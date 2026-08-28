import type {
  ExperienceCatalogConfig,
  ExperienceItemConfig,
  ExperienceOccasionOverride,
  ExperienceStyleOverride,
  ExperienceVoiceOverride,
  SampleStatusDto,
  SiteDto,
  SiteOccasionEntry,
  SiteStyleEntry,
  SiteVoiceEntry,
} from '@/lib/api/sites.api';
import { GLOBAL_VOICE_IDS, PACKAGE_TIERS, type PackageTier } from '../studio-constants';

export const FALLBACK_EXPERIENCES: Array<{ slug: string; label: string }> = [
  { slug: 'classic', label: 'Classic' },
  { slug: 'cadou', label: 'Cadou' },
];

export function humanExperienceLabel(slug: string, apiLabel?: string): string {
  if (slug === 'classic') return 'Classic';
  if (slug === 'cadou') return 'Cadou';
  const trimmed = (apiLabel ?? '').replace(/\s*\(.*\)\s*$/, '').trim();
  return trimmed || slug;
}

export function defaultSlugOf(form: SiteDto): string {
  return form.experienceConfig?.defaultSlug || 'classic';
}

export function emptyItem(): ExperienceItemConfig {
  return { enabled: true, utmRules: [], packages: {}, catalog: {} };
}

export function itemOf(form: SiteDto, slug: string): ExperienceItemConfig {
  return form.experienceConfig?.items?.[slug] ?? emptyItem();
}

/** classic e mereu on; item lipsă = activ (runtime). */
/**
 * Trebuie să dea EXACT același verdict ca `isExperienceEnabled` din
 * `apps/web/experiences/assign.ts` și `apps/api/src/modules/experiences/assign.ts`.
 *
 * Avea `if (!item) return true`, adică opusul runtime-ului: pe un site fără
 * `experienceConfig` (toate cele de producție), ecranul arăta „Cadou ·
 * Disponibilă" cu comutatorul aprins, în timp ce site-ul refuza interfața și
 * ignora inclusiv `?ui=cadou`. Adminul raporta activată o interfață care nu era
 * — cel mai prost fel de a greși, fiindcă te face să cauți defectul în altă parte.
 */
export function isEnabled(form: SiteDto, slug: string): boolean {
  if (slug === 'classic') return true;
  if (slug === form.experienceConfig?.defaultSlug) return true;
  const item = form.experienceConfig?.items?.[slug];
  // Lipsa configurării înseamnă „nu e activată pe site-ul ăsta", nu „e liberă".
  if (!item) return false;
  return item.enabled !== false;
}

export function hasOwnCatalog(catalog?: ExperienceCatalogConfig | null): boolean {
  return !!(catalog?.styles?.length || catalog?.occasions?.length || catalog?.voices?.length);
}

export function hasOwnTestimonials(catalog?: ExperienceCatalogConfig | null): boolean {
  return Array.isArray(catalog?.testimonials);
}

type TierOverride = NonNullable<NonNullable<ExperienceItemConfig['packages']>[PackageTier]>;

/**
 * Ce câmpuri din override contează ca „pachet personalizat".
 * E un `Record<keyof TierOverride, boolean>` intenționat: dacă apare un câmp nou
 * pe pachete, typecheck-ul pică aici până îl treci în listă — nu mai putem uita
 * unul (bug vechi: schimbai doar prețul tăiat și contorul zicea „0 pachete").
 * `false` = câmp scos din produs, prezent doar în JSON-uri vechi; nu-l numărăm.
 */
const TIER_OVERRIDE_FIELDS: Record<keyof TierOverride, boolean> = {
  enabled: true,
  label: true,
  priceCents: true,
  compareAtCents: true,
  instrumental: true,
  premiumPage: true,
  durationSec: true,
  generation: true,
  remakes: true,
  collage: true,
  collagePhotoLimit: true,
  collageFullTrack: true,
  greetingCard: true,
  greetingClip: true,
  socialPost: true,
  nextSongDiscountPercent: true,
  deliveryLabel: true,
  features: true,
  upsell: true,
  // Deprecate: API-ul le ignoră (vezi experiences/types.ts), rămân doar în JSON vechi.
  video: false,
  socialImage: false,
  socialImageCount: false,
};

const COUNTED_TIER_FIELDS = (Object.keys(TIER_OVERRIDE_FIELDS) as Array<keyof TierOverride>).filter(
  (k) => TIER_OVERRIDE_FIELDS[k],
);

export function packageOverrideCount(
  packages?: ExperienceItemConfig['packages'] | null,
): number {
  if (!packages) return 0;
  return PACKAGE_TIERS.filter((tier) => hasTierOverride(packages[tier])).length;
}

function hasTierOverride(p?: TierOverride): boolean {
  if (!p) return false;
  return COUNTED_TIER_FIELDS.some((key) => {
    const v = p[key];
    // `null` = „fără preț tăiat" / „fără upsell" — identic cu moștenirea, nu e personalizare.
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim() !== '';
    return true;
  });
}

export function ensureConfig(form: SiteDto): NonNullable<SiteDto['experienceConfig']> {
  return form.experienceConfig ?? { defaultSlug: 'classic', items: {} };
}

export function setDefaultSlug(form: SiteDto, slug: string): SiteDto {
  const current = ensureConfig(form);
  const prev = current.items[slug] ?? emptyItem();
  const items = { ...current.items, [slug]: { ...prev, enabled: true } };
  if (
    current.defaultSlug === slug &&
    form.experienceConfig &&
    current.items[slug]?.enabled !== false
  ) {
    return form;
  }
  return { ...form, experienceConfig: { ...current, defaultSlug: slug, items } };
}

export function patchItem(
  form: SiteDto,
  slug: string,
  updater: Partial<ExperienceItemConfig> | ((item: ExperienceItemConfig) => ExperienceItemConfig),
): SiteDto {
  const current = ensureConfig(form);
  const prev = current.items[slug] ?? emptyItem();
  const nextItem = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
  return {
    ...form,
    experienceConfig: {
      ...current,
      items: { ...current.items, [slug]: nextItem },
    },
  };
}

export function patchCatalog(
  form: SiteDto,
  slug: string,
  updater: (catalog: ExperienceCatalogConfig) => ExperienceCatalogConfig,
): SiteDto {
  return patchItem(form, slug, (item) => ({
    ...item,
    catalog: updater(item.catalog ?? {}),
  }));
}

export { styleFromSite, occasionFromSite, voiceFromSite };

export function copyFromSite(site: SiteDto): Pick<ExperienceCatalogConfig, 'styles' | 'occasions' | 'voices'> {
  const styles = (site.styles ?? []).map(styleFromSite);
  const occasions = (site.occasions ?? []).map(occasionFromSite);
  const voices = (site.voices ?? []).map(voiceFromSite);
  const next: Pick<ExperienceCatalogConfig, 'styles' | 'occasions' | 'voices'> = {};
  if (styles.length) next.styles = styles;
  if (occasions.length) next.occasions = occasions;
  if (voices.length) next.voices = voices;
  return next;
}

function styleFromSite(s: SiteStyleEntry): ExperienceStyleOverride {
  return {
    id: s.id,
    em: s.em,
    nm: s.nm,
    ds: s.ds,
    heat: s.heat,
    ic: s.ic,
    i18n: s.i18n,
    artUrl: s.artUrl,
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
    // Persona unică veche: API-ul o mai folosește ca fallback (catalog-resolve.ts).
    // Fără linia asta, un site care încă e pe ea o pierde la copierea în interfață.
    sunoPersonaId: s.sunoPersonaId,
    sunoPersonaName: s.sunoPersonaName,
  };
}

function occasionFromSite(o: SiteOccasionEntry): ExperienceOccasionOverride {
  return {
    id: o.id,
    em: o.em,
    nm: o.nm,
    ic: o.ic,
    i18n: o.i18n,
    sunoPrompt: o.sunoPrompt,
    googlePrompt: o.googlePrompt,
  };
}

function voiceFromSite(v: SiteVoiceEntry): ExperienceVoiceOverride {
  return {
    id: v.id,
    nm: v.nm,
    tg: v.tg,
    av: v.av,
    ic: v.ic,
    i18n: v.i18n,
    sunoVoice: v.sunoVoice,
    gender: v.gender,
    sunoPersonaId: v.sunoPersonaId,
    sunoPersonaName: v.sunoPersonaName,
  };
}

export function asStyleEntry(s: ExperienceStyleOverride): SiteStyleEntry {
  return {
    id: s.id,
    em: s.em ?? '',
    nm: s.nm,
    ds: s.ds ?? '',
    heat: s.heat,
    ic: s.ic,
    i18n: s.i18n,
    artUrl: s.artUrl,
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

export function asOccasionEntry(o: ExperienceOccasionOverride): SiteOccasionEntry {
  return {
    id: o.id,
    em: o.em ?? '',
    nm: o.nm,
    ic: o.ic,
    i18n: o.i18n,
    sunoPrompt: o.sunoPrompt,
    googlePrompt: o.googlePrompt,
  };
}

export function asVoiceEntry(v: ExperienceVoiceOverride): SiteVoiceEntry {
  return {
    id: v.id,
    nm: v.nm,
    tg: v.tg ?? '',
    av: v.av ?? '',
    ic: v.ic,
    i18n: v.i18n,
    sunoVoice: v.sunoVoice,
    gender: v.gender,
    sunoPersonaId: v.sunoPersonaId,
    sunoPersonaName: v.sunoPersonaName,
  };
}

export function mergeStyle(
  s: ExperienceStyleOverride,
  patch: Partial<SiteStyleEntry>,
): ExperienceStyleOverride {
  const next: ExperienceStyleOverride = { ...s };
  if (patch.id !== undefined) next.id = patch.id;
  if (patch.em !== undefined) next.em = patch.em;
  if (patch.nm !== undefined) next.nm = patch.nm;
  if (patch.ds !== undefined) next.ds = patch.ds;
  if (patch.heat !== undefined) next.heat = patch.heat;
  if (patch.ic !== undefined) next.ic = patch.ic ?? undefined;
  if (patch.i18n !== undefined) next.i18n = patch.i18n;
  if (patch.artUrl !== undefined) next.artUrl = patch.artUrl;
  if (patch.sunoPrompt !== undefined) next.sunoPrompt = patch.sunoPrompt;
  if (patch.googlePrompt !== undefined) next.googlePrompt = patch.googlePrompt;
  if (patch.lyricsHint !== undefined) next.lyricsHint = patch.lyricsHint;
  if (patch.styleWeight !== undefined) next.styleWeight = patch.styleWeight;
  if (patch.weirdnessConstraint !== undefined) next.weirdnessConstraint = patch.weirdnessConstraint;
  if (patch.negativeTags !== undefined) next.negativeTags = patch.negativeTags;
  if (patch.sunoPersonaIdMale !== undefined) next.sunoPersonaIdMale = patch.sunoPersonaIdMale;
  if (patch.sunoPersonaNameMale !== undefined) next.sunoPersonaNameMale = patch.sunoPersonaNameMale;
  if (patch.sunoPersonaIdFemale !== undefined) next.sunoPersonaIdFemale = patch.sunoPersonaIdFemale;
  if (patch.sunoPersonaNameFemale !== undefined) next.sunoPersonaNameFemale = patch.sunoPersonaNameFemale;
  if (patch.sunoPersonaId !== undefined) next.sunoPersonaId = patch.sunoPersonaId;
  if (patch.sunoPersonaName !== undefined) next.sunoPersonaName = patch.sunoPersonaName;
  return next;
}

export function mergeOccasion(
  o: ExperienceOccasionOverride,
  patch: Partial<SiteOccasionEntry>,
): ExperienceOccasionOverride {
  const next: ExperienceOccasionOverride = { ...o };
  if (patch.id !== undefined) next.id = patch.id;
  if (patch.em !== undefined) next.em = patch.em;
  if (patch.nm !== undefined) next.nm = patch.nm;
  if (patch.ic !== undefined) next.ic = patch.ic ?? undefined;
  if (patch.i18n !== undefined) next.i18n = patch.i18n;
  if (patch.sunoPrompt !== undefined) next.sunoPrompt = patch.sunoPrompt;
  if (patch.googlePrompt !== undefined) next.googlePrompt = patch.googlePrompt;
  return next;
}

export function mergeVoice(
  v: ExperienceVoiceOverride,
  patch: Partial<SiteVoiceEntry>,
): ExperienceVoiceOverride {
  const next: ExperienceVoiceOverride = { ...v };
  if (patch.id !== undefined) next.id = patch.id;
  if (patch.nm !== undefined) next.nm = patch.nm;
  if (patch.tg !== undefined) next.tg = patch.tg;
  if (patch.av !== undefined) next.av = patch.av;
  if (patch.ic !== undefined) next.ic = patch.ic ?? undefined;
  if (patch.i18n !== undefined) next.i18n = patch.i18n;
  if (patch.sunoVoice !== undefined) next.sunoVoice = patch.sunoVoice;
  if (patch.gender !== undefined) next.gender = patch.gender;
  if (patch.sunoPersonaId !== undefined) next.sunoPersonaId = patch.sunoPersonaId;
  if (patch.sunoPersonaName !== undefined) next.sunoPersonaName = patch.sunoPersonaName;
  return next;
}

export function sampleFromUrl(key: string, url?: string, startSec?: number): SampleStatusDto | null {
  if (!url) return null;
  return { key, generating: false, entry: { audioUrl: url, generatedAt: '', startSec } };
}

export function revertCatalogInherit(catalog: ExperienceCatalogConfig): ExperienceCatalogConfig {
  const next: ExperienceCatalogConfig = { ...catalog };
  delete next.styles;
  delete next.occasions;
  delete next.voices;
  return next;
}

export function missingGlobalVoices(voices: ExperienceVoiceOverride[]): string[] {
  return GLOBAL_VOICE_IDS.filter((id) => !voices.some((v) => v.id === id));
}

export function adsUiUrl(domain: string, slug: string): string {
  const host = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${host}/?ui=${slug}`;
}
