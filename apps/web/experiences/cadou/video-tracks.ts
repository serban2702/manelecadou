'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { GenerationDto } from '@/lib/api';

export type CadouClipTrack = { track: string; label: string };

/** Etichetele pieselor, traduse (`cadou.tracks`). */
export type CadouTrackLabels = { variant1: string; variant2: string; clip: string };

export function useCadouTrackLabels(): CadouTrackLabels {
  const t = useTranslations('cadou.tracks');
  return useMemo(
    () => ({ variant1: t('variant1'), variant2: t('variant2'), clip: t('clip') }),
    [t],
  );
}

/** Câte clipuri trebuie montate: câte variante de melodie există. */
export function cadouClipTracks(g: GenerationDto, labels: CadouTrackLabels): CadouClipTrack[] {
  const variants = g.variants?.filter((v) => v.audioUrl);
  if (variants && variants.length > 0) {
    return variants.map((v) => ({
      track: v.kind === 'bonus' ? 'bonus' : v.kind === 'variation' ? v.id : 'main',
      label: v.label || (v.kind === 'bonus' ? labels.variant2 : labels.variant1),
    }));
  }
  const out: CadouClipTrack[] = [];
  if (g.audioUrl) out.push({ track: 'main', label: labels.variant1 });
  if (g.bonusAudioUrl) out.push({ track: 'bonus', label: labels.variant2 });
  return out;
}

export function cadouClipLabel(
  track: string | undefined,
  tracks: CadouClipTrack[],
  labels: CadouTrackLabels,
): string {
  if (!track) return labels.clip;
  return (
    tracks.find((t) => t.track === track)?.label
    ?? (track === 'bonus' ? labels.variant2 : track === 'main' ? labels.variant1 : labels.clip)
  );
}
