import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Traficul intern se exclude prin SQL scris ca text, deci TypeScript nu poate
 * prinde o interogare uitată. Testele astea citesc sursa și verifică exact
 * lucrurile care ar trece neobservate: un filtru scăpat înseamnă un raport care
 * arată perfect și numără greșit.
 */

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

describe('excluderea traficului intern din analytics', () => {
  const src = read('modules/analytics/analytics.service.ts');

  it('toate interogările pe sesiuni trec prin sessionNoiseFilter', () => {
    // Dacă cineva reintroduce filtrul vechi, doar-pe-boți, intern nu se mai exclude.
    assert.equal(
      src.includes('const bot = excludeBots'),
      false,
      'a reapărut filtrul vechi `const bot = excludeBots` — traficul intern nu mai e exclus',
    );
    const declarations = src.match(/const noise = sessionNoiseFilter\(/g) ?? [];
    assert.ok(declarations.length >= 5, `prea puține filtre: ${declarations.length}`);
  });

  it('filtrul exclude internul CHIAR ȘI când boții sunt incluși', () => {
    // Traficul nostru nu e o categorie de analizat: se scoate întotdeauna.
    const fn = src.slice(src.indexOf('function sessionNoiseFilter'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.match(body, /isInternal" = false/);
    const withoutBots = body.slice(body.indexOf('return'));
    assert.ok(
      withoutBots.includes('internal') && !/:\s*''/.test(withoutBots),
      'ramura fără boți trebuie să păstreze filtrul de trafic intern, nu să întoarcă gol',
    );
  });

  it('sesiunea nouă se marchează la creare', () => {
    assert.match(src, /isInternal: this\.adminIps\.isAdminIpCached\(ctx\.ip\)/);
  });
});

describe('excluderea traficului intern din statisticile de email', () => {
  const src = read('modules/email-tracking/email-tracking-stats.service.ts');

  it('folosește NOT EXISTS, nu NOT IN', () => {
    // Cu `NOT IN`, un `c.ip` NULL face condiția NULL și rândul dispare din raport.
    assert.match(src, /NOT EXISTS \(SELECT 1 FROM admin_ips ai/);
    assert.equal(/c\.ip NOT IN/.test(src), false, 'NOT IN pierde rândurile cu ip NULL');
  });

  it('respectă doar IP-urile active', () => {
    assert.match(src, /ai\.enabled = true/);
  });

  it('se aplică pe ambele interogări de statistici', () => {
    const uses = src.match(/\$\{CLICK_NOT_INTERNAL\}/g) ?? [];
    assert.equal(uses.length, 2, `așteptate 2 utilizări, găsite ${uses.length}`);
  });
});

describe('atribuirea plăților NU filtrează traficul intern', () => {
  it('JOIN-urile de atribuire rămân neatinse', () => {
    // Decizie: filtrul e despre VOLUM, nu despre atribuire. Un client real de pe
    // aceeași rețea mobilă ca un admin are sesiunea marcată internă; exclusă și
    // din atribuire, plata lui ar deveni „direct" — adică am strica exact datele
    // pe care încercăm să le curățăm.
    const src = read('modules/analytics/payment-attribution.service.ts');
    assert.equal(src.includes('isInternal'), false);
  });
});
