import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  containsRawAudioLink,
  decideStyleSample,
  enumeratesStyles,
  findMentionedSamples,
  matchSample,
  resolveChatStyleSamples,
  resolveChatVoiceSamples,
  type ChatSample,
  type ChatSampleSite,
} from './chat-samples';

const S = (url: string, startSec = 0) => ({ audioUrl: url, generatedAt: '', startSec });

/** Tenantul RO real (10 sep 2026): 10 stiluri pe site, 12 mostre în `suno.styleSamples`,
 *  mostre de voce doar pe nume de artiști fictivi (legacy). */
const RO_SITE: ChatSampleSite = {
  locale: 'ro',
  styles: [
    { id: 'clasic', em: '🎻', nm: 'Clasică de pahar', ds: 'Acordeon, lăutărească' },
    { id: 'modern', em: '🎹', nm: 'Modernă', ds: 'Trap-manea' },
    { id: 'romantica', em: '💔', nm: 'De jale', ds: 'Pentru inimi frânte' },
    { id: 'trompeta', em: '🎺', nm: 'Cu trompetă', ds: 'Fanfară' },
    { id: 'iubire', em: '❤️', nm: 'De iubire', ds: 'Romantic' },
    { id: 'pahar', em: '🍷', nm: 'De pahar', ds: 'Petrecere' },
    { id: 'opulenta', em: '👑', nm: 'De opulență', ds: 'Lux' },
    { id: 'oriental', em: '🪘', nm: 'Orientală', ds: 'Darbuka' },
    { id: 'fara-mostra', em: '🎵', nm: 'Fără mostră', ds: 'nu are audio' },
  ],
  voices: [],
  experienceConfig: null,
  suno: {
    styleSamples: {
      clasic: S('https://x/style-clasic.mp3?v=1', 12),
      modern: S('https://x/style-modern.mp3'),
      romantica: S('https://x/style-romantica.mp3'),
      trompeta: S('https://x/style-trompeta.mp3'),
      iubire: S('https://x/style-iubire.mp3'),
      pahar: S('https://x/style-pahar.mp3'),
      opulenta: S('https://x/style-opulenta.mp3'),
      oriental: S('https://x/style-oriental.mp3'),
      kuchek: S('https://x/style-kuchek.mp3'),
      tallava: S('https://x/style-tallava.mp3'),
    },
    voiceSamples: {
      gigi: S('https://x/voice-gigi.mp3'),
      mariana: S('https://x/voice-mariana.mp3'),
    },
  } as ChatSampleSite['suno'],
};

test('chat-samples — mostrele sunt exact stilurile de pe site', async (t) => {
  await t.test('classic: doar stilurile site-ului care au audio, în ordinea site-ului', () => {
    const ids = resolveChatStyleSamples(RO_SITE, 'classic').map((s) => s.id);
    assert.deepEqual(ids, ['clasic', 'modern', 'romantica', 'trompeta', 'iubire', 'pahar', 'opulenta', 'oriental']);
    // kuchek/tallava au mostră dar NU sunt pe site → nu se oferă; „fara-mostra" e pe site dar n-are audio.
    assert.ok(!ids.includes('kuchek') && !ids.includes('tallava') && !ids.includes('fara-mostra'));
  });

  await t.test('numele și startSec vin din catalog / mostră', () => {
    const clasic = resolveChatStyleSamples(RO_SITE, 'classic').find((s) => s.id === 'clasic')!;
    assert.equal(clasic.name, 'Clasică de pahar');
    assert.equal(clasic.startSec, 12);
    assert.equal(clasic.audioUrl, 'https://x/style-clasic.mp3?v=1');
  });

  await t.test('cadou fără catalog propriu: selecția fixă, „clasic" cu numele lui „pahar"', () => {
    const list = resolveChatStyleSamples(RO_SITE, 'cadou');
    assert.deepEqual(list.map((s) => s.id), ['iubire', 'romantica', 'clasic', 'opulenta', 'trompeta', 'oriental']);
    assert.equal(list.find((s) => s.id === 'clasic')!.name, 'De pahar');
  });

  await t.test('catalogul interfeței are prioritate, cu sampleUrl propriu', () => {
    const site: ChatSampleSite = {
      ...RO_SITE,
      experienceConfig: {
        defaultSlug: 'cadou',
        items: {
          cadou: {
            enabled: true,
            utmRules: [],
            catalog: {
              styles: [
                { id: 'iubire', nm: 'Iubire', sampleUrl: 'https://cdn/iubire-cadou.mp3', sampleStartSec: 7 },
                { id: 'modern', nm: 'Modern' },
                { id: 'nou', nm: 'Stil nou' },
              ],
            },
          },
        },
      },
    };
    const list = resolveChatStyleSamples(site, 'cadou');
    assert.deepEqual(list.map((s) => [s.id, s.audioUrl, s.startSec]), [
      ['iubire', 'https://cdn/iubire-cadou.mp3', 7],
      ['modern', 'https://x/style-modern.mp3', 0],
    ]);
  });

  await t.test('site fără stiluri: cade pe seed-ul RO, doar ce are mostră', () => {
    const site: ChatSampleSite = { ...RO_SITE, styles: [] };
    const ids = resolveChatStyleSamples(site, 'classic').map((s) => s.id);
    assert.ok(ids.includes('clasic') && ids.includes('tallava') && !ids.includes('trapanele'));
    assert.deepEqual(resolveChatStyleSamples({ ...site, suno: {} }, 'classic'), []);
  });

  await t.test('traducerea per locale se aplică', () => {
    const site: ChatSampleSite = {
      ...RO_SITE,
      locale: 'bg',
      styles: [{ id: 'clasic', em: '', nm: 'Clasică', ds: 'x', i18n: { bg: { nm: 'Класика' } } }],
    };
    assert.equal(resolveChatStyleSamples(site, 'classic')[0].name, 'Класика');
    assert.equal(resolveChatStyleSamples(site, 'classic', 'bg-BG')[0].name, 'Класика');
  });

  await t.test('vocile: doar male/female din catalog, mostrele pe nume de artiști sunt ignorate', () => {
    assert.deepEqual(resolveChatVoiceSamples(RO_SITE, 'classic'), []);
    const site: ChatSampleSite = {
      ...RO_SITE,
      suno: { ...RO_SITE.suno, voiceSamples: { male: S('https://x/voice-male.mp3'), gigi: S('https://x/g.mp3') } },
    };
    const v = resolveChatVoiceSamples(site, 'classic');
    assert.deepEqual(v.map((x) => [x.id, x.name]), [['male', 'Bărbătească']]);
  });
});

test('chat-samples — potrivirea textului cu mostrele', async (t) => {
  const samples = resolveChatStyleSamples(RO_SITE, 'classic');

  await t.test('flexiuni și diacritice lipsă', () => {
    const ids = (txt: string) => findMentionedSamples(txt, samples).map((s) => s.id);
    assert.deepEqual(ids('vreau una moderna'), ['modern']);
    assert.deepEqual(ids('ceva de jale, trist'), ['romantica']);
    assert.deepEqual(ids('cu trompete, de petrecere'), ['trompeta']);
    assert.deepEqual(ids('vreau un demo'), []);
    // „română" NU e „romantica"; „pahar" apare în două nume → ambele.
    assert.deepEqual(ids('vreau in limba romana'), []);
    assert.deepEqual(ids('una de pahar').sort(), ['clasic', 'pahar']);
  });

  await t.test('matchSample: id, nume, prefix, „de X"', () => {
    assert.equal(matchSample(samples, 'modern')!.id, 'modern');
    assert.equal(matchSample(samples, 'Modernă')!.id, 'modern');
    assert.equal(matchSample(samples, 'de iubire')!.id, 'iubire');
    assert.equal(matchSample(samples, 'De jale')!.id, 'romantica');
    assert.equal(matchSample(samples, 'Clasică de pahar')!.id, 'clasic');
    assert.equal(matchSample(samples, 'kuchek'), undefined);
  });

  await t.test('enumeratesStyles: ≥2 nume într-un singur mesaj', () => {
    assert.ok(enumeratesStyles('Ce stil vrei? Avem: Clasică de pahar, Modernă, De jale, Cu trompetă.', samples));
    assert.ok(!enumeratesStyles('Vrei să auzi una modernă?', samples));
  });

  await t.test('containsRawAudioLink', () => {
    assert.ok(containsRawAudioLink('Uite: https://manelecadou.ro/uploads/site-samples/default/style-clasic.mp3?v=1'));
    assert.ok(containsRawAudioLink('https://cdn.x/a.MP3'));
    assert.ok(!containsRawAudioLink('Vezi melodia aici: https://manelecadou.ro/m/abc'));
  });
});

test('chat-samples — decizia „întreabă stilul întâi"', async (t) => {
  const samples = resolveChatStyleSamples(RO_SITE, 'classic');
  const base = { samples, userAffirmOnly: false, recentAiTexts: [] as string[], wizardStyle: null };

  await t.test('cerere generică de demo → ask', () => {
    const d = decideStyleSample({ ...base, requested: 'modern', userText: 'aveti un demo? vreau sa aud cum suna' });
    assert.equal(d.action, 'ask');
  });

  await t.test('userul a numit stilul → play, cu corectarea id-ului cerut de model', () => {
    const d = decideStyleSample({ ...base, requested: 'modern', userText: 'vreau sa aud una de jale' });
    assert.equal(d.action, 'play');
    assert.equal((d as { sample: ChatSample }).sample.id, 'romantica');
    assert.equal((d as { corrected: boolean }).corrected, true);
  });

  await t.test('după enumerare, răspunsul cu numărul lasă modelul să aleagă', () => {
    const d = decideStyleSample({
      ...base,
      requested: 'trompeta',
      userText: 'a doua',
      recentAiTexts: ['Ce stil vrei? Avem: Clasică de pahar, Cu trompetă, De iubire.'],
    });
    assert.equal(d.action, 'play');
    assert.equal((d as { sample: ChatSample }).sample.id, 'trompeta');
  });

  await t.test('„da" la o ofertă concretă a Irinei → play', () => {
    const d = decideStyleSample({
      ...base,
      requested: 'iubire',
      userText: 'da',
      userAffirmOnly: true,
      recentAiTexts: ['Vrei să auzi o mostră de iubire?'],
    });
    assert.equal(d.action, 'play');
  });

  await t.test('„da" fără ofertă concretă → ask', () => {
    const d = decideStyleSample({ ...base, requested: 'iubire', userText: 'da', userAffirmOnly: true, recentAiTexts: ['Vrei să auzi o mostră?'] });
    assert.equal(d.action, 'ask');
  });

  await t.test('stilul deja ales în comandă → play fără întrebare', () => {
    const d = decideStyleSample({ ...base, requested: 'opulenta', userText: 'vreau sa aud', wizardStyle: 'De opulență' });
    assert.equal(d.action, 'play');
  });

  await t.test('stil inexistent, fără mențiune → not_found', () => {
    const d = decideStyleSample({ ...base, requested: 'kuchek', userText: 'vreau kuchek' });
    assert.equal(d.action, 'not_found');
  });
});
