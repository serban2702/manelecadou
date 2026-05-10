import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('Missing token');
    try {
      const payload = this.jwt.verify(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role ?? 'user',
        siteId: payload.siteId ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = extractToken(req);
    if (!token) return true;
    try {
      const payload = this.jwt.verify(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role ?? 'user',
        siteId: payload.siteId ?? null,
      };
    } catch {
      // ignore — fallback to guest
    }
    return true;
  }
}

function extractToken(req: { headers: Record<string, unknown> }): string | null {
  const h = req.headers['authorization'];
  if (typeof h !== 'string') return null;
  const [scheme, token] = h.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
