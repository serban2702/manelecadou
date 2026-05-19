/**
 * Slug-uri localizate pentru paginile legale (termeni, confidențialitate,
 * cookies). Fiecare locale are propriile slug-uri SEO; ele sunt rewrite-uite
 * de middleware la rutele canonice Next (`/termeni`, `/confidentialitate`,
 * `/cookies`). Footer-ul și restul UI-ului folosesc `getLegalSlug()` ca să
 * emită URL-uri în limba site-ului curent.
 */

import type { Locale } from '@/i18n/locales';

export type LegalPage = 'terms' | 'privacy' | 'cookies';

/** Rutele canonice Next.js (folderele din `app/`). */
export const LEGAL_CANONICAL: Record<LegalPage, string> = {
  terms: 'termeni',
  privacy: 'confidentialitate',
  cookies: 'cookies',
};

/**
 * Slug per (locale × pagină). Slug-urile sunt în varianta latină pentru a
 * funcționa fără probleme în URL-uri și share-uri (fără caractere chirilice
 * sau grecești care fac URL-ul ilizibil când e copiat).
 */
export const LEGAL_SLUGS: Record<Locale, Record<LegalPage, string>> = {
  ro: { terms: 'termeni',   privacy: 'confidentialitate', cookies: 'cookies' },
  bg: { terms: 'uslovia',   privacy: 'poveritelnost',     cookies: 'biskvitki' },
  sr: { terms: 'uslovi',    privacy: 'privatnost',        cookies: 'kolacici' },
  tr: { terms: 'sartlar',   privacy: 'gizlilik',          cookies: 'cerezler' },
  el: { terms: 'oroi',      privacy: 'aporrito',          cookies: 'cookies' },
  hr: { terms: 'uvjeti',    privacy: 'privatnost',        cookies: 'kolacici' },
  sl: { terms: 'pogoji',    privacy: 'zasebnost',         cookies: 'piskotki' },
  bs: { terms: 'uslovi',    privacy: 'privatnost',        cookies: 'kolacici' },
};

/** Slug-ul pentru o pagină dată, în limba site-ului curent. */
export function getLegalSlug(locale: string, page: LegalPage): string {
  const map = LEGAL_SLUGS[locale as Locale] ?? LEGAL_SLUGS.ro;
  return map[page];
}

/** Path-ul absolut localizat (ex. `/uslovia`) pentru pagina dată. */
export function getLegalPath(locale: string, page: LegalPage): string {
  return `/${getLegalSlug(locale, page)}`;
}

/**
 * Dacă pathname-ul incoming corespunde unui slug localizat pentru `locale`
 * (sau canonicului RO), întoarce ruta canonică Next (ex. `/termeni`). Altfel
 * `null`. Acceptă atât slug-ul localizat al locale-ului curent cât și
 * varianta canonică RO — așa că link-urile vechi/externe nu se sparg.
 */
export function resolveLegalCanonical(pathname: string, locale: string): string | null {
  // Strip trailing slash + force lowercase ca să fim toleranți
  const clean = pathname.replace(/\/+$/, '').toLowerCase();
  if (!clean.startsWith('/')) return null;
  const slug = clean.slice(1);
  if (!slug || slug.includes('/')) return null;

  const localized = LEGAL_SLUGS[locale as Locale] ?? LEGAL_SLUGS.ro;

  for (const page of ['terms', 'privacy', 'cookies'] as LegalPage[]) {
    if (slug === localized[page] || slug === LEGAL_CANONICAL[page]) {
      return `/${LEGAL_CANONICAL[page]}`;
    }
  }
  return null;
}
