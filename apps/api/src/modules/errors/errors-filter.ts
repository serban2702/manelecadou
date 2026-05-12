import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorsService } from './errors.service';

/**
 * Captures all uncaught exceptions, persists them în `error_logs`
 * și răspunde clientului cu un payload uniform JSON.
 *
 * NOTE: throttle 429, validation 400, auth 401/403 sunt log-uite ca `warn`
 * (uneori util în debugging dar nu sunt erori critice).
 *
 * Zgomot exclus din persistare ca să nu sufoce tab-ul /errors:
 *  - 404 pe `/api/internal/caddy/ask` (by design — Caddy întreabă pentru
 *    on-demand TLS și 404 = „nu acest domeniu, nu emite cert");
 *  - 404 pe path-uri tipice de scanner (`.env`, `wp-`, `phpmyadmin`, etc.);
 *  - 401 cu mesaje standard din fluxul de auth (Missing/Invalid/Used token) —
 *    apar oricând userul are sesiunea expirată sau token-ul de magic link deja
 *    consumat; nu sunt erori reale.
 */
const SCANNER_PATH_RE =
  /(\.env|\.git|\.bak|\.sql|\.aws|\.aspx|\.asp|\.action|wp-|wordpress|phpmyadmin|\/admin\.|jenkins|cgi-bin|\/(config|credentials|secrets)\.(json|yml|yaml)|\/owa\/)/i;
const AUTH_NOISE_MSG_RE = /^(Missing token|Invalid token|Token already used|jwt expired|jwt malformed)$/i;

function shouldSkipPersist(path: string, status: number, message: string): boolean {
  if (status === 404 && path === '/api/internal/caddy/ask') return true;
  if (status === 404 && SCANNER_PATH_RE.test(path)) return true;
  if (status === 401 && AUTH_NOISE_MSG_RE.test(message)) return true;
  return false;
}

@Catch()
export class GlobalErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalErrorsFilter');

  constructor(private readonly errors: ErrorsService) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    const message =
      isHttp
        ? (typeof exception.getResponse() === 'string'
            ? (exception.getResponse() as string)
            : ((exception.getResponse() as { message?: string }).message ?? exception.message))
        : (exception as Error)?.message ?? 'Internal server error';
    const stack = (exception as Error)?.stack;

    const level: 'error' | 'warn' = status >= 500 || !isHttp ? 'error' : 'warn';
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message).slice(0, 200);
    const skipPersist = shouldSkipPersist(req.path, status, messageStr);

    // Persistă în DB (fire-and-forget — nu blocăm response-ul)
    if (!skipPersist) this.errors
      .log({
        level,
        source: 'api',
        message: messageStr,
        stack,
        path: req.path,
        method: req.method,
        statusCode: status,
        ip: (req.headers['x-forwarded-for'] as string) ?? req.ip ?? undefined,
        userAgent: req.headers['user-agent']?.toString().slice(0, 400),
        userId: (req as { user?: { id?: string } }).user?.id,
        guestId: (req.headers['x-guest-id'] as string) ?? undefined,
        siteId: (req as { siteId?: string }).siteId ?? null,
      })
      .catch(() => {});

    if (level === 'error') {
      this.logger.error(`[${status}] ${req.method} ${req.path} — ${message}`);
      if (stack) this.logger.error(stack);
    }

    res.status(status).json({
      statusCode: status,
      message,
      error: isHttp ? exception.name : 'InternalServerError',
    });
  }
}
