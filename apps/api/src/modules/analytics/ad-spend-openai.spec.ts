import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { AdSpendService } from './ad-spend.service';

/**
 * Citirea cheltuielii din ChatGPT Ads (Advertiser API — Insights).
 *
 * Nu testăm rețeaua, ci exact locurile unde o greșeală NU dă eroare, ci un zero
 * tăcut sau o cifră de o sută de ori greșită:
 *
 *  - răspunsul vine cu chei APLATIZATE (`campaign_id`), deși le cerem canonic
 *    (`campaign.id`) — citite cu numele cerut, toate ar fi `undefined`;
 *  - `spend` vine în unități MAJORE, la noi se ține în cenți;
 *  - la nivel de campanie nu există `ad_id`, iar index-ul unic al tabelului e pe
 *    `adId` — cu NULL, fiecare sincronizare ar insera din nou aceleași zile.
 */

// Serviciul nu-și atinge dependențele pe calea asta: `fetchOpenAiInsights`
// vorbește doar cu `fetch`. Le lăsăm nule intenționat — un mock complet ar
// ascunde exact asta.
const svc = new AdSpendService(null as any, null as any, null as any, null as any);
const insights = (
  level: 'ad' | 'campaign',
  currency = 'EUR',
): Promise<any[]> => (svc as any).fetchOpenAiInsights('sk-test', '2026-09-01', '2026-09-04', level, currency);

const realFetch = globalThis.fetch;
let calls: string[] = [];

/** Răspunde cu paginile date, în ordine, și reține URL-urile cerute. */
function stubFetch(pages: unknown[]): void {
  let i = 0;
  calls = [];
  globalThis.fetch = (async (url: any) => {
    calls.push(String(url));
    const body = pages[Math.min(i++, pages.length - 1)];
    return { ok: true, status: 200, json: async () => body } as any;
  }) as any;
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('ChatGPT Ads — insights la nivel de ad', () => {
  const page = {
    object: 'list',
    data: [
      {
        readable_time: '2026-09-01',
        campaign_id: 'cmpn_101',
        campaign_name: 'Manele Cadou campaign',
        ad_group_id: 'adgrp_1',
        ad_group_name: 'RO',
        ad_id: 'ad_9',
        ad_name: 'Video 1',
        impressions: 1200,
        clicks: 36,
        spend: 18.42,
      },
    ],
    has_more: false,
  };

  it('citește cheile aplatizate din răspuns, nu numele canonice cerute', async () => {
    stubFetch([page]);
    const [row] = await insights('ad');
    assert.equal(row.campaignId, 'cmpn_101');
    assert.equal(row.campaignName, 'Manele Cadou campaign');
    assert.equal(row.adsetId, 'adgrp_1');
    assert.equal(row.adId, 'ad_9');
    assert.equal(row.date, '2026-09-01');
    assert.equal(row.platform, 'chatgpt');
  });

  it('spend-ul vine în unități majore și se stochează în cenți', async () => {
    stubFetch([page]);
    const [row] = await insights('ad');
    // 18,42 € → 1842 cenți. Stocat ca 18, campania ar fi părut de 100× mai ieftină.
    assert.equal(row.spendCents, 1842);
    assert.equal(row.currency, 'EUR');
  });

  it('conversiile rămân 0 — OpenAI le expune printr-un endpoint separat', async () => {
    stubFetch([page]);
    const [row] = await insights('ad');
    assert.equal(row.conversions, 0);
    assert.equal(row.conversionValueCents, 0);
  });

  it('cere ziua ca `date_range`, cu `until` inclusiv (nu mărit cu o zi)', async () => {
    stubFetch([page]);
    await insights('ad');
    const url = decodeURIComponent(calls[0]);
    assert.match(url, /aggregation_level=ad/);
    assert.match(url, /time_granularity=daily/);
    assert.match(url, /"type":"date_range","since":"2026-09-01","until":"2026-09-04"/);
  });

  it('urmează paginarea prin `last_id`, nu reia prima pagină la nesfârșit', async () => {
    stubFetch([
      { data: [{ ...page.data[0], ad_id: 'ad_1' }], has_more: true, last_id: 'cursor_1' },
      { data: [{ ...page.data[0], ad_id: 'ad_2' }], has_more: false },
    ]);
    const rows = await insights('ad');
    assert.deepEqual(rows.map((r) => r.adId), ['ad_1', 'ad_2']);
    assert.match(decodeURIComponent(calls[1]), /after=cursor_1/);
  });

  it('aruncă rândurile fără dată validă, ca să nu ajungă gunoi în tabel', async () => {
    stubFetch([{ data: [{ ...page.data[0], readable_time: null }], has_more: false }]);
    assert.equal((await insights('ad')).length, 0);
  });
});

describe('ChatGPT Ads — rezerva pe nivel de campanie', () => {
  it('sintetizează un adId stabil, fiindcă index-ul unic nu poate fi pe NULL', async () => {
    stubFetch([
      {
        data: [
          {
            readable_time: '2026-09-02',
            campaign_id: 'cmpn_101',
            campaign_name: 'Manele Cadou campaign',
            impressions: 980,
            clicks: 29,
            spend: 14.86,
          },
        ],
        has_more: false,
      },
    ]);
    const [row] = await insights('campaign');
    assert.equal(row.adId, 'campaign:cmpn_101');
    assert.equal(row.spendCents, 1486);
    // Același id la fiecare sincronizare ⇒ upsert-ul rescrie, nu dublează.
    assert.equal(row.adName, 'Total campanie');
  });

  it('cere metricile pe campanie, nu pe ad', async () => {
    stubFetch([{ data: [], has_more: false }]);
    await insights('campaign');
    const url = decodeURIComponent(calls[0]);
    assert.match(url, /aggregation_level=campaign/);
    assert.match(url, /fields\[\]=campaign\.spend/);
    assert.doesNotMatch(url, /fields\[\]=ad\.spend/);
  });
});

describe('ChatGPT Ads — erori', () => {
  it('ridică mesajul întors de OpenAI, nu un „HTTP 400" gol', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } }),
    })) as any;
    await assert.rejects(() => insights('ad'), /OpenAI insights \(ad\): Invalid API key/);
  });
});
