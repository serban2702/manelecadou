import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { accessLogger } from './logger';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const status = res.statusCode;
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        null;
      const userId = (req as { user?: { id?: string } }).user?.id ?? null;
      const guestId = (req.headers['x-guest-id'] as string) ?? null;
      const siteId = (req as { siteId?: string }).siteId ?? null;

      const payload = {
        method: req.method,
        path: req.path,
        status,
        durationMs: Math.round(durationMs),
        ip,
        userId,
        guestId,
        siteId,
        ua: req.headers['user-agent']?.toString().slice(0, 200) ?? null,
      };

      if (status === 429) {
        accessLogger.warn({ ...payload, kind: 'throttled' }, 'THROTTLED');
      } else if (status >= 500) {
        accessLogger.error(payload, 'request');
      } else if (status >= 400) {
        accessLogger.warn(payload, 'request');
      } else {
        accessLogger.info(payload, 'request');
      }
    });
    next();
  }
}
