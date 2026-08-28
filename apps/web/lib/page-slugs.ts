/**
 * Slug-uri localizate per locale pentru paginile principale ale site-ului
 * (asculta, top, articole, cadou, etc.). Pe domeniile non-RO, URL-urile sunt
 * în limba site-ului — middleware-ul le rewrite-uiește la rutele canonice
 * Next.js (folderele din `app/`, care rămân nume RO).
 *
 * Folderele canonice Next: termeni, confidentialitate, cookies, asculta, top,
 * articole, cadou, contact, faq, cont, manelele-mele, studio, login.
 *
 * Pentru paginile cu numele intuitive în engleză (studio, faq, contact) și
 * pentru rutele dinamice (/m/[id], /articole/[slug], /login/verify) folosim
 * același slug în toate locale-le ca să rămână universale.
 */

import type { Locale } from '@/i18n/locales';

export type PageKey =
  | 'terms'
  | 'privacy'
  | 'cookies'
  | 'asculta'
  | 'istoric'
  | 'top'
  | 'articole'
  | 'cadou'
  | 'contact'
  | 'faq'
  | 'manelele-mele'
  | 'studio';

/** Numele folderului din `app/` (ruta canonică Next.js). */
export const PAGE_CANONICAL: Record<PageKey, string> = {
  terms: 'termeni',
  privacy: 'confidentialitate',
  cookies: 'cookies',
  asculta: 'asculta',
  istoric: 'istoric',
  top: 'top',
  articole: 'articole',
  cadou: 'cadou',
  contact: 'contact',
  faq: 'faq',
  'manelele-mele': 'manelele-mele',
  studio: 'studio',
};

/**
 * Slug per (locale × pagină). Slug-urile sunt transliterate în latină pentru
 * URL-uri partajabile fără caractere chirilice/grecești care fac URL-ul ilizibil
 * când e copiat în WhatsApp/Facebook/etc.
 *
 * Pentru locale-uri unde un slug nu are sens specific (studio, faq, contact)
 * folosim aceeași valoare ca pe RO — userul vede aceeași terminologie.
 */
export const PAGE_SLUGS: Record<Locale, Record<PageKey, string>> = {
  ro: {
    terms: 'termeni',
    privacy: 'confidentialitate',
    cookies: 'cookies',
    asculta: 'asculta',
    istoric: 'istoric',
    top: 'top',
    articole: 'articole',
    cadou: 'cadou',
    contact: 'contact',
    faq: 'faq',
    'manelele-mele': 'manelele-mele',
    studio: 'studio',
  },
  bg: {
    terms: 'uslovia',
    privacy: 'poveritelnost',
    cookies: 'biskvitki',
    asculta: 'slushai',
    istoric: 'istoria',
    top: 'top',
    articole: 'statii',
    cadou: 'podaruk',
    contact: 'kontakt',
    faq: 'vaprosi',
    'manelele-mele': 'moite-pesni',
    studio: 'studio',
  },
  sr: {
    terms: 'uslovi',
    privacy: 'privatnost',
    cookies: 'kolacici',
    asculta: 'slusaj',
    istoric: 'istorija',
    top: 'top',
    articole: 'clanci',
    cadou: 'poklon',
    contact: 'kontakt',
    faq: 'pitanja',
    'manelele-mele': 'moje-pesme',
    studio: 'studio',
  },
  tr: {
    terms: 'sartlar',
    privacy: 'gizlilik',
    cookies: 'cerezler',
    asculta: 'dinle',
    istoric: 'gecmis',
    top: 'top',
    articole: 'makaleler',
    cadou: 'hediye',
    contact: 'iletisim',
    faq: 'sss',
    'manelele-mele': 'sarkilarim',
    studio: 'studio',
  },
  el: {
    terms: 'oroi',
    privacy: 'aporrito',
    cookies: 'cookies',
    asculta: 'akou',
    istoric: 'istoriko',
    top: 'top',
    articole: 'arthra',
    cadou: 'doro',
    contact: 'epikoinonia',
    faq: 'syxnes-erotiseis',
    'manelele-mele': 'ta-tragoudia-mou',
    studio: 'studio',
  },
  hr: {
    terms: 'uvjeti',
    privacy: 'privatnost',
    cookies: 'kolacici',
    asculta: 'slusaj',
    istoric: 'povijest',
    top: 'top',
    articole: 'clanci',
    cadou: 'poklon',
    contact: 'kontakt',
    faq: 'pitanja',
    'manelele-mele': 'moje-pjesme',
    studio: 'studio',
  },
  sl: {
    terms: 'pogoji',
    privacy: 'zasebnost',
    cookies: 'piskotki',
    asculta: 'poslusaj',
    istoric: 'zgodovina',
    top: 'top',
    articole: 'clanki',
    cadou: 'darilo',
    contact: 'kontakt',
    faq: 'vprasanja',
    'manelele-mele': 'moje-pesmi',
    studio: 'studio',
  },
  bs: {
    terms: 'uslovi',
    privacy: 'privatnost',
    cookies: 'kolacici',
    asculta: 'slusaj',
    istoric: 'historija',
    top: 'top',
    articole: 'clanci',
    cadou: 'poklon',
    contact: 'kontakt',
    faq: 'pitanja',
    'manelele-mele': 'moje-pjesme',
    studio: 'studio',
  },
};

export function getPageSlug(locale: string, page: PageKey): string {
  const map = PAGE_SLUGS[locale as Locale] ?? PAGE_SLUGS.ro;
  return map[page];
}

/** Path absolut localizat (ex. `/akou` pe el) pentru pagina dată. */
export function getPagePath(locale: string, page: PageKey): string {
  return `/${getPageSlug(locale, page)}`;
}

/**
 * Dacă pathname-ul incoming corespunde unui slug localizat pentru `locale`
 * (sau canonicului RO), întoarce ruta canonică Next (ex. `/asculta`).
 * Altfel `null`. Acceptă atât slug-ul localizat al locale-ului curent cât și
 * varianta canonică RO — așa că link-urile vechi/externe nu se sparg.
 *
 * Suportă și sub-paths (ex. `/akou/playlist` → `/asculta/playlist`).
 */
export function resolveCanonicalPath(pathname: string, locale: string): string | null {
  const clean = pathname.replace(/\/+$/, '').toLowerCase();
  if (!clean.startsWith('/')) return null;
  const stripped = clean.slice(1);
  if (!stripped) return null;

  const firstSlash = stripped.indexOf('/');
  const firstSeg = firstSlash === -1 ? stripped : stripped.slice(0, firstSlash);
  const rest = firstSlash === -1 ? '' : stripped.slice(firstSlash);

  const localized = PAGE_SLUGS[locale as Locale] ?? PAGE_SLUGS.ro;

  for (const page of Object.keys(PAGE_CANONICAL) as PageKey[]) {
    const localSlug = localized[page];
    const canonicalSlug = PAGE_CANONICAL[page];
    if (firstSeg === localSlug || firstSeg === canonicalSlug) {
      const target = `/${canonicalSlug}${rest}`;
      if (target === pathname) return null; // deja canonic
      return target;
    }
  }
  return null;
}

// ───── Backward-compat shim pentru legacy importuri din legal-slugs ─────
export type LegalPage = 'terms' | 'privacy' | 'cookies';
export const LEGAL_CANONICAL: Record<LegalPage, string> = {
  terms: PAGE_CANONICAL.terms,
  privacy: PAGE_CANONICAL.privacy,
  cookies: PAGE_CANONICAL.cookies,
};
export function getLegalSlug(locale: string, page: LegalPage): string {
  return getPageSlug(locale, page);
}
export function getLegalPath(locale: string, page: LegalPage): string {
  return getPagePath(locale, page);
}
export function resolveLegalCanonical(pathname: string, locale: string): string | null {
  return resolveCanonicalPath(pathname, locale);
}
