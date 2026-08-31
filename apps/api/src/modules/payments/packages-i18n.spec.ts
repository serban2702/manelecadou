import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKAGES, PACKAGE_TIERS } from './packages';
import { packageCopy, packageLocale } from './packages-i18n';
import { resolveSitePackage } from '../experiences/package-resolve';

test('packages-i18n — livrabilele urmează limba tenantului', async (t) => {
  await t.test('fiecare limbă are exact câte livrabile are româna', () => {
    for (const tier of PACKAGE_TIERS) {
      for (const loc of ['bg', 'el', 'tr']) {
        const c = packageCopy(tier, loc);
        assert.ok(c, `${loc}/${tier}: lipsă`);
        assert.equal(
          c.features.length,
          PACKAGES[tier].featuresRo.length,
          `${loc}/${tier}: ${c.features.length} livrabile, româna are ${PACKAGES[tier].featuresRo.length}`,
        );
        assert.ok(c.deliveryLabel.trim().length > 0, `${loc}/${tier}: deliveryLabel gol`);
      }
    }
  });

  await t.test('româna rămâne sursa, fără copie paralelă', () => {
    assert.equal(packageLocale('ro'), 'ro');
    for (const tier of PACKAGE_TIERS) assert.equal(packageCopy(tier, 'ro'), null);
  });

  await t.test('bg și el nu conțin diacritice românești', () => {
    for (const tier of PACKAGE_TIERS) {
      for (const loc of ['bg', 'el'] as const) {
        const c = packageCopy(tier, loc)!;
        for (const f of [...c.features, c.deliveryLabel]) {
          assert.doesNotMatch(f, /[ăâîșțĂÂÎȘȚ]/, `${loc}/${tier}: text românesc — ${f}`);
        }
      }
    }
  });

  await t.test('configul rezolvat al unui site bg iese în bulgară', () => {
    const site = { locale: 'bg', packagePricesCents: null, experienceConfig: null };
    for (const tier of PACKAGE_TIERS) {
      const pkg = resolveSitePackage(site, tier);
      for (const f of pkg.features) {
        assert.doesNotMatch(f, /[ăâîșțĂÂÎȘȚ]/, `${tier}: livrabil românesc pe site bg — ${f}`);
      }
      assert.match(pkg.features.join(' '), /[Ѐ-ӿ]/, `${tier}: nimic chirilic în livrabile`);
    }
  });

  await t.test('un site românesc rămâne EXACT cum era', () => {
    const site = { locale: 'ro', packagePricesCents: null, experienceConfig: null };
    for (const tier of PACKAGE_TIERS) {
      assert.deepEqual(resolveSitePackage(site, tier).features, PACKAGES[tier].featuresRo);
      assert.equal(resolveSitePackage(site, tier).deliveryLabel, PACKAGES[tier].deliveryLabel);
    }
  });

  await t.test('livrabilele scrise de admin bat traducerea', () => {
    // Operatorul le-a scris el, în limba pe care o vrea — nu le suprascriem.
    const site = {
      locale: 'bg',
      packagePricesCents: null,
      experienceConfig: {
        defaultSlug: 'cadou',
        items: {
          cadou: { enabled: true, utmRules: [], packages: { basic: { features: ['Собствен текст'] } } },
        },
      },
    } as Parameters<typeof resolveSitePackage>[0];
    assert.deepEqual(resolveSitePackage(site, 'basic', 'cadou').features, ['Собствен текст']);
  });
});
