import { PACKAGES, type PackageDef, type PackageTier } from '../payments/packages';
import type {
  ExperiencePackageOverride,
  ExperienceUpsellConfig,
  PackageSnapshot,
  ResolvedExperiencePackage,
} from './types';

/** Per-experience code defaults. Both start as global flags so admin can A/B without a deploy. */
export const EXPERIENCE_PACKAGE_DEFAULTS: Record<string, Partial<Record<PackageTier, ExperiencePackageOverride>>> = {
  classic: {},
  cadou: {},
};

export function snapshotFromDef(def: Pick<PackageDef, 'video' | 'socialImage' | 'instrumental' | 'premiumPage' | 'durationSec'>): PackageSnapshot {
  return {
    video: !!def.video,
    socialImage: !!def.socialImage,
    instrumental: !!def.instrumental,
    premiumPage: !!def.premiumPage,
    durationSec: def.durationSec,
  };
}

function applyOverride(base: PackageDef, override?: ExperiencePackageOverride | null): ResolvedExperiencePackage {
  const o = override ?? {};
  return {
    tier: base.tier,
    video: o.video ?? base.video,
    socialImage: o.socialImage ?? base.socialImage,
    instrumental: o.instrumental ?? base.instrumental,
    premiumPage: o.premiumPage ?? base.premiumPage,
    durationSec: typeof o.durationSec === 'number' && o.durationSec > 0 ? o.durationSec : base.durationSec,
    features: Array.isArray(o.features) && o.features.length > 0 ? o.features : [...base.featuresRo],
    upsell: o.upsell === undefined ? null : o.upsell,
  };
}

/**
 * Merge: global PACKAGES[tier] ← experience code defaults ← admin override.
 */
export function resolvePackageDef(
  tier: PackageTier,
  experienceSlug: string | null | undefined,
  adminOverride?: ExperiencePackageOverride | null,
): ResolvedExperiencePackage {
  const base = PACKAGES[tier];
  const codeDefaults = (experienceSlug && EXPERIENCE_PACKAGE_DEFAULTS[experienceSlug]?.[tier]) || null;
  const withCode = applyOverride(base, codeDefaults);
  if (!adminOverride) return withCode;
  return applyOverride(
    {
      ...base,
      video: withCode.video,
      socialImage: withCode.socialImage,
      instrumental: withCode.instrumental,
      premiumPage: withCode.premiumPage,
      durationSec: withCode.durationSec,
      featuresRo: withCode.features,
    },
    adminOverride,
  );
}

export function resolveExperiencePackages(
  experienceSlug: string | null | undefined,
  adminPackages?: Partial<Record<PackageTier, ExperiencePackageOverride>> | null,
): Record<PackageTier, ResolvedExperiencePackage> {
  return {
    basic: resolvePackageDef('basic', experienceSlug, adminPackages?.basic),
    plus: resolvePackageDef('plus', experienceSlug, adminPackages?.plus),
    premium: resolvePackageDef('premium', experienceSlug, adminPackages?.premium),
  };
}

export function snapshotForTier(
  tier: PackageTier,
  experienceSlug: string | null | undefined,
  adminOverride?: ExperiencePackageOverride | null,
): PackageSnapshot {
  return snapshotFromDef(resolvePackageDef(tier, experienceSlug, adminOverride));
}

export function publicExperiencePackages(
  experienceSlug: string,
  adminPackages?: Partial<Record<PackageTier, ExperiencePackageOverride>> | null,
): Record<PackageTier, { video: boolean; socialImage: boolean; instrumental: boolean; premiumPage: boolean; durationSec: number; features: string[]; upsell: ExperienceUpsellConfig | null }> {
  return resolveExperiencePackages(experienceSlug, adminPackages);
}
