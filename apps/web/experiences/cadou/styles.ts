import { STYLES } from '@/lib/seed-data';
import type { SiteStyleEntry } from '@/lib/site-shared';

/**
 * Stilurile pe interfața Cadou — o selecție scurtă, nu tot catalogul.
 * `nmFrom` împrumută numele (și traducerile lui) de la un alt stil din catalog,
 * ca să nu ținem un literal RO aici: `clasic` se afișează cu numele lui `pahar`
 * („De pahar"), tradus per-site / per-locale ca orice alt stil.
 *
 * Id-urile de mai jos sunt cele din seed-ul ROMÂNESC. Ele se aplică DOAR
 * site-urilor care merg pe acel seed — vezi `resolveCadouStyles`.
 */
const CADOU_STYLES: Array<{ id: string; nmFrom?: string }> = [
  { id: 'iubire' },
  { id: 'romantica' },
  { id: 'clasic', nmFrom: 'pahar' },
  { id: 'opulenta' },
  { id: 'trompeta' },
  { id: 'oriental' },
];

/** Câte stiluri arătăm pe interfața cadou când alegem singuri din catalog. */
const CADOU_STYLE_COUNT = 6;
/** Sub atâtea potriviri, selecția fixă e considerată nepotrivită pentru tenant. */
const MIN_MATCHES = 3;

/**
 * Selecția de stiluri pentru interfața cadou.
 *
 * ATENȚIE la ordinea de mai jos — aici era un defect cu efect direct pe
 * calitatea produsului livrat. Varianta veche pornea de la seed-ul RO și
 * suprascria cu stilurile tenantului, deci `byId.get('iubire')` reușea MEREU,
 * chiar și pe un site bulgăresc al cărui catalog e `popfolk, kyuchek, talava…`.
 * Rezultatul: grila arăta 6 stiluri românești pe site-ul bulgăresc, iar comanda
 * pleca cu `style=iubire`, id inexistent în `site.suno.stylePromptMap` al acelui
 * tenant → providerul cădea pe harta RO și genera manea românească pentru un
 * client care voia chalga.
 *
 * Regula corectă: un site cu catalog propriu se servește DIN catalogul lui.
 * Seed-ul RO intră în discuție doar pentru site-urile care n-au catalog.
 */
export function resolveCadouStyles(siteStyles?: SiteStyleEntry[] | null): SiteStyleEntry[] {
  const own = siteStyles ?? [];

  if (own.length > 0) {
    const byId = new Map<string, SiteStyleEntry>();
    for (const s of own) byId.set(s.id, s);
    const picked = pick(CADOU_STYLES, byId);
    // Selecția fixă e gândită pe seed-ul RO. Dacă tenantul are alt catalog, ea
    // nu se regăsește — atunci luăm primele stiluri ALE LUI, în ordinea în care
    // le-a pus în admin.
    if (picked.length >= MIN_MATCHES) return picked.slice(0, CADOU_STYLE_COUNT);
    return own.slice(0, CADOU_STYLE_COUNT);
  }

  const byId = new Map<string, SiteStyleEntry>();
  for (const s of STYLES) {
    byId.set(s.id, { id: s.id, em: s.em, nm: s.nm, ds: s.ds, heat: s.heat, ic: s.ic });
  }
  return pick(CADOU_STYLES, byId);
}

function pick(
  wanted: Array<{ id: string; nmFrom?: string }>,
  byId: Map<string, SiteStyleEntry>,
): SiteStyleEntry[] {
  const out: SiteStyleEntry[] = [];
  for (const want of wanted) {
    const src = byId.get(want.id);
    if (!src) continue;
    const alias = want.nmFrom ? byId.get(want.nmFrom) : undefined;
    out.push(alias ? { ...src, nm: alias.nm, i18n: borrowNameI18n(src.i18n, alias.i18n) } : src);
  }
  return out;
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
