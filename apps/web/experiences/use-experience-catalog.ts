'use client';

import { useMemo } from 'react';
import { OCC, STYLES, VOICES } from '@/lib/seed-data';
import { useSite } from '@/lib/site-context';
import type {
  SiteOccasionEntry,
  SiteSampleEntry,
  SiteStyleEntry,
  SiteTestimonialEntry,
  SiteVoiceEntry,
} from '@/lib/site-shared';
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
    // Seed-ul brut, NU o copie re-mapată: orice re-mapare pierde câmpuri
    // (`ic` — iconițele Lucide din carduri) și UI-ul cade pe emoji.
    return STYLES;
  }, [cat?.styles, exp.slug, site.styles]);

  const occasions: SiteOccasionEntry[] = useMemo(() => {
    if (cat?.occasions?.length) return cat.occasions;
    if (exp.slug === 'cadou') return resolveCadouOccasions(site.occasions);
    if (site.occasions?.length) return site.occasions;
    // idem styles — seed brut, cu tot cu `ic`.
    return OCC;
  }, [cat?.occasions, exp.slug, site.occasions]);

  const voices: SiteVoiceEntry[] = useMemo(() => {
    if (cat?.voices?.length) return cat.voices;
    if (site.voices?.length) return site.voices;
    // idem styles — seed brut, cu tot cu `ic`.
    return VOICES;
  }, [cat?.voices, site.voices]);

  const styleSamples: Record<string, SiteSampleEntry> = useMemo(() => {
    const next: Record<string, SiteSampleEntry> = { ...(site.styleSamples ?? {}) };
    for (const s of styles) {
      if (s.sampleUrl) next[s.id] = { audioUrl: s.sampleUrl, startSec: s.sampleStartSec ?? 0, generatedAt: '' };
    }
    return next;
  }, [site.styleSamples, styles]);

  const testimonials: SiteTestimonialEntry[] | null = useMemo(() => {
    // Listă goală salvată din admin ⇒ tratată ca „neconfigurată": consumatorii
    // (Testimonials clasic, HomePage cadou) primesc `null` și cad pe seed, în
    // loc să randeze o secțiune goală. `Array.isArray([])` e true — de evitat.
    if (cat?.testimonials?.length) return cat.testimonials;
    if (site.testimonials?.length) return site.testimonials;
    return null;
  }, [cat?.testimonials, site.testimonials]);

  return {
    slug: exp.slug,
    styles,
    occasions,
    voices,
    styleSamples,
    demoIds: cat?.demoIds ?? null,
    reactionClips: (cat?.reactionClips ?? []) as CadouReactionClip[],
    testimonials,
  };
}
