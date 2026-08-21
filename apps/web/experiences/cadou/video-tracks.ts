import type { GenerationDto } from '@/lib/api';

export type CadouClipTrack = { track: string; label: string };

/** Câte clipuri trebuie montate: câte variante de melodie există. */
export function cadouClipTracks(g: GenerationDto): CadouClipTrack[] {
  const variants = g.variants?.filter((v) => v.audioUrl);
  if (variants && variants.length > 0) {
    return variants.map((v) => ({
      track: v.kind === 'bonus' ? 'bonus' : v.kind === 'variation' ? v.id : 'main',
      label: v.label || (v.kind === 'bonus' ? 'Varianta 2' : 'Varianta 1'),
    }));
  }
  const out: CadouClipTrack[] = [];
  if (g.audioUrl) out.push({ track: 'main', label: 'Varianta 1' });
  if (g.bonusAudioUrl) out.push({ track: 'bonus', label: 'Varianta 2' });
  return out;
}

export function cadouClipLabel(track: string | undefined, tracks: CadouClipTrack[]): string {
  if (!track) return 'Videoclip';
  return (
    tracks.find((t) => t.track === track)?.label
    ?? (track === 'bonus' ? 'Varianta 2' : track === 'main' ? 'Varianta 1' : 'Videoclip')
  );
}
