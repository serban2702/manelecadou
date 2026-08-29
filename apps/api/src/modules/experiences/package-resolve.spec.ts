import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGES,
  packageCompareAtCents,
  packagePriceCents,
  type PackageTier,
} from '../payments/packages';
import type { ExperiencePackageOverride } from './types';
import {
  DEFAULT_NEXT_SONG_DISCOUNT_PERCENT,
  effectiveCompareAtCents,
  effectiveExperienceSlug,
  effectivePackagePriceCents,
  nextSongDiscountPercent,
  resolveExperiencePackages,
  resolvePackageDef,
  resolveSitePackage,
  resolveSitePackages,
  snapshotFromDef,
  snapshotForTier,
  type SitePackageSource,
} from './package-resolve';

describe('resolvePackageDef', () => {
  it('falls back to global flags when no overrides', () => {
    const plus = resolvePackageDef('plus', 'cadou');
    assert.equal(plus.video, false);
    assert.equal(plus.socialImage, false);
    assert.equal(plus.greetingClip, false);
    assert.equal(plus.durationSec, PACKAGES.plus.durationSec);
    assert.deepEqual(plus.features, PACKAGES.plus.featuresRo);
    assert.equal(plus.upsell, null);
  });

  it('admin override wins on greetingClip, not on removed video', () => {
    const plus = resolvePackageDef('plus', 'cadou', { video: true, greetingClip: true, features: ['Manea'] });
    assert.equal(plus.video, false);
    assert.equal(plus.greetingClip, true);
    assert.deepEqual(plus.features, ['Manea']);
  });

  it('does not apply a zero/negative duration override', () => {
    const basic = resolvePackageDef('basic', 'classic', { durationSec: 0 });
    assert.equal(basic.durationSec, PACKAGES.basic.durationSec);
  });

  it('snapshot keeps fulfillment flags and forces video/social off', () => {
    const snap = snapshotFromDef(resolvePackageDef('premium', 'classic'));
    assert.equal(snap.video, false);
    assert.equal(snap.socialImage, false);
    assert.equal(snap.greetingClip, false);
    assert.equal(snap.premiumPage, true);
    assert.equal(snap.durationSec, PACKAGES.premium.durationSec);
  });

  it('snapshotForTier stores greetingClip', () => {
    const snap = snapshotForTier('plus', 'cadou', { greetingClip: true });
    assert.equal(snap.greetingClip, true);
    assert.equal(snap.video, false);
  });
});

describe('preț efectiv per pachet', () => {
  // Prețurile de LISTĂ din cod (ce primește un site nou, fără override).
  it('fără override-uri, folosește prețul de listă din cod', () => {
    assert.equal(resolvePackageDef('basic', 'cadou').priceCents, 2999);
    assert.equal(resolvePackageDef('plus', 'cadou').priceCents, 4999);
    assert.equal(resolvePackageDef('premium', 'cadou').priceCents, 9999);
    assert.equal(PACKAGES.premium.priceCents, 9999);
  });

  it('prețul per-site bate default-ul din cod', () => {
    const prices = { basic: 799, plus: 1499, premium: 2999 };
    const pkgs = resolveExperiencePackages('cadou', null, { prices });
    assert.equal(pkgs.basic.priceCents, 799);
    assert.equal(pkgs.plus.priceCents, 1499);
    assert.equal(pkgs.premium.priceCents, 2999);
  });

  it('override-ul pe interfață bate prețul per-site', () => {
    const prices = { premium: 2999 };
    const resolved = resolvePackageDef('premium', 'cadou', { priceCents: 3999 }, { prices });
    assert.equal(resolved.priceCents, 3999);
  });

  it('un override 0/negativ nu se aplică — rămâne prețul per-site', () => {
    const prices = { plus: 1499 };
    assert.equal(resolvePackageDef('plus', 'cadou', { priceCents: 0 }, { prices }).priceCents, 1499);
    assert.equal(resolvePackageDef('plus', 'cadou', { priceCents: -5 }, { prices }).priceCents, 1499);
  });

  it('tier-urile nemenționate în packagePricesCents cad pe prețul din cod', () => {
    const pkgs = resolveExperiencePackages('cadou', null, { prices: { plus: 1499 } });
    assert.equal(pkgs.plus.priceCents, 1499);
    assert.equal(pkgs.basic.priceCents, PACKAGES.basic.priceCents);
    assert.equal(pkgs.premium.priceCents, PACKAGES.premium.priceCents);
  });
});

describe('preț tăiat (compare-at)', () => {
  it('preia compare-at-ul per-site când e peste prețul real', () => {
    const resolved = resolvePackageDef('plus', 'cadou', null, {
      prices: { plus: 1499 },
      compareAt: { plus: 2499 },
    });
    assert.equal(resolved.compareAtCents, 2499);
  });

  it('ignoră un compare-at sub sau egal cu prețul real', () => {
    assert.equal(
      resolvePackageDef('plus', 'cadou', null, {
        prices: { plus: 1499 },
        compareAt: { plus: 1499 },
      }).compareAtCents,
      null,
    );
    assert.equal(
      resolvePackageDef('plus', 'cadou', null, {
        prices: { plus: 1499 },
        compareAt: { plus: 999 },
      }).compareAtCents,
      null,
    );
  });

  it('compare-at-ul de pe interfață bate pe cel per-site', () => {
    const resolved = resolvePackageDef(
      'plus',
      'cadou',
      { compareAtCents: 3999 },
      { prices: { plus: 1499 }, compareAt: { plus: 2499 } },
    );
    assert.equal(resolved.compareAtCents, 3999);
  });

  it('fără compare-at configurat nu inventăm o ancoră', () => {
    assert.equal(resolvePackageDef('basic', 'cadou').compareAtCents, null);
  });
});

describe('paritate cu PaymentsService.quote', () => {
  // Formula din `PaymentsService.quote` (payments.service.ts) — afișatul trebuie
  // să dea exact ce taxează checkout-ul.
  const quoteLike = (
    tier: PackageTier,
    adminPkg: ExperiencePackageOverride | null,
    prices: Partial<Record<PackageTier, number>> | null,
    compare: Partial<Record<PackageTier, number>> | null,
  ) => {
    const total =
      adminPkg && typeof adminPkg.priceCents === 'number' && adminPkg.priceCents > 0
        ? Math.round(adminPkg.priceCents)
        : packagePriceCents(tier, prices);
    const compareFromPkg =
      adminPkg && typeof adminPkg.compareAtCents === 'number' && adminPkg.compareAtCents > total
        ? Math.round(adminPkg.compareAtCents)
        : null;
    return { total, compareAtCents: compareFromPkg ?? packageCompareAtCents(tier, compare, prices) };
  };

  const cases: Array<{
    tier: PackageTier;
    adminPkg: ExperiencePackageOverride | null;
    prices: Partial<Record<PackageTier, number>> | null;
    compare: Partial<Record<PackageTier, number>> | null;
  }> = [
    { tier: 'basic', adminPkg: null, prices: null, compare: null },
    { tier: 'premium', adminPkg: null, prices: null, compare: null },
    { tier: 'basic', adminPkg: null, prices: { basic: 799 }, compare: { basic: 1499 } },
    { tier: 'plus', adminPkg: null, prices: { plus: 1499 }, compare: { plus: 2499 } },
    { tier: 'premium', adminPkg: { priceCents: 3999 }, prices: { premium: 2999 }, compare: null },
    { tier: 'plus', adminPkg: { compareAtCents: 3999 }, prices: { plus: 1499 }, compare: { plus: 2499 } },
    { tier: 'plus', adminPkg: { label: 'Plus' }, prices: { plus: 1499 }, compare: null },
  ];

  for (const c of cases) {
    it(`${c.tier} — prices=${JSON.stringify(c.prices)} admin=${JSON.stringify(c.adminPkg)}`, () => {
      const expected = quoteLike(c.tier, c.adminPkg, c.prices, c.compare);
      const resolved = resolvePackageDef(c.tier, 'cadou', c.adminPkg, {
        prices: c.prices,
        compareAt: c.compare,
      });
      assert.equal(resolved.priceCents, expected.total);
      assert.equal(resolved.compareAtCents, expected.compareAtCents);
      assert.equal(
        effectivePackagePriceCents(c.tier, 'cadou', c.adminPkg, c.prices),
        expected.total,
      );
      assert.equal(
        effectiveCompareAtCents(c.tier, 'cadou', c.adminPkg, c.compare, c.prices),
        expected.compareAtCents,
      );
    });
  }
});

describe('resolveSitePackage — sursă unică site + interfață', () => {
  const site: SitePackageSource = {
    packagePricesCents: { basic: 2999, plus: 4999, premium: 9999 },
    packageCompareAtCents: { plus: 7999 },
    experienceConfig: {
      defaultSlug: 'cadou',
      items: {
        cadou: {
          enabled: true,
          utmRules: [],
          packages: {
            premium: { priceCents: 12999 },
            basic: { enabled: false },
          },
        },
      },
    },
  };

  it('slug explicit → override-ul interfeței bate prețul per-site', () => {
    assert.equal(resolveSitePackage(site, 'premium', 'cadou').priceCents, 12999);
  });

  it('slug lipsă → cade pe defaultSlug-ul site-ului (nu pe classic)', () => {
    assert.equal(resolveSitePackage(site, 'premium').priceCents, 12999);
    assert.equal(effectiveExperienceSlug(site, null), 'cadou');
  });

  it('altă interfață → prețul per-site, fără override', () => {
    assert.equal(resolveSitePackage(site, 'premium', 'classic').priceCents, 9999);
  });

  it('fără site → prețul de listă din cod', () => {
    assert.equal(resolveSitePackage(null, 'plus').priceCents, PACKAGES.plus.priceCents);
    assert.equal(effectiveExperienceSlug(null, null), 'classic');
  });

  it('`enabled: false` se propagă (checkout-ul refuză pachetul)', () => {
    assert.equal(resolveSitePackage(site, 'basic', 'cadou').enabled, false);
    assert.equal(resolveSitePackage(site, 'basic', 'classic').enabled, true);
    assert.equal(resolveSitePackage(site, 'plus', 'cadou').enabled, true);
  });

  it('toate cele 3 pachete se rezolvă pe aceeași interfață', () => {
    const pkgs = resolveSitePackages(site, 'cadou');
    assert.equal(pkgs.basic.priceCents, 2999);
    assert.equal(pkgs.plus.priceCents, 4999);
    assert.equal(pkgs.premium.priceCents, 12999);
    assert.equal(pkgs.plus.compareAtCents, 7999);
  });
});

describe('nextSongDiscountPercent', () => {
  it('snapshotul comenzii are prioritate (ce i s-a promis la plată)', () => {
    assert.equal(nextSongDiscountPercent({ nextSongDiscountPercent: 25 }, { nextSongDiscountPercent: 40 }), 25);
  });

  it('fără snapshot, cade pe pachetul rezolvat azi', () => {
    assert.equal(nextSongDiscountPercent(null, { nextSongDiscountPercent: 30 }), 30);
    assert.equal(nextSongDiscountPercent({}, { nextSongDiscountPercent: 30 }), 30);
  });

  it('0 nu e o promisiune (Standard) — rămâne valoarea implicită de 40%', () => {
    assert.equal(nextSongDiscountPercent({ nextSongDiscountPercent: 0 }, { nextSongDiscountPercent: 0 }), 40);
    assert.equal(nextSongDiscountPercent(null, null), DEFAULT_NEXT_SONG_DISCOUNT_PERCENT);
  });

  it('citește procentul configurat în admin pentru pachetul comenzii', () => {
    const site: SitePackageSource = {
      experienceConfig: {
        defaultSlug: 'cadou',
        items: {
          cadou: {
            enabled: true,
            utmRules: [],
            packages: { premium: { nextSongDiscountPercent: 50 } },
          },
        },
      },
    };
    assert.equal(nextSongDiscountPercent(null, resolveSitePackage(site, 'premium', 'cadou')), 50);
  });
});

describe('effectiveExperienceSlug — o interfață oprită nu poate fi cotată', () => {
  const off = {
    experienceConfig: {
      defaultSlug: 'classic',
      items: { cadou: { enabled: false, utmRules: [], packages: { basic: { priceCents: 1 } } } },
    },
  } as never;

  it('ignoră slug-ul cerut prin antet dacă interfața e oprită', () => {
    assert.equal(effectiveExperienceSlug(off, 'cadou'), 'classic');
  });

  it('acceptă slug-ul când interfața e pornită', () => {
    const on = {
      experienceConfig: { defaultSlug: 'classic', items: { cadou: { enabled: true, utmRules: [] } } },
    } as never;
    assert.equal(effectiveExperienceSlug(on, 'cadou'), 'cadou');
  });

  it('cade pe classic dacă implicitul însuși e oprit', () => {
    const brokenDefault = {
      experienceConfig: { defaultSlug: 'cadou', items: { cadou: { enabled: false, utmRules: [] } } },
    } as never;
    assert.equal(effectiveExperienceSlug(brokenDefault, null), 'classic');
  });

  it('prețul cotat pe o interfață oprită e cel de pe classic, nu override-ul ei', () => {
    assert.notEqual(resolveSitePackage(off, 'basic', 'cadou').priceCents, 1);
    assert.equal(
      resolveSitePackage(off, 'basic', 'cadou').priceCents,
      resolveSitePackage(off, 'basic', 'classic').priceCents,
    );
  });
});
