import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { Request } from 'express';
import { accessLogger } from './logger';

/**
 * Adresa e loopback sau dintr-o rețea privată (RFC1918 / IPv6 unique-local)?
 * Folosit pentru a recunoaște traficul intern din rețeaua Docker — Caddy, healthcheck-uri,
 * job-uri — care nu trebuie să împartă bucket-ul de rate limit al vizitatorilor reali.
 */
function isInternalIp(ip: string | undefined): boolean {
  if (!ip) return false;
  // Normalizează formele IPv4-mapped IPv6 (::ffff:172.18.0.8).
  const addr = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  if (addr === '127.0.0.1' || addr === '::1') return true;
  if (addr.startsWith('10.') || addr.startsWith('192.168.')) return true;
  // 172.16.0.0/12 — rețelele bridge Docker cad aici (172.16–172.31).
  const m = /^172\.(\d{1,2})\./.exec(addr);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  // fc00::/7 — IPv6 unique-local.
  if (/^f[cd][0-9a-f]{2}:/i.test(addr)) return true;

  return false;
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(context)) return true;
    const req = context.switchToHttp().getRequest<Request>();

    if (req.path === '/health' || req.path === '/api/health') return true;
    if (req.path.startsWith('/api/admin/')) return true;
    // /auth/me (citire self) + /auth/magic-link/consume (token random, neghicibil) NU
    // trebuie limitate de throttler-ul global; altfel un 429 pe /auth/me deconecta
    // admin-ul imediat după login (bounce). magic-link/request rămâne limitat — are
    // @Throttle propriu pentru anti-spam email.
    if (req.path === '/api/auth/me' || req.path === '/api/auth/magic-link/consume') return true;

    // Request-uri interne din rețeaua Docker (healthcheck wget, Caddy ask etc.):
    // nu au X-Forwarded-For → ar otrăvi bucket-ul unui singur IP intern.
    //
    // BUG observat 2026-08-24: condiția acoperea DOAR loopback, dar Caddy nu vine de
    // pe 127.0.0.1 — vine de pe IP-ul lui de container (172.18.0.x). Rezultat: toate
    // interogările `/api/internal/caddy/ask` intrau în același bucket per-IP și, la
    // rafale de boți care lovesc :443 cu SNI aleatoriu, se depășea limita `medium`
    // (300/min) → 2685 de 429-uri în 3 zile. Consecințe: (a) un `ask` legitim pentru
    // un domeniu nou / cert de reemis primea 429, iar Caddy citește 4xx ca „refuz" și
    // nu emite certificatul; (b) error_logs inundat (2167 rânduri într-o zi), ceea ce
    // ascunde erorile reale la triaj.
    //
    // Traficul public nu scapă: trece prin Caddy, care setează X-Forwarded-For, deci
    // rămâne limitat normal. Aici sar doar cererile fără XFF venite din rețele private.
    const xff = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
    if (!xff && isInternalIp(req.ip)) return true;

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
