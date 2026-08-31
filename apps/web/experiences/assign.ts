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

/**
 * `classic` e plasa de siguranță a site-ului: dacă `experienceConfig` lipsește
 * (API picat) sau interfața implicită e oprită, trebuie să existe unde cădea.
 * De aceea NU poate fi oprită necondiționat — doar cât timp o ALTĂ interfață e
 * simultan activată și implicită, adică chiar poate prelua homepage-ul.
 *
 * Există pentru un caz concret: pe un tenant care rulează doar `cadou`, adminul
 * afișează linkul `?ui=classic` cu buton de copiere. Scăpat într-o reclamă sau
 * într-un mesaj către clienți, lipea interfața greșită pe vizitator 365 de zile,
 * prin cookie-ul `mc_ui`.
 */
function classicCanBeOff(config?: SiteExperienceConfigLite | null): boolean {
  const fallback = config?.defaultSlug?.trim();
  if (!fallback || fallback === DEFAULT_EXPERIENCE_SLUG) return false;
  // Nu recursează: `fallback !== DEFAULT_EXPERIENCE_SLUG`, deci apelul de mai
  // jos intră pe ramura obișnuită, care nu mai ajunge aici.
  return isExperienceEnabled(fallback, config);
}

export function isExperienceEnabled(slug: string, config?: SiteExperienceConfigLite | null): boolean {
  if (!isKnownExperienceSlug(slug)) return false;
  const item = config?.items?.[slug];
  if (slug === DEFAULT_EXPERIENCE_SLUG) {
    return item?.enabled === false ? !classicCanBeOff(config) : true;
  }
  // `defaultSlug` NU ține în viață o interfață oprită: dacă operatorul o
  // oprește cât timp e implicită, site-ul cade pe classic. Altfel „oprită"
  // n-ar însemna nimic exact în cazul în care e cel mai vizibilă.
  //
  // Lipsa configurării înseamnă „nu e activată pe site-ul ăsta", nu „e liberă".
  // Altfel un cookie mc_ui rămas de la un test (365 de zile) ar forța interfața
  // pe un tenant care n-a activat-o niciodată — inclusiv când configul vine
  // null pentru că API-ul a picat. Trebuie să dea același verdict ca
  // `toPublicExperienceConfig` din experiences/public-config.ts.
  if (!item) return false;
  return item.enabled !== false;
}

function pickIfUsable(slug: string | null | undefined, config?: SiteExperienceConfigLite | null): string | null {
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
  // Cookie-ul și amprenta trec prin ACEEAȘI poartă ca `?ui=`. A existat o
  // excepție („sticky"): pe cine intrase deja pe o interfață îl lăsam pe ea
  // chiar după ce operatorul o oprea, ca să nu-i schimbăm UI-ul în mijlocul
  // comenzii. Consecința era că „oprită" nu însemna oprită: oricine avea
  // cookie-ul de la un test rămânea pe ea încă un an. Decizie 29 aug 2026:
  // oprit înseamnă inaccesibil, pentru toată lumea, imediat.
  const fromCookie = pickIfUsable(input.cookieSlug, cfg);
  if (fromCookie) return { slug: fromCookie, reason: 'cookie' };
  const fromPerson = pickIfUsable(input.personSlug, cfg);
  if (fromPerson) return { slug: fromPerson, reason: 'fingerprint' };
  const fromUtm = matchUtm(input);
  if (fromUtm) return { slug: fromUtm, reason: 'utm' };
  return { slug: defaultSlug(cfg), reason: 'default' };
}
