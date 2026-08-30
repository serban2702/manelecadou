import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ABSOLUTE_SESSION_DAYS, isWithinAbsoluteWindow, sessionAnchor } from './session-window';

const NOW = 1_800_000_000;
const day = 86_400;

test('ancora e authAt când există', () => {
  assert.equal(sessionAnchor({ authAt: 111, iat: 222 }), 111);
});

test('tokenurile vechi, fără authAt, cad pe iat', () => {
  assert.equal(sessionAnchor({ iat: 222 }), 222);
});

test('fără nicio ancoră, sesiunea nu se poate prelungi', () => {
  assert.equal(sessionAnchor({}), 0);
  assert.equal(isWithinAbsoluteWindow(0, NOW), false);
});

test('o sesiune proaspătă se poate prelungi', () => {
  assert.equal(isWithinAbsoluteWindow(NOW - day, NOW), true);
});

test('exact la limită încă se poate', () => {
  assert.equal(isWithinAbsoluteWindow(NOW - ABSOLUTE_SESSION_DAYS * day, NOW), true);
});

test('peste limită, nu — se cere autentificare nouă', () => {
  assert.equal(isWithinAbsoluteWindow(NOW - (ABSOLUTE_SESSION_DAYS + 1) * day, NOW), false);
});

test('o ancoră din viitor e respinsă', () => {
  assert.equal(isWithinAbsoluteWindow(NOW + 3600, NOW), false);
});

test('o abatere mică de ceas e tolerată', () => {
  assert.equal(isWithinAbsoluteWindow(NOW + 30, NOW), true);
});
