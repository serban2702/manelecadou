import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  OpenAiAdsService,
  buildUserPayload,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  splitFullName,
} from './openai-ads.service';
import type { Site } from '../sites/site.entity';

const sha = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');
const svc = new OpenAiAdsService();

describe('normalizarea identificatorilor (regulile OpenAI)', () => {
  it('emailul se curăță de spații și devine minuscul', () => {
    assert.equal(normalizeEmail('  Ion.Popescu@Gmail.COM '), 'ion.popescu@gmail.com');
  });

  it('telefonul păstrează prefixul de țară, dar pierde „+", zerourile și separatorii', () => {
    // Exemplul din documentație, plus varianta românească scrisă cu 0 în față.
    assert.equal(normalizePhone('+1 (415) 555-2671'), '14155552671');
    assert.equal(normalizePhone('+40 723.456.789'), '40723456789');
    assert.equal(normalizePhone('0040-723-456-789'), '40723456789');
  });

  it('numele pierd punctuația ASCII, dar PĂSTREAZĂ diacriticele', () => {
    // Diferența față de alte platforme: aici `José` NU devine `jose`. O
    // „normalizare" care scoate accentele dă zero potriviri, tăcut.
    assert.equal(normalizeName('Mary Jane'), 'maryjane');
    assert.equal(normalizeName("O'Connor"), 'oconnor');
    assert.equal(normalizeName('José'), 'josé');
    assert.equal(normalizeName('Ștefan-Ioan'), 'ștefanioan');
  });

  it('numele complet se împarte în prenume + rest', () => {
    assert.deepEqual(splitFullName('Ion Popescu'), { first: 'Ion', last: 'Popescu' });
    assert.deepEqual(splitFullName('Ion Popescu Vasile'), { first: 'Ion', last: 'Popescu Vasile' });
    assert.deepEqual(splitFullName('Ion'), { first: 'Ion', last: null });
    assert.deepEqual(splitFullName(null), { first: null, last: null });
  });
});

describe('buildUserPayload', () => {
  it('trimite hash-uri hex minuscule de 64 de caractere, pe valorile normalizate', () => {
    const u = buildUserPayload({
      email: ' Ion@Example.COM ',
      phone: '+40 723 456 789',
      externalId: 'guest-123',
      firstName: "O'Connor",
      lastName: 'José',
      country: 'ro',
      city: 'Cluj-Napoca',
      region: 'Cluj',
      postalCode: '400001',
    })!;
    assert.equal(u.email_sha256, sha('ion@example.com'));
    assert.equal(u.phone_number_sha256, sha('40723456789'));
    assert.equal(u.external_id_sha256, sha('guest-123'));
    assert.equal(u.first_name_sha256, sha('oconnor'));
    assert.equal(u.last_name_sha256, sha('josé'));
    // Geografia se trimite în clar, cu țara pe două litere mari.
    assert.equal(u.country, 'RO');
    assert.equal(u.city, 'Cluj-Napoca');
    for (const k of ['email_sha256', 'phone_number_sha256', 'first_name_sha256']) {
      assert.match(String(u[k]), /^[0-9a-f]{64}$/);
    }
  });

  it('omite câmpurile lipsă în loc să trimită hash-ul șirului gol', () => {
    // Un hash al lui '' e sintactic valid și nu se potrivește cu nimeni — ar
    // scădea rata de potrivire raportată fără să adauge nimic.
    const u = buildUserPayload({ email: 'a@b.ro', phone: '   ', firstName: '' })!;
    assert.deepEqual(Object.keys(u), ['email_sha256']);
    assert.equal(buildUserPayload({}), null);
    assert.equal(buildUserPayload(undefined), null);
  });

  it('respinge un telefon care nu are 8-15 cifre', () => {
    assert.equal(buildUserPayload({ phone: '123' }), null);
    assert.equal(buildUserPayload({ phone: '1234567890123456' }), null);
    assert.ok(buildUserPayload({ phone: '40723456789' })?.phone_number_sha256);
  });
});

describe('buildEvent', () => {
  const site = {
    analytics: { openaiPixelId: 'PIX' },
    analyticsSecrets: { openaiConversionsApiKey: 'KEY' },
  } as unknown as Site;

  it('trimite suma în unități MINORE și întreagă', () => {
    // 129,99 lei se trimit ca 12999. Trimise ca 129.99, OpenAI le-ar citi ca
    // 1,29 lei și campania ar părea de 100 de ori mai slabă decât e.
    const ev = svc.buildEvent({
      site,
      event: 'order_created',
      eventId: 'pay-abc',
      amountMinor: 12999,
      currency: 'ron',
      contents: [{ id: 'gen-1', name: 'Manea Cadou', quantity: 1 }],
      sourceUrl: 'https://manelecadou.ro/',
      timestampMs: 1_700_000_000_000,
    });
    const data = ev.data as Record<string, unknown>;
    assert.equal(data.amount, 12999);
    assert.equal(data.currency, 'RON');
    assert.equal(data.type, 'contents');
    assert.deepEqual(data.contents, [
      { id: 'gen-1', name: 'Manea Cadou', content_type: 'product', quantity: 1 },
    ]);
    assert.equal(ev.id, 'pay-abc');
    assert.equal(ev.type, 'order_created');
    assert.equal(ev.action_source, 'web');
    assert.equal(ev.timestamp_ms, 1_700_000_000_000);
    assert.equal(ev.source_url, 'https://manelecadou.ro/');
  });

  it('`customer_action` rămâne minimal, fără listă de produse', () => {
    const ev = svc.buildEvent({ site, event: 'lead_created', eventId: 'x', dataType: 'customer_action' });
    assert.deepEqual(ev.data, { type: 'customer_action' });
    assert.equal('user' in ev, false);
  });

  it('`plan_enrollment` poartă plan_id', () => {
    const ev = svc.buildEvent({
      site,
      event: 'subscription_created',
      eventId: 'x',
      dataType: 'plan_enrollment',
      planId: 'premium',
      amountMinor: 9999,
      currency: 'RON',
    });
    assert.equal((ev.data as Record<string, unknown>).plan_id, 'premium');
  });
});

describe('isEnabled', () => {
  it('cere ȘI pixel, ȘI cheie', () => {
    const withBoth = { analytics: { openaiPixelId: 'P' }, analyticsSecrets: { openaiConversionsApiKey: 'K' } };
    const onlyPixel = { analytics: { openaiPixelId: 'P' }, analyticsSecrets: {} };
    assert.equal(svc.isEnabled(withBoth as unknown as Site), true);
    assert.equal(svc.isEnabled(onlyPixel as unknown as Site), false);
    assert.equal(svc.isEnabled(null), false);
  });
});
