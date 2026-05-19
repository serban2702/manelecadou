/**
 * Map locale-ul unui site (ex. `ro`, `bg`, `sr`) la metadatele țării folosite în
 * selectorul de țară din topbar: cod ISO 3166-1 alpha-2 (pentru flag CDN) și
 * numele țării în limba nativă.
 */
export interface CountryMeta {
  code: string;       // ISO 3166-1 alpha-2 lowercase, ex. "ro" — folosit la flagcdn.com
  name: string;       // numele țării în limba ei
}

const MAP: Record<string, CountryMeta> = {
  ro: { code: 'ro', name: 'România' },
  bg: { code: 'bg', name: 'България' },
  sr: { code: 'rs', name: 'Srbija' },
  rs: { code: 'rs', name: 'Srbija' },
  tr: { code: 'tr', name: 'Türkiye' },
  el: { code: 'gr', name: 'Ελλάδα' },
  gr: { code: 'gr', name: 'Ελλάδα' },
  hr: { code: 'hr', name: 'Hrvatska' },
  sl: { code: 'si', name: 'Slovenija' },
  bs: { code: 'ba', name: 'Bosna i Hercegovina' },
  sq: { code: 'al', name: 'Shqipëria' },
  mk: { code: 'mk', name: 'Северна Македонија' },
  hu: { code: 'hu', name: 'Magyarország' },
  en: { code: 'gb', name: 'United Kingdom' },
};

export function countryMetaFromLocale(locale: string): CountryMeta {
  const key = locale.toLowerCase();
  return MAP[key] ?? { code: key.slice(0, 2), name: key.toUpperCase() };
}

/** URL SVG steag de la flagcdn (CDN public, fără cost, fără auth). */
export function flagSvgUrl(countryCode: string): string {
  return `https://flagcdn.com/${countryCode.toLowerCase()}.svg`;
}
