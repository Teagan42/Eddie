import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ConfigService } from "@eddie/config";
import type { CliRuntimeOptions, EddieConfig } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { LoggerService } from "@eddie/io";

interface ContextSummary {
  files: number;
  totalBytes: number;
}

@Catch()
@Injectable()
export class ApiHttpExceptionFilter implements ExceptionFilter, OnModuleInit {
  private includeStackInResponse = false;
  private contextSummary: ContextSummary | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly logger = this.loggerService.getLogger("api:exceptions");

  constructor(
    private readonly configService: ConfigService,
    private readonly contextService: ContextService,
    private readonly loggerService: LoggerService
  ) {}

  async onModuleInit(): Promise<void> {
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    const runtimeOptions: CliRuntimeOptions = {};
    const config: EddieConfig = await this.configService.load(runtimeOptions);
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
