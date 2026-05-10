import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Sărim throttle-ul pentru rutele admin (deja protejate de AdminGuard).
 * Asta permite polling intens pe dashboard fără 429.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // Respectăm @SkipThrottle() pe handler/controller (logica default a NestJS).
    if (await super.shouldSkip(context)) return true;
    const req = context.switchToHttp().getRequest<Request>();
    return req.path.startsWith('/api/admin/');
  }
}
