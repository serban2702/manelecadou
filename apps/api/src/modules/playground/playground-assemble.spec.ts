import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assemblePlayground, playgroundNeedsLyricsWrite } from './playground-assemble';
import type { Site } from '../sites/site.entity';

function site(partial: Partial<Site>): Site {
  return {
    id: 'site-1',
    locale: 'ro',
    currency: 'RON',
    musicEngine: 'suno',
    lyricsReviewEnabled: true,
    styles: [
      {
        id: 'clasic',
        em: '🎻',
        nm: 'Clasic',
        ds: '',
        sunoPrompt: 'classic lautareasca, accordion',
        googlePrompt: 'Romanian manele with accordion and violin',
        lyricsHint: 'manea de petrecere',
        styleWeight: 0.7,
        weirdnessConstraint: 0.2,
        negativeTags: 'pop, EDM',
      },
    ],
    occasions: [{ id: 'nunta', em: '💍', nm: 'Nuntă', sunoPrompt: 'wedding celebration', googlePrompt: 'wedding party' }],
    voices: [{ id: 'female', nm: 'Feminină', tg: '', av: 'F', gender: 'f', sunoPersonaId: 'persona-f' }],
    suno: {
      basePrompt: 'site base prompt',
      writerSystemPrompt: 'site writer',
      writerUserTemplate: 'Scrie pentru {{recipientName}}',
      criticSystemPrompt: 'site critic',
      lyricsLocale: 'ro',
    },
    experienceConfig: {
      defaultSlug: 'classic',
      items: {
        cadou: {
          enabled: true,
          utmRules: [],
          catalog: {
            writerSystemPrompt: 'cadou writer',
            styles: [{ id: 'jale', nm: 'De jale', em: '💔', sunoPrompt: 'sad manele crying vocal', googlePrompt: 'heartbroken manele' }],
            occasions: [{ id: 'despartire', nm: 'Despărțire', em: '😢', sunoPrompt: 'breakup', googlePrompt: 'breakup theme' }],
            voices: [{ id: 'male', nm: 'Bărbătească', tg: '', av: 'M', gender: 'm' }],
          },
        },
      },
    },
    ...partial,
  } as Site;
}

describe('assemblePlayground', () => {
  it('fills Suno/Google prompts from the selected style and occasion', () => {
    const a = assemblePlayground(site({}), {
      styleId: 'clasic',
      occasionId: 'nunta',
      voiceId: 'female',
      recipientName: 'Mirela',
    });
    assert.equal(a.style?.id, 'clasic');
    assert.match(a.suno.styleOverride ?? '', /classic lautareasca/);
    assert.match(a.suno.styleOverride ?? '', /wedding celebration/);
    assert.equal(a.lyria.stylePrompt, 'Romanian manele with accordion and violin');
    assert.equal(a.lyria.occasionPrompt, 'wedding party');
    assert.equal(a.suno.vocalGender, 'f');
    assert.equal(a.suno.personaId, 'persona-f');
    assert.equal(a.suno.styleWeight, 0.7);
    assert.equal(a.lyricsInput.writerSystemPrompt, 'site writer');
    assert.equal(a.lyricsInput.styleHint, 'manea de petrecere');
  });

  it('lets DTO overrides win over catalog', () => {
    const a = assemblePlayground(site({}), {
      styleId: 'clasic',
      sunoStylePrompt: 'CUSTOM SUNO TAGS',
      sunoOccasionPrompt: '',
      lyriaStylePrompt: 'CUSTOM LYRIA',
      lyriaPromptOverride: 'FULL CUSTOM LYRIA PROMPT',
      writerSystemPrompt: 'CUSTOM WRITER',
      vocalGender: 'm',
      personaId: 'forced-persona',
    });
    assert.equal(a.suno.styleOverride, 'CUSTOM SUNO TAGS');
    assert.equal(a.lyria.stylePrompt, 'CUSTOM LYRIA');
    assert.equal(a.lyria.builtPrompt, 'FULL CUSTOM LYRIA PROMPT');
    assert.equal(a.lyricsInput.writerSystemPrompt, 'CUSTOM WRITER');
    assert.equal(a.suno.vocalGender, 'm');
    assert.equal(a.suno.personaId, 'forced-persona');
  });

  it('uses the experience catalog when a slug is set', () => {
    const a = assemblePlayground(site({}), {
      experienceSlug: 'cadou',
      styleId: 'jale',
    });
    assert.equal(a.style?.id, 'jale');
    assert.match(a.suno.styleOverride ?? '', /sad manele/);
    assert.equal(a.lyria.stylePrompt, 'heartbroken manele');
    assert.equal(a.lyricsInput.writerSystemPrompt, 'cadou writer');
    assert.equal(a.voice?.id, 'male');
  });

  it('skips GPT when a complete Lyria/Suno prompt is set', () => {
    const google = assemblePlayground(site({}), {
      engine: 'google',
      lyricsMode: 'generate',
      lyriaPromptOverride: 'FULL CUSTOM',
    });
    assert.equal(playgroundNeedsLyricsWrite(google), false);
    assert.equal(google.variantCount, 1);
    const suno = assemblePlayground(site({}), {
      engine: 'suno',
      lyricsMode: 'generate',
      sunoPromptOverride: 'FULL SUNO',
    });
    assert.equal(playgroundNeedsLyricsWrite(suno), false);
    const fields = assemblePlayground(site({}), { lyricsMode: 'generate', variantCount: 2 });
    assert.equal(playgroundNeedsLyricsWrite(fields), true);
    assert.equal(fields.variantCount, 2);
  });

  it('description-mode Suno when there are no lyrics', () => {
    const a = assemblePlayground(site({}), { lyricsMode: 'generate' });
    assert.equal(a.suno.customMode, false);
    const b = assemblePlayground(site({}), { lyricsMode: 'custom', lyrics: '[Verse 1]\nMirela' });
    assert.equal(b.suno.customMode, true);
    const c = assemblePlayground(site({}), { lyricsMode: 'instrumental' });
    assert.equal(c.instrumental, true);
    assert.equal(c.suno.customMode, false);
  });
});
