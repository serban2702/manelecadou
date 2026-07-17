import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdSpend, AdPlatform } from './ad-spend.entity';
import { Payment } from '../payments/payment.entity';
import { SitesService } from '../sites/sites.service';
import type { Site } from '../sites/site.entity';

const META_API_VERSION = 'v21.0';
const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

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

export interface AdSpendSyncResult {
  siteId: string;
  meta: { ok: boolean; rows: number; error?: string };
  tiktok: { ok: boolean; rows: number; error?: string };
}

@Injectable()
export class AdSpendService {
  private readonly logger = new Logger('AdSpend');

  constructor(
    @InjectRepository(AdSpend) private readonly repo: Repository<AdSpend>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly sites: SitesService,
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
    const targets = sites.filter((s) => this.hasMeta(s) || this.hasTiktok(s));
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
      meta: { ok: false, rows: 0 },
      tiktok: { ok: false, rows: 0 },
    };

    if (this.hasMeta(site)) {
      try {
        const rows = await this.fetchMeta(site, since, until);
        await this.upsert(site.id, 'meta', rows);
        res.meta = { ok: true, rows: rows.length };
      } catch (e) {
        res.meta = { ok: false, rows: 0, error: (e as Error).message };
        this.logger.warn(`Meta sync ${site.domain} failed: ${(e as Error).message}`);
      }
    } else {
      res.meta.ok = true; // nimic de făcut → nu e eroare
    }

    if (this.hasTiktok(site)) {
      try {
        const rows = await this.fetchTiktok(site, since, until);
        await this.upsert(site.id, 'tiktok', rows);
        res.tiktok = { ok: true, rows: rows.length };
      } catch (e) {
        res.tiktok = { ok: false, rows: 0, error: (e as Error).message };
        this.logger.warn(`TikTok sync ${site.domain} failed: ${(e as Error).message}`);
      }
    } else {
      res.tiktok.ok = true;
    }

    return res;
  }

  private hasMeta(s: Site): boolean {
    return !!(s.analytics?.metaAdAccountId && s.analyticsSecrets?.metaMarketingToken);
  }
  private hasTiktok(s: Site): boolean {
    return !!(s.analytics?.tiktokAdvertiserId && s.analyticsSecrets?.tiktokMarketingToken);
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

  private async upsert(siteId: string, platform: AdPlatform, rows: NormalizedRow[]): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date();
    const entities = rows.map((r) => ({
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
    // Upsert idempotent pe index-ul unic (siteId, platform, adId, date).
    await this.repo.upsert(entities, {
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

    const platforms = (['meta', 'tiktok'] as AdPlatform[]).map((platform) =>
      buildPlatformTree(platform, adRows.filter((r) => r.platform === platform)),
    );

    const totalSpendCents = platforms.reduce((a, p) => a + p.spendCents, 0);
    const totalConversions = platforms.reduce((a, p) => a + p.conversions, 0);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      revenueCents,
      paidCount,
      totalSpendCents,
      totalConversions,
      // ROAS = venit Stripe / cheltuială. Caveat: monedele trebuie să coincidă.
      roas: totalSpendCents > 0 ? revenueCents / totalSpendCents : null,
      // Cost/conversie global din conversiile atribuite de platforme (Purchase).
      costPerConversion: totalConversions > 0 ? totalSpendCents / totalConversions : null,
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
