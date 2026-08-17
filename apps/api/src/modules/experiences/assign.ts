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

/** classic cannot be turned off — a missing/disabled default must not lock the site. */
export function isExperienceEnabled(slug: string, config?: SiteExperienceConfig | null): boolean {
  if (!isKnownExperienceSlug(slug)) return false;
  if (slug === DEFAULT_EXPERIENCE_SLUG) return true;
  const item = config?.items?.[slug];
  if (!item) return true;
  return item.enabled !== false;
}

function pickIfUsable(slug: string | null | undefined, config?: SiteExperienceConfig | null): string | null {
  if (!slug) return null;
  const trimmed = slug.trim();
  if (!isExperienceEnabled(trimmed, config)) return null;
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

  // ?ui= forces any known slug (owner testing). enabled=false only blocks UTM/default.
  const ui = input.uiParam?.trim() ?? '';
  if (isKnownExperienceSlug(ui)) return { slug: ui, reason: 'url' };

  const fromCookie = pickIfUsable(input.cookieSlug, cfg);
  if (fromCookie) return { slug: fromCookie, reason: 'cookie' };

  const fromPerson = pickIfUsable(input.personSlug, cfg);
  if (fromPerson) return { slug: fromPerson, reason: 'fingerprint' };

  const fromUtm = matchUtm(input);
  if (fromUtm) return { slug: fromUtm, reason: 'utm' };

  return { slug: defaultSlug(cfg), reason: 'default' };
}
