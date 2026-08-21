'use client';

import { useMemo } from 'react';
import { OCC, STYLES, VOICES } from '@/lib/seed-data';
import { useSite } from '@/lib/site-context';
import type { SiteOccasionEntry, SiteSampleEntry, SiteStyleEntry, SiteVoiceEntry } from '@/lib/site-shared';
import { useExperience } from '@/lib/experience-context';
import { resolveCadouOccasions } from './cadou/occasions';
import { resolveCadouStyles } from './cadou/styles';
import type { CadouReactionClip } from './cadou/reactions';

export function useExperienceCatalog() {
  const site = useSite();
  const exp = useExperience();
  const cat = site.experienceConfig?.items?.[exp.slug]?.catalog;

  const styles: SiteStyleEntry[] = useMemo(() => {
    if (cat?.styles?.length) return cat.styles;
    if (exp.slug === 'cadou') return resolveCadouStyles(site.styles);
    if (site.styles?.length) return site.styles;
    return STYLES.map((s) => ({ id: s.id, em: s.em, nm: s.nm, ds: s.ds, heat: s.heat }));
  }, [cat?.styles, exp.slug, site.styles]);

  const occasions: SiteOccasionEntry[] = useMemo(() => {
    if (cat?.occasions?.length) return cat.occasions;
    if (exp.slug === 'cadou') return resolveCadouOccasions(site.occasions);
    if (site.occasions?.length) return site.occasions;
    return OCC.map((o) => ({ id: o.id, em: o.em, nm: o.nm }));
  }, [cat?.occasions, exp.slug, site.occasions]);

  const voices: SiteVoiceEntry[] = useMemo(() => {
    if (cat?.voices?.length) return cat.voices;
    if (site.voices?.length) return site.voices;
    return VOICES.map((v) => ({ id: v.id, nm: v.nm, tg: v.tg, av: v.av }));
  }, [cat?.voices, site.voices]);

  const styleSamples: Record<string, SiteSampleEntry> = useMemo(() => {
    const next: Record<string, SiteSampleEntry> = { ...(site.styleSamples ?? {}) };
    for (const s of styles) {
      if (s.sampleUrl) next[s.id] = { audioUrl: s.sampleUrl, startSec: s.sampleStartSec ?? 0, generatedAt: '' };
    }
    return next;
  }, [site.styleSamples, styles]);

  return {
    slug: exp.slug,
    styles,
    occasions,
    voices,
    styleSamples,
    demoIds: cat?.demoIds ?? null,
    reactionClips: (cat?.reactionClips ?? []) as CadouReactionClip[],
  };
}
