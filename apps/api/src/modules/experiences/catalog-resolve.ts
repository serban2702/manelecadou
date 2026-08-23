import type { Site, SiteOccasionEntry, SiteStyleEntry, SiteVoiceEntry } from '../sites/site.entity';
import type {
  ExperienceCatalogConfig,
  ExperienceOccasionOverride,
  ExperienceStyleOverride,
  ExperienceVoiceOverride,
} from './types';

export function experienceCatalogOf(
  site: Pick<Site, 'experienceConfig'> | null | undefined,
  slug: string | null | undefined,
): ExperienceCatalogConfig | null {
  if (!site || !slug) return null;
  return site.experienceConfig?.items?.[slug]?.catalog ?? null;
}

export function resolveExperienceStyles(
  site: Pick<Site, 'styles' | 'experienceConfig'> | null | undefined,
  slug: string | null | undefined,
): SiteStyleEntry[] {
  const cat = experienceCatalogOf(site, slug);
  if (cat?.styles?.length) return cat.styles.map(styleFromOverride);
  return site?.styles ?? [];
}

export function resolveExperienceOccasions(
  site: Pick<Site, 'occasions' | 'experienceConfig'> | null | undefined,
  slug: string | null | undefined,
): SiteOccasionEntry[] {
  const cat = experienceCatalogOf(site, slug);
  if (cat?.occasions?.length) return cat.occasions.map(occasionFromOverride);
  return site?.occasions ?? [];
}

export function resolveExperienceVoices(
  site: Pick<Site, 'voices' | 'experienceConfig'> | null | undefined,
  slug: string | null | undefined,
): SiteVoiceEntry[] {
  const cat = experienceCatalogOf(site, slug);
  if (cat?.voices?.length) return cat.voices.map(voiceFromOverride);
  return site?.voices ?? [];
}

export function resolveExperienceStyleEntry(
  site: Pick<Site, 'styles' | 'experienceConfig'> | null | undefined,
  slug: string | null | undefined,
  styleId: string | null | undefined,
): SiteStyleEntry | undefined {
  if (!styleId) return undefined;
  return resolveExperienceStyles(site, slug).find((s) => s.id === styleId);
}

export function resolveExperienceWriterPrompt(
  site: { suno?: { writerSystemPrompt?: string }; experienceConfig?: Site['experienceConfig'] } | null | undefined,
  slug: string | null | undefined,
): string | undefined {
  const override = experienceCatalogOf(site as Site, slug)?.writerSystemPrompt?.trim();
  if (override) return override;
  return site?.suno?.writerSystemPrompt;
}

export function resolveExperienceStylePrompt(
  site: {
    styles?: SiteStyleEntry[];
    suno?: { stylePromptMap?: Record<string, string> };
    experienceConfig?: Site['experienceConfig'];
  } | null | undefined,
  slug: string | null | undefined,
  styleId: string | null | undefined,
): string | undefined {
  if (!styleId) return undefined;
  const entry = resolveExperienceStyleEntry(site as Site, slug, styleId);
  const fromEntry = entry?.sunoPrompt?.trim();
  if (fromEntry) return fromEntry;
  return site?.suno?.stylePromptMap?.[styleId];
}

/** Persona de pe stil după genul vocal. Câmpurile male/female au prioritate;
 *  `sunoPersonaId` vechi e fallback doar dacă ambele lipsesc. */
export function resolveStylePersonaId(
  style: Pick<SiteStyleEntry, 'sunoPersonaId' | 'sunoPersonaIdMale' | 'sunoPersonaIdFemale'> | null | undefined,
  gender: 'm' | 'f' | undefined,
): string | undefined {
  if (!style) return undefined;
  const male = style.sunoPersonaIdMale?.trim();
  const female = style.sunoPersonaIdFemale?.trim();
  const legacy = style.sunoPersonaId?.trim();
  if (gender === 'f') return female || undefined;
  if (gender === 'm') return male || undefined;
  return male || female || legacy || undefined;
}

export function resolveExperienceDemoIds(
  site: Pick<Site, 'experienceConfig'> | null | undefined,
  slug: string | null | undefined,
): string[] | null {
  const ids = experienceCatalogOf(site, slug)?.demoIds;
  if (!ids) return null;
  const clean = ids.map((id) => String(id).trim()).filter(Boolean);
  return clean.length ? clean : [];
}

function styleFromOverride(s: ExperienceStyleOverride): SiteStyleEntry {
  return {
    id: s.id,
    em: s.em || '🎵',
    nm: s.nm,
    ds: s.ds || '',
    heat: s.heat,
    ic: s.ic,
    i18n: s.i18n,
    sunoPrompt: s.sunoPrompt,
    googlePrompt: s.googlePrompt,
    lyricsHint: s.lyricsHint,
    styleWeight: s.styleWeight,
    weirdnessConstraint: s.weirdnessConstraint,
    negativeTags: s.negativeTags,
    sunoPersonaIdMale: s.sunoPersonaIdMale,
    sunoPersonaNameMale: s.sunoPersonaNameMale,
    sunoPersonaIdFemale: s.sunoPersonaIdFemale,
    sunoPersonaNameFemale: s.sunoPersonaNameFemale,
    sunoPersonaId: s.sunoPersonaId,
    sunoPersonaName: s.sunoPersonaName,
  };
}

function occasionFromOverride(o: ExperienceOccasionOverride): SiteOccasionEntry {
  return {
    id: o.id,
    em: o.em || '✨',
    nm: o.nm,
    ic: o.ic,
    i18n: o.i18n,
    sunoPrompt: o.sunoPrompt,
    googlePrompt: o.googlePrompt,
  };
}

export function resolveExperienceOccasionEntry(
  site: Pick<Site, 'occasions' | 'experienceConfig'> | null | undefined,
  slug: string | null | undefined,
  occasionId: string | null | undefined,
): SiteOccasionEntry | undefined {
  if (!occasionId) return undefined;
  return resolveExperienceOccasions(site, slug).find((o) => o.id === occasionId);
}

export function resolveExperienceGoogleStylePrompt(
  site: Pick<Site, 'styles' | 'experienceConfig'> | null | undefined,
  slug: string | null | undefined,
  styleId: string | null | undefined,
): string | undefined {
  if (!styleId) return undefined;
  return resolveExperienceStyleEntry(site as Site, slug, styleId)?.googlePrompt?.trim() || undefined;
}

function voiceFromOverride(v: ExperienceVoiceOverride): SiteVoiceEntry {
  return {
    id: v.id,
    nm: v.nm,
    tg: v.tg || '',
    av: v.av || '',
    ic: v.ic,
    i18n: v.i18n,
    sunoVoice: v.sunoVoice,
    gender: v.gender,
    sunoPersonaId: v.sunoPersonaId,
    sunoPersonaName: v.sunoPersonaName,
  };
}
