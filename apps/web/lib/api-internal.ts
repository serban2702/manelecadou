/**
 * URL-ul intern al API-ului pentru fetch-urile de pe server (SSR, middleware,
 * sitemap). NU e pentru client — acolo se folosește `lib/api.ts`, care merge
 * same-origin pe `/api/...`.
 *
 * ATENȚIE, capcană Next.js: nu pune `API_INTERNAL_URL` în `next.config.ts ›
 * env`. Cheile de acolo sunt substituite la BUILD (DefinePlugin), iar în
 * imaginea Docker variabila nu există la build → s-ar bake `""` și valoarea de
 * la runtime din compose (`http://api:3000`) ar fi ignorată. Rezultatul e un
 * fetch relativ pe server → „Failed to parse URL" → middleware-ul și
 * `getSiteConfig()` cad tăcut pe fallback (hiddenMode ignorat, brand RO pe
 * toate domeniile). Citește variabila direct din `process.env`, ca aici.
 *
 * `||` în loc de `??`: `NEXT_PUBLIC_API_URL` e string GOL în producție
 * (same-origin), iar `??` nu tratează `''` ca lipsă.
 */
export function apiInternalUrl(): string {
  return (
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://api:3000'
  );
}
