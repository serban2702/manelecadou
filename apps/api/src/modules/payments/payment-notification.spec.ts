import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPaymentTitle, buildPaymentBody, formatAmount } from './payment-notification';

const BASE = {
  amountCents: 1499,
  currency: 'EUR',
  siteDomain: 'chalgapodarok.bg',
  siteName: 'ЧалгаПодарък',
  customerEmail: 'ivan@example.com',
  packageTier: 'premium',
  packageLabel: 'Premium',
  recipientName: 'Никола Недялков',
  style: 'kyuchek',
  occasion: 'zi',
  paymentId: 'aaaaaaaa-1111-2222-3333-444444444444',
  generationId: 'bbbbbbbb-5555-6666-7777-888888888888',
};

test('notificarea de plată — titlu și corp', async (t) => {
  await t.test('titlul are SITE-ul și SUMA cu moneda, în ordinea cerută', () => {
    const title = buildPaymentTitle(BASE);
    assert.equal(title, '💰 chalgapodarok.bg — 14.99 EUR');
    // Se citește de pe ecranul blocat: telefoanele taie în jur de 65 de caractere.
    assert.ok(title.length <= 65, `titlu prea lung (${title.length}): ${title}`);
  });

  await t.test('suma e formatată din bani, cu moneda mare', () => {
    assert.equal(formatAmount(1499, 'eur'), '14.99 EUR');
    assert.equal(formatAmount(9999, 'RON'), '99.99 RON');
    assert.equal(formatAmount(0, 'RON'), '0.00 RON');
    assert.equal(formatAmount(100000, 'RON'), '1000.00 RON');
  });

  await t.test('corpul conține tot ce s-a cerut', () => {
    const body = buildPaymentBody(BASE);
    assert.match(body, /Premium/, 'pachetul lipsește');
    assert.match(body, /14\.99 EUR/, 'prețul lipsește');
    assert.match(body, /ivan@example\.com/, 'emailul lipsește');
    assert.match(body, /ЧалгаПодарък/, 'numele site-ului lipsește');
    assert.match(body, /chalgapodarok\.bg/, 'domeniul lipsește');
    assert.match(body, /Никола Недялков/, 'destinatarul lipsește');
    assert.match(body, /kyuchek/, 'stilul lipsește');
    // Identificatori scurți, pentru investigație.
    assert.match(body, /aaaaaaaa/, 'id-ul plății lipsește');
    assert.match(body, /bbbbbbbb/, 'id-ul comenzii lipsește');
  });

  await t.test('echivalentul în lei apare doar când moneda nu e RON', () => {
    assert.match(buildPaymentBody({ ...BASE, amountRonCents: 7500 }), /În lei: 75\.00 RON/);
    // Plată în RON: linia ar fi redundantă.
    const ron = buildPaymentBody({ ...BASE, currency: 'RON', amountCents: 9999, amountRonCents: 9999 });
    assert.doesNotMatch(ron, /În lei/);
  });

  await t.test('nu apare „undefined"/„null" când lipsesc date', () => {
    const minimal = { amountCents: 2999, currency: 'RON', siteDomain: 'manelecadou.ro', paymentId: 'p1' };
    const body = buildPaymentBody(minimal);
    const title = buildPaymentTitle(minimal);
    for (const s of [body, title]) {
      assert.doesNotMatch(s, /undefined|null|NaN/, `text degradat: ${s}`);
    }
    assert.match(body, /\(fără email\)/);
    assert.equal(title, '💰 manelecadou.ro — 29.99 RON');
  });

  await t.test('refacerea plătită se distinge de o comandă nouă', () => {
    assert.match(buildPaymentTitle({ ...BASE, kind: 'remake' }), /\(refacere\)$/);
    assert.doesNotMatch(buildPaymentTitle({ ...BASE, kind: 'order' }), /refacere/);
  });

  await t.test('site fără nume de brand nu duplică domeniul', () => {
    const body = buildPaymentBody({ ...BASE, siteName: 'chalgapodarok.bg' });
    assert.match(body, /Site: chalgapodarok\.bg\n/);
    assert.doesNotMatch(body, /chalgapodarok\.bg \(chalgapodarok\.bg\)/);
  });
});
