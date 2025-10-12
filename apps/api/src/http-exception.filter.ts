import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ConfigService, ConfigStore } from "@eddie/config";
import type { EddieConfig } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { InjectLogger } from "@eddie/io";
import type { Logger } from "pino";
import { Subscription } from "rxjs";

interface ContextSummary {
  files: number;
  totalBytes: number;
}

@Catch()
@Injectable()
export class ApiHttpExceptionFilter implements ExceptionFilter, OnModuleInit, OnModuleDestroy {
  private includeStackInResponse = false;
  private contextSummary: ContextSummary | null = null;
  private initPromise: Promise<void> | null = null;
  private subscription: Subscription | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly configStore: ConfigStore,
    private readonly contextService: ContextService,
    @InjectLogger("api:exceptions") private readonly logger: Logger
  ) {}

  async onModuleInit(): Promise<void> {
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  private async initialize(): Promise<void> {
    await this.applySnapshot(this.configStore.getSnapshot());

    this.ensureSubscription();
  }

  private ensureSubscription(): void {
    if (this.subscription) {
      return;
    }

    this.subscription = this.configStore.changes$.subscribe((config) => {
      void this.applySnapshot(config);
    });
  }

  private async applySnapshot(config: EddieConfig): Promise<void> {
    this.includeStackInResponse =
      config.api?.telemetry?.exposeErrorStack ?? config.logLevel === "debug";

    try {
      const packed = await this.contextService.pack(config.context);
      this.contextSummary = {
        files: packed.files.length,
        totalBytes: packed.totalBytes,
      };
    } catch (error) {
      this.logger.debug(
        { error },
        "Failed to compute context summary for exception responses"
      );
    }
  }

  private async ensureInitialised(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initialize();
    await this.initPromise;
  }

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    if (host.getType() !== "http") {
      throw exception;
    }

    await this.ensureInitialised();

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const httpException =
      exception instanceof HttpException ? exception : null;
    const status = httpException?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR;

    const baseResponse = httpException?.getResponse();
    let message: string | string[] = "Internal server error";
    let details: Record<string, unknown> | undefined;

    if (typeof baseResponse === "string") {
      message = baseResponse;
    } else if (typeof baseResponse === "object" && baseResponse !== null) {
      const { message: responseMessage, ...rest } = baseResponse as {
        message?: string | string[];
        [key: string]: unknown;
      };
      message = responseMessage ?? message;
      if (Object.keys(rest).length > 0) {
        details = rest;
      }
    }

    const payload: Record<string, unknown> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      message,
    };

    if (details) {
      payload.details = details;
    }

    if (this.contextSummary) {
      payload.context = this.contextSummary;
    }

    if (this.includeStackInResponse && exception instanceof Error) {
      payload.stack = exception.stack?.split("\n");
    }

    this.logger.error(
      {
        statusCode: status,
        method: request.method,
        path: request.originalUrl ?? request.url,
        message,
        context: this.contextSummary,
        error:
          exception instanceof Error
            ? {
              name: exception.name,
              message: exception.message,
              stack: exception.stack,
            }
            : exception,
      },
      "Unhandled exception while processing request"
    );

    response.status(status).json(payload);
  }
}
