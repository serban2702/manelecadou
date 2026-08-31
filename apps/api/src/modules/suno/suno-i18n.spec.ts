import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunoTitle, occasionThemeEn, dedicationOpeningLines, introSkeletonTag } from './suno-i18n';

const RO_DIACRITICS = /[ăâîșțĂÂÎȘȚ]/;

test('suno-i18n — ce trimitem la Suno respectă limba site-ului', async (t) => {
  await t.test('titlul nu mai e românesc pe bg/el', () => {
    // Cazul real de pe prod: „Pentru Никола Недялков, de la От Калоян".
    assert.equal(sunoTitle('bg', 'Никола', 'Калоян'), 'За Никола, от Калоян');
    assert.equal(sunoTitle('el', 'Γιώργος', 'Μαρία'), 'Για Γιώργος, από Μαρία');
    assert.equal(sunoTitle('ro', 'Ion', 'Maria'), 'Pentru Ion, de la Maria');
    // Fără expeditor.
    assert.equal(sunoTitle('bg', 'Никола'), 'За Никола');
    assert.equal(sunoTitle('ro', 'Ion'), 'Pentru Ion');
    // Limbă necunoscută → engleză, nu română.
    assert.equal(sunoTitle('tr', 'Ali', 'Ayşe'), 'For Ali, from Ayşe');
    assert.doesNotMatch(sunoTitle('bg', 'Никола', 'Калоян'), RO_DIACRITICS);
  });

  await t.test('ocazia ajunge în ENGLEZĂ, nu ca identificator intern', () => {
    // Bug-ul confirmat în payload: `style` se termina cu „themed for zi".
    assert.equal(occasionThemeEn('zi'), 'birthday');
    assert.equal(occasionThemeEn('nunta'), 'wedding');
    assert.equal(occasionThemeEn('botez'), 'christening');
    // Catalogul grecesc.
    assert.equal(occasionThemeEn('genethlia'), 'birthday');
    assert.equal(occasionThemeEn('gamos'), 'wedding');
    assert.equal(occasionThemeEn('vaptisi'), 'christening');
    // „altceva" nu are temă utilă → nu trimitem nimic.
    assert.equal(occasionThemeEn('altul'), undefined);
    assert.equal(occasionThemeEn('allo'), undefined);
    assert.equal(occasionThemeEn(''), undefined);
    assert.equal(occasionThemeEn(null), undefined);
  });

  await t.test('toate ocaziile din producție sunt acoperite', () => {
    // Exact ID-urile din `sites.occasions` pe 1 sep 2026 — dacă apare unul nou
    // fără traducere, ori e cuvânt englezesc, ori trebuie adăugat aici.
    const RO_IDS = ['zi', 'nunta', 'botez', 'cumatrie', 'cuplu', 'dragoste', 'inmorm', 'motiv', 'nas', 'roast', 'sef', 'altul'];
    const EL_IDS = ['genethlia', 'gamos', 'vaptisi', 'koumparos', 'nonos', 'agapi', 'afentiko', 'mnimosino', 'plaka', 'dynamis', 'epeteios', 'allo'];
    for (const id of [...RO_IDS, ...EL_IDS]) {
      const theme = occasionThemeEn(id);
      if (theme === undefined) {
        assert.ok(['altul', 'allo'].includes(id), `ocazia ${id} nu are traducere engleză`);
        continue;
      }
      assert.match(theme, /^[a-z][a-z ]+$/, `${id}: tema trebuie să fie engleză simplă — „${theme}"`);
    }
  });

  await t.test('un identificator necunoscut nu ajunge la Suno dacă nu e ASCII', () => {
    assert.equal(occasionThemeEn('graduation'), 'graduation'); // plauzibil englezesc
    assert.equal(occasionThemeEn('рожден'), undefined); // chirilic — omis
    assert.equal(occasionThemeEn('γάμος'), undefined); // grecesc — omis
    assert.equal(occasionThemeEn('aniversăre'), undefined); // diacritice — omis
  });

  await t.test('deschiderea CÂNTATĂ e în limba piesei', () => {
    const bg = dedicationOpeningLines('bg', 'Никола', 'Калоян', '');
    assert.equal(bg[0], 'От Калоян, за Никола, с обич,');
    for (const line of bg) assert.doesNotMatch(line, RO_DIACRITICS, `vers românesc pe bg: ${line}`);

    const el = dedicationOpeningLines('el', 'Γιώργος', 'Μαρία', '');
    assert.match(el[0], /^Από Μαρία, για Γιώργος/);
    for (const line of el) assert.doesNotMatch(line, RO_DIACRITICS, `vers românesc pe el: ${line}`);

    assert.equal(dedicationOpeningLines('ro', 'Ion', 'Maria', '')[0], 'De la Maria, pentru Ion, cu drag,');

    // Mesajul clientului, când există, ține locul rândului al doilea în orice limbă.
    for (const loc of ['ro', 'bg', 'el', 'tr']) {
      assert.equal(dedicationOpeningLines(loc, 'A', 'B', 'Честит рожден ден')[1], 'Честит рожден ден.');
    }
  });

  await t.test('scheletul de intro nu cere „doina" pe alte limbi', () => {
    assert.match(introSkeletonTag('ro'), /doina/);
    for (const loc of ['bg', 'el', 'tr']) {
      assert.doesNotMatch(introSkeletonTag(loc), /doina/, `${loc} cere doina`);
      assert.match(introSkeletonTag(loc), /^\[Intro:/);
    }
  });
});
