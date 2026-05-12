import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { Request } from 'express';
import { accessLogger } from './logger';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(context)) return true;
    const req = context.switchToHttp().getRequest<Request>();

    if (req.path === '/health' || req.path === '/api/health') return true;
    if (req.path.startsWith('/api/admin/')) return true;

    // Request-uri interne din rețeaua Docker (healthcheck wget, Caddy ask etc.):
    // nu au X-Forwarded-For și vin de pe loopback → ar otrăvi bucket-ul 127.0.0.1.
    const xff = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
    if (
      !xff &&
      (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1')
    ) {
      return true;
    }
    return false;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<Request>();
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;
    accessLogger.warn(
      {
        kind: 'throttler-reject',
        method: req.method,
        path: req.path,
        ip,
        tracker: throttlerLimitDetail.tracker,
        limit: throttlerLimitDetail.limit,
        ttl: throttlerLimitDetail.ttl,
        totalHits: throttlerLimitDetail.totalHits,
        ua: req.headers['user-agent']?.toString().slice(0, 200) ?? null,
      },
      'throttler limit exceeded',
    );
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
