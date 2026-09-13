import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';

import { ProfitConfig, ProfitConfigData, ProfitExpenseItem } from './profit-config.entity';
import { dailyExpenseValue } from './profit-math';
import { AdSpend } from './ad-spend.entity';
import { Payment } from '../payments/payment.entity';
import { SunoLog } from '../suno/suno-log.entity';
import { SettingsService } from '../settings/settings.service';

/**
 * Emailurile echipei — plățile lor de test se IGNORĂ complet (nici venit, nici
 * comision Stripe). Veniturile afișate sunt deja fără ele.
 */
export const TEAM_TEST_EMAILS = [
  'serban2702@gmail.com',
  'robertsmara1@gmail.com',
  'contact@manelecadou.ro',
  'alexandrutihon@yahoo.com',
  'office@freevox.ro',
];

/**
 * Platformele de reclame ale căror cheltuieli vin din tabelul `ad_spend`
 * (sincronizate din API-urile lor). Lista e EXPLICITĂ, nu „tot ce e în tabel":
 * TikTok lipsește intenționat, fiindcă e ținut ca item recurent manual — luat
 * din ambele locuri, ar fi numărat de două ori.
 *
 * `vatApplies: true` — reclamele vin de la furnizori externi, facturate fără TVA
 * în factură, deci TVA-ul se adaugă (la fel ca la Meta).
 */
export const AD_PLATFORMS: Array<{ platform: string; label: string; vatApplies: boolean }> = [
  { platform: 'meta', label: 'Meta Ads', vatApplies: true },
  { platform: 'chatgpt', label: 'ChatGPT Ads', vatApplies: true },
];

export const DEFAULT_PROFIT_CONFIG: ProfitConfigData = {
  fx: { eurToRon: 4.97, usdToRon: 4.6 },
  fxWeekly: {},
  sunoUsdPerRequest: 0.06,
  vatRatePct: 21,
  microTaxRatePct: 1,
  items: [
    { id: 'chatgpt', builtin: 'chatgpt', label: 'ChatGPT API', cadence: 'monthly', currency: 'USD', amounts: {}, defaultAmount: null },
    // Grok: abonament ținut 3 luni (18.05 → 18.08.2026), 135 lei/lună cu TVA inclus.
    { id: 'grok', builtin: 'grok', label: 'Grok', cadence: 'monthly', currency: 'RON', amounts: {}, defaultAmount: 135, startDay: '2026-05-18', endDay: '2026-08-18' },
    // CapCut: 2 luni (13.07 → 13.09.2026), 150 lei/lună cu TVA inclus.
    { id: 'capcut', builtin: 'capcut', label: 'CapCut', cadence: 'monthly', currency: 'RON', amounts: {}, defaultAmount: 150, startDay: '2026-07-13', endDay: '2026-09-13' },
    // Agenție externă de campanii, o singură lună (22.07 → 22.08.2026), 1270 lei cu TVA inclus.
    { id: 'puggy', builtin: 'puggy', label: 'Campanii Puggy Agency', cadence: 'once', currency: 'RON', amounts: {}, defaultAmount: 1270, startDay: '2026-07-22', endDay: '2026-08-22' },
    { id: 'tiktok_ads', builtin: 'tiktok_ads', label: 'TikTok Ads', cadence: 'monthly', currency: 'RON', amounts: {}, defaultAmount: null },
    { id: 'domains', builtin: 'domains', label: 'Domenii internet', cadence: 'yearly', currency: 'RON', amounts: {}, defaultAmount: null },
  ],
};

/** O platformă de reclame, cu cheltuiala ei pe interval. */
export interface ProfitAdLine {
  platform: string;
  label: string;
  /** Suma brută, în moneda contului de ads. */
  rawCents: number;
  currency: string | null;
  /** Aceeași sumă convertită în bani RON, cu cursul fiecărei zile. */
  ronCents: number;
  vatApplies: boolean;
}

export interface ProfitRecurringLine {
  id: string;
  label: string;
  cadence: 'monthly' | 'yearly' | 'once';
  currency: 'RON' | 'EUR' | 'USD';
  builtin?: string | null;
  /** Intervalul de activitate al cheltuielii (gol = nelimitat). */
  startDay?: string | null;
  endDay?: string | null;
  /** `true` = suma intră în baza de TVA; `false` = TVA deja inclus în ea. */
  vatApplies: boolean;
  /** Suma în moneda proprie, pro-rata pe interval (pentru transparență). */
  amountCents: number;
  /** Aceeași sumă convertită în bani RON. */
  ronCents: number;
}

export interface ProfitReport {
  range: { fromDay: string; toDay: string; days: number };
  fx: { eurToRon: number; usdToRon: number };
  stripeConfigured: boolean;
  revenueRonCents: number;
  /** Cheltuiala de reclame, o linie per platformă din `AD_PLATFORMS`. */
  ads: ProfitAdLine[];
  adsTotalRonCents: number;
  suno: { ronCents: number; requests: number; usdPerRequest: number };
  recurring: ProfitRecurringLine[];
  recurringTotalRonCents: number;
  /** Subtotal cheltuieli înainte de TVA (Meta + Suno + TOATE recurentele). */
  preVatTotalRonCents: number;
  /**
   * Baza pe care se calculează TVA: Meta + Suno + doar recurentele marcate
   * `vatApplies`. Restul au TVA-ul deja inclus în sumă și nu se mai taxează.
   */
  vatBaseRonCents: number;
  vatRatePct: number;
  vatRonCents: number;
  microTaxRatePct: number;
  microTaxRonCents: number;
  stripeFee: { ronCents: number; paymentsKnown: number; paymentsTotal: number };
  totalExpensesRonCents: number;
  profitRonCents: number;
  /** Marjă de profit (%) raportată la venituri. */
  marginPct: number;
  /**
   * Serie zilnică venituri vs cheltuieli (graficul din dashboard). Cheltuielile
   * zilei = Meta + Suno + recurente pro-rata + TVA-ul bazei impozabile a zilei +
   * impozitul micro pe venitul zilei + comisionul Stripe al plăților zilei
   * (zile Europe/Bucharest).
   */
  daily: Array<{
    day: string;
    revenueRonCents: number;
    expensesRonCents: number;
    profitRonCents: number;
  }>;
}

function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Diferența în zile calendaristice între două date `YYYY-MM-DD` (b - a). */
function diffDays(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86_400_000);
}

/** Toate zilele calendaristice din [fromDay,toDay] inclusiv, ca `YYYY-MM-DD`. */
function eachDay(fromDay: string, toDay: string): string[] {
  if (toDay < fromDay) return [];
  const days: string[] = [];
  let t = Date.UTC(+fromDay.slice(0, 4), +fromDay.slice(5, 7) - 1, +fromDay.slice(8, 10));
  const end = Date.UTC(+toDay.slice(0, 4), +toDay.slice(5, 7) - 1, +toDay.slice(8, 10));
  // Plasă de siguranță: max ~3 ani de zile (evită bucle accidentale pe range-uri uriașe).
  let guard = 0;
  while (t <= end && guard < 1100) {
    days.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
    guard++;
  }
  return days;
}

/** Lunea (ISO) săptămânii care conține `day`, ca `YYYY-MM-DD`. Cheia pentru `fxWeekly`. */
function mondayOf(day: string): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)));
  const dow = d.getUTCDay(); // 0=duminică, 1=luni, …
  const offset = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function fxToRon(currency: string, fx: { eurToRon: number; usdToRon: number }): number {
  if (currency === 'EUR') return fx.eurToRon;
  if (currency === 'USD') return fx.usdToRon;
  return 1;
}

@Injectable()
export class ProfitabilityService {
  private readonly logger = new Logger('Profitability');
  private stripe: Stripe | null = null;
  private lastStripeKey: string | null = null;

  constructor(
    @InjectRepository(ProfitConfig) private readonly configRepo: Repository<ProfitConfig>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(AdSpend) private readonly adSpend: Repository<AdSpend>,
    @InjectRepository(SunoLog) private readonly sunoLogs: Repository<SunoLog>,
    private readonly settings: SettingsService,
  ) {}

  // ============== CONFIG ==============

  async getConfig(): Promise<ProfitConfigData> {
    const row = await this.configRepo.find({ take: 1, order: { updatedAt: 'DESC' } });
    if (!row[0]) return JSON.parse(JSON.stringify(DEFAULT_PROFIT_CONFIG));
    return this.normalizeConfig(row[0].data);
  }

  async saveConfig(data: ProfitConfigData): Promise<ProfitConfigData> {
    const clean = this.normalizeConfig(data);
    const existing = await this.configRepo.find({ take: 1, order: { updatedAt: 'DESC' } });
    if (existing[0]) {
      existing[0].data = clean;
      await this.configRepo.save(existing[0]);
    } else {
      await this.configRepo.save(this.configRepo.create({ data: clean }));
    }
    return clean;
  }

  /** Saneză valorile numerice + structura (defensiv față de payload-ul din UI). */
  private normalizeConfig(input: Partial<ProfitConfigData> | null | undefined): ProfitConfigData {
    const d = input ?? {};
    const num = (v: unknown, fallback: number): number => {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    const items: ProfitExpenseItem[] = Array.isArray(d.items)
      ? d.items.map((it) => {
          const amounts: Record<string, number> = {};
          if (it && typeof it.amounts === 'object' && it.amounts) {
            for (const [k, v] of Object.entries(it.amounts)) {
              const n = typeof v === 'string' ? parseFloat(v) : Number(v);
              if (Number.isFinite(n) && n >= 0) amounts[k] = n;
            }
          }
          const cur = it?.currency === 'EUR' || it?.currency === 'USD' ? it.currency : 'RON';
          const da = it?.defaultAmount;
          const defaultAmount =
            da == null || da === ('' as unknown) ? null : num(da, 0);
          const day = (v: unknown): string | null =>
            typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
          let startDay = day(it?.startDay);
          let endDay = day(it?.endDay);
          // Interval inversat = intenție imposibilă; îl ignorăm în loc să tăcem la zero.
          if (startDay && endDay && endDay < startDay) { startDay = null; endDay = null; }
          return {
            id: String(it?.id ?? Math.random().toString(36).slice(2)),
            label: String(it?.label ?? 'Cheltuială').slice(0, 80),
            cadence:
              it?.cadence === 'yearly' ? 'yearly' : it?.cadence === 'once' ? 'once' : 'monthly',
            currency: cur,
            amounts,
            defaultAmount,
            startDay,
            endDay,
            vatApplies: it?.vatApplies === true,
            builtin: it?.builtin ?? null,
          };
        })
      : [];
    const fxWeekly: Record<string, { eurToRon: number; usdToRon: number }> = {};
    if (d.fxWeekly && typeof d.fxWeekly === 'object') {
      for (const [k, v] of Object.entries(d.fxWeekly)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== 'object') continue;
        const eur = num((v as { eurToRon?: unknown }).eurToRon, 0);
        const usd = num((v as { usdToRon?: unknown }).usdToRon, 0);
        // Păstrăm doar săptămânile cu cel puțin un curs setat (>0).
        if (eur > 0 || usd > 0) {
          fxWeekly[k] = {
            eurToRon: eur > 0 ? eur : DEFAULT_PROFIT_CONFIG.fx.eurToRon,
            usdToRon: usd > 0 ? usd : DEFAULT_PROFIT_CONFIG.fx.usdToRon,
          };
        }
      }
    }
    return {
      fx: {
        eurToRon: num(d.fx?.eurToRon, DEFAULT_PROFIT_CONFIG.fx.eurToRon),
        usdToRon: num(d.fx?.usdToRon, DEFAULT_PROFIT_CONFIG.fx.usdToRon),
      },
      fxWeekly,
      sunoUsdPerRequest: num(d.sunoUsdPerRequest, DEFAULT_PROFIT_CONFIG.sunoUsdPerRequest),
      vatRatePct: num(d.vatRatePct, DEFAULT_PROFIT_CONFIG.vatRatePct),
      microTaxRatePct: num(d.microTaxRatePct, DEFAULT_PROFIT_CONFIG.microTaxRatePct),
      items: items.length ? items : JSON.parse(JSON.stringify(DEFAULT_PROFIT_CONFIG.items)),
    };
  }

  // ============== REPORT ==============

  async compute(
    range: { from: Date; to: Date },
    opts?: { fromDay?: string; toDay?: string },
  ): Promise<ProfitReport> {
    const cfg = await this.getConfig();
    const fromDay = opts?.fromDay && /^\d{4}-\d{2}-\d{2}$/.test(opts.fromDay) ? opts.fromDay : toDay(range.from);
    const toDayStr = opts?.toDay && /^\d{4}-\d{2}-\d{2}$/.test(opts.toDay) ? opts.toDay : toDay(range.to);
    const days = Math.max(0, diffDays(fromDay, toDayStr) + 1);

    // Zilele calendaristice ale intervalului + funcția de curs pe zi: cursul
    // săptămânii (lunea ISO) din `fxWeekly`, cu fallback pe cursul global `fx`.
    const allDays = eachDay(fromDay, toDayStr);
    const rateFor = (day: string, currency: 'RON' | 'EUR' | 'USD'): number => {
      if (currency === 'RON') return 1;
      const wk = cfg.fxWeekly[mondayOf(day)] ?? cfg.fx;
      return currency === 'EUR' ? wk.eurToRon : wk.usdToRon;
    };

    // Acumulatoare pe zi pentru seria `daily`. Cheltuielile se țin în DOUĂ hărți:
    // `dailyVatBase` (peste care se aplică TVA) și `dailyNoVat` (sume cu TVA deja
    // inclus). Bump doar pe zilele intervalului — conversiile de fus orar de la
    // margini pot produce zile vecine; le ignorăm în serie (totalurile rămân exacte).
    const dailyRevenue = new Map<string, number>(allDays.map((d) => [d, 0]));
    const dailyVatBase = new Map<string, number>(allDays.map((d) => [d, 0]));
    const dailyNoVat = new Map<string, number>(allDays.map((d) => [d, 0]));
    const bumpDay = (map: Map<string, number>, day: string, cents: number) => {
      if (map.has(day)) map.set(day, (map.get(day) ?? 0) + cents);
    };

    // --- 1) Venituri (paid, non-test, all-site) în bani RON ---
    const revenueRonCents = await this.revenueRonCents(range);
    for (const r of await this.revenueByDay(range)) bumpDay(dailyRevenue, r.day, r.cents);

    // --- 2) Cheltuiala de reclame, per platformă, convertită RON cu cursul fiecărei zile ---
    const ads: ProfitAdLine[] = [];
    for (const p of AD_PLATFORMS) {
      const rows = await this.adSpendByDay(p.platform, fromDay, toDayStr);
      let rawCents = 0;
      let ronAcc = 0;
      let currency: string | null = null;
      for (const d of rows) {
        rawCents += d.cents;
        if (d.currency) currency = d.currency;
        const ron = d.cents * rateFor(d.date, (d.currency as 'RON' | 'EUR' | 'USD') ?? 'RON');
        ronAcc += ron;
        bumpDay(p.vatApplies ? dailyVatBase : dailyNoVat, d.date, Math.round(ron));
      }
      ads.push({
        platform: p.platform,
        label: p.label,
        rawCents,
        currency,
        ronCents: Math.round(ronAcc),
        vatApplies: p.vatApplies,
      });
    }
    const adsTotalRonCents = ads.reduce((a, x) => a + x.ronCents, 0);
    const adsVatBaseRonCents = ads.filter((x) => x.vatApplies).reduce((a, x) => a + x.ronCents, 0);

    // --- 3) Suno: 0.06$ × requesturi (per zi, cu cursul USD al săptămânii) ---
    const sunoDaily = await this.sunoRequestsByDay(range);
    let sunoRequests = 0;
    let sunoRonAcc = 0;
    for (const d of sunoDaily) {
      sunoRequests += d.n;
      const ron = d.n * cfg.sunoUsdPerRequest * rateFor(d.day, 'USD');
      sunoRonAcc += ron;
      bumpDay(dailyVatBase, d.day, Math.round(ron * 100));
    }
    const sunoRonCents = Math.round(sunoRonAcc * 100);

    // --- 4) Cheltuieli recurente, pro-rata pe zile, cu cursul săptămânii fiecărei zile ---
    const recurring: ProfitRecurringLine[] = cfg.items.map((it) => {
      const vatApplies = it.vatApplies === true;
      const target = vatApplies ? dailyVatBase : dailyNoVat;
      let unit = 0; // sumă în moneda proprie (pentru transparență)
      let ron = 0;
      for (const day of allDays) {
        const daily = dailyExpenseValue(it, day);
        if (daily === 0) continue;
        unit += daily;
        const dayRon = daily * rateFor(day, it.currency);
        ron += dayRon;
        bumpDay(target, day, Math.round(dayRon * 100));
      }
      return {
        id: it.id,
        label: it.label,
        cadence: it.cadence,
        currency: it.currency,
        builtin: it.builtin ?? null,
        startDay: it.startDay ?? null,
        endDay: it.endDay ?? null,
        vatApplies,
        amountCents: Math.round(unit * 100),
        ronCents: Math.round(ron * 100),
      };
    });
    const recurringTotalRonCents = recurring.reduce((a, r) => a + r.ronCents, 0);

    // --- 5) TVA doar peste baza impozabilă: Meta + Suno + recurentele marcate
    //        `vatApplies`. Restul vin cu TVA-ul deja în sumă (facturi RO), deci
    //        taxate încă o dată ar fi dublă impozitare. ---
    const recurringVatBaseRonCents = recurring
      .filter((r) => r.vatApplies)
      .reduce((a, r) => a + r.ronCents, 0);
    const preVatTotalRonCents = adsTotalRonCents + sunoRonCents + recurringTotalRonCents;
    const vatBaseRonCents = adsVatBaseRonCents + sunoRonCents + recurringVatBaseRonCents;
    const vatRonCents = Math.round((vatBaseRonCents * cfg.vatRatePct) / 100);

    // --- 6) Impozit microîntreprindere (% din venituri, fără TVA peste el) ---
    const microTaxRonCents = Math.round((revenueRonCents * cfg.microTaxRatePct) / 100);

    // --- 7) Comision Stripe (real, din API; fără TVA) ---
    const stripeFee = await this.stripeFees(range);

    const totalExpensesRonCents =
      preVatTotalRonCents + vatRonCents + microTaxRonCents + stripeFee.ronCents;
    const profitRonCents = revenueRonCents - totalExpensesRonCents;
    const marginPct =
      revenueRonCents > 0 ? Math.round((profitRonCents / revenueRonCents) * 1000) / 10 : 0;

    // --- 8) Seria zilnică venituri vs cheltuieli (aceeași formulă, pe zi) ---
    const daily = allDays.map((day) => {
      const rev = dailyRevenue.get(day) ?? 0;
      const vatBase = dailyVatBase.get(day) ?? 0;
      const noVat = dailyNoVat.get(day) ?? 0;
      const expenses =
        vatBase +
        noVat +
        Math.round((vatBase * cfg.vatRatePct) / 100) +
        Math.round((rev * cfg.microTaxRatePct) / 100) +
        (stripeFee.byDay.get(day) ?? 0);
      return { day, revenueRonCents: rev, expensesRonCents: expenses, profitRonCents: rev - expenses };
    });

    return {
      range: { fromDay, toDay: toDayStr, days },
      fx: cfg.fx,
      stripeConfigured: stripeFee.configured,
      revenueRonCents,
      ads,
      adsTotalRonCents,
      suno: { ronCents: sunoRonCents, requests: sunoRequests, usdPerRequest: cfg.sunoUsdPerRequest },
      recurring,
      recurringTotalRonCents,
      preVatTotalRonCents,
      vatBaseRonCents,
      vatRatePct: cfg.vatRatePct,
      vatRonCents,
      microTaxRatePct: cfg.microTaxRatePct,
      microTaxRonCents,
      stripeFee: {
        ronCents: stripeFee.ronCents,
        paymentsKnown: stripeFee.paymentsKnown,
        paymentsTotal: stripeFee.paymentsTotal,
      },
      totalExpensesRonCents,
      profitRonCents,
      marginPct,
      daily,
    };
  }

  // ============== HELPERS — VENITURI / META / SUNO ==============

  /**
   * SQL pentru suma plății în bani RON, indiferent de valută. Identic cu logica
   * AnalyticsService.AMOUNT_RON (prioritate amountRonCents → RON → curs Stripe → fallback EUR).
   */
  private static readonly AMOUNT_RON = `
    CASE
      WHEN p."amountRonCents" IS NOT NULL THEN p."amountRonCents"
      WHEN upper(p.currency) = 'RON' THEN p.amount
      WHEN p."exchangeRateToRon" IS NOT NULL THEN round(p.amount * p."exchangeRateToRon")::int
      ELSE round(p.amount * 4.97)::int
    END`;

  /** Filtrul SQL care exclude plățile echipei (după lista fixă de emailuri). */
  private testEmailFilter(): string {
    const e = `lower(COALESCE(p."customerEmail", gst.email, u.email, ''))`;
    const list = TEAM_TEST_EMAILS.map((x) => `'${x}'`).join(',');
    return `AND ${e} NOT IN (${list})`;
  }

  private async revenueRonCents(range: { from: Date; to: Date }): Promise<number> {
    const rows = (await this.payments.query(
      `SELECT COALESCE(SUM(${ProfitabilityService.AMOUNT_RON}) FILTER (WHERE p.status='paid'),0)::bigint AS revenue
       FROM payments p
       LEFT JOIN guest_sessions gst ON gst.id = p."guestId"
       LEFT JOIN users u ON u.id = p."userId"
       WHERE p."createdAt" BETWEEN $1 AND $2 ${this.testEmailFilter()}`,
      [range.from.toISOString(), range.to.toISOString()],
    )) as Array<{ revenue: string }>;
    return parseInt(rows[0]?.revenue ?? '0', 10) || 0;
  }

  /** Veniturile pe zile locale (Europe/Bucharest), aceleași filtre ca `revenueRonCents`. */
  private async revenueByDay(range: { from: Date; to: Date }): Promise<Array<{ day: string; cents: number }>> {
    const rows = (await this.payments.query(
      `SELECT to_char((p."createdAt" AT TIME ZONE 'Europe/Bucharest')::date, 'YYYY-MM-DD') AS day,
              COALESCE(SUM(${ProfitabilityService.AMOUNT_RON}) FILTER (WHERE p.status='paid'),0)::bigint AS revenue
       FROM payments p
       LEFT JOIN guest_sessions gst ON gst.id = p."guestId"
       LEFT JOIN users u ON u.id = p."userId"
       WHERE p."createdAt" BETWEEN $1 AND $2 ${this.testEmailFilter()}
       GROUP BY 1`,
      [range.from.toISOString(), range.to.toISOString()],
    )) as Array<{ day: string; revenue: string }>;
    return rows.map((r) => ({ day: r.day, cents: parseInt(r.revenue ?? '0', 10) || 0 }));
  }

  private async adSpendByDay(
    platform: string,
    fromDay: string,
    toDay: string,
  ): Promise<Array<{ date: string; cents: number; currency: string | null }>> {
    const rows = await this.adSpend
      .createQueryBuilder('a')
      .select('a.date', 'date')
      .addSelect('COALESCE(SUM(a.spendCents),0)::bigint', 'cents')
      .addSelect('MAX(a.currency)', 'currency')
      .where('a.platform = :p', { p: platform })
      .andWhere('a.date BETWEEN :from AND :to', { from: fromDay, to: toDay })
      .groupBy('a.date')
      .getRawMany<{ date: string | Date; cents: string; currency: string | null }>();
    return rows.map((r) => ({
      date: typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10),
      cents: parseInt(r.cents ?? '0', 10) || 0,
      currency: r.currency ?? null,
    }));
  }

  private async sunoRequestsByDay(range: { from: Date; to: Date }): Promise<Array<{ day: string; n: number }>> {
    const rows = (await this.sunoLogs.query(
      `SELECT to_char((s."createdAt" AT TIME ZONE 'Europe/Bucharest')::date, 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS n
       FROM suno_logs s
       WHERE s."createdAt" BETWEEN $1 AND $2
       GROUP BY 1`,
      [range.from.toISOString(), range.to.toISOString()],
    )) as Array<{ day: string; n: number }>;
    return rows.map((r) => ({ day: r.day, n: Number(r.n) || 0 }));
  }

  // ============== HELPERS — PRO-RATA ==============

  // ============== HELPERS — STRIPE FEES ==============

  private async getStripe(): Promise<Stripe | null> {
    const key = await this.settings.get('STRIPE_SECRET_KEY');
    if (!key) { this.stripe = null; this.lastStripeKey = null; return null; }
    if (key !== this.lastStripeKey) {
      this.stripe = new Stripe(key, { apiVersion: '2024-09-30.acacia' as Stripe.LatestApiVersion });
      this.lastStripeKey = key;
    }
    return this.stripe;
  }

  /**
   * Comisionul Stripe real pe interval (plăți paid, non-test). Îl tragem din
   * `balance_transaction.fee` per plată și îl cache-uim pe rândul Payment ca să nu
   * reinterogăm Stripe. Convertit în RON cu cursurile din config.
   */
  private async stripeFees(range: { from: Date; to: Date }): Promise<{
    ronCents: number; paymentsKnown: number; paymentsTotal: number; configured: boolean;
    /** Comisionul pe zile locale (Europe/Bucharest) — pentru seria `daily`. */
    byDay: Map<string, number>;
  }> {
    // Plățile paid, non-test, cu sesiune Stripe, în interval.
    const rows = (await this.payments.query(
      `SELECT p.id, p."providerSessionId" AS sid, p."stripeFeeCents" AS fee, p."stripeFeeCurrency" AS feecur,
              to_char((p."createdAt" AT TIME ZONE 'Europe/Bucharest')::date, 'YYYY-MM-DD') AS day
       FROM payments p
       LEFT JOIN guest_sessions gst ON gst.id = p."guestId"
       LEFT JOIN users u ON u.id = p."userId"
       WHERE p.status='paid' AND p."createdAt" BETWEEN $1 AND $2
         AND p."providerSessionId" IS NOT NULL ${this.testEmailFilter()}`,
      [range.from.toISOString(), range.to.toISOString()],
    )) as Array<{ id: string; sid: string | null; fee: number | null; feecur: string | null; day: string }>;

    const cfg = await this.getConfig();
    const stripe = await this.getStripe();
    const paymentsTotal = rows.length;
    let paymentsKnown = 0;
    let ronCents = 0;
    const byDay = new Map<string, number>();

    // Backfill din Stripe pentru plățile fără fee cache-uit (limităm per request).
    let fetched = 0;
    const MAX_FETCH = 250;
    for (const r of rows) {
      if (r.fee == null && stripe && r.sid && fetched < MAX_FETCH) {
        const got = await this.fetchAndCacheFee(stripe, r.id, r.sid).catch(() => null);
        if (got) { r.fee = got.fee; r.feecur = got.currency; fetched++; }
      }
      if (r.fee != null) {
        paymentsKnown++;
        const rate = fxToRon((r.feecur ?? 'RON').toUpperCase(), cfg.fx);
        const ron = Math.round(r.fee * rate);
        ronCents += ron;
        byDay.set(r.day, (byDay.get(r.day) ?? 0) + ron);
      }
    }
    return { ronCents, paymentsKnown, paymentsTotal, configured: !!stripe, byDay };
  }

  /** Recuperează fee-ul real al unei plăți din Stripe și-l persistă pe rândul Payment. */
  private async fetchAndCacheFee(
    stripe: Stripe,
    paymentId: string,
    sessionId: string,
  ): Promise<{ fee: number; currency: string } | null> {
    let bt: Stripe.BalanceTransaction | null = null;
    if (sessionId.startsWith('pi_')) {
      const pi = await stripe.paymentIntents.retrieve(sessionId, {
        expand: ['latest_charge.balance_transaction'],
      });
      bt = ((pi.latest_charge as Stripe.Charge | null)?.balance_transaction as Stripe.BalanceTransaction) ?? null;
    } else {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent.latest_charge.balance_transaction'],
      });
      const pi = session.payment_intent as Stripe.PaymentIntent | null;
      bt = ((pi?.latest_charge as Stripe.Charge | null)?.balance_transaction as Stripe.BalanceTransaction) ?? null;
    }
    if (!bt) return null;
    const fee = typeof bt.fee === 'number' ? bt.fee : 0;
    const currency = (bt.currency ?? 'ron').toUpperCase();
    await this.payments.update(paymentId, { stripeFeeCents: fee, stripeFeeCurrency: currency });
    return { fee, currency };
  }
}

