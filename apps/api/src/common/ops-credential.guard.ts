import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Gate suplimentar peste AdminGuard pentru zonele periculoase (ex. /admin/database —
 * restore/reset pot distruge datele). Cere headerul `x-ops-credential` egal cu
 * `OPS_TERMINAL_CREDENTIAL` (format `user:parolă`) — EXACT credențialul folosit de
 * terminalul Claude Ops (ttyd Basic Auth), cerință 2026-07-07.
 *
 * Fără env setat (dev local) gate-ul e dezactivat. Răspundem 403 (nu 401!) —
 * clientul admin face logout + redirect la /login pe orice 401.
 */
@Injectable()
export class OpsCredentialGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('OPS_TERMINAL_CREDENTIAL') ?? '';
    if (!expected) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.headers['x-ops-credential'];
    const given = Array.isArray(raw) ? raw[0] : raw;
    if (typeof given === 'string' && given.length > 0) {
      // Comparație constant-time pe hash-uri (lungimile diferă altfel).
      const a = createHash('sha256').update(given).digest();
      const b = createHash('sha256').update(expected).digest();
      if (timingSafeEqual(a, b)) return true;
    }
    throw new ForbiddenException('OPS_CREDENTIAL_REQUIRED');
  }
}
