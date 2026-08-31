import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chatLocale,
  chatStrings,
  aiChatSupported,
  allThankYouBodies,
  AI_SUPPORTED_LOCALES,
} from './chat-i18n';
import { recoveryStrings, collageReadyStrings } from '../../mailer/templates/recovery-i18n';

test('chat-i18n — limba site-ului decide textele automate', async (t) => {
  await t.test('bg și el au texte proprii, nu românești', () => {
    const bg = chatStrings('bg');
    const el = chatStrings('el');
    const ro = chatStrings('ro');
    assert.notEqual(bg.songReady('/m/1'), ro.songReady('/m/1'));
    assert.notEqual(el.songReady('/m/1'), ro.songReady('/m/1'));
    // Verificare de script: bulgara e chirilică, greaca e grecească.
    assert.match(bg.songReady('/m/1'), /[Ѐ-ӿ]/, 'bg trebuie să fie chirilic');
    assert.match(el.songReady('/m/1'), /[Ͱ-Ͽ]/, 'el trebuie să fie grecesc');
    // Și niciuna nu are voie să conțină diacritice românești.
    for (const s of [bg, el]) {
      for (const body of [...s.thankYou, s.thankYouRemake, ...s.thankYouReturning]) {
        assert.doesNotMatch(body, /[ăâîșțĂÂÎȘȚ]/, `text românesc scăpat: ${body}`);
      }
    }
  });

  await t.test('linkul melodiei ajunge în text, în fiecare limbă', () => {
    for (const loc of ['ro', 'bg', 'el', 'sr']) {
      assert.ok(chatStrings(loc).songReady('/m/abc').includes('/m/abc'), `link lipsă pe ${loc}`);
      assert.ok(chatStrings(loc).songReadyRemake('/m/abc').includes('/m/abc'), `link lipsă (remake) pe ${loc}`);
    }
  });

  await t.test('o limbă necunoscută cade pe engleză, NU pe română', () => {
    const s = chatStrings('sr');
    assert.equal(chatLocale('sr'), 'en');
    assert.doesNotMatch(s.songReady('/m/1'), /[ăâîșț]/);
    assert.match(s.songReady('/m/1'), /Your song is ready/);
    // null / gol / variantă regională
    assert.equal(chatLocale(null), 'en');
    assert.equal(chatLocale(''), 'en');
    assert.equal(chatLocale('BG-bg'), 'bg');
  });

  await t.test('agentul AI rulează DOAR pe limbile declarate', () => {
    assert.equal(aiChatSupported('ro'), true);
    assert.equal(aiChatSupported('bg'), false);
    assert.equal(aiChatSupported('el'), false);
    assert.equal(aiChatSupported(null), false);
    assert.equal(aiChatSupported('ro-RO'), true);
    // Sursa unică de adevăr — cronul de follow-up filtrează cu aceeași listă.
    assert.deepEqual([...AI_SUPPORTED_LOCALES], ['ro']);
  });

  await t.test('mesajul de limbă neacoperită conține adresa de email a site-ului', () => {
    const bg = chatStrings('bg').unsupportedLanguage('contact@chalgapodarok.bg');
    assert.ok(bg.includes('contact@chalgapodarok.bg'));
    const el = chatStrings('el').unsupportedLanguage('contact@doroparaggelia.gr');
    assert.ok(el.includes('contact@doroparaggelia.gr'));
    // Fără email configurat există o variantă care nu lasă un gol în frază.
    assert.ok(chatStrings('bg').unsupportedLanguageNoEmail.length > 20);
    assert.doesNotMatch(chatStrings('bg').unsupportedLanguageNoEmail, /undefined|null/);
  });

  await t.test('mesajul spune în cât timp răspundem pe email', () => {
    // Omul e trimis pe email în loc să primească răspuns aici, deci trebuie să
    // știe ce așteaptă. O traducere viitoare care uită termenul pică testul.
    for (const loc of ['ro', 'bg', 'el', 'sr']) {
      const s = chatStrings(loc);
      for (const body of [s.unsupportedLanguage('a@b.co'), s.unsupportedLanguageNoEmail]) {
        assert.match(body, /2[–-]48/, `${loc}: lipsește termenul de răspuns — ${body}`);
      }
    }
  });

  await t.test('gărzile anti-duplicat acoperă TOATE limbile, inclusiv istoricul românesc', () => {
    const all = allThankYouBodies();
    // Textul exact trimis pe prod înainte de traducere trebuie să rămână recunoscut,
    // altfel un client care l-a primit în română primește a doua mulțumire în bulgară.
    assert.ok(
      all.includes('Gata, mulțumim mult! ✨ Sper să-i placă tare. Dacă vrei să mai faci una pentru cineva drag, mă găsești aici. 🎶'),
      'varianta istorică românească lipsește din gardă',
    );
    for (const loc of ['ro', 'bg', 'el']) {
      for (const b of chatStrings(loc).thankYou) assert.ok(all.includes(b), `${loc}: ${b}`);
    }
    assert.equal(new Set(all).size, all.length, 'variantele trebuie să fie unice');
  });
});

test('email-i18n — recovery și colajul respectă limba site-ului', async (t) => {
  await t.test('cele 6 etape de recovery sunt traduse pe bg și el', () => {
    for (const loc of ['bg', 'el'] as const) {
      const s = recoveryStrings(loc);
      for (const stage of [1, 2, 3, 4, 5, 6] as const) {
        const c = s.stages[stage];
        for (const text of [c.subject(20), c.headline(20), c.cta(20), c.intro('X', 20)]) {
          assert.doesNotMatch(text, /[ăâîșțĂÂÎȘȚ]/, `${loc} etapa ${stage}: text românesc — ${text}`);
        }
      }
    }
  });

  await t.test('procentul ajunge peste tot unde e promis', () => {
    for (const loc of ['ro', 'bg', 'el'] as const) {
      const s = recoveryStrings(loc);
      // Etapele 3 și 4 anunță procentul chiar în subiect.
      assert.ok(s.stages[3].subject(20).includes('20'), `${loc}: procent lipsă în subiectul etapei 3`);
      assert.ok(s.stages[4].headline(30).includes('30'), `${loc}: procent lipsă în titlul etapei 4`);
      assert.ok(s.codeLineText(15, 'ABC').includes('ABC'));
      assert.ok(s.promoValid(48).includes('48'));
    }
  });

  await t.test('emailul de colaj e tradus, cu link în varianta text', () => {
    for (const loc of ['bg', 'el'] as const) {
      const c = collageReadyStrings(loc);
      assert.doesNotMatch(c.subject, /[ăâîșț]/, `${loc}: subiect românesc`);
      assert.doesNotMatch(c.body, /[ăâîșț]/, `${loc}: corp românesc`);
      assert.ok(c.text('https://x/m/1').includes('https://x/m/1'));
    }
    // Limbile fără traducere primesc engleză.
    assert.match(collageReadyStrings('tr').subject, /video collage is ready/i);
  });
});
