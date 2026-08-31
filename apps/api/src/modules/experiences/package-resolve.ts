import {
  PACKAGES,
  PACKAGE_FEATURES,
  packagePriceCents,
  packageCompareAtCents,
  type PackageDef,
  type PackageTier,
} from '../payments/packages';
import { packageCopy } from '../payments/packages-i18n';
import type {
  ExperiencePackageOverride,
  ExperienceUpsellConfig,
  PackageSnapshot,
  ResolvedExperiencePackage,
  SiteExperienceConfig,
} from './types';
import { DEFAULT_EXPERIENCE_SLUG } from './catalog';
import { isExperienceEnabled } from './assign';

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
  locale?: string | null,
): ResolvedExperiencePackage {
  // Pasul 2 din precedență: prețul de bază devine cel al tenantului (dacă are).
  // Livrabilele se traduc AICI, pe pachetul de bază, ca un `features` scris de
  // admin pe interfață să rămână prioritar (l-a scris în limba pe care o vrea).
  const copy = packageCopy(tier, locale);
  const base: PackageDef = {
    ...PACKAGES[tier],
    priceCents: packagePriceCents(tier, sitePricing?.prices ?? null),
    ...(copy ? { featuresRo: copy.features, deliveryLabel: copy.deliveryLabel } : {}),
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
  locale?: string | null,
): Record<PackageTier, ResolvedExperiencePackage> {
  return {
    basic: resolvePackageDef('basic', experienceSlug, adminPackages?.basic, sitePricing, locale),
    plus: resolvePackageDef('plus', experienceSlug, adminPackages?.plus, sitePricing, locale),
    premium: resolvePackageDef('premium', experienceSlug, adminPackages?.premium, sitePricing, locale),
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

/**
 * Minimul dintr-un `Site` de care are nevoie rezolvarea unui pachet. Tipat structural
 * ca să poată fi apelat cu un Site real, cu un site parțial (cache) sau cu un obiect
 * de test — fără să tragă entitatea TypeORM în funcțiile pure.
 */
export interface SitePackageSource {
  packagePricesCents?: Partial<Record<PackageTier, number>> | null;
  packageCompareAtCents?: Partial<Record<PackageTier, number>> | null;
  experienceConfig?: SiteExperienceConfig | null;
  /** Limba tenantului — decide în ce limbă ies `features` și `deliveryLabel`
   *  când adminul nu le-a scris el (vezi payments/packages-i18n.ts). */
  locale?: string | null;
}

/**
 * Interfața (experience) efectivă pentru o cerere: cea cerută explicit → default-ul
 * site-ului → `classic`. REGULĂ UNICĂ — orice loc care calculează un preț trebuie să
 * folosească exact acest slug, altfel afișatul și taxatul pot diverge.
 */
export function effectiveExperienceSlug(
  site: SitePackageSource | null | undefined,
  experienceSlug?: string | null,
): string {
  const cfg = site?.experienceConfig ?? null;
  // Slug-ul cerut vine din antetul `x-mc-experience` sau din `?ui=` — ambele
  // controlate de client. Dacă interfața nu e activată pe site-ul ăsta, îl
  // ignorăm: altfel un pachet cu preț propriu pe o interfață OPRITĂ putea fi
  // cotat și cumpărat trimițând antetul de mână, fără să treci vreodată pe ea.
  if (experienceSlug && isExperienceEnabled(experienceSlug, cfg)) return experienceSlug;
  const fallback = cfg?.defaultSlug;
  if (fallback && isExperienceEnabled(fallback, cfg)) return fallback;
  return DEFAULT_EXPERIENCE_SLUG;
}

/**
 * SURSA UNICĂ DE ADEVĂR pentru pachetul efectiv al unui site (preț, preț tăiat,
 * livrabile, `enabled`). Tot ce cotează sau taxează un pachet — `quote`, checkout,
 * upgrade, chat, Irina — trece pe aici, ca prețul AFIȘAT și cel TAXAT să nu mai poată
 * diverge (bug: override-ul pe interfață era ignorat la `createCheckoutSession`).
 */
export function resolveSitePackage(
  site: SitePackageSource | null | undefined,
  tier: PackageTier,
  experienceSlug?: string | null,
): ResolvedExperiencePackage {
  const slug = effectiveExperienceSlug(site, experienceSlug);
  const adminOverride = site?.experienceConfig?.items?.[slug]?.packages?.[tier] ?? null;
  return resolvePackageDef(tier, slug, adminOverride, sitePricingOf(site), site?.locale);
}

/** Toate cele 3 pachete efective ale unui site pe o interfață. */
export function resolveSitePackages(
  site: SitePackageSource | null | undefined,
  experienceSlug?: string | null,
): Record<PackageTier, ResolvedExperiencePackage> {
  return {
    basic: resolveSitePackage(site, 'basic', experienceSlug),
    plus: resolveSitePackage(site, 'plus', experienceSlug),
    premium: resolveSitePackage(site, 'premium', experienceSlug),
  };
}

/**
 * Valoarea istorică a reducerii „la manea următoare", păstrată ca ultimă plasă:
 * pachetul Standard nu promite nicio reducere (0), dar emailul de fidelizare a
 * oferit dintotdeauna 40% oricui. Sursa se schimbă, valoarea implicită NU.
 */
export const DEFAULT_NEXT_SONG_DISCOUNT_PERCENT = 40;

/**
 * Procentul de reducere la următoarea manea, în ordinea corectă a surselor:
 *   1. `packageSnapshot` — ce i s-a promis clientului CÂND A PLĂTIT (înghețat);
 *   2. pachetul rezolvat azi (comenzi vechi, fără procent în snapshot);
 *   3. 40% — valoarea implicită istorică.
 */
export function nextSongDiscountPercent(
  snapshot?: Pick<PackageSnapshot, 'nextSongDiscountPercent'> | null,
  resolved?: Pick<ResolvedExperiencePackage, 'nextSongDiscountPercent'> | null,
): number {
  const fromSnapshot = snapshot?.nextSongDiscountPercent;
  if (typeof fromSnapshot === 'number' && Number.isFinite(fromSnapshot) && fromSnapshot > 0) {
    return Math.round(fromSnapshot);
  }
  const fromPackage = resolved?.nextSongDiscountPercent;
  if (typeof fromPackage === 'number' && Number.isFinite(fromPackage) && fromPackage > 0) {
    return Math.round(fromPackage);
  }
  return DEFAULT_NEXT_SONG_DISCOUNT_PERCENT;
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
