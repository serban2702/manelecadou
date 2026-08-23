/** Must stay in sync with apps/api/src/modules/experiences/assign.ts */
import { DEFAULT_EXPERIENCE_SLUG, isKnownExperienceSlug } from './catalog';
import type {
  ExperienceUtmRule,
  ResolveExperienceInput,
  ResolveExperienceResult,
  SiteExperienceConfigLite,
} from './types';

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

export function isExperienceEnabled(slug: string, config?: SiteExperienceConfigLite | null): boolean {
  if (!isKnownExperienceSlug(slug)) return false;
  if (slug === DEFAULT_EXPERIENCE_SLUG) return true;
  if (slug === config?.defaultSlug) return true;
  const item = config?.items?.[slug];
  // Lipsa configurării înseamnă „nu e activată pe site-ul ăsta", nu „e liberă".
  // Altfel un cookie mc_ui rămas de la un test (365 de zile) ar forța interfața
  // pe un tenant care n-a activat-o niciodată — inclusiv când configul vine
  // null pentru că API-ul a picat. Trebuie să dea același verdict ca
  // `toPublicExperienceConfig` din experiences/public-config.ts.
  if (!item) return false;
  return item.enabled !== false;
}

/**
 * Sticky: interfața pe care vizitatorul o are deja (cookie / person). Dacă
 * operatorul o oprește (`enabled: false`) după ce omul a intrat pe ea, îl lăsăm
 * pe ea — altfel i-am schimba UI-ul în mijlocul comenzii (spec §13).
 * Diferența față de `isExperienceEnabled`: aici contează că interfața E
 * CONFIGURATĂ pe site, chiar dacă e oprită. Un slug fără nicio intrare (sau cu
 * config null pentru că API-ul a picat) tot nu trece — altfel un cookie vechi
 * ar prelua un site care n-a activat-o niciodată.
 */
function isExperienceSticky(slug: string, config?: SiteExperienceConfigLite | null): boolean {
  if (isExperienceEnabled(slug, config)) return true;
  if (!isKnownExperienceSlug(slug)) return false;
  return !!config?.items?.[slug];
}

function pickIfUsable(slug: string | null | undefined, config?: SiteExperienceConfigLite | null): string | null {
  if (!slug) return null;
  const trimmed = slug.trim();
  if (!isExperienceEnabled(trimmed, config)) return null;
  return trimmed;
}

/** Ca `pickIfUsable`, dar acceptă și o interfață oprită pe care userul e deja. */
function pickIfSticky(slug: string | null | undefined, config?: SiteExperienceConfigLite | null): string | null {
  if (!slug) return null;
  const trimmed = slug.trim();
  if (!isExperienceSticky(trimmed, config)) return null;
  return trimmed;
}

function utmMatches(
  rule: ExperienceUtmRule,
  utm: { source?: string | null; campaign?: string | null; content?: string | null },
): boolean {
  const checks: Array<[string | undefined, string | null | undefined]> = [
    [rule.source, utm.source],
    [rule.campaign, utm.campaign],
    [rule.content, utm.content],
  ];
  let anyConstraint = false;
  for (const [ruleVal, actual] of checks) {
    if (!ruleVal || !ruleVal.trim()) continue;
    anyConstraint = true;
    if (norm(ruleVal) !== norm(actual)) return false;
  }
  return anyConstraint;
}

function matchUtm(input: ResolveExperienceInput): string | null {
  const utm = input.utm;
  const items = input.config?.items;
  if (!utm || !items) return null;
  for (const [slug, item] of Object.entries(items)) {
    if (!isExperienceEnabled(slug, input.config)) continue;
    for (const rule of item.utmRules ?? []) {
      if (utmMatches(rule, utm)) return slug;
    }
  }
  return null;
}

function defaultSlug(config?: SiteExperienceConfigLite | null): string {
  return pickIfUsable(config?.defaultSlug, config) ?? DEFAULT_EXPERIENCE_SLUG;
}

export function resolveExperienceSlug(input: ResolveExperienceInput): ResolveExperienceResult {
  const cfg = input.config ?? null;
  // `?ui=` e pentru preview intern, dar respectă activarea: ca să testezi o
  // interfață pe un site, o activezi (`enabled: true`) fără s-o pui default.
  // Fără gardă, un link `?ui=cadou` scăpat pe social ar lipi interfața pe
  // vizitatori un an prin cookie.
  const ui = pickIfUsable(input.uiParam, cfg);
  if (ui) return { slug: ui, reason: 'url' };
  const fromCookie = pickIfSticky(input.cookieSlug, cfg);
  if (fromCookie) return { slug: fromCookie, reason: 'cookie' };
  const fromPerson = pickIfSticky(input.personSlug, cfg);
  if (fromPerson) return { slug: fromPerson, reason: 'fingerprint' };
  const fromUtm = matchUtm(input);
  if (fromUtm) return { slug: fromUtm, reason: 'utm' };
  return { slug: defaultSlug(cfg), reason: 'default' };
}
