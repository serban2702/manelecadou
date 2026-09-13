import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referencesPastConversation } from './past-reference';
import { requiresResponsesApiForTools, isReasoningModel } from '../../openai/openai-params.helper';

test('referencesPastConversation — referiri la o discuție/comandă anterioară', async (t) => {
  await t.test('prinde cazurile reale de „chat nou, comandă veche"', () => {
    const yes = [
      'unde e comanda mea?',
      'Unde este melodia mea, am platit ieri',
      'am vorbit ieri cu cineva de la voi',
      'v-am scris saptamana trecuta si nu mi-a raspuns nimeni',
      'am comandat o manea si nu am primit nimic',
      'mi-ati zis ca vine in 10 minute',
      'am discutat data trecuta despre pretul cu reducere',
      'Am platit dar nu am primit melodia',
    ];
    for (const s of yes) assert.ok(referencesPastConversation(s), `ratat: ${s}`);
  });

  await t.test('NU se declanșează pe conversații noi obișnuite', () => {
    const no = [
      'buna, cat costa o manea?',
      'vreau o melodie pentru sotia mea de ziua ei',
      'as vrea sa comand ceva pentru nunta',
      'ce stiluri aveti?',
      'da',
      '',
      'poti sa-mi trimiti o mostra?',
    ];
    for (const s of no) assert.ok(!referencesPastConversation(s), `fals pozitiv: ${s}`);
  });

  await t.test('funcționează și fără diacritice, și cu ele', () => {
    assert.ok(referencesPastConversation('Am vorbit ieri'));
    assert.ok(referencesPastConversation('Am vorbit ieri'.normalize('NFD')));
    assert.ok(referencesPastConversation('unde e maneaua mea'));
  });
});

test('openai-params — ce model cere /v1/responses pentru tool calling', async (t) => {
  await t.test('gpt-5.6+ cere Responses API (chat/completions dă 400 cu tools)', () => {
    for (const m of ['gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.7', 'gpt-5.10']) {
      assert.ok(requiresResponsesApiForTools(m), `${m} ar trebui să ceară /v1/responses`);
    }
  });

  await t.test('modelele vechi rămân pe chat/completions', () => {
    for (const m of ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5', 'gpt-5', 'gpt-5-mini', 'gpt-4o-mini', 'o3-mini']) {
      assert.ok(!requiresResponsesApiForTools(m), `${m} nu ar trebui mutat pe /v1/responses`);
    }
  });

  await t.test('gpt-5.6-luna e tot model de reasoning (fără temperature)', () => {
    assert.ok(isReasoningModel('gpt-5.6-luna'));
  });
});
