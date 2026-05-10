import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';
import { getSiteConfig } from '@/lib/site-config';

export const COOKIE_LOCALE = 'NEXT_LOCALE';

/**
 * Locale-ul efectiv per request, în ordinea de prioritate:
 *  1. Site.locale — domeniul curent forțează limba (un site BG e mereu BG,
 *     un user nu poate trece pe RO peste el).
 *  2. Cookie NEXT_LOCALE — preferință utilizator (fallback dacă site-ul nu
 *     are un locale valid, caz teoretic).
 *  3. DEFAULT_LOCALE.
 */
async function resolveLocale(): Promise<Locale> {
  try {
    const site = await getSiteConfig();
    if (isLocale(site.locale)) return site.locale;
  } catch {
    // ignorăm — fallback la cookie / default
  }

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(COOKIE_LOCALE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
