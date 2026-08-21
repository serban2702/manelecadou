import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExperienceDemoIds,
  resolveExperienceStylePrompt,
  resolveExperienceStyles,
  resolveExperienceWriterPrompt,
  resolveStylePersonaId,
} from './catalog-resolve';
import type { Site } from '../sites/site.entity';

function site(partial: Partial<Site>): Site {
  return partial as Site;
}

describe('resolveExperienceStyles', () => {
  it('falls back to site styles when catalog is empty', () => {
    const s = site({
      styles: [{ id: 'clasic', em: '🎻', nm: 'Clasic', ds: '' }],
      experienceConfig: { defaultSlug: 'cadou', items: { cadou: { enabled: true, utmRules: [] } } },
    });
    assert.equal(resolveExperienceStyles(s, 'cadou')[0].id, 'clasic');
  });

  it('uses experience styles when present', () => {
    const s = site({
      styles: [{ id: 'clasic', em: '🎻', nm: 'Clasic', ds: '' }],
      experienceConfig: {
        defaultSlug: 'cadou',
        items: {
          cadou: {
            enabled: true,
            utmRules: [],
            catalog: { styles: [{ id: 'jale', nm: 'De jale', em: '💔', sunoPrompt: 'sad manele' }] },
          },
        },
      },
    });
    const styles = resolveExperienceStyles(s, 'cadou');
    assert.equal(styles.length, 1);
    assert.equal(styles[0].id, 'jale');
    assert.equal(styles[0].sunoPrompt, 'sad manele');
  });
});

describe('resolveExperienceStylePrompt', () => {
  it('prefers experience sunoPrompt over site map', () => {
    const s = site({
      suno: { stylePromptMap: { clasic: 'site prompt' } },
      experienceConfig: {
        defaultSlug: 'cadou',
        items: {
          cadou: {
            enabled: true,
            utmRules: [],
            catalog: { styles: [{ id: 'clasic', nm: 'Clasic', sunoPrompt: 'ui prompt' }] },
          },
        },
      },
    });
    assert.equal(resolveExperienceStylePrompt(s, 'cadou', 'clasic'), 'ui prompt');
    assert.equal(resolveExperienceStylePrompt(s, 'classic', 'clasic'), 'site prompt');
  });
});

describe('resolveExperienceWriterPrompt', () => {
  it('prefers catalog writer prompt', () => {
    const s = site({
      suno: { writerSystemPrompt: 'site writer' },
      experienceConfig: {
        defaultSlug: 'cadou',
        items: {
          cadou: {
            enabled: true,
            utmRules: [],
            catalog: { writerSystemPrompt: 'cadou writer' },
          },
        },
      },
    });
    assert.equal(resolveExperienceWriterPrompt(s, 'cadou'), 'cadou writer');
    assert.equal(resolveExperienceWriterPrompt(s, 'classic'), 'site writer');
  });
});

describe('resolveStylePersonaId', () => {
  const style = {
    sunoPersonaIdMale: 'male-id',
    sunoPersonaIdFemale: 'female-id',
    sunoPersonaId: 'legacy-id',
  };
  it('picks male/female by gender and ignores the other', () => {
    assert.equal(resolveStylePersonaId(style, 'm'), 'male-id');
    assert.equal(resolveStylePersonaId(style, 'f'), 'female-id');
  });
  it('returns undefined for that gender when empty (does not steal the other)', () => {
    assert.equal(resolveStylePersonaId({ sunoPersonaIdMale: 'male-id' }, 'f'), undefined);
    assert.equal(resolveStylePersonaId({ sunoPersonaIdFemale: 'female-id' }, 'm'), undefined);
  });
  it('uses legacy id only when gender is unknown', () => {
    assert.equal(resolveStylePersonaId({ sunoPersonaId: 'legacy-id' }, undefined), 'legacy-id');
    assert.equal(resolveStylePersonaId({ sunoPersonaId: 'legacy-id' }, 'm'), undefined);
  });
});

describe('resolveExperienceDemoIds', () => {
  it('returns null when unset (show all)', () => {
    const s = site({ experienceConfig: { defaultSlug: 'cadou', items: {} } });
    assert.equal(resolveExperienceDemoIds(s, 'cadou'), null);
  });

  it('returns cleaned ids when set', () => {
    const s = site({
      experienceConfig: {
        defaultSlug: 'cadou',
        items: { cadou: { enabled: true, utmRules: [], catalog: { demoIds: [' a ', '', 'b'] } } },
      },
    });
    assert.deepEqual(resolveExperienceDemoIds(s, 'cadou'), ['a', 'b']);
  });
});
