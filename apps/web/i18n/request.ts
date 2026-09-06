import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE } from './locales';
import { getActiveLocale } from '@/lib/active-locale';

export { COOKIE_LOCALE } from '@/lib/active-locale';

// Ordinea de rezolvare a limbii stă în `lib/active-locale.ts` — aceeași funcție
// o folosește și `app/layout.tsx` pentru `<html lang>`. Duplicată, diverge.

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
  const locale = await getActiveLocale();
  const messages = (await import(`../messages/${locale}.json`)).default as Messages;
  if (locale === DEFAULT_LOCALE) return { locale, messages };
  const fallback = (await import(`../messages/${DEFAULT_LOCALE}.json`)).default as Messages;
  return { locale, messages: withFallback(messages, fallback) };
});
