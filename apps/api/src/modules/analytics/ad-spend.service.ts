import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AdSpend, AdPlatform, AD_PLATFORMS } from './ad-spend.entity';
import { Payment } from '../payments/payment.entity';
import { SitesService } from '../sites/sites.service';
import { FxRateService } from '../fx/fx-rate.service';
import { CHANNEL_LABELS, normalizeChannelSql } from './utm-standard';
import type { Site } from '../sites/site.entity';

const META_API_VERSION = 'v21.0';
const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';
const OPENAI_ADS_API_BASE = 'https://api.ads.openai.com/v1';

/**
 * Tipuri de acțiune Meta numărate ca „Purchase", în ordinea priorității. Luăm
 * PRIMUL prezent pe rând (evită dubla numărare între pixel + omni). `omni_purchase`
 * e metrica unificată Meta (toate sursele) — cel mai aproape de coloana „Purchases"
 * din Ads Manager. Ajustabil dacă cifra nu se potrivește.
 */
const META_PURCHASE_ACTION_TYPES = [
  'omni_purchase',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_web_purchase',
];

/** Un rând zilnic de spend la nivel de AD, normalizat înainte de upsert. */
interface NormalizedRow {
  platform: AdPlatform;
  campaignId: string;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string;
  adName: string | null;
  date: string; // YYYY-MM-DD
  spendCents: number;
  currency: string;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValueCents: number;
}

/** Starea sincronizării unei platforme. `ok` fără credențiale = nimic de făcut. */
export interface AdSpendSyncPlatformResult {
  ok: boolean;
  rows: number;
  error?: string;
}

export interface AdSpendSyncResult {
  siteId: string;
  meta: AdSpendSyncPlatformResult;
  tiktok: AdSpendSyncPlatformResult;
  chatgpt: AdSpendSyncPlatformResult;
}

@Injectable()
export class AdSpendService {
  private readonly logger = new Logger('AdSpend');

  constructor(
    @InjectRepository(AdSpend) private readonly repo: Repository<AdSpend>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly sites: SitesService,
    private readonly fx: FxRateService,
  ) {}

  // ============== SYNC ==============

  /** Cron 04:15 UTC zilnic — trage ultimele 7 zile (overlap pentru ajustări
   *  retroactive ale platformelor). No-op dacă niciun site n-are creds. */
  @Cron('15 4 * * *', { name: 'ad-spend-sync', timeZone: 'UTC' })
  async nightlySync(): Promise<void> {
    await this.syncAll(14).catch((e) =>
      this.logger.warn(`nightly ad-spend sync failed: ${(e as Error).message}`),
    );
  }

  /** Sincronizează toate site-urile care au cel puțin o platformă configurată. */
  async syncAll(days = 7): Promise<AdSpendSyncResult[]> {
    const sites = await this.sites.listAll();
    const targets = sites.filter((s) => this.hasMeta(s) || this.hasTiktok(s) || this.hasOpenAi(s));
    const results: AdSpendSyncResult[] = [];
    for (const site of targets) {
      results.push(await this.syncSite(site, days));
    }
    this.logger.log(`syncAll done — sites=${targets.length}`);
    return results;
  }

  /** Sincronizează un singur site (ambele platforme dacă-s configurate). */
  async syncSite(site: Site, days = 7): Promise<AdSpendSyncResult> {
    const { since, until } = this.windowDates(days);
    const res: AdSpendSyncResult = {
      siteId: site.id,
      meta: { ok: true, rows: 0 },
      tiktok: { ok: true, rows: 0 },
      chatgpt: { ok: true, rows: 0 },
    };

    // Fără credențiale nu e eroare, e „nimic de făcut" — de-aia pornesc toate
    // pe `ok: true` și doar o excepție reală le strică.
    const jobs: Array<[AdPlatform, () => Promise<NormalizedRow[]>]> = [];
    if (this.hasMeta(site)) jobs.push(['meta', () => this.fetchMeta(site, since, until)]);
    if (this.hasTiktok(site)) jobs.push(['tiktok', () => this.fetchTiktok(site, since, until)]);
    if (this.hasOpenAi(site)) jobs.push(['chatgpt', () => this.fetchOpenAi(site, since, until)]);

    for (const [platform, fetchRows] of jobs) {
      try {
        const rows = await fetchRows();
        if (platform === 'chatgpt') {
          await this.replaceWindow(site.id, platform, since, until, rows);
        } else {
          await this.upsert(site.id, platform, rows);
        }
        res[platform] = { ok: true, rows: rows.length };
      } catch (e) {
        res[platform] = { ok: false, rows: 0, error: (e as Error).message };
        this.logger.warn(`${platform} sync ${site.domain} failed: ${(e as Error).message}`);
      }
    }

    return res;
  }

  private hasMeta(s: Site): boolean {
    return !!(s.analytics?.metaAdAccountId && s.analyticsSecrets?.metaMarketingToken);
  }
  private hasTiktok(s: Site): boolean {
    return !!(s.analytics?.tiktokAdvertiserId && s.analyticsSecrets?.tiktokMarketingToken);
  }
  /**
   * Spre deosebire de Meta și TikTok, aici e de ajuns cheia: fiecare cheie
   * Advertiser API e legată de UN SINGUR cont de ads, deci `GET /ad_account`
   * și `/ad_account/insights` nu primesc niciun id. `openaiAdAccountId` rămâne
   * opțional, pentru afișare și linkuri către Ads Manager.
   */
  private hasOpenAi(s: Site): boolean {
    return !!s.analyticsSecrets?.openaiAdsApiKey;
  }

  // ============== META MARKETING API ==============

  private async fetchMeta(site: Site, since: string, until: string): Promise<NormalizedRow[]> {
    const accountId = String(site.analytics!.metaAdAccountId).replace(/^act_/, '').trim();
    const token = site.analyticsSecrets!.metaMarketingToken!.trim();

    // Moneda contului — insights nu o întoarce, o luăm o dată din /act_<id>.
    const currency = await this.fetchMetaCurrency(accountId, token);

    const rows: NormalizedRow[] = [];
    const params = new URLSearchParams({
      level: 'ad',
      fields:
        'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values',
      time_increment: '1',
      time_range: JSON.stringify({ since, until }),
      limit: '500',
      access_token: token,
    });
    let url: string | null = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights?${params.toString()}`;

    let pages = 0;
    while (url && pages < 50) {
      const res = await fetch(url);
      const json: any = await res.json();
      if (!res.ok) {
        const msg = json?.error?.message ?? `HTTP ${res.status}`;
        throw new Error(`Meta insights: ${msg}`);
      }
      for (const d of json.data ?? []) {
        const conv = pickMetaAction(d.actions);
        const convVal = pickMetaAction(d.action_values, conv.type ?? undefined);
        rows.push({
          platform: 'meta',
          campaignId: String(d.campaign_id ?? ''),
          campaignName: d.campaign_name ?? null,
          adsetId: d.adset_id ? String(d.adset_id) : null,
          adsetName: d.adset_name ?? null,
          adId: String(d.ad_id ?? ''),
          adName: d.ad_name ?? null,
          date: d.date_start, // time_increment=1 → o zi per rând
          spendCents: toCents(d.spend),
          currency,
          impressions: toInt(d.impressions),
          clicks: toInt(d.clicks),
          conversions: Math.round(conv.count),
          conversionValueCents: toCents(convVal.count),
        });
      }
      url = json.paging?.next ?? null;
      pages++;
    }
    return rows.filter((r) => r.adId && r.date);
  }

  private async fetchMetaCurrency(accountId: string, token: string): Promise<string> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}?fields=currency&access_token=${encodeURIComponent(token)}`,
      );
      const json: any = await res.json();
      return (json?.currency as string) || 'EUR';
    } catch {
      return 'EUR';
    }
  }

  // ============== TIKTOK MARKETING API ==============

  private async fetchTiktok(site: Site, since: string, until: string): Promise<NormalizedRow[]> {
    const advertiserId = String(site.analytics!.tiktokAdvertiserId).trim();
    const token = site.analyticsSecrets!.tiktokMarketingToken!.trim();

    const currency = await this.fetchTiktokCurrency(advertiserId, token);

    const rows: NormalizedRow[] = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages && page <= 50) {
      const params = new URLSearchParams({
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_AD',
        dimensions: JSON.stringify(['ad_id', 'stat_time_day']),
        metrics: JSON.stringify([
          'spend',
          'impressions',
          'clicks',
          'conversion',
          'total_complete_payment_rate',
          'campaign_id',
          'campaign_name',
          'adgroup_id',
          'adgroup_name',
          'ad_name',
        ]),
        start_date: since,
        end_date: until,
        page: String(page),
        page_size: '1000',
      });
      const res = await fetch(`${TIKTOK_API_BASE}/report/integrated/get/?${params.toString()}`, {
        headers: { 'Access-Token': token },
      });
      const json: any = await res.json();
      if (json?.code !== 0) {
        throw new Error(`TikTok report: ${json?.message ?? `code ${json?.code}`}`);
      }
      const list = json.data?.list ?? [];
      for (const item of list) {
        const dim = item.dimensions ?? {};
        const met = item.metrics ?? {};
        rows.push({
          platform: 'tiktok',
          campaignId: String(met.campaign_id ?? ''),
          campaignName: met.campaign_name ?? null,
          adsetId: met.adgroup_id ? String(met.adgroup_id) : null,
          adsetName: met.adgroup_name ?? null,
          adId: String(dim.ad_id ?? ''),
          adName: met.ad_name ?? null,
          date: String(dim.stat_time_day ?? '').slice(0, 10), // "YYYY-MM-DD 00:00:00"
          spendCents: toCents(met.spend),
          currency,
          impressions: toInt(met.impressions),
          clicks: toInt(met.clicks),
          conversions: toInt(met.conversion),
          conversionValueCents: 0,
        });
      }
      totalPages = json.data?.page_info?.total_page ?? 1;
      page++;
    }
    return rows.filter((r) => r.adId && r.date);
  }

  private async fetchTiktokCurrency(advertiserId: string, token: string): Promise<string> {
    try {
      const params = new URLSearchParams({
        advertiser_ids: JSON.stringify([advertiserId]),
        fields: JSON.stringify(['currency']),
      });
      const res = await fetch(`${TIKTOK_API_BASE}/advertiser/info/?${params.toString()}`, {
        headers: { 'Access-Token': token },
      });
      const json: any = await res.json();
      return (json?.data?.list?.[0]?.currency as string) || 'EUR';
    } catch {
      return 'EUR';
    }
  }

  // ============== UPSERT ==============

  // ============== CHATGPT (OpenAI Advertiser API — Insights) ==============

  /**
   * Cheltuiala zilnică din ChatGPT Ads.
   *
   * Docs: https://developers.openai.com/ads/api-reference/insights
   * `GET /v1/ad_account/insights` — contul e implicit (cheia e legată de el).
   *
   * Trei lucruri care diferă de Meta/TikTok și pe care le-ai greși scriind
   * request-ul din memorie:
   *
   * 1. **`fields[]` folosește nume canonice, dar răspunsul vine cu chei
   *    APLATIZATE**: ceri `campaign.id` și primești `campaign_id`,
   *    `metadata.readable_time` → `readable_time`. Citite cu numele cerut, toate
   *    ar fi `undefined` — adică zero rânduri, tăcut.
   * 2. **`spend` vine în unități MAJORE** (`18.42`), nu în cenți ca la noi.
   * 3. **`until` din `date_range` e INCLUSIV** (se normalizează la miezul nopții
   *    următoare), deci nu trebuie mărit cu o zi ca la alte API-uri.
   *
   * Conversiile nu se cer aici: OpenAI le expune prin `POST /conversions/insights`,
   * agregat pe interval și pe campanie — nu pe zi și pe ad, deci n-au unde intra
   * în rândul zilnic. Pentru ChatGPT, conversiile și venitul din raport vin din
   * plățile NOASTRE atribuite canalului (vezi `report`), care sunt oricum sursa
   * după care calculăm ROAS-ul pentru toate platformele.
   */
  private async fetchOpenAi(site: Site, since: string, until: string): Promise<NormalizedRow[]> {
    const key = site.analyticsSecrets!.openaiAdsApiKey!.trim();
    const currency = await this.fetchOpenAiCurrency(key);

    // Întâi la nivel de ad, ca la Meta/TikTok. Dacă nu vine niciun rând (cont cu
    // livrare pornită dar fără defalcare pe ad încă), reîncercăm la nivel de
    // campanie — altfel o campanie care cheltuie ar apărea cu 0 lei, ceea ce e
    // mai rău decât o defalcare mai puțin fină.
    let rows = await this.fetchOpenAiInsights(key, since, until, 'ad', currency);
    if (rows.length === 0) {
      rows = await this.fetchOpenAiInsights(key, since, until, 'campaign', currency);
      if (rows.length > 0) {
        this.logger.log(`OpenAI insights: fără rânduri pe ad, am căzut pe nivel de campanie (${rows.length})`);
      }
    }
    return rows;
  }

  private async fetchOpenAiInsights(
    key: string,
    since: string,
    until: string,
    level: 'ad' | 'campaign',
    currency: string,
  ): Promise<NormalizedRow[]> {
    const fields =
      level === 'ad'
        ? [
            'metadata.readable_time',
            'campaign.id', 'campaign.name',
            'ad_group.id', 'ad_group.name',
            'ad.id', 'ad.name',
            'ad.spend', 'ad.impressions', 'ad.clicks',
          ]
        : [
            'metadata.readable_time',
            'campaign.id', 'campaign.name',
            'campaign.spend', 'campaign.impressions', 'campaign.clicks',
          ];

    const rows: NormalizedRow[] = [];
    let after: string | null = null;
    for (let page = 0; page < 50; page++) {
      const params = new URLSearchParams();
      params.set('time_granularity', 'daily');
      params.set('aggregation_level', level);
      for (const f of fields) params.append('fields[]', f);
      params.append('time_ranges[]', JSON.stringify({ type: 'date_range', since, until }));
      params.set('limit', '1000');
      if (after) params.set('after', after);

      const res = await fetch(`${OPENAI_ADS_API_BASE}/ad_account/insights?${params.toString()}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error?.message ?? json?.message ?? `HTTP ${res.status}`;
        throw new Error(`OpenAI insights (${level}): ${msg}`);
      }

      for (const d of json.data ?? []) {
        const campaignId = String(d.campaign_id ?? '');
        // La nivel de campanie nu există `ad_id`, iar index-ul unic e pe
        // `(siteId, platform, adId, date)` — cu NULL, Postgres n-ar mai vedea
        // duplicatele (NULL ≠ NULL), deci fiecare sincronizare ar insera din nou
        // aceleași zile. De-aia un id sintetic, stabil.
        const adId = level === 'ad' ? String(d.ad_id ?? '') : `campaign:${campaignId}`;
        rows.push({
          platform: 'chatgpt',
          campaignId,
          campaignName: d.campaign_name ?? null,
          adsetId: d.ad_group_id ? String(d.ad_group_id) : null,
          adsetName: d.ad_group_name ?? null,
          adId,
          adName: level === 'ad' ? (d.ad_name ?? null) : 'Total campanie',
          date: String(d.readable_time ?? '').slice(0, 10),
          spendCents: toCents(d.spend),
          currency,
          impressions: toInt(d.impressions),
          clicks: toInt(d.clicks),
          conversions: 0,
          conversionValueCents: 0,
        });
      }

      if (!json.has_more || !json.last_id) break;
      after = String(json.last_id);
    }

    return rows.filter((r) => r.adId && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
  }

  /** Moneda contului de ads. `GET /ad_account` e și verificarea că cheia e bună. */
  private async fetchOpenAiCurrency(key: string): Promise<string> {
    try {
      const res = await fetch(`${OPENAI_ADS_API_BASE}/ad_account`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      });
      const json: any = await res.json();
      return (json?.currency_code as string)?.toUpperCase() || 'EUR';
    } catch {
      return 'EUR';
    }
  }

  /**
   * Rescrie COMPLET fereastra pentru o platformă, în loc s-o îmbine cu ce era.
   *
   * Există pentru ChatGPT. Advertiser API-ul e în beta și nu întoarce (încă)
   * istoric zilnic: verificat pe 4 septembrie 2026, o interogare pe 22.08–04.09
   * a răspuns cu UN SINGUR bucket — cel de azi — conținând totalurile de la
   * începutul campaniilor (82 de clickuri și 33,90 € pe o campanie pornită pe 1
   * septembrie), iar interogările pe zile anterioare au întors zero rânduri.
   * `time_granularity` e acceptat, dar ignorat.
   *
   * Cu upsert pe `(siteId, platform, adId, date)`, dacă mâine același total
   * cumulat apare ștampilat cu ziua de mâine, rândul de azi rămâne pe loc și
   * cheltuiala se numără de două ori. Nu ca eroare — ca ROAS înjumătățit tăcut.
   * Ștergerea ferestrei înainte de scriere face sincronizarea idempotentă
   * indiferent cum își mută ei bucket-ul, iar când vor da defalcare zilnică
   * reală se comportă exact ca un upsert.
   *
   * Zero rânduri NU șterge nimic: un `200` gol în timpul unei pene la ei ar
   * rade cheltuiala reală din rapoarte.
   */
  private async replaceWindow(
    siteId: string,
    platform: AdPlatform,
    since: string,
    until: string,
    rows: NormalizedRow[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.repo.manager.transaction(async (m) => {
      await m.delete(AdSpend, { siteId, platform, date: Between(since, until) });
      await m.insert(AdSpend, toEntities(siteId, platform, rows));
    });
  }

  private async upsert(siteId: string, platform: AdPlatform, rows: NormalizedRow[]): Promise<void> {
    if (rows.length === 0) return;
    // Upsert idempotent pe index-ul unic (siteId, platform, adId, date).
    await this.repo.upsert(toEntities(siteId, platform, rows), {
      conflictPaths: ['siteId', 'platform', 'adId', 'date'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  // ============== REPORTING ==============

  /**
   * Raport agregat pentru intervalul dat: total + defalcare pe campanie per
   * platformă, plus ROAS calculat față de venitul (payments paid) din același
   * interval/site.
   */
  async report(
    range: { from: Date; to: Date },
    siteId: string | null,
    opts?: { fromDay?: string; toDay?: string },
  ) {
    // Cheltuiala e stocată per zi calendaristică (în TZ-ul contului de ads, cum o
    // raportează Meta/TikTok). Datepicker-ul trimite instant-uri (miezul nopții
    // LOCAL → în UTC poate fi ziua precedentă), așa că dacă frontend-ul ne dă
    // explicit zilele locale (`fromDay`/`toDay`), le folosim direct — altfel
    // cădem pe felia UTC a instant-ului (poate fi off-by-one în afara UTC).
    const fromDay = opts?.fromDay && /^\d{4}-\d{2}-\d{2}$/.test(opts.fromDay) ? opts.fromDay : toDay(range.from);
    const toDayStr = opts?.toDay && /^\d{4}-\d{2}-\d{2}$/.test(opts.toDay) ? opts.toDay : toDay(range.to);

    // Agregare la nivel de AD (campaignId → adsetId → adId) peste interval.
    const qb = this.repo
      .createQueryBuilder('a')
      .select('a.platform', 'platform')
      .addSelect('a.campaignId', 'campaignId')
      .addSelect('MAX(a.campaignName)', 'campaignName')
      .addSelect('a.adsetId', 'adsetId')
      .addSelect('MAX(a.adsetName)', 'adsetName')
      .addSelect('a.adId', 'adId')
      .addSelect('MAX(a.adName)', 'adName')
      .addSelect('MAX(a.currency)', 'currency')
      .addSelect('SUM(a.spendCents)::int', 'spendCents')
      .addSelect('SUM(a.impressions)::int', 'impressions')
      .addSelect('SUM(a.clicks)::int', 'clicks')
      .addSelect('SUM(a.conversions)::int', 'conversions')
      .addSelect('SUM(a.conversionValueCents)::int', 'conversionValueCents')
      .addSelect('MAX(a.fetchedAt)', 'fetchedAt')
      .where('a.date BETWEEN :from AND :to', { from: fromDay, to: toDayStr })
      .groupBy('a.platform')
      .addGroupBy('a.campaignId')
      .addGroupBy('a.adsetId')
      .addGroupBy('a.adId');
    if (siteId) qb.andWhere('a.siteId = :siteId', { siteId });

    const adRows = await qb.getRawMany<{
      platform: AdPlatform;
      campaignId: string;
      campaignName: string | null;
      adsetId: string | null;
      adsetName: string | null;
      adId: string | null;
      adName: string | null;
      currency: string;
      spendCents: number;
      impressions: number;
      clicks: number;
      conversions: number;
      conversionValueCents: number;
      fetchedAt: Date | null;
    }>();

    // Venit din payments (paid) — normalizat în RON la cursul BNR de dinainte
    // de data plății (vezi FxRateService), ca ROAS-ul și „Revenue (Stripe)" să
    // fie corecte și pe site-urile în valută (EUR pe BG/GR). Aceeași logică ca
    // AnalyticsService.AMOUNT_RON.
    const AMOUNT_RON_P = `CASE
      WHEN p."amountRonCents" IS NOT NULL THEN p."amountRonCents"
      WHEN upper(p.currency) = 'RON' THEN p.amount
      WHEN p."exchangeRateToRon" IS NOT NULL THEN round(p.amount * p."exchangeRateToRon")::int
      ELSE round(p.amount * 5.23)::int END`;
    const revQb = this.payments
      .createQueryBuilder('p')
      .select(`COALESCE(SUM(${AMOUNT_RON_P}), 0)::int`, 'sum')
      .addSelect('COUNT(*)::int', 'count')
      .where('p.status = :s', { s: 'paid' })
      .andWhere('p.createdAt BETWEEN :from AND :to', { from: range.from, to: range.to });
    if (siteId) revQb.andWhere('p."siteId" = :siteId', { siteId });
    const rev = await revQb.getRawOne<{ sum: number; count: number }>();
    const revenueCents = rev?.sum ?? 0;
    const paidCount = rev?.count ?? 0;

    // Venitul defalcat pe CANAL, ca ROAS-ul să se poată calcula per sursă și nu
    // doar global. Canalul se ia din snapshotul de pe plată; rândurile mai vechi
    // decât standardul UTM au `attributionChannel` NULL, deci cădem pe aceeași
    // normalizare aplicată sursei — altfel toată perioada de dinainte ar fi
    // arătat ca venit neatribuit, iar ROAS-ul pe Meta ar fi ieșit artificial mic.
    const channelExpr = `COALESCE(NULLIF(p."attributionChannel", ''), ${normalizeChannelSql('p."attributionSource"')})`;
    const byChannelQb = this.payments
      .createQueryBuilder('p')
      .select(channelExpr, 'channel')
      .addSelect(`COALESCE(SUM(${AMOUNT_RON_P}), 0)::int`, 'sum')
      .addSelect('COUNT(*)::int', 'count')
      .where('p.status = :s', { s: 'paid' })
      .andWhere('p.createdAt BETWEEN :from AND :to', { from: range.from, to: range.to })
      // `GROUP BY 1`, nu `GROUP BY channel`: dacă `payments` capătă vreodată o
      // coloană numită `channel`, Postgres ar grupa după ea, nu după alias, iar
      // query-ul ar cădea cu „must appear in the GROUP BY clause".
      .groupBy('1');
    if (siteId) byChannelQb.andWhere('p."siteId" = :siteId', { siteId });
    const channelRows = await byChannelQb.getRawMany<{ channel: string; sum: number; count: number }>();
    const revenueByChannel = new Map(
      channelRows.map((r) => [String(r.channel ?? 'direct'), { sum: Number(r.sum), count: Number(r.count) }]),
    );

    // Cheltuiala pe zi și monedă, ca s-o putem converti în RON la cursul zilei.
    // Fără conversie, ROAS-ul ar fi împărțit lei la euro: pe un cont de ads în
    // EUR ieșea de ~5 ori mai bun decât e în realitate.
    const spendDaysQb = this.repo
      .createQueryBuilder('a')
      .select('a.platform', 'platform')
      .addSelect('a.date', 'date')
      .addSelect('MAX(a.currency)', 'currency')
      .addSelect('SUM(a.spendCents)::int', 'spendCents')
      .where('a.date BETWEEN :from AND :to', { from: fromDay, to: toDayStr })
      .groupBy('a.platform')
      .addGroupBy('a.date');
    if (siteId) spendDaysQb.andWhere('a.siteId = :siteId', { siteId });
    const spendDays = await spendDaysQb.getRawMany<{
      platform: AdPlatform;
      date: string;
      currency: string;
      spendCents: number;
    }>();

    const spendRonByPlatform = new Map<AdPlatform, number>();
    let fxIncomplete = false;
    for (const d of spendDays) {
      const cents = Number(d.spendCents);
      const conv = await this.fx.toRonCents(cents, d.currency || 'EUR', d.date);
      if (!conv) fxIncomplete = true;
      const prev = spendRonByPlatform.get(d.platform) ?? 0;
      spendRonByPlatform.set(d.platform, prev + (conv?.amountRonCents ?? cents));
    }

    const platforms = AD_PLATFORMS.map((platform) =>
      buildPlatformTree(platform, adRows.filter((r) => r.platform === platform)),
    );

    const totalSpendCents = platforms.reduce((a, p) => a + p.spendCents, 0);
    const totalSpendRonCents = [...spendRonByPlatform.values()].reduce((a, v) => a + v, 0);
    const totalConversions = platforms.reduce((a, p) => a + p.conversions, 0);

    /**
     * O linie de raport per sursă plătită. Cheltuiala vine de la platformă,
     * venitul din plățile NOASTRE atribuite acelui canal — nu din conversiile
     * raportate de platformă. E singura variantă care dă același înțeles pentru
     * toate trei: Meta și TikTok raportează conversii proprii, ChatGPT le ține
     * într-un endpoint separat, iar cele trei numere nu sunt comparabile între
     * ele. Banii încasați, da.
     */
    const sources = AD_PLATFORMS.map((platform) => {
      const tree = platforms.find((p) => p.platform === platform)!;
      const rev = revenueByChannel.get(platform) ?? { sum: 0, count: 0 };
      const spendRonCents = spendRonByPlatform.get(platform) ?? 0;
      return {
        key: platform,
        label: CHANNEL_LABELS[platform] ?? platform,
        configured: tree.configured,
        currency: tree.currency,
        spendCents: tree.spendCents,
        spendRonCents,
        impressions: tree.impressions,
        clicks: tree.clicks,
        revenueRonCents: rev.sum,
        purchases: rev.count,
        /** Conversiile raportate de platformă. 0 la ChatGPT — vezi `fetchOpenAi`. */
        platformConversions: tree.conversions,
        roas: spendRonCents > 0 ? rev.sum / spendRonCents : null,
        costPerPurchaseRonCents: rev.count > 0 && spendRonCents > 0 ? Math.round(spendRonCents / rev.count) : null,
      };
    });

    // Ce a intrat din canale pentru care nu plătim reclamă (direct, organic,
    // email, referral). Există ca să se închidă socoteala: suma veniturilor pe
    // surse plus asta trebuie să dea „Revenue (Stripe)".
    const paidRevenue = sources.reduce((a, x) => a + x.revenueRonCents, 0);
    const paidPurchases = sources.reduce((a, x) => a + x.purchases, 0);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      revenueCents,
      paidCount,
      totalSpendCents,
      totalSpendRonCents,
      totalConversions,
      // ROAS global = venit Stripe (RON) / cheltuială convertită în RON.
      roas: totalSpendRonCents > 0 ? revenueCents / totalSpendRonCents : null,
      // Cost/conversie global din conversiile atribuite de platforme (Purchase).
      costPerConversion: totalConversions > 0 ? totalSpendCents / totalConversions : null,
      /** `true` = cel puțin o zi n-a găsit curs BNR și a fost numărată 1:1. */
      fxIncomplete,
      sources,
      unattributed: {
        revenueRonCents: Math.max(0, revenueCents - paidRevenue),
        purchases: Math.max(0, paidCount - paidPurchases),
      },
      platforms,
    };
  }

  // ============== HELPERS ==============

  /** Fereastra de sincronizare: ultimele `days` zile (inclusiv azi), în date UTC. */
  private windowDates(days: number): { since: string; until: string } {
    const until = new Date();
    const since = new Date(until.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    return { since: toDay(since), until: toDay(until) };
  }
}

/** Rândurile normalizate → entități gata de scris. Comun între upsert și replaceWindow. */
function toEntities(siteId: string, platform: AdPlatform, rows: NormalizedRow[]) {
  const now = new Date();
  return rows.map((r) => ({
    siteId,
    platform,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    adsetId: r.adsetId,
    adsetName: r.adsetName,
    adId: r.adId,
    adName: r.adName,
    date: r.date,
    spendCents: r.spendCents,
    currency: r.currency,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    conversionValueCents: r.conversionValueCents,
    fetchedAt: now,
  }));
}

function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toCents(spend: unknown): number {
  const n = typeof spend === 'string' ? parseFloat(spend) : Number(spend ?? 0);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

function toInt(v: unknown): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : Number(v ?? 0);
  return isFinite(n) ? n : 0;
}

/**
 * Alege din array-ul `actions`/`action_values` Meta valoarea primului action_type
 * Purchase prezent (în ordinea priorității). Dacă `forceType` e dat, caută exact
 * acel tip (pentru a alinia action_values cu action-ul ales).
 */
function pickMetaAction(
  actions: unknown,
  forceType?: string,
): { type: string | null; count: number } {
  if (!Array.isArray(actions)) return { type: null, count: 0 };
  const types = forceType ? [forceType] : META_PURCHASE_ACTION_TYPES;
  for (const t of types) {
    const hit = actions.find((a: any) => a?.action_type === t);
    if (hit) {
      const n = parseFloat(hit.value ?? '0');
      return { type: t, count: isFinite(n) ? n : 0 };
    }
  }
  return { type: null, count: 0 };
}

interface AdNode {
  adId: string;
  adName: string | null;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValueCents: number;
  currency: string | null;
  costPerConversion: number | null;
}
interface AdsetNode {
  adsetId: string | null;
  adsetName: string | null;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValueCents: number;
  currency: string | null;
  costPerConversion: number | null;
  ads: AdNode[];
}
interface CampaignNode {
  campaignId: string;
  campaignName: string | null;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValueCents: number;
  currency: string | null;
  costPerConversion: number | null;
  adsets: AdsetNode[];
}

type AdRow = {
  campaignId: string;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string | null;
  adName: string | null;
  currency: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValueCents: number;
  fetchedAt: Date | null;
};

const cpcv = (spendCents: number, conversions: number): number | null =>
  conversions > 0 ? Math.round(spendCents / conversions) : null;

/** Construiește ierarhia campanie → ad set → ad cu agregare bottom-up. */
function buildPlatformTree(platform: AdPlatform, rows: AdRow[]) {
  const campaigns = new Map<string, CampaignNode>();
  let latestFetched: Date | null = null;

  for (const r of rows) {
    const spendCents = Number(r.spendCents);
    const impressions = Number(r.impressions);
    const clicks = Number(r.clicks);
    const conversions = Number(r.conversions);
    const conversionValueCents = Number(r.conversionValueCents);
    if (r.fetchedAt) {
      const t = new Date(r.fetchedAt);
      if (!latestFetched || t > latestFetched) latestFetched = t;
    }

    let camp = campaigns.get(r.campaignId);
    if (!camp) {
      camp = {
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        spendCents: 0, impressions: 0, clicks: 0, conversions: 0, conversionValueCents: 0,
        currency: r.currency ?? null, costPerConversion: null, adsets: [],
      };
      campaigns.set(r.campaignId, camp);
    }
    camp.spendCents += spendCents;
    camp.impressions += impressions;
    camp.clicks += clicks;
    camp.conversions += conversions;
    camp.conversionValueCents += conversionValueCents;

    const adsetKey = r.adsetId ?? '(none)';
    let adset = camp.adsets.find((s) => (s.adsetId ?? '(none)') === adsetKey);
    if (!adset) {
      adset = {
        adsetId: r.adsetId, adsetName: r.adsetName,
        spendCents: 0, impressions: 0, clicks: 0, conversions: 0, conversionValueCents: 0,
        currency: r.currency ?? null, costPerConversion: null, ads: [],
      };
      camp.adsets.push(adset);
    }
    adset.spendCents += spendCents;
    adset.impressions += impressions;
    adset.clicks += clicks;
    adset.conversions += conversions;
    adset.conversionValueCents += conversionValueCents;

    adset.ads.push({
      adId: r.adId ?? '', adName: r.adName,
      spendCents, impressions, clicks, conversions, conversionValueCents,
      currency: r.currency ?? null,
      costPerConversion: cpcv(spendCents, conversions),
    });
  }

  const sortBySpend = <T extends { spendCents: number }>(arr: T[]) =>
    arr.sort((a, b) => b.spendCents - a.spendCents);

  const campList = sortBySpend([...campaigns.values()]);
  for (const c of campList) {
    c.costPerConversion = cpcv(c.spendCents, c.conversions);
    sortBySpend(c.adsets);
    for (const s of c.adsets) {
      s.costPerConversion = cpcv(s.spendCents, s.conversions);
      sortBySpend(s.ads);
    }
  }

  const spendCents = campList.reduce((a, c) => a + c.spendCents, 0);
  const impressions = campList.reduce((a, c) => a + c.impressions, 0);
  const clicks = campList.reduce((a, c) => a + c.clicks, 0);
  const conversions = campList.reduce((a, c) => a + c.conversions, 0);
  const conversionValueCents = campList.reduce((a, c) => a + c.conversionValueCents, 0);

  return {
    platform,
    spendCents,
    impressions,
    clicks,
    conversions,
    conversionValueCents,
    currency: campList[0]?.currency ?? null,
    configured: campList.length > 0,
    fetchedAt: latestFetched ? latestFetched.toISOString() : null,
    costPerConversion: cpcv(spendCents, conversions),
    // ROAS atribuit de platformă (valoarea conversiilor / cheltuială).
    platformRoas: spendCents > 0 && conversionValueCents > 0 ? conversionValueCents / spendCents : null,
    campaigns: campList,
  };
}
