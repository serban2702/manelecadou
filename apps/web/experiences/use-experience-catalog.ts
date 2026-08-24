'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
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

/** Aplică numele/descrierea traduse peste intrarea de catalog, păstrând `i18n`. */
function localize<T extends { nm?: string; ds?: string; tg?: string; i18n?: Record<string, { nm?: string; ds?: string; tg?: string }> | undefined }>(
  entry: T,
  locale: string,
): T {
  const tr = entry.i18n?.[locale];
  if (!tr) return entry;
  const next = { ...entry };
  if (tr.nm) next.nm = tr.nm;
  if (tr.ds) next.ds = tr.ds;
  if (tr.tg) next.tg = tr.tg;
  return next;
}

export function useExperienceCatalog() {
  const site = useSite();
  const locale = useLocale();
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

  // Numele traduse se aplică AICI, o singură dată, nu în fiecare componentă.
  // Interfața clasică își făcea singură lookup-ul (`s.i18n?.[locale]?.nm || s.nm`),
  // cea cadou citea `.nm` brut — deci un tenant care ține numele în română și
  // traducerea în `i18n.bg` afișa româna pe toată interfața cadou. Cu localizarea
  // în hook, orice consumator (inclusiv cei care citesc `.nm` direct) primește
  // limba corectă, iar lookup-ul din UI-ul clasic rămâne valid: `i18n` nu se
  // șterge, deci `i18n?.[locale]?.nm || nm` întoarce aceeași valoare.
  const localizedStyles = useMemo(() => styles.map((s) => localize(s, locale)), [styles, locale]);
  const localizedOccasions = useMemo(
    () => occasions.map((o) => localize(o, locale)),
    [occasions, locale],
  );
  const localizedVoices = useMemo(() => voices.map((v) => localize(v, locale)), [voices, locale]);

  return {
    slug: exp.slug,
    styles: localizedStyles,
    occasions: localizedOccasions,
    voices: localizedVoices,
    styleSamples,
    demoIds: cat?.demoIds ?? null,
    reactionClips: (cat?.reactionClips ?? []) as CadouReactionClip[],
    testimonials,
  };
}
