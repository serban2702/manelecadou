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

/** Un rând zilnic de spend, normalizat indiferent de platformă, înainte de upsert. */
interface NormalizedRow {
  platform: AdPlatform;
  campaignId: string;
  campaignName: string | null;
  date: string; // YYYY-MM-DD
  spendCents: number;
  currency: string;
  impressions: number;
  clicks: number;
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
      level: 'campaign',
      fields: 'campaign_id,campaign_name,spend,impressions,clicks',
      time_increment: '1',
      time_range: JSON.stringify({ since, until }),
      limit: '500',
      access_token: token,
    });
    let url: string | null = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights?${params.toString()}`;

    let pages = 0;
    while (url && pages < 25) {
      const res = await fetch(url);
      const json: any = await res.json();
      if (!res.ok) {
        const msg = json?.error?.message ?? `HTTP ${res.status}`;
        throw new Error(`Meta insights: ${msg}`);
      }
      for (const d of json.data ?? []) {
        rows.push({
          platform: 'meta',
          campaignId: String(d.campaign_id ?? ''),
          campaignName: d.campaign_name ?? null,
          date: d.date_start, // time_increment=1 → o zi per rând
          spendCents: toCents(d.spend),
          currency,
          impressions: toInt(d.impressions),
          clicks: toInt(d.clicks),
        });
      }
      url = json.paging?.next ?? null;
      pages++;
    }
    return rows.filter((r) => r.campaignId && r.date);
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
    while (page <= totalPages && page <= 25) {
      const params = new URLSearchParams({
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
        metrics: JSON.stringify(['spend', 'impressions', 'clicks', 'campaign_name']),
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
          campaignId: String(dim.campaign_id ?? ''),
          campaignName: met.campaign_name ?? null,
          date: String(dim.stat_time_day ?? '').slice(0, 10), // "YYYY-MM-DD 00:00:00"
          spendCents: toCents(met.spend),
          currency,
          impressions: toInt(met.impressions),
          clicks: toInt(met.clicks),
        });
      }
      totalPages = json.data?.page_info?.total_page ?? 1;
      page++;
    }
    return rows.filter((r) => r.campaignId && r.date);
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
      date: r.date,
      spendCents: r.spendCents,
      currency: r.currency,
      impressions: r.impressions,
      clicks: r.clicks,
      fetchedAt: now,
    }));
    // Upsert idempotent pe index-ul unic (siteId, platform, campaignId, date).
    await this.repo.upsert(entities, {
      conflictPaths: ['siteId', 'platform', 'campaignId', 'date'],
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

    const qb = this.repo
      .createQueryBuilder('a')
      .select('a.platform', 'platform')
      .addSelect('a.campaignId', 'campaignId')
      .addSelect('MAX(a.campaignName)', 'campaignName')
      .addSelect('MAX(a.currency)', 'currency')
      .addSelect('SUM(a.spendCents)::int', 'spendCents')
      .addSelect('SUM(a.impressions)::int', 'impressions')
      .addSelect('SUM(a.clicks)::int', 'clicks')
      .addSelect('MAX(a.fetchedAt)', 'fetchedAt')
      .where('a.date BETWEEN :from AND :to', { from: fromDay, to: toDayStr })
      .groupBy('a.platform')
      .addGroupBy('a.campaignId')
      .orderBy('SUM(a.spendCents)', 'DESC');
    if (siteId) qb.andWhere('a.siteId = :siteId', { siteId });

    const campaigns = await qb.getRawMany<{
      platform: AdPlatform;
      campaignId: string;
      campaignName: string | null;
      currency: string;
      spendCents: number;
      impressions: number;
      clicks: number;
      fetchedAt: Date | null;
    }>();

    // Venit din payments (paid) — aceeași logică ca overview, în moneda site-ului.
    const revQb = this.payments
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)::int', 'sum')
      .addSelect('COUNT(*)::int', 'count')
      .where('p.status = :s', { s: 'paid' })
      .andWhere('p.createdAt BETWEEN :from AND :to', { from: range.from, to: range.to });
    if (siteId) revQb.andWhere('p."siteId" = :siteId', { siteId });
    const rev = await revQb.getRawOne<{ sum: number; count: number }>();
    const revenueCents = rev?.sum ?? 0;
    const paidCount = rev?.count ?? 0;

    const platforms = (['meta', 'tiktok'] as AdPlatform[]).map((platform) => {
      const rows = campaigns.filter((c) => c.platform === platform);
      const spendCents = rows.reduce((a, c) => a + Number(c.spendCents), 0);
      const impressions = rows.reduce((a, c) => a + Number(c.impressions), 0);
      const clicks = rows.reduce((a, c) => a + Number(c.clicks), 0);
      const currency = rows[0]?.currency ?? null;
      const fetchedAt = rows.reduce<Date | null>((acc, c) => {
        const t = c.fetchedAt ? new Date(c.fetchedAt) : null;
        return !acc || (t && t > acc) ? t ?? acc : acc;
      }, null);
      return {
        platform,
        spendCents,
        impressions,
        clicks,
        currency,
        configured: spendCents > 0 || rows.length > 0,
        fetchedAt: fetchedAt ? fetchedAt.toISOString() : null,
        campaigns: rows.map((c) => ({
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          spendCents: Number(c.spendCents),
          impressions: Number(c.impressions),
          clicks: Number(c.clicks),
          currency: c.currency,
          cpc: Number(c.clicks) > 0 ? Number(c.spendCents) / Number(c.clicks) : null,
          cpm: Number(c.impressions) > 0 ? (Number(c.spendCents) / Number(c.impressions)) * 1000 : null,
        })),
      };
    });

    const totalSpendCents = platforms.reduce((a, p) => a + p.spendCents, 0);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      revenueCents,
      paidCount,
      totalSpendCents,
      // ROAS = venit / cheltuială. Caveat: monedele trebuie să coincidă pentru a fi exact.
      roas: totalSpendCents > 0 ? revenueCents / totalSpendCents : null,
      costPerConversion: paidCount > 0 ? totalSpendCents / paidCount : null,
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
