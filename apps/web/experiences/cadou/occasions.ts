import { OCC } from '@/lib/seed-data';
import type { SiteOccasionEntry } from '@/lib/site-shared';

/**
 * Ocaziile pe interfața Cadou — cele de cadou. Restul rămân pe UI-ul clasic.
 * Id-urile sunt din seed-ul ROMÂNESC; vezi `resolveCadouOccasions` pentru ce se
 * întâmplă pe un tenant cu catalog propriu.
 */
export const CADOU_OCCASION_IDS = ['zi', 'nunta', 'botez', 'dragoste', 'cuplu', 'nas', 'sef', 'altul'] as const;

/** Câte ocazii arătăm când alegem singuri din catalogul tenantului. */
const CADOU_OCCASION_COUNT = 8;
const MIN_MATCHES = 4;

/**
 * Aceeași corecție ca la stiluri (vezi `styles.ts`): un site cu catalog propriu
 * se servește DIN catalogul lui. Varianta veche suprapunea catalogul peste
 * seed-ul RO, deci pe site-ul grecesc — al cărui catalog e `genethlia, gamos,
 * vaptisi…` — grila afișa ocazii românești, iar comanda pleca cu un id pe care
 * tenantul nu-l cunoaște.
 */
export function resolveCadouOccasions(siteOccasions?: SiteOccasionEntry[] | null): SiteOccasionEntry[] {
  const own = (siteOccasions ?? []).map((o) => ({ id: o.id, em: o.em, nm: o.nm }));

  if (own.length > 0) {
    const byId = new Map<string, SiteOccasionEntry>();
    for (const o of own) byId.set(o.id, o);
    const picked = CADOU_OCCASION_IDS.map((id) => byId.get(id)).filter(
      (o): o is SiteOccasionEntry => !!o,
    );
    if (picked.length >= MIN_MATCHES) return picked.slice(0, CADOU_OCCASION_COUNT);
    return own.slice(0, CADOU_OCCASION_COUNT);
  }

  const byId = new Map<string, SiteOccasionEntry>();
  for (const o of OCC) byId.set(o.id, { id: o.id, em: o.em, nm: o.nm });
  return CADOU_OCCASION_IDS.map((id) => byId.get(id)).filter((o): o is SiteOccasionEntry => !!o);
}
