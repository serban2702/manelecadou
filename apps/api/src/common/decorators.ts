import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthedRequestUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  /** Site-ul căruia îi aparține contul. Pentru `role==='user'` e singurul siteId valid
   *  (anti-abuz: header-ul x-site-id e ignorat). Pentru `role==='admin'` e siteId-ul
   *  contului master, dar adminul poate selecta orice site din header. */
  siteId: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedRequestUser | null => {
    const req = ctx.switchToHttp().getRequest();
    return req.user ?? null;
  },
);

export const CurrentGuestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers['x-guest-id'];
    if (!raw) return null;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' && v.length > 0 ? v : null;
  },
);

// Returnează id-ul site-ului curent (rezolvat din Host sau header x-site-id de admin).
// Garantat non-null după ce SiteContextMiddleware a rulat (atașează default site dacă nu se găsește match).
// Pentru endpoint-urile admin "All sites" (selector setat pe "all"), middleware-ul lasă req.siteId undefined
// — folosește decoratorul `@AllSites()` pentru a face explicit query-uri cross-site.
export const CurrentSiteId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest();
    return req.siteId ?? null;
  },
);

export const CurrentSite = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.site ?? null;
  },
);
