/**
 * Partea de server pentru `/llms.txt` și `/llms/<locale>.txt`: aduce configul
 * tenantului, alege pachetele interfeței implicite și întoarce textul construit
 * de `buildLlmsTxt`.
 *
 * ⚠️ Rutele astea NU trec prin `middleware.ts` — matcher-ul lui exclude orice
 * cale care conține un punct (`.*\..*`), tocmai ca să nu intercepteze fișiere.
 * Deci garda de `hiddenMode` / `maintenanceMode` / site inactiv trebuie făcută
 * AICI: altfel un site ascuns, care întoarce 444 pe orice pagină, și-ar servi
 * totuși prețurile și catalogul într-un fișier gândit ca modelele să-l citească.
 */

import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from '@/i18n/locales';
import { resolveExperienceSlug } from '@/experiences/assign';
import { getSiteConfig } from './site-config';
import { sitePackages } from './packages';
import { buildLlmsTxt, type LlmsCopy } from './llms-txt';

type Messages = Record<string, unknown>;

/**
 * Textele `llms` pentru o limbă, completate din română acolo unde lipsesc.
 * Aceeași plasă ca `i18n/request.ts`: o traducere care întârzie produce o
 * propoziție în altă limbă, nu un fișier cu chei brute în el.
 */
async function loadCopy(locale: Locale): Promise<LlmsCopy> {
  const load = async (loc: Locale): Promise<LlmsCopy> =>
    ((await import(`../messages/${loc}.json`)).default as Messages).llms as LlmsCopy;

  const copy = await load(locale);
  if (locale === DEFAULT_LOCALE) return copy;
  const fallback = await load(DEFAULT_LOCALE);
  return { ...fallback, ...copy, pages: { ...fallback.pages, ...copy?.pages } };
}

/**
 * `localeOverride` = limba cerută explicit prin `/llms/<locale>.txt`. Fără ea,
 * fișierul urmează limba site-ului.
 */
export async function llmsTxtResponse(localeOverride?: Locale): Promise<Response> {
  const site = await getSiteConfig();

  if (!site.active || site.maintenanceMode || site.hiddenMode) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const locale: Locale =
    localeOverride ?? (isLocale(site.locale) ? site.locale : DEFAULT_LOCALE);

  // Interfața pe care o vede un vizitator nou (fără cookie, fără `?ui=`) —
  // aceeași funcție ca în middleware, deci aceleași pachete ca pe site.
  const experienceSlug = resolveExperienceSlug({
    config: site.experienceConfig ?? null,
  }).slug;

  const body = buildLlmsTxt({
    site,
    locale,
    copy: await loadCopy(locale),
    packages: sitePackages(site, experienceSlug),
    alternateLocales: LOCALES,
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=1800',
    },
  });
}
