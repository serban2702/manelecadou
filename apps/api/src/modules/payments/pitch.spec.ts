import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chatPackageUpsell, type PitchPackage } from './packages';

const pkg = (o: Partial<PitchPackage> & { label: string; priceCents: number }): PitchPackage => ({
  compareAtCents: null,
  features: [],
  ...o,
});

describe('chatPackageUpsell — Irina descrie ce e configurat, nu ce e în cod', () => {
  test('folosește numele și beneficiile din pachetul rezolvat', () => {
    const out = chatPackageUpsell(
      [
        pkg({ label: 'Bazic', priceCents: 799, features: ['Piesa ta', 'O refacere'] }),
        pkg({ label: 'Lux', priceCents: 2999, features: ['Colaj 20 poze'] }),
      ],
      'EUR',
    );
    assert.match(out, /Bazic 7\.99 euro — Piesa ta, O refacere/);
    assert.match(out, /Lux 29\.99 euro — Colaj 20 poze/);
    // Numele vechi din cod nu au voie să apară.
    assert.doesNotMatch(out, /Standard|Premium/);
  });

  test('sare peste pachetele scoase din vitrină', () => {
    const out = chatPackageUpsell(
      [
        pkg({ label: 'Standard', priceCents: 2999 }),
        pkg({ label: 'Plus', priceCents: 4999, enabled: false }),
        pkg({ label: 'Premium', priceCents: 9999 }),
      ],
      'RON',
    );
    assert.doesNotMatch(out, /Plus/, 'un pachet oprit nu are voie să fie prezentat');
    assert.match(out, /doua pachete/);
  });

  test('prețul tăiat apare doar dacă e mai mare decât cel real', () => {
    const cu = chatPackageUpsell([pkg({ label: 'Plus', priceCents: 4999, compareAtCents: 6999 })], 'RON');
    assert.match(cu, /redus de la 69\.99 lei/);
    const fara = chatPackageUpsell([pkg({ label: 'Plus', priceCents: 4999, compareAtCents: 3999 })], 'RON');
    assert.doesNotMatch(fara, /redus de la/);
  });

  test('toate pachetele oprite → text gol, nu o listă goală', () => {
    assert.equal(chatPackageUpsell([pkg({ label: 'X', priceCents: 100, enabled: false })], 'RON'), '');
  });
});
