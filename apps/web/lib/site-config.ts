import { headers } from 'next/headers';
import { cache } from 'react';
import type { SiteConfig } from './site-shared';

// Re-export tipurile + helperii puri ca să rămână import path-ul vechi funcțional
export { formatPrice, siteUrl, siteSupportEmail, type SiteConfig } from './site-shared';

const API_INTERNAL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://api:3000';

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
    maintenanceMessage: {},
  };

  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host') || '';
    const res = await fetch(`${API_INTERNAL}/api/public/site`, {
      headers: {
        'Host': host,
        'X-Forwarded-Host': host,
      },
      next: { revalidate: 30, tags: ['site-config'] },
    });
    if (!res.ok) return fallback;
    return (await res.json()) as SiteConfig;
  } catch {
    return fallback;
  }
});
