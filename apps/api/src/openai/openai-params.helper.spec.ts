import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatParams,
  isReasoningModel,
  modelCapabilities,
  normalizeEffort,
  requiresResponsesApiForTools,
} from './openai-params.helper';

/**
 * Tabelul de mai jos e cel VERIFICAT EMPIRIC pe `/v1/responses` (19 sept 2026,
 * un apel real per model × valoare). Dacă OpenAI schimbă vocabularul, se
 * re-rulează sondajul, nu se ghicește.
 */
describe('modelCapabilities (verificat empiric)', () => {
  it('gpt-6-astra: fără none, cu max, mod pro, fără temperature', () => {
    const c = modelCapabilities('gpt-6-astra');
    assert.deepEqual(c.efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
    assert.equal(c.temperature, false);
    assert.equal(c.verbosity, true);
    assert.equal(c.summary, true);
    assert.equal(c.proMode, true);
  });

  it('gpt-5.6-*: none…max, mod pro, fără temperature', () => {
    for (const m of ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6']) {
      const c = modelCapabilities(m);
      assert.deepEqual(c.efforts, ['none', 'low', 'medium', 'high', 'xhigh', 'max'], m);
      assert.equal(c.temperature, false, m);
      assert.equal(c.proMode, true, m);
      assert.equal(c.responsesOnlyForTools, true, m);
    }
  });

  it('gpt-5.4 / 5.5: none…xhigh, fără max, fără mod pro; DOAR 5.4 acceptă temperature', () => {
    for (const m of ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.5']) {
      const c = modelCapabilities(m);
      assert.deepEqual(c.efforts, ['none', 'low', 'medium', 'high', 'xhigh'], m);
      assert.equal(c.proMode, false, m);
      assert.equal(c.responsesOnlyForTools, false, m);
    }
    assert.equal(modelCapabilities('gpt-5.4-mini').temperature, true);
    assert.equal(modelCapabilities('gpt-5.5').temperature, false);
  });

  it('gpt-5 / 5-mini: minimal…high', () => {
    for (const m of ['gpt-5', 'gpt-5-mini']) {
      const c = modelCapabilities(m);
      assert.deepEqual(c.efforts, ['minimal', 'low', 'medium', 'high'], m);
      assert.equal(c.temperature, false, m);
      assert.equal(c.verbosity, true, m);
    }
  });

  it('gpt-4.1 / 4o: fără reasoning, cu temperature, fără verbosity/summary', () => {
    for (const m of ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini']) {
      const c = modelCapabilities(m);
      assert.equal(c.reasoning, false, m);
      assert.deepEqual(c.efforts, [], m);
      assert.equal(c.temperature, true, m);
      assert.equal(c.verbosity, false, m);
      assert.equal(c.summary, false, m);
      assert.equal(c.proMode, false, m);
    }
  });

  it('isReasoningModel acoperă gpt-6', () => {
    assert.equal(isReasoningModel('gpt-6-astra'), true);
    assert.equal(requiresResponsesApiForTools('gpt-6-astra'), true);
  });
});

describe('normalizeEffort — traducere per model', () => {
  it('lasă neschimbată o valoare acceptată', () => {
    assert.equal(normalizeEffort('medium', 'gpt-5.6-terra'), 'medium');
    assert.equal(normalizeEffort('xhigh', 'gpt-5.5'), 'xhigh');
    assert.equal(normalizeEffort('max', 'gpt-6-astra'), 'max');
    assert.equal(normalizeEffort('minimal', 'gpt-5'), 'minimal');
  });

  it('minimal ↔ none între generații; pe gpt-6 minimul e low', () => {
    assert.equal(normalizeEffort('minimal', 'gpt-5.6-luna'), 'none');
    assert.equal(normalizeEffort('none', 'gpt-5'), 'minimal');
    assert.equal(normalizeEffort('none', 'gpt-6-astra'), 'low');
    assert.equal(normalizeEffort('minimal', 'gpt-6-astra'), 'low');
  });

  it('xhigh / max cad pe cea mai mare valoare acceptată', () => {
    assert.equal(normalizeEffort('xhigh', 'gpt-5'), 'high');
    assert.equal(normalizeEffort('max', 'gpt-5.5'), 'xhigh');
    assert.equal(normalizeEffort('max', 'gpt-5-mini'), 'high');
  });

  it('standard / pro nu sunt valori de effort pe niciun model', () => {
    assert.equal(normalizeEffort('standard', 'gpt-5.6-terra'), 'medium');
    assert.equal(normalizeEffort('pro', 'gpt-5.6-terra'), 'xhigh');
    assert.equal(normalizeEffort('pro', 'gpt-5'), 'high');
  });

  it('pe modelele fără reasoning întoarce ce a primit (nu se trimite oricum)', () => {
    assert.equal(normalizeEffort('high', 'gpt-4o-mini'), 'high');
  });
});

describe('buildChatParams', () => {
  it('omite temperature pe modelele de raționament, o păstrează pe 4o', () => {
    const msgs = [{ role: 'user' as const, content: 'x' }];
    assert.equal(buildChatParams({ model: 'gpt-5.6-terra', temperature: 0.85, messages: msgs }).temperature, undefined);
    assert.equal(buildChatParams({ model: 'gpt-4o-mini', temperature: 0.85, messages: msgs }).temperature, 0.85);
  });
});
