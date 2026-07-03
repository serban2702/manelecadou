/**
 * Normalizare localitate + județ pentru facturare (SmartBill).
 *
 * Regula de aur: la județ trimitem DOAR un județ RO valid (unul din cele 42) sau NIMIC.
 * Niciodată o valoare verbatim — Stripe pune în `address.state` orice a scris clientul
 * (localități „Straja", regiuni străine „Oxfordshire"/„MI"/„County Dublin"), iar acelea
 * NU sunt județe. Pentru București: județ = „Bucuresti", localitate = „Sector N".
 */

/** Județele RO acceptate de SmartBill (denumiri standard, fără diacritice). */
export const RO_COUNTIES = [
  'Alba', 'Arad', 'Arges', 'Bacau', 'Bihor', 'Bistrita-Nasaud', 'Botosani',
  'Brasov', 'Braila', 'Bucuresti', 'Buzau', 'Caras-Severin', 'Calarasi', 'Cluj',
  'Constanta', 'Covasna', 'Dambovita', 'Dolj', 'Galati', 'Giurgiu', 'Gorj',
  'Harghita', 'Hunedoara', 'Ialomita', 'Iasi', 'Ilfov', 'Maramures', 'Mehedinti',
  'Mures', 'Neamt', 'Olt', 'Prahova', 'Satu Mare', 'Salaj', 'Sibiu', 'Suceava',
  'Teleorman', 'Timis', 'Tulcea', 'Vaslui', 'Valcea', 'Vrancea',
];

/** Cod ISO 3166-2:RO (fără prefix RO-) → denumire SmartBill. */
const ISO_TO_COUNTY: Record<string, string> = {
  AB: 'Alba', AR: 'Arad', AG: 'Arges', BC: 'Bacau', BH: 'Bihor',
  BN: 'Bistrita-Nasaud', BT: 'Botosani', BV: 'Brasov', BR: 'Braila',
  B: 'Bucuresti', BZ: 'Buzau', CS: 'Caras-Severin', CL: 'Calarasi', CJ: 'Cluj',
  CT: 'Constanta', CV: 'Covasna', DB: 'Dambovita', DJ: 'Dolj', GL: 'Galati',
  GR: 'Giurgiu', GJ: 'Gorj', HR: 'Harghita', HD: 'Hunedoara', IL: 'Ialomita',
  IS: 'Iasi', IF: 'Ilfov', MM: 'Maramures', MH: 'Mehedinti', MS: 'Mures',
  NT: 'Neamt', OT: 'Olt', PH: 'Prahova', SM: 'Satu Mare', SJ: 'Salaj',
  SB: 'Sibiu', SV: 'Suceava', TR: 'Teleorman', TM: 'Timis', TL: 'Tulcea',
  VS: 'Vaslui', VL: 'Valcea', VN: 'Vrancea',
};

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Normalizează un județ la denumirea SmartBill **DOAR dacă e un județ RO valid**.
 * Acceptă: cod ISO („RO-CJ"/„CJ"), nume cu/fără diacritice, variante București/sector.
 * Returnează `null` pentru orice altceva (localitate, regiune străină, gunoi) — nu
 * inventăm și nu păstrăm verbatim.
 */
export function normalizeCounty(raw?: string | null): string | null {
  if (!raw) return null;
  const v = stripDiacritics(String(raw).trim());
  if (!v) return null;
  const iso = v.toUpperCase().replace(/^RO[-\s]?/, '');
  if (ISO_TO_COUNTY[iso]) return ISO_TO_COUNTY[iso];
  const lower = v.toLowerCase();
  const hit = RO_COUNTIES.find((c) => stripDiacritics(c).toLowerCase() === lower);
  if (hit) return hit;
  if (lower.includes('bucur') || lower === 'bucharest' || lower.startsWith('sector')) {
    return 'Bucuresti';
  }
  return null; // necunoscut → gol
}

/** Numărul sectorului București (1-6) din oraș/adresă („Sector N"/„S N") sau din
 *  codul poștal (0Nxxxx — a doua cifră = sectorul). Null dacă nedeterminabil. */
export function detectBucharestSector(opts: {
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
}): number | null {
  const text = stripDiacritics(`${opts.city ?? ''} ${opts.address ?? ''}`).toLowerCase();
  const m = text.match(/sector(?:ul)?\s*0*([1-6])(?!\d)/);
  if (m) return Number(m[1]);
  const abbr = stripDiacritics(opts.city ?? '').trim().toLowerCase().match(/^s\s*0*([1-6])$/);
  if (abbr) return Number(abbr[1]);
  const pc = (opts.postalCode ?? '').replace(/\s/g, '');
  if (/^0[1-6]\d{4}$/.test(pc)) return Number(pc[1]);
  return null;
}

/**
 * Rezolvă localitatea + județul pentru SmartBill.
 * - București (județ/oraș/„sector"/cod poștal 0Nxxxx) → județ „Bucuresti", localitate „Sector N".
 * - Județ RO valid → păstrat normalizat.
 * - Orice altceva (localitate pusă la județ, regiune străină) → județ NULL (gol).
 * Localitatea (city) e păstrată ca atare (mai puțin la București, unde devine „Sector N").
 */
export function resolveLocalityForSmartbill(raw: {
  city?: string | null;
  county?: string | null;
  address?: string | null;
  postalCode?: string | null;
}): { city: string | null; county: string | null } {
  const normCounty = normalizeCounty(raw.county);
  const cityTxt = stripDiacritics(raw.city ?? '').toLowerCase();
  const pc = (raw.postalCode ?? '').replace(/\s/g, '');
  const combined = stripDiacritics(`${raw.city ?? ''} ${raw.address ?? ''}`).toLowerCase();
  const looksBucharest =
    normCounty === 'Bucuresti' ||
    cityTxt.includes('bucur') ||
    cityTxt.includes('bucharest') ||
    /sector/.test(combined) ||
    /^s\s*0*[1-6]$/.test(cityTxt.trim()) ||
    /^0[1-6]\d{4}$/.test(pc);
  if (!looksBucharest) {
    // Județ = doar dacă e RO valid; altfel gol. Orașul rămâne cum e.
    return { city: raw.city ?? null, county: normCounty };
  }
  const sector = detectBucharestSector(raw);
  return {
    county: 'Bucuresti',
    city: sector ? `Sector ${sector}` : raw.city ?? 'Bucuresti',
  };
}
