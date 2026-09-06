import { cookies } from 'next/headers';
import { cache } from 'react';
import { normalizeLocale, type Locale } from '@/i18n/locales';
import { getSiteConfig } from './site-config';
import { getDeliveryLocale } from './delivery-locale';

export const COOKIE_LOCALE = 'NEXT_LOCALE';

/**
 * Limba request-ului curent — **sursa unică** pentru tot ce se randează pe
 * server: mesajele next-intl (`i18n/request.ts`), `<html lang>` din layout și
 * metadata OG a paginilor.
 *
 * Ordinea:
 *  1. **Comanda**, pe paginile de livrare `/m/<id>`. Linkurile de livrare
 *     circulă — sunt trimise mai departe și partajate — deci domeniul pe care
 *     ajung nu spune în ce limbă e comanda.
 *  2. **Configurarea site-ului.** Un domeniu = o limbă, iar vizitatorul nu
 *     poate trece peste ea (per cerință): pe `chalgapodarok.bg` totul e bulgar.
 *  3. **Cookie-ul**, doar dacă site-ul n-are limbă validă (caz teoretic).
 *  4. `'ro'` — abia când nu știm nimic.
 *
 * Trăia în două locuri (`i18n/request.ts` și `app/layout.tsx`), cu aceeași
 * ordine scrisă de două ori. Le-am unit pentru că `getMessages({ locale })` NU
 * suprascrie configul de request: layoutul își calcula limba lui pentru
 * `<html lang>`, iar mesajele veneau din calculul celuilalt fișier. Cât timp
 * amândouă spuneau „site.locale" rezultatul era același; la prima divergență —
 * limba comenzii, adăugată aici — ar fi ieșit o pagină cu `lang="bg"` și texte
 * românești.
 */
export const getActiveLocale = cache(async (): Promise<Locale> => {
  const delivery = await getDeliveryLocale();
  if (delivery) return delivery;

  try {
    const site = await getSiteConfig();
    const fromSite = normalizeLocale(site.locale);
    if (fromSite) return fromSite;
  } catch {
    // ignorăm — fallback la cookie / default
  }

  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(COOKIE_LOCALE)?.value) ?? 'ro';
});
