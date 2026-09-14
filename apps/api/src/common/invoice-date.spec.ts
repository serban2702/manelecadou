import { test } from 'node:test';
import assert from 'node:assert/strict';

import { invoiceToday } from './invoice-date';

/**
 * Regresie pentru data de pe factură: containerul de API rulează pe UTC, iar
 * `new Date().toISOString().slice(0, 10)` datează cu ziua precedentă orice
 * factură emisă noaptea, ora României. O dată greșită pe un document fiscal nu
 * dă nicio eroare — se vede abia la contabilitate.
 */

test('noaptea, ora României, data e a zilei curente din RO, nu a celei UTC', () => {
  // 14 sept 2026, 00:30 ora României (vara, UTC+3) = 13 sept, 21:30 UTC.
  const night = new Date('2026-09-13T21:30:00Z');
  assert.equal(night.toISOString().slice(0, 10), '2026-09-13'); // ce dădea înainte
  assert.equal(invoiceToday(night), '2026-09-14');
});

test('iarna (UTC+2) pragul se mută, dar regula e aceeași', () => {
  // 15 ian 2026, 00:30 ora României = 14 ian, 22:30 UTC.
  const winterNight = new Date('2026-01-14T22:30:00Z');
  assert.equal(invoiceToday(winterNight), '2026-01-15');
  // 15 ian, 00:30 UTC = 02:30 ora României — aceeași zi în ambele.
  assert.equal(invoiceToday(new Date('2026-01-15T00:30:00Z')), '2026-01-15');
});

test('ziua, cele două coincid', () => {
  assert.equal(invoiceToday(new Date('2026-09-14T12:00:00Z')), '2026-09-14');
});

test('formatul e cel cerut de SmartBill, cu zero-padding', () => {
  assert.match(invoiceToday(new Date('2026-03-05T10:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(invoiceToday(new Date('2026-03-05T10:00:00Z')), '2026-03-05');
});
