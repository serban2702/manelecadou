import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PACKAGES } from '../payments/packages';
import { resolvePackageDef, snapshotFromDef, snapshotForTier } from './package-resolve';

describe('resolvePackageDef', () => {
  it('falls back to global flags when no overrides', () => {
    const plus = resolvePackageDef('plus', 'cadou');
    assert.equal(plus.video, PACKAGES.plus.video);
    assert.equal(plus.socialImage, PACKAGES.plus.socialImage);
    assert.equal(plus.durationSec, PACKAGES.plus.durationSec);
    assert.deepEqual(plus.features, PACKAGES.plus.featuresRo);
    assert.equal(plus.upsell, null);
  });

  it('admin override wins over global (plus + video)', () => {
    const plus = resolvePackageDef('plus', 'cadou', { video: true, features: ['Manea', 'Video'] });
    assert.equal(plus.video, true);
    assert.equal(plus.socialImage, PACKAGES.plus.socialImage);
    assert.deepEqual(plus.features, ['Manea', 'Video']);
  });

  it('does not apply a zero/negative duration override', () => {
    const basic = resolvePackageDef('basic', 'classic', { durationSec: 0 });
    assert.equal(basic.durationSec, PACKAGES.basic.durationSec);
  });

  it('snapshot only keeps fulfillment flags', () => {
    const snap = snapshotFromDef(PACKAGES.premium);
    assert.deepEqual(snap, {
      video: true,
      socialImage: true,
      instrumental: false,
      premiumPage: true,
      durationSec: PACKAGES.premium.durationSec,
    });
  });

  it('snapshotForTier uses the merged def', () => {
    const snap = snapshotForTier('plus', 'cadou', { video: true });
    assert.equal(snap.video, true);
    assert.equal(snap.socialImage, PACKAGES.plus.socialImage);
  });
});
