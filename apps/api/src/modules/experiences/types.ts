import type { PackageTier } from '../payments/packages';

export type AssignReason = 'url' | 'cookie' | 'fingerprint' | 'device' | 'utm' | 'default';

export interface ExperienceUtmRule {
  source?: string;
  campaign?: string;
  content?: string;
}

export interface ExperienceUpsellConfig {
  title: string;
  body: string;
  targetTier: 'plus' | 'premium';
}

export interface ExperiencePackageOverride {
  video?: boolean;
  socialImage?: boolean;
  instrumental?: boolean;
  premiumPage?: boolean;
  durationSec?: number;
  features?: string[];
  upsell?: ExperienceUpsellConfig | null;
}

/** Catalog (stiluri / ocazii / voci / demo-uri / prompturi) per interfață.
 *  Dacă `styles` / `occasions` / `voices` e gol sau lipsește, UI-ul moștenește
 *  catalogul site-ului. `writerSystemPrompt` gol = promptul site.suno. */
export interface ExperienceStyleOverride {
  id: string;
  em?: string;
  nm: string;
  ds?: string;
  heat?: string;
  ic?: { name: string; fill?: string; stroke?: string; strokeWidth?: number };
  i18n?: Record<string, { nm?: string; ds?: string; heat?: string }>;
  artUrl?: string;
  sampleUrl?: string;
  sampleStartSec?: number;
  sunoPrompt?: string;
  lyricsHint?: string;
  styleWeight?: number;
  weirdnessConstraint?: number;
  negativeTags?: string;
  sunoPersonaIdMale?: string;
  sunoPersonaNameMale?: string;
  sunoPersonaIdFemale?: string;
  sunoPersonaNameFemale?: string;
  /** @deprecated fallback dacă male/female lipsesc */
  sunoPersonaId?: string;
  sunoPersonaName?: string;
}

export interface ExperienceOccasionOverride {
  id: string;
  em?: string;
  nm: string;
  ic?: { name: string; fill?: string; stroke?: string; strokeWidth?: number };
  i18n?: Record<string, { nm?: string }>;
}

export interface ExperienceVoiceOverride {
  id: string;
  nm: string;
  tg?: string;
  av?: string;
  ic?: { name: string; fill?: string; stroke?: string; strokeWidth?: number };
  i18n?: Record<string, { nm?: string; tg?: string }>;
  sunoVoice?: string;
  gender?: 'm' | 'f';
  sunoPersonaId?: string;
}

export interface ExperienceReactionClip {
  id: string;
  platform: 'tiktok' | 'instagram';
  videoUrl: string;
  posterUrl?: string;
  audioUrl?: string;
  demoId?: string | null;
  username: string;
  caption: string;
  song: string;
  likes?: number;
  comments?: number;
  shares?: number;
  avatarUrl?: string;
  previewStartSec?: number;
}

export interface ExperienceCatalogConfig {
  styles?: ExperienceStyleOverride[];
  occasions?: ExperienceOccasionOverride[];
  voices?: ExperienceVoiceOverride[];
  writerSystemPrompt?: string;
  /** Dacă e setat (chiar gol), filtrează demo-urile site-ului la aceste id-uri. */
  demoIds?: string[] | null;
  /** Reacții TikTok/Instagram pe homepage-ul Cadou. Gol = setul default din UI. */
  reactionClips?: ExperienceReactionClip[];
}

export interface SiteExperienceItemConfig {
  enabled: boolean;
  utmRules: ExperienceUtmRule[];
  packages?: Partial<Record<PackageTier, ExperiencePackageOverride>>;
  catalog?: ExperienceCatalogConfig;
}

export interface SiteExperienceConfig {
  defaultSlug: string;
  items: Record<string, SiteExperienceItemConfig>;
}

export interface PackageSnapshot {
  video: boolean;
  socialImage: boolean;
  instrumental: boolean;
  premiumPage: boolean;
  durationSec: number;
}

export interface ResolvedExperiencePackage extends PackageSnapshot {
  tier: PackageTier;
  features: string[];
  upsell: ExperienceUpsellConfig | null;
}

export interface ResolveExperienceInput {
  uiParam?: string | null;
  cookieSlug?: string | null;
  personSlug?: string | null;
  utm?: {
    source?: string | null;
    campaign?: string | null;
    content?: string | null;
  } | null;
  config?: SiteExperienceConfig | null;
}

export interface ResolveExperienceResult {
  slug: string;
  reason: AssignReason;
}
