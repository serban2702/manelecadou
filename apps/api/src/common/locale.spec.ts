import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTED_LOCALES,
  isSupportedLocale,
  normalizeLocale,
  resolveDeliveryLocale,
  resolveOrderLocale,
} from './locale';

/**
 * Regresie pentru bug-ul din 6 septembrie 2026: comenzile făcute pe
 * `chalgapodarok.bg` se înregistrau cu `locale: 'ro'`.
 *
 * Cauza avea două jumătăți, ambele acoperite aici și în `apps/web`:
 * checkout-ul pay-first nu trimitea deloc limba, iar serverul o completa cu
 * `dto.locale ?? 'ro'` — o constantă românească pusă înaintea configurării
 * site-ului. Pe producție: 5 din 12 comenzi bulgare, toate de după ce s-a scos
 * demo-ul și tot traficul a trecut pe calea pay-first.
 */

test('normalizeLocale acceptă formele regionale în care vin limbile', () => {
  // `navigator.language`, `Accept-Language`, valori scrise de mână în admin.
  assert.equal(normalizeLocale('bg-BG'), 'bg');
  assert.equal(normalizeLocale('bg_BG'), 'bg');
  assert.equal(normalizeLocale('BG'), 'bg');
  assert.equal(normalizeLocale('  bg  '), 'bg');
  assert.equal(normalizeLocale('el-GR'), 'el');
  assert.equal(normalizeLocale('ro'), 'ro');
});

test('normalizeLocale respinge ce nu e limbă a platformei', () => {
  for (const bad of ['', 'xx', 'en', 'rom', '-ro', null, undefined, 42, {}, []]) {
    assert.equal(normalizeLocale(bad), null, `nu ar trebui acceptat: ${JSON.stringify(bad)}`);
  }
  // Se normalizează pe SUBTAG-ul de limbă, deci orice etichetă cu baza `ro`
  // rămâne română — inclusiv una cu regiune și variantă.
  assert.equal(normalizeLocale('ro-RO-u-ca-gregory'), 'ro');
  // `en` chiar nu e livrată — dacă o adăugăm vreodată, testul cade intenționat.
  assert.equal(isSupportedLocale('en'), false);
  assert.equal(SUPPORTED_LOCALES.includes('bg'), true);
});

test('maparea site → limbă: domeniul decide, nu clientul', () => {
  // Cele patru site-uri reale din producție, cu limbile lor configurate.
  const SITES = [
    { domain: 'chalgapodarok.bg', locale: 'bg' },
    { domain: 'doroparaggelia.gr', locale: 'el' },
    { domain: 'manelecadou.ro', locale: 'ro' },
    { domain: 'manele-top.ro', locale: 'ro' },
  ];
  for (const site of SITES) {
    assert.equal(
      resolveOrderLocale(undefined, site.locale),
      site.locale,
      `${site.domain} trebuie să comande în ${site.locale}`,
    );
  }
});

test('comanda pay-first fără limbă în payload ia limba site-ului, nu „ro"', () => {
  // Exact forma care a produs bug-ul: `checkout-direct` nu trimitea `locale`.
  assert.equal(resolveOrderLocale(undefined, 'bg'), 'bg');
  assert.equal(resolveOrderLocale(null, 'el'), 'el');
});

test('un client nu poate comanda în română de pe un site bulgar', () => {
  // `locale` din body e control de client (poate fi scris de mână).
  assert.equal(resolveOrderLocale('ro', 'bg'), 'bg');
  assert.equal(resolveOrderLocale('ro-RO', 'bg-BG'), 'bg');
});

test('comportamentul românesc rămâne neschimbat', () => {
  assert.equal(resolveOrderLocale(undefined, 'ro'), 'ro');
  assert.equal(resolveOrderLocale('ro', 'ro'), 'ro');
  // Site necunoscut + client care spune „ro" → tot ro.
  assert.equal(resolveOrderLocale('ro', null), 'ro');
});

test('fără site rezolvabil, limba clientului e plasa; „ro" doar când nu știm nimic', () => {
  // Lookup de site eșuat / comandă fără `siteId` — atunci limba din browser e
  // singurul semnal pe care îl avem, și e mai bună decât o constantă.
  assert.equal(resolveOrderLocale('bg', null), 'bg');
  assert.equal(resolveOrderLocale('el', undefined), 'el');
  // Site cu limbă invalidă în admin — nu blochează comanda, dar nici nu o mută
  // tăcut pe română dacă știm ce vorbește clientul.
  assert.equal(resolveOrderLocale('bg', 'klingon'), 'bg');
  assert.equal(resolveOrderLocale(undefined, undefined), 'ro');
});

test('pagina de livrare urmează site-ul PROPRIETAR, nu domeniul pe care e deschisă', () => {
  // Cazul verificat pe producție: link de comandă bulgară deschis pe domeniul RO.
  assert.equal(resolveDeliveryLocale('bg', 'bg'), 'bg');
  // Și cazul care contează cel mai mult — comandă bulgară cu `locale='ro'`
  // scris de bug: pagina TREBUIE să rămână bulgară. Dacă limba de pe comandă ar
  // fi prima, cele 5 comenzi din producție s-ar întoarce pe românește, iar
  // corectarea lor e exclusă (nu modificăm comenzi existente).
  assert.equal(resolveDeliveryLocale('ro', 'bg'), 'bg');
  assert.equal(resolveDeliveryLocale('ro', 'el'), 'el');
});

test('comanda de pe un site românesc rămâne românească', () => {
  assert.equal(resolveDeliveryLocale('ro', 'ro'), 'ro');
  assert.equal(resolveDeliveryLocale(null, 'ro'), 'ro');
});

test('comandă fără site — limba de pe rând e plasa, altfel „nu știm"', () => {
  // Rânduri vechi cu `siteId = null`.
  assert.equal(resolveDeliveryLocale('bg', null), 'bg');
  // `null`, nu „ro": apelantul cade pe limba site-ului vizitat, care e un
  // răspuns mai bun decât o constantă.
  assert.equal(resolveDeliveryLocale(null, null), null);
});
