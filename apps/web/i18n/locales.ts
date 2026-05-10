export const LOCALES = ['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale =
  (process.env.NEXT_PUBLIC_DEFAULT_LOCALE as Locale | undefined) ?? 'ro';

export const LOCALE_META: Record<Locale, { name: string; flag: string; html: string; og: string }> = {
  ro: { name: 'Română',       flag: '🇷🇴', html: 'ro', og: 'ro_RO' },
  bg: { name: 'Български',    flag: '🇧🇬', html: 'bg', og: 'bg_BG' },
  sr: { name: 'Српски',       flag: '🇷🇸', html: 'sr', og: 'sr_RS' },
  tr: { name: 'Türkçe',       flag: '🇹🇷', html: 'tr', og: 'tr_TR' },
  el: { name: 'Ελληνικά',     flag: '🇬🇷', html: 'el', og: 'el_GR' },
  hr: { name: 'Hrvatski',     flag: '🇭🇷', html: 'hr', og: 'hr_HR' },
  sl: { name: 'Slovenščina',  flag: '🇸🇮', html: 'sl', og: 'sl_SI' },
  bs: { name: 'Bosanski',     flag: '🇧🇦', html: 'bs', og: 'bs_BA' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
