import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSunoStyleTag, buildSunoStyleTagBody, styleOverrideTag, sunoGenderTag } from './suno-style-tag';
import type { Site } from '../sites/site.entity';

const site = {
  locale: 'ro',
  suno: { stylePromptMap: { modern: 'modern manele, 808 bass, male vocal' } },
} as unknown as Site;

describe('suno-style-tag', () => {
  it('corpul NU conține prefixul de gen; tag-ul complet îl pune o singură dată', () => {
    const body = buildSunoStyleTagBody({ style: 'modern', occasion: 'nunta', vocalGender: 'f', site });
    assert.equal(body.startsWith('female vocals only'), false);
    assert.equal(body.includes('female vocal'), true); // aliniat la gen
    const full = buildSunoStyleTag({ style: 'modern', occasion: 'nunta', vocalGender: 'f', site });
    assert.equal(full, sunoGenderTag('f') + body);
    assert.equal(full.split('female vocals only').length, 2);
  });

  it('un corp editat și trimis ca override primește prefixul o singură dată', () => {
    const body = buildSunoStyleTagBody({ style: 'modern', occasion: 'nunta', vocalGender: 'm', site });
    const sent = styleOverrideTag(body, 'm');
    assert.equal(sent, sunoGenderTag('m') + body);
  });

  it('stil necunoscut în catalog cade pe CORE + „<stil> manele subgenre”', () => {
    const body = buildSunoStyleTagBody({ style: 'Modernă', occasion: 'zi', site: {} as Site });
    assert.equal(body.includes('Modernă manele subgenre'), true);
  });
});
