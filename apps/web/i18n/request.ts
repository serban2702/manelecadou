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

type Messages = Record<string, unknown>;

/**
 * Completează recursiv cheile lipsă dintr-o limbă cu cele din română.
 *
 * `next-intl` nu are limbă de rezervă configurată aici, iar o cheie lipsă
 * ajunge pe ecran ca path brut („cadou.song.title") sau aruncă. Când adăugăm
 * texte noi, traducerile vin de obicei mai târziu decât codul — fallback-ul
 * face diferența dintre „o propoziție în altă limbă" și „o pagină stricată".
 * Nu suprascrie nimic din traducerea existentă.
 */
function withFallback(base: Messages, fallback: Messages): Messages {
  const out: Messages = { ...fallback, ...base };
  for (const [key, fbValue] of Object.entries(fallback)) {
    const value = base[key];
    if (isPlainObject(fbValue) && isPlainObject(value)) {
      out[key] = withFallback(value, fbValue);
    }
  }
  return out;
}

function isPlainObject(v: unknown): v is Messages {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../messages/${locale}.json`)).default as Messages;
  if (locale === DEFAULT_LOCALE) return { locale, messages };
  const fallback = (await import(`../messages/${DEFAULT_LOCALE}.json`)).default as Messages;
  return { locale, messages: withFallback(messages, fallback) };
});
