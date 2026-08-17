import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isExperienceEnabled, resolveExperienceSlug } from './assign';
import type { SiteExperienceConfig } from './types';

const cadouOn: SiteExperienceConfig = {
  defaultSlug: 'classic',
  items: {
    cadou: {
      enabled: true,
      utmRules: [
        { source: 'facebook' },
        { source: 'tiktok', campaign: 'c3-ocazii' },
      ],
    },
  },
};

describe('isExperienceEnabled', () => {
  it('classic is always enabled even if admin disables it', () => {
    const cfg: SiteExperienceConfig = {
      defaultSlug: 'cadou',
      items: { classic: { enabled: false, utmRules: [] } },
    };
    assert.equal(isExperienceEnabled('classic', cfg), true);
  });

  it('unknown slug is disabled', () => {
    assert.equal(isExperienceEnabled('nope', cadouOn), false);
  });

  it('cadou follows enabled flag', () => {
    assert.equal(isExperienceEnabled('cadou', cadouOn), true);
    assert.equal(
      isExperienceEnabled('cadou', { defaultSlug: 'classic', items: { cadou: { enabled: false, utmRules: [] } } }),
      false,
    );
  });
});

describe('resolveExperienceSlug', () => {
  it('?ui= wins over cookie, person, and utm', () => {
    const r = resolveExperienceSlug({
      uiParam: 'cadou',
      cookieSlug: 'classic',
      personSlug: 'classic',
      utm: { source: 'facebook' },
      config: cadouOn,
    });
    assert.deepEqual(r, { slug: 'cadou', reason: 'url' });
  });

  it('invalid ?ui= is ignored', () => {
    const r = resolveExperienceSlug({
      uiParam: 'nope',
      cookieSlug: 'classic',
      config: cadouOn,
    });
    assert.deepEqual(r, { slug: 'classic', reason: 'cookie' });
  });

  it('?ui= still forces a known slug even if admin disabled it', () => {
    const r = resolveExperienceSlug({
      uiParam: 'cadou',
      config: { defaultSlug: 'classic', items: { cadou: { enabled: false, utmRules: [] } } },
    });
    assert.deepEqual(r, { slug: 'cadou', reason: 'url' });
  });

  it('cookie wins over person and utm', () => {
    const r = resolveExperienceSlug({
      cookieSlug: 'cadou',
      personSlug: 'classic',
      utm: { source: 'facebook' },
      config: cadouOn,
    });
    assert.deepEqual(r, { slug: 'cadou', reason: 'cookie' });
  });

  it('person slug is used when no url/cookie', () => {
    const r = resolveExperienceSlug({
      personSlug: 'cadou',
      utm: { source: 'google' },
      config: cadouOn,
    });
    assert.deepEqual(r, { slug: 'cadou', reason: 'fingerprint' });
  });

  it('UTM first matching rule wins (wildcard empty fields)', () => {
    const r = resolveExperienceSlug({
      utm: { source: 'Facebook', campaign: 'anything' },
      config: cadouOn,
    });
    assert.deepEqual(r, { slug: 'cadou', reason: 'utm' });
  });

  it('UTM requires all specified fields (AND)', () => {
    const miss = resolveExperienceSlug({
      utm: { source: 'tiktok', campaign: 'other' },
      config: cadouOn,
    });
    assert.deepEqual(miss, { slug: 'classic', reason: 'default' });

    const hit = resolveExperienceSlug({
      utm: { source: 'tiktok', campaign: 'C3-Ocazii' },
      config: cadouOn,
    });
    assert.deepEqual(hit, { slug: 'cadou', reason: 'utm' });
  });

  it('empty config falls back to classic', () => {
    const r = resolveExperienceSlug({});
    assert.deepEqual(r, { slug: 'classic', reason: 'default' });
  });

  it('uses config defaultSlug when enabled', () => {
    const r = resolveExperienceSlug({
      config: { defaultSlug: 'cadou', items: { cadou: { enabled: true, utmRules: [] } } },
    });
    assert.deepEqual(r, { slug: 'cadou', reason: 'default' });
  });
});
