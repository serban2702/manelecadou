import { isExperienceEnabled } from './assign';
import { EXPERIENCE_CATALOG, isKnownExperienceSlug } from './catalog';
import { resolveExperiencePackages, type SitePackagePricing } from './package-resolve';
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
    ...(Array.isArray(catalog.testimonials)
      ? {
          testimonials: catalog.testimonials.map((t) => ({
            id: t.id,
            stars: t.stars,
            quote: t.quote,
            name: t.name,
            role: t.role,
            avatar: t.avatar,
            i18n: t.i18n,
          })),
        }
      : {}),
  };
}

/**
 * Configul public al interfețelor.
 *
 * `sitePricing` = `{ prices: site.packagePricesCents, compareAt: site.packageCompareAtCents }`.
 * Fără el, pachetele expuse cad pe prețul de LISTĂ din cod, care pe un tenant
 * cu preț propriu (ex. EUR) diferă de ce taxează Stripe. Trebuie pasat mereu de
 * la controller — vezi `PublicSiteController.serialize`.
 */
export function toPublicExperienceConfig(
  config?: SiteExperienceConfig | null,
  sitePricing?: SitePackagePricing | null,
) {
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
    // Verdictul vine din `isExperienceEnabled`, nu dintr-o copie a regulii:
    // erau două locuri care trebuiau să spună același lucru, și au divergit
    // deja o dată. `defaultSlug` nu e o scutire — o interfață oprită e oprită
    // chiar dacă a rămas marcată implicită (atunci site-ul cade pe classic).
    const enabled = isExperienceEnabled(slug, config);
    items[slug] = {
      enabled,
      utmRules: item?.utmRules ?? [],
      packages: resolveExperiencePackages(slug, item?.packages ?? null, sitePricing ?? null),
      catalog: toPublicCatalog(item?.catalog),
    };
  }
  return { defaultSlug, items };
}
