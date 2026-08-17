import { DEFAULT_EXPERIENCE_SLUG, isKnownExperienceSlug } from './catalog';
import { classicExperience } from './classic';
import type { ExperienceModule } from './types';

const REGISTRY: Record<string, ExperienceModule> = {
  classic: classicExperience,
};

export function getExperience(slug: string | null | undefined): ExperienceModule {
  if (slug && REGISTRY[slug]) return REGISTRY[slug];
  return REGISTRY[DEFAULT_EXPERIENCE_SLUG];
}

export function isRegisteredExperience(slug: string | null | undefined): boolean {
  return !!slug && !!REGISTRY[slug] && isKnownExperienceSlug(slug);
}

export { REGISTRY };
