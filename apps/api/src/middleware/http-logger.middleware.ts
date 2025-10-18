import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import onFinished from 'on-finished'; // ensure esModuleInterop=true
import { InjectLogger } from '@eddie/io';
import type { Logger } from 'pino';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  constructor(@InjectLogger('http') private readonly logger: Logger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startNs = process.hrtime.bigint();

    onFinished(res, () => {
      const durationNs = process.hrtime.bigint() - startNs;

      // Keep precision safely for any realistic request duration
      const ms = Number(durationNs) / 1_000_000; // fine unless your API naps for >150 min
      // If you're paranoid:
      // const ms = Number(durationNs) < Number.MAX_SAFE_INTEGER
      //   ? Number(durationNs) / 1_000_000
      //   : Number((durationNs / 1_000n) /* μs as bigint */) / 1_000;

      const durationMs = Math.round(ms * 1000) / 1000;

      // content-length may be undefined or inaccurate with compression
      const contentLength =
        res.getHeader?.('content-length') ??
        (res as any).get?.('content-length') ??
        undefined;

      const requestId = this.resolveRequestId(req);

      this.logger.info(
        {
          method: req.method,
          url: req.originalUrl ?? req.url,
          statusCode: res.statusCode,
          contentLength,
          durationMs,
          userAgent: req.get?.('user-agent'),
          requestId,
          // add your correlation/request id here if you have one
          // requestId: req.id,
        },
        'HTTP request completed'
      );
    });

    next();
  }

  private resolveRequestId(req: Request): string | undefined {
    const headerValue =
      req.get?.('x-request-id') ?? req.headers?.['x-request-id'];
    const candidates = Array.isArray(headerValue)
      ? headerValue
      : [headerValue];

    for (const candidate of candidates) {
      const normalized = this.normalizeRequestId(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private normalizeRequestId(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}