import { DEFAULT_EXPERIENCE_SLUG, isKnownExperienceSlug } from './catalog';
import type {
  ExperienceUtmRule,
  ResolveExperienceInput,
  ResolveExperienceResult,
  SiteExperienceConfig,
} from './types';

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

/**
 * classic cannot be turned off — a missing/disabled default must not lock the site.
 * A slug with no config entry counts as NOT enabled: otherwise a stale `mc_ui`
 * cookie (365 days) would force an experience onto a tenant that never turned it
 * on, including when the config comes back null because the API is down. Must
 * give the same verdict as `toPublicExperienceConfig` in public-config.ts.
 */
export function isExperienceEnabled(slug: string, config?: SiteExperienceConfig | null): boolean {
  if (!isKnownExperienceSlug(slug)) return false;
  if (slug === DEFAULT_EXPERIENCE_SLUG) return true;
  if (slug === config?.defaultSlug) return true;
  const item = config?.items?.[slug];
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
function isExperienceSticky(slug: string, config?: SiteExperienceConfig | null): boolean {
  if (isExperienceEnabled(slug, config)) return true;
  if (!isKnownExperienceSlug(slug)) return false;
  return !!config?.items?.[slug];
}

function pickIfUsable(slug: string | null | undefined, config?: SiteExperienceConfig | null): string | null {
  if (!slug) return null;
  const trimmed = slug.trim();
  if (!isExperienceEnabled(trimmed, config)) return null;
  return trimmed;
}

/** Ca `pickIfUsable`, dar acceptă și o interfață oprită pe care userul e deja. */
function pickIfSticky(slug: string | null | undefined, config?: SiteExperienceConfig | null): string | null {
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
    const rules = item.utmRules ?? [];
    for (const rule of rules) {
      if (utmMatches(rule, utm)) return slug;
    }
  }
  return null;
}

function defaultSlug(config?: SiteExperienceConfig | null): string {
  const fromConfig = pickIfUsable(config?.defaultSlug, config);
  if (fromConfig) return fromConfig;
  return DEFAULT_EXPERIENCE_SLUG;
}

/**
 * Assignment order (spec §5):
 * 1. ?ui=  2. cookie  3. person (fingerprint/device)  4. UTM  5. site default
 */
export function resolveExperienceSlug(input: ResolveExperienceInput): ResolveExperienceResult {
  const cfg = input.config ?? null;

  // ?ui= is for internal preview but still respects `enabled`: to test an
  // experience on a site you enable it without making it the default. Without
  // the guard, a stray `?ui=cadou` link sticks the experience on visitors for a
  // year through the cookie.
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
