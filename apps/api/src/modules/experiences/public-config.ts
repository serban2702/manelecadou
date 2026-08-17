import { EXPERIENCE_CATALOG, isKnownExperienceSlug } from './catalog';
import { resolveExperiencePackages } from './package-resolve';
import type { SiteExperienceConfig } from './types';

export function toPublicExperienceConfig(config?: SiteExperienceConfig | null) {
  const defaultSlug = config?.defaultSlug && isKnownExperienceSlug(config.defaultSlug)
    ? config.defaultSlug
    : 'classic';
  const items: Record<string, {
    enabled: boolean;
    utmRules: Array<{ source?: string; campaign?: string; content?: string }>;
    packages: ReturnType<typeof resolveExperiencePackages>;
  }> = {};
  for (const { slug } of EXPERIENCE_CATALOG) {
    const item = config?.items?.[slug];
    const enabled = slug === 'classic' ? true : item?.enabled !== false && !!item;
    items[slug] = {
      enabled,
      utmRules: item?.utmRules ?? [],
      packages: resolveExperiencePackages(slug, item?.packages ?? null),
    };
  }
  return { defaultSlug, items };
}
