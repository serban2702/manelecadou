import {
  PACKAGES,
  PACKAGE_FEATURES,
  packagePriceCents,
  packageCompareAtCents,
  type PackageDef,
  type PackageTier,
} from '../payments/packages';
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

/**
 * Prețurile per-tenant (`site.packagePricesCents` / `site.packageCompareAtCents`).
 * Fără ele, rezolvarea cade pe prețul de listă din cod — ceea ce afișează greșit
 * pe orice site cu preț propriu (ex. EUR), deși Stripe taxează prețul site-ului.
 */
export interface SitePackagePricing {
  prices?: Partial<Record<PackageTier, number>> | null;
  compareAt?: Partial<Record<PackageTier, number>> | null;
}

/** Prețurile per-tenant, extrase dintr-un Site. Sursă unică pentru toți apelanții. */
export function sitePricingOf(
  site:
    | {
        packagePricesCents?: Partial<Record<PackageTier, number>> | null;
        packageCompareAtCents?: Partial<Record<PackageTier, number>> | null;
      }
    | null
    | undefined,
): SitePackagePricing {
  return {
    prices: site?.packagePricesCents ?? null,
    compareAt: site?.packageCompareAtCents ?? null,
  };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function snapshotFromDef(
  def: Pick<
    ResolvedExperiencePackage,
    | 'video'
    | 'socialImage'
    | 'instrumental'
    | 'premiumPage'
    | 'durationSec'
    | 'remakes'
    | 'collage'
    | 'collagePhotoLimit'
    | 'collageFullTrack'
    | 'greetingCard'
    | 'greetingClip'
    | 'socialPost'
    | 'nextSongDiscountPercent'
  >,
): PackageSnapshot {
  return {
    video: false,
    socialImage: false,
    instrumental: !!def.instrumental,
    premiumPage: !!def.premiumPage,
    durationSec: def.durationSec,
    remakes: def.remakes,
    collage: !!def.collage,
    collagePhotoLimit: def.collagePhotoLimit,
    collageFullTrack: !!def.collageFullTrack,
    socialImageCount: 0,
    greetingCard: !!def.greetingCard,
    greetingClip: !!def.greetingClip,
    socialPost: !!def.socialPost,
    nextSongDiscountPercent: def.nextSongDiscountPercent,
  };
}

function applyOverride(
  base: PackageDef,
  override?: ExperiencePackageOverride | null,
  /** Prețul „tăiat" moștenit (per-site sau din pasul anterior de merge). */
  fallbackCompareAtCents?: number | null,
): ResolvedExperiencePackage {
  const o = override ?? {};
  const feat = PACKAGE_FEATURES[base.tier];
  const remakes = num(o.remakes, feat.remakes);
  const collage = bool(o.collage, feat.collage);
  const priceCents = num(o.priceCents, 0) > 0 ? Math.round(o.priceCents as number) : base.priceCents;
  // Prețul tăiat e PUR marketing: îl arătăm doar dacă e strict mai mare decât
  // prețul real (altfel n-are sens să-l tăiem) — aceeași regulă ca în
  // `packageCompareAtCents`.
  const overrideCompare =
    typeof o.compareAtCents === 'number' && o.compareAtCents > priceCents
      ? Math.round(o.compareAtCents)
      : null;
  const inheritedCompare =
    typeof fallbackCompareAtCents === 'number' && fallbackCompareAtCents > priceCents
      ? Math.round(fallbackCompareAtCents)
      : null;
  return {
    tier: base.tier,
    enabled: o.enabled !== false,
    label: (o.label ?? base.label).trim() || base.label,
    priceCents,
    compareAtCents: overrideCompare ?? inheritedCompare,
    generation: o.generation !== false,
    video: false,
    socialImage: false,
    socialImageCount: 0,
    instrumental: bool(o.instrumental, base.instrumental),
    premiumPage: bool(o.premiumPage, base.premiumPage),
    durationSec: num(o.durationSec, base.durationSec) > 0 ? num(o.durationSec, base.durationSec) : base.durationSec,
    remakes,
    collage,
    collagePhotoLimit: collage ? num(o.collagePhotoLimit, feat.collagePhotoLimit) : 0,
    collageFullTrack: collage ? bool(o.collageFullTrack, feat.collageFullTrack) : false,
    greetingCard: bool(o.greetingCard, feat.greetingCard),
    greetingClip: bool(o.greetingClip, feat.greetingClip),
    socialPost: bool(o.socialPost, feat.socialPost),
    nextSongDiscountPercent: num(o.nextSongDiscountPercent, feat.nextSongDiscountPercent),
    deliveryLabel: (o.deliveryLabel ?? base.deliveryLabel).trim() || base.deliveryLabel,
    features: Array.isArray(o.features) && o.features.length > 0 ? o.features : [...base.featuresRo],
    upsell: o.upsell === undefined ? null : o.upsell,
  };
}

/**
 * Merge: global PACKAGES[tier] ← preț per-site ← experience code defaults ← admin override.
 *
 * Ordinea de precedență a PREȚULUI (identică cu `PaymentsService.quote`, ca
 * afișatul să coincidă cu taxatul):
 *   1. override pe interfață (admin `experienceConfig.items[slug].packages[tier].priceCents`)
 *   2. preț per-site (`site.packagePricesCents[tier]`)
 *   3. default din cod (`PACKAGES[tier].priceCents`)
 */
export function resolvePackageDef(
  tier: PackageTier,
  experienceSlug: string | null | undefined,
  adminOverride?: ExperiencePackageOverride | null,
  sitePricing?: SitePackagePricing | null,
): ResolvedExperiencePackage {
  // Pasul 2 din precedență: prețul de bază devine cel al tenantului (dacă are).
  const base: PackageDef = {
    ...PACKAGES[tier],
    priceCents: packagePriceCents(tier, sitePricing?.prices ?? null),
  };
  const siteCompare = packageCompareAtCents(
    tier,
    sitePricing?.compareAt ?? null,
    sitePricing?.prices ?? null,
  );
  const codeDefaults = (experienceSlug && EXPERIENCE_PACKAGE_DEFAULTS[experienceSlug]?.[tier]) || null;
  const withCode = applyOverride(base, codeDefaults, siteCompare);
  if (!adminOverride) return withCode;
  return applyOverride(
    {
      ...base,
      label: withCode.label,
      priceCents: withCode.priceCents,
      video: false,
      socialImage: false,
      instrumental: withCode.instrumental,
      premiumPage: withCode.premiumPage,
      durationSec: withCode.durationSec,
      featuresRo: withCode.features,
      deliveryLabel: withCode.deliveryLabel,
    },
    adminOverride,
    withCode.compareAtCents ?? siteCompare,
  );
}

export function resolveExperiencePackages(
  experienceSlug: string | null | undefined,
  adminPackages?: Partial<Record<PackageTier, ExperiencePackageOverride>> | null,
  sitePricing?: SitePackagePricing | null,
): Record<PackageTier, ResolvedExperiencePackage> {
  return {
    basic: resolvePackageDef('basic', experienceSlug, adminPackages?.basic, sitePricing),
    plus: resolvePackageDef('plus', experienceSlug, adminPackages?.plus, sitePricing),
    premium: resolvePackageDef('premium', experienceSlug, adminPackages?.premium, sitePricing),
  };
}

export function snapshotForTier(
  tier: PackageTier,
  experienceSlug: string | null | undefined,
  adminOverride?: ExperiencePackageOverride | null,
  sitePricing?: SitePackagePricing | null,
): PackageSnapshot {
  return snapshotFromDef(resolvePackageDef(tier, experienceSlug, adminOverride, sitePricing));
}

export function publicExperiencePackages(
  experienceSlug: string,
  adminPackages?: Partial<Record<PackageTier, ExperiencePackageOverride>> | null,
  sitePricing?: SitePackagePricing | null,
): Record<PackageTier, ResolvedExperiencePackage> {
  return resolveExperiencePackages(experienceSlug, adminPackages, sitePricing);
}

/** Prețul EFECTIV al unui tier pe o interfață (vezi precedența din `resolvePackageDef`). */
export function effectivePackagePriceCents(
  tier: PackageTier,
  experienceSlug: string | null | undefined,
  adminOverride: ExperiencePackageOverride | null | undefined,
  sitePrices: Partial<Record<PackageTier, number>> | null | undefined,
): number {
  return resolvePackageDef(tier, experienceSlug, adminOverride, { prices: sitePrices ?? null }).priceCents;
}

/** Prețul „tăiat" EFECTIV (marketing). `null` dacă nu e strict mai mare decât prețul real. */
export function effectiveCompareAtCents(
  tier: PackageTier,
  experienceSlug: string | null | undefined,
  adminOverride: ExperiencePackageOverride | null | undefined,
  siteCompare: Partial<Record<PackageTier, number>> | null | undefined,
  sitePrices: Partial<Record<PackageTier, number>> | null | undefined,
): number | null {
  return resolvePackageDef(tier, experienceSlug, adminOverride, {
    prices: sitePrices ?? null,
    compareAt: siteCompare ?? null,
  }).compareAtCents;
}
