'use client';

import { useFromPriceCents } from '@/experiences/use-packages';

/**
 * Prețul „de la" pe interfața Cadou = cel mai mic preț dintre pachetele ACTIVE,
 * din configul de site (deja rezolvat de API cu prețul tenantului + override-ul
 * pe interfață). `null` = nu-l știm încă → afișează schelet, nu o cifră de cod.
 *
 * Înainte era un fetch la `/payments/quote?packageTier=basic` cu fallback pe o
 * constantă RON din cod — pe un site în EUR arăta cifra greșită până venea
 * răspunsul, și ignora complet un `basic` dezactivat din admin.
 */
export function useCadouFromPrice(): number | null {
  return useFromPriceCents();
}
