import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const h = req.headers['authorization'];
    if (typeof h !== 'string') throw new UnauthorizedException('Missing token');
    const [scheme, token] = h.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token)
      throw new UnauthorizedException('Missing token');

    let payload: { sub: string; email: string; role?: string };
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.role !== 'admin') throw new ForbiddenException('Admin only');
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    return true;
  }
}
