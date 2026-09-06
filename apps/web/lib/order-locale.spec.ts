import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deliveryIdFromPath, orderLocale, withOrderLocale } from './order-locale';
import { normalizeLocale } from '@/i18n/locales';

/**
 * Regresie pentru bug-ul din 6 septembrie 2026 (jumătatea de client).
 *
 * `createDirectCheckoutSession` — singura cale de comandă de când s-a scos
 * demo-ul — trimitea payload-ul brut, fără limbă. Niciun wizard nu o pune, deci
 * serverul primea `undefined` și scria „ro" pe comenzi bulgare.
 */

test('payload-ul de comandă primește limba site-ului când wizardul nu o trimite', () => {
  // Exact obiectul construit de Generator.tsx / cadou WizardPage.tsx: fără `locale`.
  const generation = {
    style: 'tallava',
    occasion: 'zi-de-nastere',
    recipientName: 'Никола',
    message: 'Честит рожден ден',
    voiceArtist: 'male',
    packageTier: 'plus',
  };

  const payload = withOrderLocale(generation, 'bg');

  assert.equal(payload.locale, 'bg');
  // Restul câmpurilor trec neatinse.
  assert.equal(payload.style, 'tallava');
  assert.equal(payload.packageTier, 'plus');
  assert.equal(payload.recipientName, 'Никола');
});

test('un `locale: undefined` explicit NU șterge limba completată', () => {
  // Capcana formei „evidente" `{ locale: current, ...input }`: spread-ul copiază
  // și cheile cu undefined, deci ar fi suprascris valoarea cu nimic.
  const payload = withOrderLocale({ locale: undefined, style: 'manea' }, 'bg');
  assert.equal(payload.locale, 'bg');

  // Și forma trebuie să reziste și când cheia lipsește complet.
  assert.equal(withOrderLocale({ style: 'manea' }, 'bg').locale, 'bg');
});

test('limba trimisă explicit de apelant e respectată și normalizată', () => {
  assert.equal(withOrderLocale({ locale: 'el' }, 'bg').locale, 'el');
  assert.equal(withOrderLocale({ locale: 'bg-BG' }, 'ro').locale, 'bg');
});

test('comportamentul românesc rămâne neschimbat', () => {
  assert.equal(withOrderLocale({ style: 'manea' }, 'ro').locale, 'ro');
  assert.equal(orderLocale(undefined, 'ro'), 'ro');
  // Necunoscut peste tot → „ro", ca ultimă instanță (nu ca prim răspuns).
  assert.equal(orderLocale(undefined, undefined), 'ro');
  assert.equal(orderLocale('xx', 'yy'), 'ro');
});

test('limba site-ului nu e ignorată din cauza formei în care vine', () => {
  // `<html lang>` / config din admin pot fi regionale; înainte cădeau pe „ro".
  assert.equal(orderLocale(undefined, 'bg-BG'), 'bg');
  assert.equal(orderLocale(undefined, 'EL'), 'el');
  assert.equal(normalizeLocale('bg_BG'), 'bg');
});

test('pagina de livrare e recunoscută după cale', () => {
  const id = 'a09bf47b-7a22-41df-806a-931a46a68ade';
  assert.equal(deliveryIdFromPath(`/m/${id}`), id);
  assert.equal(deliveryIdFromPath(`/m/${id}/video`), id);
  assert.equal(deliveryIdFromPath(`/m/${id.toUpperCase()}`), id);

  // Restul site-ului își ia limba de la domeniu, nu de la o comandă.
  assert.equal(deliveryIdFromPath('/'), null);
  assert.equal(deliveryIdFromPath('/manelele-mele'), null);
  assert.equal(deliveryIdFromPath('/m/nu-e-uuid'), null);
  assert.equal(deliveryIdFromPath(null), null);
});
