import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSiteStats, formatStatNumber } from './site-stats';

describe('computeSiteStats', () => {
  it('adaugă offsetul la numărul real', () => {
    assert.equal(computeSiteStats(850, 1431).songs, 2281);
    assert.equal(computeSiteStats(13, 1431).songs, 1444);
  });

  it('fără offset afișează exact realitatea', () => {
    assert.equal(computeSiteStats(850, 0).songs, 850);
  });

  it('recenziile NU sunt egale cu melodiile', () => {
    // Bug-ul de dinainte: 12 483 melodii și 12 483 „recenzii reale" — adică o
    // rată de recenzare de 100%, vizibil fabricată.
    const s = computeSiteStats(850, 1431);
    assert.notEqual(s.reviews, s.songs);
    assert.ok(s.reviews !== null && s.reviews < s.songs);
  });

  it('recenziile cresc odată cu comenzile', () => {
    const a = computeSiteStats(100, 1431);
    const b = computeSiteStats(900, 1431);
    assert.ok((b.reviews ?? 0) > (a.reviews ?? 0));
  });

  it('ascunde numărul de recenzii când e prea mic', () => {
    // Un site nou, fără offset: „2 recenzii" e mai rău decât să nu scrii nimic.
    assert.equal(computeSiteStats(5, 0).reviews, null);
    assert.equal(computeSiteStats(0, 0).reviews, null);
  });

  it('nu produce numere negative din valori aberante', () => {
    assert.equal(computeSiteStats(-5, -10).songs, 0);
    assert.equal(computeSiteStats(10, NaN).songs, 10);
  });
});

describe('formatStatNumber', () => {
  it('folosește convenția locale-ului', () => {
    // Fiecare limbă își are separatorul ei; scrise de mână în traduceri, era
    // treaba fiecărui traducător să-l nimerească.
    assert.equal(formatStatNumber(2281, 'ro').includes('2'), true);
    assert.equal(formatStatNumber(2281, 'bg').includes('2'), true);
    assert.notEqual(formatStatNumber(2281, 'ro'), '2281');
  });

  it('nu aruncă pe un locale invalid', () => {
    assert.equal(formatStatNumber(42, 'nu-e-un-locale-valid!!'), '42');
  });
});
