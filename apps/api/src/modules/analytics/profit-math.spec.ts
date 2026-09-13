import test from 'node:test';
import assert from 'node:assert/strict';

import { expenseValueForDay, periodKey } from './profit-math';
import { DEFAULT_PROFIT_CONFIG } from './profitability.service';
import type { ProfitExpenseItem } from './profit-config.entity';

const item = (p: Partial<ProfitExpenseItem>): ProfitExpenseItem => ({
  id: 'x',
  label: 'X',
  cadence: 'monthly',
  currency: 'RON',
  amounts: {},
  defaultAmount: null,
  ...p,
});

test('periodKey: lunar = YYYY-MM, anual = an fiscal mai→apr', () => {
  assert.equal(periodKey('monthly', '2026-08-18'), '2026-08');
  assert.equal(periodKey('yearly', '2026-08-18'), '2026');
  // Aprilie aparține anului fiscal care a început în mai anul trecut.
  assert.equal(periodKey('yearly', '2027-04-30'), '2026');
  assert.equal(periodKey('yearly', '2027-05-01'), '2027');
});

test('fără interval, defaultAmount se aplică oricărei zile', () => {
  const it = item({ defaultAmount: 100 });
  assert.equal(expenseValueForDay(it, '2020-01-01'), 100);
  assert.equal(expenseValueForDay(it, '2030-12-31'), 100);
});

test('intervalul taie zilele din afară, ambele capete inclusive', () => {
  const it = item({ defaultAmount: 135, startDay: '2026-05-18', endDay: '2026-08-18' });
  assert.equal(expenseValueForDay(it, '2026-05-17'), 0);
  assert.equal(expenseValueForDay(it, '2026-05-18'), 135); // prima zi intră
  assert.equal(expenseValueForDay(it, '2026-07-01'), 135);
  assert.equal(expenseValueForDay(it, '2026-08-18'), 135); // ultima zi intră
  assert.equal(expenseValueForDay(it, '2026-08-19'), 0);
});

test('un override rămas în afara intervalului NU reînvie cheltuiala', () => {
  // Cazul real: Grok avea amounts 2026-05/06 din config-ul vechi. După ce
  // abonamentul s-a oprit, luna aia nu mai are voie să producă cheltuială.
  const it = item({
    defaultAmount: 135,
    amounts: { '2026-09': 999 },
    startDay: '2026-05-18',
    endDay: '2026-08-18',
  });
  assert.equal(expenseValueForDay(it, '2026-09-10'), 0);
});

test('override-ul perioadei bate defaultAmount, în interval', () => {
  const it = item({ defaultAmount: 135, amounts: { '2026-06': 200 } });
  assert.equal(expenseValueForDay(it, '2026-06-10'), 200);
  assert.equal(expenseValueForDay(it, '2026-07-10'), 135);
});

test('fără sumă configurată, cheltuiala e zero (nu NaN)', () => {
  assert.equal(expenseValueForDay(item({}), '2026-06-10'), 0);
});

test('configul implicit: Hetzner e scos, iar recurentele nu intră în baza de TVA', () => {
  const ids = DEFAULT_PROFIT_CONFIG.items.map((i) => i.id);
  assert.ok(!ids.includes('hetzner'), 'Hetzner trebuie scos definitiv');
  assert.ok(ids.includes('puggy'), 'Campanii Puggy Agency trebuie să existe');
  for (const it of DEFAULT_PROFIT_CONFIG.items) {
    assert.notEqual(it.vatApplies, true, `${it.id} nu trebuie să intre în baza de TVA`);
  }
});

test('configul implicit: intervalele abonamentelor oprite', () => {
  const byId = Object.fromEntries(DEFAULT_PROFIT_CONFIG.items.map((i) => [i.id, i]));
  assert.deepEqual(
    [byId.grok.startDay, byId.grok.endDay, byId.grok.defaultAmount, byId.grok.currency],
    ['2026-05-18', '2026-08-18', 135, 'RON'],
  );
  assert.deepEqual(
    [byId.capcut.startDay, byId.capcut.endDay, byId.capcut.defaultAmount, byId.capcut.currency],
    ['2026-07-13', '2026-09-13', 150, 'RON'],
  );
  assert.deepEqual(
    [byId.puggy.startDay, byId.puggy.endDay, byId.puggy.defaultAmount, byId.puggy.currency],
    ['2026-07-22', '2026-08-22', 1270, 'RON'],
  );
});
