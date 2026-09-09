import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AdminIpsService } from './admin-ips.service';

/**
 * Învață IP-urile de pe care se intră în admin.
 *
 * E interceptor, nu middleware, fiindcă middleware-ul rulează ÎNAINTE de guards
 * — acolo `req.user` încă nu există, deci n-am ști dacă requestul e de la un
 * admin sau de la un vizitator oarecare.
 *
 * Nu blochează nimic: `touch` e best-effort, cu debounce în serviciu.
 */
@Injectable()
export class AdminIpTrackerInterceptor implements NestInterceptor {
  constructor(private readonly adminIps: AdminIpsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const user = req?.user as { id?: string; role?: string } | undefined;
    if (user?.role === 'admin' && typeof req.ip === 'string') {
      void this.adminIps.touch(req.ip, user.id ?? null);
    }
    return next.handle();
  }
}
