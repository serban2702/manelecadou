import { STYLES } from '@/lib/seed-data';
import type { SiteStyleEntry } from '@/lib/site-shared';

/**
 * Stilurile pe interfața Cadou — 6, cele mai cerute în RO.
 * `nmFrom` împrumută numele (și traducerile lui) de la un alt stil din catalog,
 * ca să nu ținem un literal RO aici: `clasic` se afișează cu numele lui `pahar`
 * („De pahar"), tradus per-site / per-locale ca orice alt stil.
 */
const CADOU_STYLES: Array<{ id: string; nmFrom?: string }> = [
  { id: 'iubire' },
  { id: 'romantica' },
  { id: 'clasic', nmFrom: 'pahar' },
  { id: 'opulenta' },
  { id: 'trompeta' },
  { id: 'oriental' },
];

export function resolveCadouStyles(siteStyles?: SiteStyleEntry[] | null): SiteStyleEntry[] {
  const seed = STYLES.map((s) => ({
    id: s.id, em: s.em, nm: s.nm, ds: s.ds, heat: s.heat, ic: s.ic,
  }));
  const byId = new Map<string, SiteStyleEntry>();
  for (const s of seed) byId.set(s.id, s);
  for (const s of siteStyles ?? []) byId.set(s.id, s);
  return CADOU_STYLES.map((pick) => {
    const src = byId.get(pick.id);
    if (!src) return null;
    const alias = pick.nmFrom ? byId.get(pick.nmFrom) : undefined;
    if (!alias) return src;
    return { ...src, nm: alias.nm, i18n: borrowNameI18n(src.i18n, alias.i18n) };
  }).filter((s): s is SiteStyleEntry => !!s);
}

type StyleI18n = SiteStyleEntry['i18n'];

/** Păstrează `ds`/`heat` ale stilului, dar ia `nm` de la stilul împrumutat. */
function borrowNameI18n(own: StyleI18n, borrowed: StyleI18n): StyleI18n {
  if (!own && !borrowed) return undefined;
  const locales = new Set([...Object.keys(own ?? {}), ...Object.keys(borrowed ?? {})]);
  const out: NonNullable<StyleI18n> = {};
  for (const loc of locales) {
    const mine = own?.[loc] ?? {};
    const nm = borrowed?.[loc]?.nm;
    out[loc] = nm ? { ...mine, nm } : mine;
  }
  return out;
}
