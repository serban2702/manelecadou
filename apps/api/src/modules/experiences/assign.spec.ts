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

  it('no config entry means NOT enabled (stale cookie must not stick)', () => {
    assert.equal(isExperienceEnabled('cadou', null), false);
    assert.equal(isExperienceEnabled('cadou', { defaultSlug: 'classic', items: {} }), false);
  });

  it('the site default slug is enabled even without an items entry', () => {
    assert.equal(isExperienceEnabled('cadou', { defaultSlug: 'cadou', items: {} }), true);
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

  it('?ui= is ignored when the experience is disabled', () => {
    // Preview needs `enabled: true` (without making it the default). Otherwise a
    // stray ?ui= link would stick the experience on visitors via the cookie.
    const r = resolveExperienceSlug({
      uiParam: 'cadou',
      config: { defaultSlug: 'classic', items: { cadou: { enabled: false, utmRules: [] } } },
    });
    assert.deepEqual(r, { slug: 'classic', reason: 'default' });
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

  it('a cookie for an unconfigured experience is dropped', () => {
    // Covers the API-down case too: config null must not hand the site over to
    // whatever slug an old cookie carries.
    const r = resolveExperienceSlug({ cookieSlug: 'cadou' });
    assert.deepEqual(r, { slug: 'classic', reason: 'default' });

    const noItem = resolveExperienceSlug({
      cookieSlug: 'cadou',
      config: { defaultSlug: 'classic', items: {} },
    });
    assert.deepEqual(noItem, { slug: 'classic', reason: 'default' });
  });

  it('a visitor already on an experience stays on it after it is turned off (spec §13)', () => {
    // Sticky beats enabled=false so we do not swap someone's UI mid-order.
    // The entry still exists in items — that is what separates this from a
    // stale cookie for an experience the site never configured.
    const off = { defaultSlug: 'classic', items: { cadou: { enabled: false, utmRules: [] } } };
    assert.deepEqual(resolveExperienceSlug({ cookieSlug: 'cadou', config: off }), {
      slug: 'cadou',
      reason: 'cookie',
    });
    assert.deepEqual(resolveExperienceSlug({ personSlug: 'cadou', config: off }), {
      slug: 'cadou',
      reason: 'fingerprint',
    });
    // …but a fresh visitor is not sent there.
    assert.deepEqual(resolveExperienceSlug({ config: off }), { slug: 'classic', reason: 'default' });
    assert.deepEqual(resolveExperienceSlug({ uiParam: 'cadou', config: off }), {
      slug: 'classic',
      reason: 'default',
    });
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
