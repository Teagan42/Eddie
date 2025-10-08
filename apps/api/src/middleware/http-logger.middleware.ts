import { Injectable, NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import onFinished from "on-finished";
import { LoggerService } from "@eddie/io";

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  constructor(private readonly loggerService: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const logger = this.loggerService.getLogger("http");
    const start = process.hrtime.bigint();

    onFinished(res, () => {
      const durationNs = process.hrtime.bigint() - start;
      const durationMs = Number(durationNs) / 1_000_000;

      logger.info(
        {
          method: req.method,
          url: req.originalUrl ?? req.url,
          statusCode: res.statusCode,
          contentLength: res.get("content-length"),
          durationMs: Number.isFinite(durationMs)
            ? Number(durationMs.toFixed(3))
            : undefined,
          userAgent: req.get("user-agent"),
        },
        "HTTP request completed"
      );
    });

    next();
  }
}
