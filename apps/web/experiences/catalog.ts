export const EXPERIENCE_CATALOG = [
  { slug: 'classic', label: 'Classic (site-ul actual)' },
  { slug: 'cadou', label: 'Cadou (landing + wizard 4 pași)' },
] as const;

export type ExperienceSlug = (typeof EXPERIENCE_CATALOG)[number]['slug'];
export const DEFAULT_EXPERIENCE_SLUG: ExperienceSlug = 'classic';

const KNOWN = new Set<string>(EXPERIENCE_CATALOG.map((e) => e.slug));

export function isKnownExperienceSlug(slug: string | null | undefined): slug is ExperienceSlug {
  return typeof slug === 'string' && KNOWN.has(slug);
}
