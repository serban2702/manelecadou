import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fillStats, formatCount } from '@/lib/site-stats';

const site = (stats?: { songs: number; reviews: number | null }) =>
  ({ stats, locale: 'ro' }) as Parameters<typeof fillStats>[1];

describe('fillStats', () => {
  it('umple ambele cifre', () => {
    const out = fillStats('<b>{count}</b> manele · {reviews} review', site({ songs: 2281, reviews: 182 }));
    assert.ok(out?.includes('2.281'));
    assert.ok(out?.includes('182'));
    assert.equal(out?.includes('{'), false);
  });

  it('ASCUNDE badge-ul când statisticile lipsesc', () => {
    // API-ul n-a răspuns. Un fallback hardcodat aici ar fi exact cifra inventată
    // pe care am scos-o din traduceri.
    assert.equal(fillStats('<b>{count}</b> manele', site(undefined)), null);
  });

  it('ascunde badge-ul de recenzii când sunt prea puține', () => {
    assert.equal(fillStats('{reviews} review', site({ songs: 40, reviews: null })), null);
    // …dar numărul de melodii se afișează în continuare.
    assert.ok(fillStats('<b>{count}</b> manele', site({ songs: 40, reviews: null })));
  });

  it('lasă neatins un text fără cifre', () => {
    const plain = 'Livrare în câteva minute';
    assert.equal(fillStats(plain, site(undefined)), plain);
  });
});

describe('formatCount', () => {
  it('pune separator de mii', () => {
    assert.notEqual(formatCount(2281, 'ro'), '2281');
  });
  it('nu aruncă pe locale invalid sau lipsă', () => {
    assert.equal(formatCount(42, undefined), '42');
    assert.equal(formatCount(42, '!!invalid!!'), '42');
  });
});
