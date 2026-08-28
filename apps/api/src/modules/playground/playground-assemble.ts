import { voiceArtistToGender } from '../../common/voice';
import {
  resolveExperienceGoogleStylePrompt,
  resolveExperienceOccasionEntry,
  resolveExperienceOccasions,
  resolveExperienceStyleEntry,
  resolveExperienceStylePrompt,
  resolveExperienceStyles,
  resolveExperienceVoices,
  resolveExperienceWriterPrompt,
  resolveStylePersonaId,
} from '../experiences/catalog-resolve';
import type { LyricsInput } from '../lyrics/lyrics.module';
import { buildLyriaPrompt } from '../lyria/lyria.service';
import type { Site, SiteOccasionEntry, SiteStyleEntry, SiteVoiceEntry } from '../sites/site.entity';
import type { PlaygroundEngine, PlaygroundLyricsMode } from './playground.constants';

export interface PlaygroundAssembleInput {
  engine?: PlaygroundEngine;
  experienceSlug?: string | null;
  styleId?: string | null;
  occasionId?: string | null;
  voiceId?: string | null;
  recipientName?: string;
  senderName?: string;
  message?: string;
  tipAmount?: number;
  lyricsMode?: PlaygroundLyricsMode;
  lyrics?: string;
  skipCritic?: boolean;
  phonetic?: boolean;
  openaiModel?: string;
  openaiTemperature?: number;
  writerSystemPrompt?: string;
  writerUserTemplate?: string;
  criticSystemPrompt?: string;
  criticUserTemplate?: string;
  languageOverride?: string;
  locale?: string;
  sunoModel?: string;
  sunoCustomMode?: boolean;
  sunoBasePrompt?: string;
  sunoStylePrompt?: string;
  sunoOccasionPrompt?: string;
  sunoPromptOverride?: string;
  sunoTitle?: string;
  vocalGender?: 'm' | 'f';
  styleWeight?: number;
  weirdnessConstraint?: number;
  negativeTags?: string;
  personaId?: string;
  personaModel?: 'style_persona' | 'voice_persona';
  instrumental?: boolean;
  durationSec?: number;
  lyriaModel?: string;
  lyriaStylePrompt?: string;
  lyriaOccasionPrompt?: string;
  lyriaPromptOverride?: string;
}

export interface PlaygroundAssembled {
  engine: PlaygroundEngine;
  experienceSlug: string | null;
  style: SiteStyleEntry | null;
  occasion: SiteOccasionEntry | null;
  voice: SiteVoiceEntry | null;
  lyricsMode: PlaygroundLyricsMode;
  lyricsInput: LyricsInput;
  lyrics: string;
  skipCritic: boolean;
  phonetic: boolean;
  instrumental: boolean;
  suno: {
    model?: string;
    customMode: boolean;
    styleOverride?: string;
    promptOverride?: string;
    titleOverride?: string;
    occasionPrompt?: string;
    vocalGender?: 'm' | 'f';
    styleWeight?: number;
    weirdnessConstraint?: number;
    negativeTags?: string;
    personaId?: string;
    personaModel?: 'style_persona' | 'voice_persona';
    instrumental: boolean;
    durationSec: number;
    basePrompt?: string;
  };
  lyria: {
    model?: string;
    stylePrompt: string;
    occasionPrompt?: string;
    promptOverride?: string;
    vocalGender?: 'm' | 'f';
    durationSec: number;
    instrumental: boolean;
    lyricsLocale: string;
    builtPrompt: string;
  };
}

const RO_LYRIA_FALLBACK =
  'Authentic Romanian manele song with oriental Hijaz scale, darbuka, accordion and violin.';
const BALKAN_LYRIA_FALLBACK =
  'Authentic Balkan manele/chalga song with oriental Hijaz scale, darbuka, accordion and violin.';

export function assemblePlayground(site: Site, dto: PlaygroundAssembleInput): PlaygroundAssembled {
  const slug = dto.experienceSlug?.trim() || null;
  const styles = resolveExperienceStyles(site, slug);
  const occasions = resolveExperienceOccasions(site, slug);
  const voices = resolveExperienceVoices(site, slug);

  const style =
    resolveExperienceStyleEntry(site, slug, dto.styleId) ??
    styles.find((s) => s.id === dto.styleId) ??
    styles[0] ??
    null;
  const occasion =
    resolveExperienceOccasionEntry(site, slug, dto.occasionId) ??
    occasions.find((o) => o.id === dto.occasionId) ??
    occasions[0] ??
    null;
  const voice = voices.find((v) => v.id === dto.voiceId) ?? voices[0] ?? null;

  const lyricsMode: PlaygroundLyricsMode = dto.lyricsMode ?? 'generate';
  const instrumental = !!dto.instrumental || lyricsMode === 'instrumental';
  const lyricsLocale = dto.locale?.trim() || site.suno?.lyricsLocale || site.locale || 'ro';
  const engine: PlaygroundEngine =
    dto.engine === 'google' || dto.engine === 'suno'
      ? dto.engine
      : site.musicEngine === 'google'
        ? 'google'
        : 'suno';

  const vocalGender: 'm' | 'f' | undefined =
    dto.vocalGender === 'm' || dto.vocalGender === 'f'
      ? dto.vocalGender
      : voiceArtistToGender(voice?.id) ?? voice?.gender;

  const lyricsInput: LyricsInput = {
    style: style?.id ?? dto.styleId ?? 'clasic',
    occasion: occasion?.id ?? dto.occasionId ?? '',
    recipientName: dto.recipientName?.trim() || 'Mirela',
    message: dto.message?.trim() || '',
    dedication: dto.senderName?.trim() || undefined,
    tipAmount: dto.tipAmount,
    currency: site.currency,
    voiceArtist: voice?.id ?? dto.voiceId ?? 'male',
    locale: lyricsLocale,
    languageOverride: dto.languageOverride?.trim() || undefined,
    styleHint: style?.lyricsHint,
    writerSystemPrompt: pickOverride(
      dto.writerSystemPrompt,
      resolveExperienceWriterPrompt(site, slug) ?? site.suno?.writerSystemPrompt,
    ),
    writerUserTemplate: pickOverride(dto.writerUserTemplate, site.suno?.writerUserTemplate),
    criticSystemPrompt: pickOverride(dto.criticSystemPrompt, site.suno?.criticSystemPrompt),
    criticUserTemplate: pickOverride(dto.criticUserTemplate, site.suno?.criticUserTemplate),
    model: dto.openaiModel?.trim() || undefined,
    temperature: dto.openaiTemperature,
    siteId: site.id,
    customLyrics: lyricsMode === 'custom' ? dto.lyrics?.trim() || undefined : undefined,
  };

  const catalogSunoStyle =
    resolveExperienceStylePrompt(site, slug, style?.id) || style?.sunoPrompt || '';
  const catalogSunoOccasion = occasion?.sunoPrompt?.trim() || '';
  const sunoStyle = pickOverride(dto.sunoStylePrompt, catalogSunoStyle) ?? '';
  const sunoOccasion = pickOverride(dto.sunoOccasionPrompt, catalogSunoOccasion) ?? '';
  const styleOverride = [sunoStyle, sunoOccasion].map((s) => s.trim()).filter(Boolean).join(', ') || undefined;

  const lyrics = dto.lyrics?.trim() || '';
  const hasSungLyrics = !!lyrics && !instrumental;
  const customMode =
    dto.sunoCustomMode !== undefined ? !!dto.sunoCustomMode : hasSungLyrics || !!dto.sunoPromptOverride?.trim();

  const catalogGoogleStyle =
    resolveExperienceGoogleStylePrompt(site, slug, style?.id) || style?.googlePrompt || '';
  const catalogGoogleOccasion = occasion?.googlePrompt?.trim() || occasion?.nm || '';
  const lyriaStyle =
    (pickOverride(dto.lyriaStylePrompt, catalogGoogleStyle) ?? '').trim() ||
    (lyricsLocale === 'ro' ? RO_LYRIA_FALLBACK : BALKAN_LYRIA_FALLBACK);
  const lyriaOccasion = pickOverride(dto.lyriaOccasionPrompt, catalogGoogleOccasion) || undefined;
  const durationSec = clampDuration(dto.durationSec);

  const lyriaBuilt = buildLyriaPrompt(
    {
      stylePrompt: lyriaStyle,
      occasionPrompt: lyriaOccasion,
      lyrics: lyrics || '(lyrics)',
      vocalGender,
      durationSec,
      instrumental,
      lyricsLocale,
    },
    1,
  );

  return {
    engine,
    experienceSlug: slug,
    style,
    occasion,
    voice,
    lyricsMode,
    lyricsInput,
    lyrics,
    skipCritic: !!dto.skipCritic || lyricsMode === 'writer_only',
    phonetic: dto.phonetic ?? !!site.lyricsReviewEnabled,
    instrumental,
    suno: {
      model: dto.sunoModel?.trim() || undefined,
      customMode,
      styleOverride,
      promptOverride: dto.sunoPromptOverride?.trim() || undefined,
      titleOverride: dto.sunoTitle?.trim() || undefined,
      occasionPrompt: sunoOccasion || undefined,
      vocalGender,
      styleWeight: dto.styleWeight ?? style?.styleWeight,
      weirdnessConstraint: dto.weirdnessConstraint ?? style?.weirdnessConstraint,
      negativeTags: pickOverride(dto.negativeTags, style?.negativeTags),
      personaId:
        dto.personaId?.trim() ||
        resolveStylePersonaId(style, vocalGender) ||
        voice?.sunoPersonaId ||
        undefined,
      personaModel: dto.personaModel,
      instrumental,
      durationSec,
      basePrompt: pickOverride(dto.sunoBasePrompt, site.suno?.basePrompt),
    },
    lyria: {
      model: dto.lyriaModel?.trim() || undefined,
      stylePrompt: lyriaStyle,
      occasionPrompt: lyriaOccasion,
      promptOverride: dto.lyriaPromptOverride?.trim() || undefined,
      vocalGender,
      durationSec,
      instrumental,
      lyricsLocale,
      builtPrompt: dto.lyriaPromptOverride?.trim() || lyriaBuilt,
    },
  };
}

/**
 * `undefined` pe DTO = moștenește catalogul/site-ul.
 * String (chiar gol) = operatorul a editat explicit câmpul.
 */
function pickOverride(dtoValue: string | undefined, fallback: string | undefined): string | undefined {
  if (dtoValue !== undefined) return dtoValue;
  return fallback;
}

function clampDuration(n?: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 120;
  return Math.min(240, Math.max(30, Math.round(n)));
}
