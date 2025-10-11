import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  OnModuleInit,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, catchError, defer, of, switchMap, tap } from "rxjs";
import { ConfigService } from "@eddie/config";
import type { EddieConfig } from "@eddie/config";
import { InjectLogger } from "@eddie/io";
import type { Logger } from "pino";
import { getRuntimeOptions } from "./runtime-options";

@Injectable()
export class RequestLoggingInterceptor
implements NestInterceptor, OnModuleInit
{
  private logBodies = false;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectLogger("api:requests") private readonly logger: Logger
  ) {}

  async onModuleInit(): Promise<void> {
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    const runtimeOptions = getRuntimeOptions();
    const config: EddieConfig = await this.configService.load(runtimeOptions);
    this.logBodies = config.logLevel === "debug";
  }

  private async ensureInitialised(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initialize();
    await this.initPromise;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const start = process.hrtime.bigint();

    return defer(() => this.ensureInitialised()).pipe(
      catchError((error) => {
        this.logger.error(
          { error },
          "Failed to initialise request logging interceptor"
        );
        return of(null);
      }),
      switchMap(() => {
        const baseLog = {
          method: request.method,
          url: request.originalUrl ?? request.url,
          userAgent: request.get("user-agent"),
          body: this.logBodies ? request.body : undefined,
        };

        this.logger.debug(baseLog, "Handling incoming request");

        return next.handle().pipe(
          tap({
            next: (value) => {
              const durationNs = process.hrtime.bigint() - start;
              const durationMs = Number(durationNs) / 1_000_000;
              this.logger.info(
                {
                  ...baseLog,
                  statusCode: response.statusCode,
                  durationMs: Number.isFinite(durationMs)
                    ? Number(durationMs.toFixed(3))
                    : undefined,
                  response: this.logBodies ? value : undefined,
                },
                "Request completed successfully"
              );
            },
            error: (error) => {
              const durationNs = process.hrtime.bigint() - start;
              const durationMs = Number(durationNs) / 1_000_000;
              this.logger.error(
                {
                  ...baseLog,
                  statusCode: response.statusCode,
                  durationMs: Number.isFinite(durationMs)
                    ? Number(durationMs.toFixed(3))
                    : undefined,
                  error,
                },
                "Request pipeline emitted an error"
              );
            },
          })
        );
      })
    );
  }
}
