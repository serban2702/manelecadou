import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import type { SiteConfig } from './site-shared';
import { apiInternalUrl } from './api-internal';
import { resolveExperienceSlug } from '@/experiences/assign';
import { fromPriceCents } from './packages';

// Re-export tipurile + helperii puri ca să rămână import path-ul vechi funcțional
export { formatPrice, siteUrl, siteSupportEmail, type SiteConfig } from './site-shared';

const API_INTERNAL = apiInternalUrl();

/**
 * Configul site-ului curent rezolvat din Host header. Server-only (folosește
 * `next/headers`), cached per request prin React `cache()`. Fallback la un
 * config minim default dacă API-ul e indisponibil (la build sau cold-start).
 *
 * Pentru client components folosește `useSite()` din `site-context.tsx`.
 */
export const getSiteConfig = cache(async (): Promise<SiteConfig> => {
  const fallback: SiteConfig = {
    id: 'fallback',
    slug: 'default',
    domain: process.env.DEFAULT_SITE_DOMAIN ?? 'localhost',
    name: process.env.DEFAULT_SITE_NAME ?? 'Manele Cadou',
    locale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'ro',
    currency: 'RON',
    basePriceCents: 4900,
    giftPriceCents: 4900,
    brand: { primaryColor: '#d4af37', tagline: 'Maneaua ta cadou' },
    seo: {},
    analytics: { ga4Id: process.env.NEXT_PUBLIC_GA_ID },
    social: {},
    companyInfo: {},
    supportEmail: null,
    active: true,
    maintenanceMode: false,
    hiddenMode: false,
    langSwitcherEnabled: false,
    maintenanceMessage: {},
  };

  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host') || '';
    // Includem host-ul ca query param ca să fie parte din cheia de cache Next —
    // altfel toate domeniile lovesc același URL și primul răspuns e servit pentru
    // toate (cache poisoning între tenants: ex. BG primește configul GR).
    const url = `${API_INTERNAL}/api/public/site?host=${encodeURIComponent(host)}`;
    const res = await fetch(url, {
      headers: {
        'Host': host,
        'X-Forwarded-Host': host,
      },
      next: { revalidate: 10, tags: [`site-config:${host}`] },
    });
    if (!res.ok) return fallback;
    return (await res.json()) as SiteConfig;
  } catch {
    return fallback;
  }
});

/**
 * Interfața (`classic` / `cadou`) rezolvată pentru request-ul curent, în server
 * components. Aceeași logică ca în `app/layout.tsx`: header-ul pus de
 * middleware, apoi cookie-ul (retrecut prin gardă), apoi default-ul din admin.
 */
export const getExperienceSlug = cache(async (): Promise<string> => {
  const site = await getSiteConfig();
  const [h, c] = await Promise.all([headers(), cookies()]);
  return resolveExperienceSlug({
    uiParam: h.get('x-mc-experience'),
    cookieSlug: c.get('mc_ui')?.value ?? null,
    config: site.experienceConfig ?? null,
  }).slug;
});

/**
 * Prețul „de la X" pentru request-ul curent. `null` = nu-l știm (site vechi
 * fără pachete / API indisponibil) ⇒ ascunde cifra, nu inventa una.
 */
export const getFromPriceCents = cache(async (): Promise<number | null> => {
  const [site, slug] = await Promise.all([getSiteConfig(), getExperienceSlug()]);
  return fromPriceCents(site, slug);
});
