/**
 * Vocabularul canonic de limbi al platformei + normalizarea lui.
 *
 * Lista era scrisă în trei locuri (`auth.controller.ts`, `i18n/locales.ts` pe
 * web, seturile ad-hoc din `chat-i18n` / `packages-i18n`). Aici e sursa pentru
 * tot ce ține de LIMBA UNEI COMENZI — restul rămân seturi de acoperire, adică
 * „pentru ce avem texte", nu „ce limbi există".
 */
export const SUPPORTED_LOCALES = ['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const SUPPORTED: ReadonlySet<string> = new Set(SUPPORTED_LOCALES);

/**
 * `bg-BG`, `BG`, `bg_BG`, ` bg ` → `bg`. Orice altceva → `null`.
 *
 * Browserele trimit forme regionale (`navigator.language` = `bg-BG`), iar un
 * `Set.has('bg-BG')` dă false: fără normalizare, o limbă configurată corect
 * cade tăcut pe fallback — exact modul de eșec pe care îl reparăm aici.
 */
export function normalizeLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== 'string') return null;
  const base = value.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  return SUPPORTED.has(base) ? (base as SupportedLocale) : null;
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED.has(value);
}

/**
 * Limba cu care se înregistrează o comandă.
 *
 * **Configurarea site-ului e autoritatea.** Un domeniu = o limbă: pe
 * `chalgapodarok.bg` o comandă e bulgară indiferent ce trimite clientul, iar
 * `locale` din payload e control de client (antet sau body scrise de mână).
 *
 * `requested` rămâne ca plasă pentru cazul în care site-ul nu se poate rezolva
 * (lookup eșuat, `siteId` lipsă) — atunci limba rezolvată în browser e tot ce
 * avem, și e mai bună decât o constantă.
 *
 * `'ro'` intervine DOAR când nu știm nimic. Înainte era primul răspuns, nu
 * ultimul: `dto.locale ?? 'ro'` scria română pe fiecare comandă bulgară făcută
 * prin checkout-ul pay-first, care nu trimite deloc câmpul.
 */
export function resolveOrderLocale(
  requested: unknown,
  siteLocale: unknown,
): SupportedLocale {
  return normalizeLocale(siteLocale) ?? normalizeLocale(requested) ?? 'ro';
}

/**
 * Limba în care se servește pagina de livrare a unei comenzi.
 *
 * Site-ul PROPRIETAR al comenzii, apoi limba scrisă pe comandă. Nu invers, și
 * nu site-ul vizitat:
 *
 *  • Site-ul vizitat ar fi greșit — linkurile de livrare circulă. Verificat pe
 *    producție: o comandă de pe `chalgapodarok.bg`, deschisă pe
 *    `manelecadou.ro/m/<id>`, se servea integral în română.
 *  • Limba de pe comandă nu poate fi prima, pentru că pe rândurile vechi e chiar
 *    bug-ul reparat aici: comenzi bulgare cu `locale='ro'` scris de fallback-ul
 *    global. Puse înaintea site-ului, ar fi ÎNTORS pe românește pagini care azi
 *    se văd corect în bulgară. Comenzile existente nu se modifică — deci le
 *    corectăm la citire.
 *
 * `null` = nu știm (comandă fără site și fără limbă validă); atunci decide
 * apelantul, cu limba site-ului vizitat.
 */
export function resolveDeliveryLocale(
  orderLocale: unknown,
  owningSiteLocale: unknown,
): SupportedLocale | null {
  return normalizeLocale(owningSiteLocale) ?? normalizeLocale(orderLocale);
}
