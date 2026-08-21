import { EXPERIENCE_CATALOG, isKnownExperienceSlug } from './catalog';
import { resolveExperiencePackages } from './package-resolve';
import type { ExperienceCatalogConfig, SiteExperienceConfig } from './types';

function toPublicCatalog(catalog?: ExperienceCatalogConfig | null) {
  if (!catalog) return undefined;
  const styles = (catalog.styles ?? []).map((s) => ({
    id: s.id,
    em: s.em || '🎵',
    nm: s.nm,
    ds: s.ds || '',
    heat: s.heat,
    ic: s.ic,
    i18n: s.i18n,
    artUrl: s.artUrl,
    sampleUrl: s.sampleUrl,
    sampleStartSec: s.sampleStartSec,
  }));
  const occasions = (catalog.occasions ?? []).map((o) => ({
    id: o.id,
    em: o.em || '✨',
    nm: o.nm,
    ic: o.ic,
    i18n: o.i18n,
  }));
  const voices = (catalog.voices ?? []).map((v) => ({
    id: v.id,
    nm: v.nm,
    tg: v.tg || '',
    av: v.av || '',
    ic: v.ic,
    i18n: v.i18n,
  }));
  const reactionClips = (catalog.reactionClips ?? []).map((c) => ({
    id: c.id,
    platform: c.platform === 'instagram' ? 'instagram' as const : 'tiktok' as const,
    videoUrl: c.videoUrl,
    posterUrl: c.posterUrl,
    audioUrl: c.audioUrl,
    demoId: c.demoId ?? null,
    username: c.username,
    caption: c.caption,
    song: c.song,
    likes: c.likes,
    comments: c.comments,
    shares: c.shares,
    avatarUrl: c.avatarUrl,
    previewStartSec: c.previewStartSec,
  }));
  return {
    styles,
    occasions,
    voices,
    demoIds: catalog.demoIds ?? null,
    reactionClips,
  };
}

export function toPublicExperienceConfig(config?: SiteExperienceConfig | null) {
  const defaultSlug = config?.defaultSlug && isKnownExperienceSlug(config.defaultSlug)
    ? config.defaultSlug
    : 'classic';
  const items: Record<string, {
    enabled: boolean;
    utmRules: Array<{ source?: string; campaign?: string; content?: string }>;
    packages: ReturnType<typeof resolveExperiencePackages>;
    catalog?: ReturnType<typeof toPublicCatalog>;
  }> = {};
  for (const { slug } of EXPERIENCE_CATALOG) {
    const item = config?.items?.[slug];
    const enabled = slug === 'classic' ? true : item?.enabled !== false && !!item;
    items[slug] = {
      enabled,
      utmRules: item?.utmRules ?? [],
      packages: resolveExperiencePackages(slug, item?.packages ?? null),
      catalog: toPublicCatalog(item?.catalog),
    };
  }
  return { defaultSlug, items };
}
