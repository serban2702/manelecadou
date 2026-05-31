/**
 * Sistem de voci canonic — reducem la DOAR două opțiuni: `male` (Bărbătească)
 * și `female` (Feminină). Genul Suno: male → 'm', female → 'f'.
 *
 * Generațiile vechi (istoric) rămân citibile printr-un fallback legacy care
 * mapează vechile id-uri de artiști la gen.
 */

export type VoiceArtist = 'male' | 'female';

export interface VoiceOption {
  id: VoiceArtist;
  label: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'male', label: 'Bărbătească' },
  { id: 'female', label: 'Feminină' },
];

/** Map legacy id artist → gen. Generații istorice (înainte de canonizare). */
const LEGACY_GENDER: Record<string, 'm' | 'f'> = {
  florinel: 'm',
  adi: 'm',
  adita: 'm',
  ticu: 'm',
  nicu: 'm',
  mariana: 'f',
  gigi: 'f',
};

/**
 * Derivă genul Suno dintr-un voiceArtist.
 *  - 'male' → 'm', 'female' → 'f'
 *  - legacy ids (florinel/adi/ticu/nicu → 'm', mariana/gigi → 'f')
 *  - orice altceva necunoscut → undefined (lasă Suno să aleagă)
 */
export function voiceArtistToGender(voiceArtist?: string): 'm' | 'f' | undefined {
  if (!voiceArtist) return undefined;
  const v = voiceArtist.trim().toLowerCase();
  if (v === 'male') return 'm';
  if (v === 'female') return 'f';
  return LEGACY_GENDER[v];
}

/**
 * Etichetă RO pentru un voiceArtist.
 *  - 'male' → 'Bărbătească', 'female' → 'Feminină'
 *  - legacy → capitalizezi id-ul
 *  - gol → '-'
 */
export function voiceArtistLabel(voiceArtist?: string): string {
  if (!voiceArtist || !voiceArtist.trim()) return '-';
  const v = voiceArtist.trim().toLowerCase();
  if (v === 'male') return 'Bărbătească';
  if (v === 'female') return 'Feminină';
  return v.charAt(0).toUpperCase() + v.slice(1);
}
