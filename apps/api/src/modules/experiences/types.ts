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

export interface SiteExperienceItemConfig {
  enabled: boolean;
  utmRules: ExperienceUtmRule[];
  packages?: Partial<Record<PackageTier, ExperiencePackageOverride>>;
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
