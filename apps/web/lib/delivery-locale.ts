import { headers } from 'next/headers';
import { cache } from 'react';
import { normalizeLocale, type Locale } from '@/i18n/locales';
import { apiInternalUrl } from './api-internal';
import { deliveryIdFromPath } from './order-locale';

const API_INTERNAL = apiInternalUrl();

/**
 * Limba paginii de livrare pentru request-ul curent, sau `null` dacă nu e o
 * pagină de livrare (și atunci decide limba site-ului vizitat).
 *
 * Există pentru un caz verificat pe producție: linkul unei comenzi făcute pe
 * `chalgapodarok.bg`, deschis pe `manelecadou.ro/m/<id>`, se servea integral în
 * română — `<html lang="ro">` inclusiv — deși comanda, emailul de livrare și
 * melodia sunt bulgare. Linkurile de livrare circulă (sunt trimise mai departe,
 * partajate), deci domeniul pe care ajung nu spune nimic despre limba omului
 * care le deschide.
 *
 * Serverul întoarce limba site-ului PROPRIETAR al comenzii, cu limba scrisă pe
 * comandă ca rezervă — vezi `resolveDeliveryLocale` în API pentru de ce în
 * ordinea asta și nu invers.
 *
 * Eșecul e tăcut și cade pe site-ul vizitat: o hopă de API nu merită o pagină
 * de eroare pe linkul pentru care omul a plătit.
 */
export const getDeliveryLocale = cache(async (): Promise<Locale | null> => {
  try {
    const h = await headers();
    const id = deliveryIdFromPath(h.get('x-mc-pathname'));
    if (!id) return null;
    const res = await fetch(`${API_INTERNAL}/api/generations/${id}/locale`, {
      // Limba unei comenzi nu se schimbă, dar nici nu merită păstrată la
      // nesfârșit dacă site-ul proprietar e reconfigurat.
      next: { revalidate: 300, tags: [`delivery-locale:${id}`] },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { locale?: unknown };
    return normalizeLocale(body?.locale);
  } catch {
    return null;
  }
});
