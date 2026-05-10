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
 */
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

    // Persistă în DB (fire-and-forget — nu blocăm response-ul)
    this.errors
      .log({
        level,
        source: 'api',
        message: typeof message === 'string' ? message : JSON.stringify(message).slice(0, 200),
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
