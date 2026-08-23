'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, type SiteDemoDto } from '@/lib/api';
import type { SiteSampleEntry } from '@/lib/site-shared';
import { useExperienceCatalog } from '../use-experience-catalog';
import { CADOU_REACTION_SEEDS, type CadouReactionClip } from './reactions';
import { cadouStyleIdFromTitle } from './style-art';

/**
 * Găsește piesa care sună sub reacție pe tenantul curent:
 *  1. demo-ul fixat din admin (`demoId`) — dacă chiar există pe site-ul ăsta;
 *  2. primul demo publicat pe același stil;
 *  3. mostra stilului din setările site-ului.
 * Dacă nu găsim nimic, clipul rămâne fără coloană sonoră și telefonul redă
 * sunetul propriu al videoclipului (vezi `startPhoneMedia`) — fără player rupt.
 */
function findDemo(clip: CadouReactionClip, demos: SiteDemoDto[]): SiteDemoDto | null {
  if (clip.demoId) {
    const exact = demos.find((d) => d.id === clip.demoId);
    if (exact) return exact;
  }
  if (clip.styleId) {
    const byStyle = demos.find((d) => cadouStyleIdFromTitle(d.title, d.category) === clip.styleId);
    if (byStyle) return byStyle;
  }
  return null;
}

function resolveClip(
  clip: CadouReactionClip,
  demos: SiteDemoDto[],
  styleSamples: Record<string, SiteSampleEntry>,
): CadouReactionClip {
  const demo = findDemo(clip, demos);
  const sample = clip.styleId ? styleSamples[clip.styleId] : undefined;
  const audioUrl = demo?.audioUrl || sample?.audioUrl || clip.audioUrl || undefined;
  const previewStartSec = demo
    ? demo.previewStartSec ?? clip.previewStartSec
    : sample
      ? sample.startSec ?? clip.previewStartSec
      : clip.previewStartSec;
  return {
    ...clip,
    audioUrl,
    previewStartSec,
    song: clip.song || demo?.title || '',
  };
}

/** Reacțiile de pe homepage — din admin dacă există, altfel seed-ul tradus. */
export function useCadouReactionClips(limit?: number): CadouReactionClip[] {
  const t = useTranslations('cadou.reactions.clips');
  const { reactionClips, styleSamples } = useExperienceCatalog();
  const { data } = useQuery({
    queryKey: ['site-demos'],
    queryFn: () => api.siteDemos(),
    staleTime: 60_000,
  });
  const demos = data?.items;

  return useMemo(() => {
    const base: CadouReactionClip[] = reactionClips?.length
      ? reactionClips
      : CADOU_REACTION_SEEDS.map((s) => ({
          ...s,
          username: t(`${s.id}.username`),
          caption: t(`${s.id}.caption`),
          song: t(`${s.id}.song`),
        }));
    const list = typeof limit === 'number' ? base.slice(0, limit) : base;
    return list.map((c) => resolveClip(c, demos ?? [], styleSamples));
  }, [reactionClips, styleSamples, demos, limit, t]);
}
