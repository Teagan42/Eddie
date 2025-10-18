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

      // Keep precision safely by truncating to the nearest microsecond
      const durationUs = durationNs / 1_000n;
      const durationMs = Number(durationUs) / 1_000;

      // content-length may be undefined or inaccurate with compression
      const rawContentLength =
        res.getHeader?.('content-length') ??
        (res as any).get?.('content-length') ??
        undefined;
      const contentLength = (() => {
        if (typeof rawContentLength !== 'string') {
          return rawContentLength;
        }

        const numericContentLength = Number(rawContentLength);

        return Number.isNaN(numericContentLength)
          ? rawContentLength
          : numericContentLength;
      })();

      const url = req.originalUrl ?? req.url;
      const userAgent = req.get?.('user-agent');

      const payload = {
        method: req.method,
        url,
        statusCode: res.statusCode,
        ...(contentLength === undefined ? {} : { contentLength }),
        durationMs,
        userAgent,
        // add your correlation/request id here if you have one
        // requestId: req.id,
      };

      this.logger.info(payload, 'HTTP request completed');
    });

    next();
  }
}