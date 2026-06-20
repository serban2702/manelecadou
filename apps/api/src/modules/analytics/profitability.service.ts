import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';

import { ProfitConfig, ProfitConfigData, ProfitExpenseItem } from './profit-config.entity';
import { AdSpend } from './ad-spend.entity';
import { Payment } from '../payments/payment.entity';
import { SunoLog } from '../suno/suno-log.entity';
import { SettingsService } from '../settings/settings.service';

/**
 * Emailurile echipei — plățile lor de test se IGNORĂ complet (nici venit, nici
 * comision Stripe). Veniturile afișate sunt deja fără ele.
 */
const TEAM_TEST_EMAILS = [
  'serban2702@gmail.com',
  'robertsmara1@gmail.com',
  'contact@manelecadou.ro',
  'alexandrutihon@yahoo.com',
  'office@freevox.ro',
];

/** Pro-rata: o lună standard are 30.5 zile, un an 365 (cerința owner-ului). */
const DAYS_PER_MONTH = 30.5;
const DAYS_PER_YEAR = 365;

export const DEFAULT_PROFIT_CONFIG: ProfitConfigData = {
  fx: { eurToRon: 4.97, usdToRon: 4.6 },
  sunoUsdPerRequest: 0.06,
  vatRatePct: 21,
  microTaxRatePct: 1,
  items: [
    { id: 'chatgpt', builtin: 'chatgpt', label: 'ChatGPT API', cadence: 'monthly', currency: 'USD', amounts: {}, defaultAmount: null },
    { id: 'grok', builtin: 'grok', label: 'Grok', cadence: 'monthly', currency: 'USD', amounts: {}, defaultAmount: 30 },
    { id: 'capcut', builtin: 'capcut', label: 'CapCut', cadence: 'monthly', currency: 'USD', amounts: {}, defaultAmount: 20 },
    { id: 'hetzner', builtin: 'hetzner', label: 'Server Hetzner', cadence: 'monthly', currency: 'EUR', amounts: {}, defaultAmount: 45 },
    { id: 'tiktok_ads', builtin: 'tiktok_ads', label: 'TikTok Ads', cadence: 'monthly', currency: 'RON', amounts: {}, defaultAmount: null },
    { id: 'domains', builtin: 'domains', label: 'Domenii internet', cadence: 'yearly', currency: 'RON', amounts: {}, defaultAmount: null },
  ],
};

export interface ProfitRecurringLine {
  id: string;
  label: string;
  cadence: 'monthly' | 'yearly';
  currency: 'RON' | 'EUR' | 'USD';
  builtin?: string | null;
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
  meta: { ronCents: number; rawCents: number; currency: string | null };
  suno: { ronCents: number; requests: number; usdPerRequest: number };
  recurring: ProfitRecurringLine[];
  recurringTotalRonCents: number;
  /** Subtotal cheltuieli cărora li se aplică TVA (Meta + Suno + recurente). */
  preVatTotalRonCents: number;
  vatRatePct: number;
  vatRonCents: number;
  microTaxRatePct: number;
  microTaxRonCents: number;
  stripeFee: { ronCents: number; paymentsKnown: number; paymentsTotal: number };
  totalExpensesRonCents: number;
  profitRonCents: number;
  /** Marjă de profit (%) raportată la venituri. */
  marginPct: number;
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

/** Câte zile din [fromDay,toDay] cad în [periodStart,periodEnd] (toate inclusiv). */
function overlapDays(fromDay: string, toDay: string, periodStart: string, periodEnd: string): number {
  const s = fromDay > periodStart ? fromDay : periodStart;
  const e = toDay < periodEnd ? toDay : periodEnd;
  if (s > e) return 0;
  return diffDays(s, e) + 1;
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
          return {
            id: String(it?.id ?? Math.random().toString(36).slice(2)),
            label: String(it?.label ?? 'Cheltuială').slice(0, 80),
            cadence: it?.cadence === 'yearly' ? 'yearly' : 'monthly',
            currency: cur,
            amounts,
            defaultAmount,
            builtin: it?.builtin ?? null,
          };
        })
      : [];
    return {
      fx: {
        eurToRon: num(d.fx?.eurToRon, DEFAULT_PROFIT_CONFIG.fx.eurToRon),
        usdToRon: num(d.fx?.usdToRon, DEFAULT_PROFIT_CONFIG.fx.usdToRon),
      },
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

    // --- 1) Venituri (paid, non-test, all-site) în bani RON ---
    const revenueRonCents = await this.revenueRonCents(range);

    // --- 2) Meta spend pe interval (zile calendaristice), convertit RON ---
    const metaRaw = await this.metaSpend(fromDay, toDayStr);
    const metaRate = metaRaw.currency ? fxToRon(metaRaw.currency, cfg.fx) : 1;
    const metaRonCents = Math.round(metaRaw.cents * metaRate);

    // --- 3) Suno: 0.06$ × nr requesturi, convertit RON ---
    const sunoRequests = await this.sunoRequestCount(range);
    const sunoRonCents = Math.round(sunoRequests * cfg.sunoUsdPerRequest * cfg.fx.usdToRon * 100);

    // --- 4) Cheltuieli recurente, pro-rata pe zile, convertite RON ---
    const recurring: ProfitRecurringLine[] = cfg.items.map((it) => {
      const amountUnits = this.proratedAmount(it, fromDay, toDayStr); // în moneda item
      const rate = fxToRon(it.currency, cfg.fx);
      return {
        id: it.id,
        label: it.label,
        cadence: it.cadence,
        currency: it.currency,
        builtin: it.builtin ?? null,
        amountCents: Math.round(amountUnits * 100),
        ronCents: Math.round(amountUnits * rate * 100),
      };
    });
    const recurringTotalRonCents = recurring.reduce((a, r) => a + r.ronCents, 0);

    // --- 5) TVA peste TOATE cheltuielile de mai sus (Meta + Suno + recurente) ---
    const preVatTotalRonCents = metaRonCents + sunoRonCents + recurringTotalRonCents;
    const vatRonCents = Math.round((preVatTotalRonCents * cfg.vatRatePct) / 100);

    // --- 6) Impozit microîntreprindere (% din venituri, fără TVA peste el) ---
    const microTaxRonCents = Math.round((revenueRonCents * cfg.microTaxRatePct) / 100);

    // --- 7) Comision Stripe (real, din API; fără TVA) ---
    const stripeFee = await this.stripeFees(range);

    const totalExpensesRonCents =
      preVatTotalRonCents + vatRonCents + microTaxRonCents + stripeFee.ronCents;
    const profitRonCents = revenueRonCents - totalExpensesRonCents;
    const marginPct =
      revenueRonCents > 0 ? Math.round((profitRonCents / revenueRonCents) * 1000) / 10 : 0;

    return {
      range: { fromDay, toDay: toDayStr, days },
      fx: cfg.fx,
      stripeConfigured: stripeFee.configured,
      revenueRonCents,
      meta: { ronCents: metaRonCents, rawCents: metaRaw.cents, currency: metaRaw.currency },
      suno: { ronCents: sunoRonCents, requests: sunoRequests, usdPerRequest: cfg.sunoUsdPerRequest },
      recurring,
      recurringTotalRonCents,
      preVatTotalRonCents,
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

  private async metaSpend(fromDay: string, toDay: string): Promise<{ cents: number; currency: string | null }> {
    const row = await this.adSpend
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.spendCents),0)::bigint', 'cents')
      .addSelect('MAX(a.currency)', 'currency')
      .where('a.platform = :p', { p: 'meta' })
      .andWhere('a.date BETWEEN :from AND :to', { from: fromDay, to: toDay })
      .getRawOne<{ cents: string; currency: string | null }>();
    return { cents: parseInt(row?.cents ?? '0', 10) || 0, currency: row?.currency ?? null };
  }

  private async sunoRequestCount(range: { from: Date; to: Date }): Promise<number> {
    return this.sunoLogs
      .createQueryBuilder('s')
      .where('s.createdAt BETWEEN :from AND :to', { from: range.from, to: range.to })
      .getCount();
  }

  // ============== HELPERS — PRO-RATA ==============

  /**
   * Suma pro-rata a unei cheltuieli recurente pe intervalul [fromDay,toDay], în
   * moneda proprie. Lunar: Σ (sumă_lună / 30.5 × zile_din_lună). Anual (an fiscal
   * mai→aprilie): Σ (sumă_an / 365 × zile_din_an).
   */
  private proratedAmount(item: ProfitExpenseItem, fromDay: string, toDay: string): number {
    if (toDay < fromDay) return 0;
    const valueFor = (key: string): number => {
      const override = item.amounts[key];
      if (override != null && Number.isFinite(override)) return override;
      return item.defaultAmount != null && Number.isFinite(item.defaultAmount) ? item.defaultAmount : 0;
    };

    let total = 0;
    if (item.cadence === 'monthly') {
      // Iterăm lunile calendaristice care ating intervalul.
      let y = +fromDay.slice(0, 4);
      let m = +fromDay.slice(5, 7); // 1..12
      const endY = +toDay.slice(0, 4);
      const endM = +toDay.slice(5, 7);
      while (y < endY || (y === endY && m <= endM)) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        const periodStart = `${key}-01`;
        const periodEnd = toDay2(y, m, daysInMonth(y, m));
        const od = overlapDays(fromDay, toDay, periodStart, periodEnd);
        if (od > 0) total += (valueFor(key) / DAYS_PER_MONTH) * od;
        m += 1;
        if (m > 12) { m = 1; y += 1; }
      }
    } else {
      // An fiscal: eticheta = anul de start (mai). Iterăm anii fiscali care ating intervalul.
      const fiscalYearOf = (day: string): number => {
        const yy = +day.slice(0, 4);
        const mm = +day.slice(5, 7);
        return mm >= 5 ? yy : yy - 1;
      };
      const startFy = fiscalYearOf(fromDay);
      const endFy = fiscalYearOf(toDay);
      for (let fy = startFy; fy <= endFy; fy++) {
        const key = String(fy);
        const periodStart = `${fy}-05-01`;
        const periodEnd = `${fy + 1}-04-30`;
        const od = overlapDays(fromDay, toDay, periodStart, periodEnd);
        if (od > 0) total += (valueFor(key) / DAYS_PER_YEAR) * od;
      }
    }
    return total;
  }

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
  }> {
    // Plățile paid, non-test, cu sesiune Stripe, în interval.
    const rows = (await this.payments.query(
      `SELECT p.id, p."providerSessionId" AS sid, p."stripeFeeCents" AS fee, p."stripeFeeCurrency" AS feecur
       FROM payments p
       LEFT JOIN guest_sessions gst ON gst.id = p."guestId"
       LEFT JOIN users u ON u.id = p."userId"
       WHERE p.status='paid' AND p."createdAt" BETWEEN $1 AND $2
         AND p."providerSessionId" IS NOT NULL ${this.testEmailFilter()}`,
      [range.from.toISOString(), range.to.toISOString()],
    )) as Array<{ id: string; sid: string | null; fee: number | null; feecur: string | null }>;

    const cfg = await this.getConfig();
    const stripe = await this.getStripe();
    const paymentsTotal = rows.length;
    let paymentsKnown = 0;
    let ronCents = 0;

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
        ronCents += Math.round(r.fee * rate);
      }
    }
    return { ronCents, paymentsKnown, paymentsTotal, configured: !!stripe };
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

/** Câte zile are luna `m` (1..12) din anul `y`. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** `YYYY-MM-DD` pentru ziua `d` a lunii `m` (1..12) din anul `y`. */
function toDay2(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
