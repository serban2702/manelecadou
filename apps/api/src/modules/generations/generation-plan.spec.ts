import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGenerationPlan, catalogKey } from './generation-plan';
import type { Site } from '../sites/site.entity';

function site(partial: Partial<Site> = {}): Site {
  return {
    id: 'site-1',
    locale: 'ro',
    currency: 'RON',
    musicEngine: 'suno',
    styles: [
      { id: 'modern', em: '🎹', nm: 'Modernă', ds: '', sunoPrompt: 'modern manele, 808' },
      { id: 'iubire', em: '❤️', nm: 'De iubire', ds: '' },
    ],
    occasions: [{ id: 'zi', em: '🎂', nm: 'Zi naștere', sunoPrompt: 'birthday party' }],
    voices: [{ id: 'female', nm: 'Feminină', tg: '', av: 'F', gender: 'f' }],
    suno: { writerModel: { model: 'gpt-5.6-terra', effort: 'medium' }, criticSameAsWriter: true },
    experienceConfig: null,
    ...partial,
  } as unknown as Site;
}

describe('catalogKey — numele afișat se mapează la id', () => {
  const entries = [{ id: 'modern', nm: 'Modernă' }, { id: 'iubire', nm: 'De iubire' }];
  it('id exact rămâne', () => assert.equal(catalogKey(entries, 'modern'), 'modern'));
  it('nume cu diacritice / majuscule → id', () => {
    assert.equal(catalogKey(entries, 'Modernă'), 'modern');
    assert.equal(catalogKey(entries, 'de iubire'), 'iubire');
    assert.equal(catalogKey(entries, 'MODERNA'), 'modern');
  });
  it('necunoscut rămâne așa cum a venit', () => assert.equal(catalogKey(entries, 'jazz'), 'jazz'));
});

describe('buildGenerationPlan', () => {
  it('rezolvă stilul din nume, tag-ul Suno folosește promptul stilului și ocazia, fără prefix de gen', () => {
    const plan = buildGenerationPlan(site(), {
      style: 'Modernă',
      occasion: 'Zi naștere',
      recipientName: 'Mirela',
      message: 'La mulți ani',
      voiceArtist: 'female',
    });
    assert.equal(plan.engine, 'suno');
    assert.equal(plan.styleId, 'modern');
    assert.equal(plan.occasionId, 'zi');
    assert.equal(plan.sunoStylePrompt, 'modern manele, 808, birthday party');
    assert.equal(plan.lyriaStylePrompt, null);
    assert.equal(plan.lyricsInput.style, 'modern');
    assert.equal(plan.lyricsInput.voiceArtist, 'female');
    assert.deepEqual(plan.models, { writer: 'gpt-5.6-terra', critic: 'gpt-5.6-terra' });
    assert.deepEqual(plan.lyricsInput.criticModel, { model: 'gpt-5.6-terra', effort: 'medium' });
  });

  it('pe motorul google întoarce promptul Lyria', () => {
    const plan = buildGenerationPlan(site({ musicEngine: 'google' }), {
      style: 'iubire',
      occasion: 'zi',
      recipientName: 'Mirela',
      message: '',
      voiceArtist: 'male',
    });
    assert.equal(plan.engine, 'google');
    assert.equal(typeof plan.lyriaStylePrompt, 'string');
    assert.equal(plan.lyriaStylePrompt!.length > 10, true);
  });
});
