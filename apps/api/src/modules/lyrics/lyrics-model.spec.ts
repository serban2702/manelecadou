import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLyricsRequest,
  extractResponsesText,
  hasTuning,
  resolveSiteLyricsModels,
} from './lyrics-model';

const base = { globalModel: 'gpt-5.4-mini', system: 'SYS', user: 'USR' } as const;

describe('resolveSiteLyricsModels — gol = comportamentul vechi', () => {
  it('site fără configurare → nimic pe writer și critic', () => {
    assert.deepEqual(resolveSiteLyricsModels(undefined), { writerModel: undefined, criticModel: undefined });
    assert.deepEqual(resolveSiteLyricsModels({}), { writerModel: undefined, criticModel: undefined });
    assert.deepEqual(resolveSiteLyricsModels({ writerModel: {}, criticModel: { model: '  ' } }), {
      writerModel: undefined,
      criticModel: undefined,
    });
  });

  it('criticSameAsWriter copiază writer-ul peste critic', () => {
    const r = resolveSiteLyricsModels({
      writerModel: { model: 'gpt-5.6-terra', effort: 'medium' },
      criticModel: { model: 'gpt-4o-mini' },
      criticSameAsWriter: true,
    });
    assert.deepEqual(r.criticModel, { model: 'gpt-5.6-terra', effort: 'medium' });
  });

  it('normalizează: effort lowercase, temperatură în [0,2], valori invalide scoase', () => {
    const r = resolveSiteLyricsModels({
      writerModel: { model: 'gpt-4o', effort: ' HIGH ', temperature: 7, verbosity: 'huge' as never, store: 'yes' as never },
    });
    assert.deepEqual(r.writerModel, { model: 'gpt-4o', effort: 'high', temperature: 2 });
  });
});

describe('buildLyricsRequest — calea veche rămâne identică', () => {
  it('fără config: chat/completions cu OPENAI_MODEL și temperature 0.85 (unde e acceptată)', () => {
    const r = buildLyricsRequest({ stage: 'writer', ...base, globalModel: 'gpt-4o-mini' });
    assert.equal(r.endpoint, 'chat');
    assert.equal(r.model, 'gpt-4o-mini');
    assert.deepEqual(r.body, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USR' },
      ],
      temperature: 0.85,
    });
  });

  it('fără config, model de raționament global: chat/completions FĂRĂ temperature, fără effort', () => {
    const r = buildLyricsRequest({ stage: 'critic', ...base, globalModel: 'gpt-5.6-terra' });
    assert.equal(r.endpoint, 'chat');
    assert.equal('temperature' in r.body, false);
    assert.equal('reasoning' in r.body, false);
  });

  it('doar modelul pe site (fără reglaje): tot chat/completions, dar cu modelul site-ului', () => {
    const r = buildLyricsRequest({ stage: 'writer', ...base, config: { model: 'gpt-5.5' } });
    assert.equal(r.endpoint, 'chat');
    assert.equal(r.model, 'gpt-5.5');
    assert.equal(hasTuning({ model: 'gpt-5.5' }), false);
  });

  it('override-ul explicit (playground) câștigă în fața configului de site', () => {
    const r = buildLyricsRequest({
      stage: 'writer',
      ...base,
      config: { model: 'gpt-5.5' },
      modelOverride: 'gpt-4o',
      temperatureOverride: 0.3,
    });
    assert.equal(r.model, 'gpt-4o');
    assert.equal((r.body as { temperature?: number }).temperature, 0.3);
  });
});

describe('buildLyricsRequest — cu reglaje merge pe /v1/responses', () => {
  it('effort + verbosity + summary + store pe gpt-5.6-terra', () => {
    const r = buildLyricsRequest({
      stage: 'writer',
      ...base,
      config: {
        model: 'gpt-5.6-terra',
        effort: 'medium',
        verbosity: 'medium',
        reasoningSummary: 'auto',
        store: true,
        textFormat: 'text',
      },
    });
    assert.equal(r.endpoint, 'responses');
    assert.equal(r.url, 'https://api.openai.com/v1/responses');
    assert.deepEqual(r.body, {
      model: 'gpt-5.6-terra',
      input: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USR' },
      ],
      store: true,
      reasoning: { effort: 'medium', summary: 'auto' },
      text: { verbosity: 'medium' },
    });
  });

  it('store e OFF implicit; summary "off" nu se trimite; temperature ignorată pe reasoning', () => {
    const r = buildLyricsRequest({
      stage: 'critic',
      ...base,
      config: { model: 'gpt-5.6-terra', effort: 'high', reasoningSummary: 'off', temperature: 0.9 },
    });
    assert.equal(r.body.store, false);
    assert.deepEqual(r.body.reasoning, { effort: 'high' });
    assert.equal('temperature' in r.body, false);
  });

  it('effort-ul se traduce per model: minimal → none pe 5.6, xhigh → high pe gpt-5', () => {
    const a = buildLyricsRequest({ stage: 'writer', ...base, config: { model: 'gpt-5.6-luna', effort: 'minimal' } });
    assert.deepEqual(a.body.reasoning, { effort: 'none' });
    const b = buildLyricsRequest({ stage: 'writer', ...base, config: { model: 'gpt-5', effort: 'xhigh' } });
    assert.deepEqual(b.body.reasoning, { effort: 'high' });
  });

  it('reasoning.mode pro pleacă doar pe modelele care îl acceptă', () => {
    const ok = buildLyricsRequest({ stage: 'writer', ...base, config: { model: 'gpt-6-astra', effort: 'high', reasoningMode: 'pro' } });
    assert.deepEqual(ok.body.reasoning, { effort: 'high', mode: 'pro' });
    const no = buildLyricsRequest({ stage: 'writer', ...base, config: { model: 'gpt-5.5', effort: 'high', reasoningMode: 'pro' } });
    assert.deepEqual(no.body.reasoning, { effort: 'high' });
  });

  it('temperature pleacă doar pe modelele care o acceptă (4o, familia 5.4)', () => {
    const a = buildLyricsRequest({ stage: 'writer', ...base, config: { model: 'gpt-4o-mini', temperature: 0.7, store: false } });
    assert.equal(a.endpoint, 'responses');
    assert.equal(a.body.temperature, 0.7);
    assert.equal('reasoning' in a.body, false);
    const b = buildLyricsRequest({ stage: 'writer', ...base, config: { model: 'gpt-5.4-mini', temperature: 0.7, effort: 'low' } });
    assert.equal(b.body.temperature, 0.7);
  });

  it('verbosity nu pleacă pe 4o (acceptă doar "medium", adică nimic de reglat)', () => {
    const r = buildLyricsRequest({ stage: 'writer', ...base, config: { model: 'gpt-4o', verbosity: 'low', temperature: 0.5 } });
    assert.equal('text' in r.body, false);
  });
});

describe('extractResponsesText', () => {
  it('preferă output_text, altfel adună itemele message', () => {
    assert.equal(extractResponsesText({ output_text: ' hi ' }), 'hi');
    assert.equal(
      extractResponsesText({
        output: [
          { type: 'reasoning' },
          { type: 'message', content: [{ type: 'output_text', text: 'a' }] },
          { type: 'message', content: [{ type: 'output_text', text: 'b' }] },
        ],
      }),
      'a\nb',
    );
  });
});
