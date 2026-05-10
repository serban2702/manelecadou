import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { SitesService } from './sites.service';

declare module 'express' {
  interface Request {
    siteId?: string;
    site?: import('./site.entity').Site;
  }
}

@Injectable()
export class SiteContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('SiteContextMiddleware');

  constructor(
    private readonly sites: SitesService,
    private readonly jwt: JwtService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Decode best-effort al JWT-ului — ca să putem aplica anti-abuz înainte de guards.
      //    Guards rulează DUPĂ middleware, deci req.user nu e încă setat de JwtAuthGuard.
      //    Decodăm noi aici, separat, doar pentru decizia de site context.
      const jwtPayload = this.tryDecodeJwt(req);

      // 2. Anti-abuz: dacă tokenul e al unui utilizator obișnuit (role==='user'),
      //    siteId-ul lui din JWT e singurul valid — ignorăm header-ul x-site-id
      //    (un user RO nu poate accesa date BG schimbând header-ul).
      if (jwtPayload?.role === 'user' && jwtPayload?.siteId) {
        const site = await this.sites.findById(jwtPayload.siteId);
        if (site) {
          req.site = site;
          req.siteId = site.id;
          return next();
        }
      }

      // 3. Pentru admin (sau request-uri fără auth): header-ul x-site-id (din selectorul
      //    admin) câștigă peste Host. Adminul poate selecta orice site.
      //    Cazul special: x-site-id === 'all' și user-ul e admin → cross-site agregat
      //    (req.siteId rămâne undefined, controllerele admin tratează ca "Toate site-urile").
      const headerSiteId = req.headers['x-site-id'];
      if (typeof headerSiteId === 'string' && headerSiteId === 'all' && jwtPayload?.role === 'admin') {
        req.site = undefined;
        req.siteId = undefined;
        return next();
      }
      if (typeof headerSiteId === 'string' && headerSiteId.length > 0 && headerSiteId !== 'all') {
        const site = await this.sites.findById(headerSiteId);
        if (site) {
          req.site = site;
          req.siteId = site.id;
          return next();
        }
      }

      // 4. Fallback: rezolvăm din Host header (X-Forwarded-Host de la Caddy → Host).
      const fwdHost = req.headers['x-forwarded-host'];
      const host = (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) || req.headers.host;
      const site = await this.sites.resolveFromHost(host);
      req.site = site;
      req.siteId = site.id;
    } catch (err) {
      this.logger.warn(`SiteContext: nu am putut rezolva site (${(err as Error).message})`);
    }
    next();
  }

  /** Decode JWT din header Authorization. Verificare completă (semnătură + expirare).
   *  Returnează null dacă lipsește sau e invalid — guards vor face și ei verificarea. */
  private tryDecodeJwt(req: Request): { sub?: string; role?: string; siteId?: string | null } | null {
    const auth = req.headers['authorization'];
    if (typeof auth !== 'string') return null;
    const [scheme, token] = auth.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    try {
      const payload = this.jwt.verify(token) as Record<string, unknown>;
      return {
        sub: typeof payload.sub === 'string' ? payload.sub : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
        siteId: typeof payload.siteId === 'string' ? payload.siteId : null,
      };
    } catch {
      return null;
    }
  }
}
