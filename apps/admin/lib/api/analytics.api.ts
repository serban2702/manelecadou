import { http } from '../http/client';
import type { AnalyticsOverview, AnalyticsRange } from '../types';

function qs(range: AnalyticsRange, extra?: Record<string, string>): string {
  const p = new URLSearchParams({ from: range.from, to: range.to, ...(extra ?? {}) });
  return `?${p.toString()}`;
}

export class AnalyticsApi {
  static overview(range: AnalyticsRange): Promise<AnalyticsOverview> {
    return http.get(`/admin/analytics/overview${qs(range)}`);
  }
  static timeSeries(range: AnalyticsRange, bucket: 'hour' | 'day' = 'day'): Promise<{
    sessions: Array<{ bucket: string; sessions: number; visitors: number; pageViews: number }>;
    revenue: Array<{ bucket: string; revenueCents: number; count: number }>;
  }> {
    return http.get(`/admin/analytics/time-series${qs(range, { bucket })}`);
  }
  static funnel(range: AnalyticsRange): Promise<Array<{ step: string; count: number; rateOfTotal: number; rateOfPrevious: number }>> {
    return http.get(`/admin/analytics/funnel${qs(range)}`);
  }
  static sources(range: AnalyticsRange): Promise<Array<{ source: string; sessions: number; avgSessionSec: number; bounceRate: number }>> {
    return http.get(`/admin/analytics/sources${qs(range)}`);
  }
  static topPages(range: AnalyticsRange): Promise<Array<{ path: string; views: number; uniqueSessions: number }>> {
    return http.get(`/admin/analytics/top-pages${qs(range)}`);
  }
  static revenueBySource(range: AnalyticsRange): Promise<Array<{ source: string; paidCount: number; revenueCents: number }>> {
    return http.get(`/admin/analytics/revenue-by-source${qs(range)}`);
  }
  static revenueByCampaign(range: AnalyticsRange): Promise<Array<{ source: string; campaign: string; paidCount: number; revenueCents: number }>> {
    return http.get(`/admin/analytics/revenue-by-campaign${qs(range)}`);
  }
  static devices(range: AnalyticsRange): Promise<Array<{ device: string; sessions: number }>> {
    return http.get(`/admin/analytics/devices${qs(range)}`);
  }
  static users(range: AnalyticsRange): Promise<{
    newUsersTimeSeries: Array<{ bucket: string; count: number }>;
    returningUsers: number;
    totalUsers: number;
  }> {
    return http.get(`/admin/analytics/users${qs(range)}`);
  }
  static stripeReconciliation(range: AnalyticsRange): Promise<{
    configured: boolean;
    range: AnalyticsRange;
    summary: {
      stripePaid: number; stripeAmountCents: number; localPaid: number; localAmountCents: number;
      matched: number; missingInLocal: number; missingInStripe: number; amountMismatch: number;
    };
    rows: Array<{
      sessionId: string; stripeAmountCents: number | null; localAmountCents: number | null; currency: string;
      status: 'matched' | 'missing_local' | 'missing_stripe' | 'amount_mismatch'; paidAt: string | null; localId: string | null;
    }>;
  }> {
    return http.get(`/admin/analytics/stripe-reconciliation${qs(range)}`);
  }
  static pixelCrossCheck(range: AnalyticsRange): Promise<{
    ga4Enabled: boolean;
    capiEnabled: boolean;
    events: Array<{ type: string; captured: number; forwarded: number; failed: number; skipped: number; coverage: number }>;
  }> {
    return http.get(`/admin/analytics/pixel-cross-check${qs(range)}`);
  }
  static countries(range: AnalyticsRange): Promise<Array<{ country: string; countryName: string | null; sessions: number; visitors: number }>> {
    return http.get(`/admin/analytics/countries${qs(range)}`);
  }
  static browsers(range: AnalyticsRange): Promise<Array<{ browser: string; sessions: number }>> {
    return http.get(`/admin/analytics/browsers${qs(range)}`);
  }
  static os(range: AnalyticsRange): Promise<Array<{ os: string; sessions: number }>> {
    return http.get(`/admin/analytics/os${qs(range)}`);
  }
  static screens(range: AnalyticsRange): Promise<Array<{ bucket: string; sessions: number }>> {
    return http.get(`/admin/analytics/screens${qs(range)}`);
  }
  static languages(range: AnalyticsRange): Promise<Array<{ language: string; sessions: number }>> {
    return http.get(`/admin/analytics/languages${qs(range)}`);
  }
  static webVitals(range: AnalyticsRange): Promise<Array<{ metric: string; samples: number; avg: number; p75: number; p95: number }>> {
    return http.get(`/admin/analytics/web-vitals${qs(range)}`);
  }
  static recentSessions(
    range: AnalyticsRange,
    opts?: { limit?: number; offset?: number; country?: string; browser?: string; device?: string; category?: string; excludeBots?: boolean },
  ): Promise<{ total: number; items: AnalyticsSessionRow[] }> {
    const extra: Record<string, string> = {};
    if (opts?.limit != null) extra.limit = String(opts.limit);
    if (opts?.offset != null) extra.offset = String(opts.offset);
    if (opts?.country) extra.country = opts.country;
    if (opts?.browser) extra.browser = opts.browser;
    if (opts?.device) extra.device = opts.device;
    if (opts?.category) extra.category = opts.category;
    if (opts?.excludeBots) extra.excludeBots = '1';
    return http.get(`/admin/analytics/sessions${qs(range, extra)}`);
  }
  static botStats(range: AnalyticsRange): Promise<{
    total: number;
    bots: number;
    suspicious: number;
    humans: number;
    avgScore: number;
    botRate: number;
    byCategory: Array<{ category: string; sessions: number }>;
    topRules: Array<{ rule: string; hits: number }>;
  }> {
    return http.get(`/admin/analytics/bots${qs(range)}`);
  }
  static sessionDetail(sessionKey: string): Promise<{
    session: AnalyticsSessionRow & { id: string; siteId: string | null };
    events: Array<{
      id: string;
      eventId: string;
      type: string;
      path: string | null;
      url: string | null;
      valueCents: number | null;
      currency: string | null;
      props: Record<string, unknown> | null;
      forwardStatus: string | null;
      forwardError: string | null;
      createdAt: string;
    }>;
  }> {
    return http.get(`/admin/analytics/sessions/${encodeURIComponent(sessionKey)}`);
  }
  static paymentDetail(id: string): Promise<PaymentDetail> {
    return http.get(`/admin/analytics/payments/${encodeURIComponent(id)}`);
  }
  static adSpend(range: AnalyticsRange, days?: { fromDay: string; toDay: string }): Promise<AdSpendReport> {
    return http.get(`/admin/analytics/ad-spend${qs(range, days ? { fromDay: days.fromDay, toDay: days.toDay } : undefined)}`);
  }
  static adSpendSync(days = 7): Promise<{ ok: boolean; scope: string; results: AdSpendSyncResult[] }> {
    return http.post(`/admin/analytics/ad-spend/sync?days=${days}`, {});
  }
  /** Reconcilierea e ALL-TIME (nu depinde de intervalul selectat), deci nu trimite range. */
  static adPayments(platform: 'meta' | 'tiktok' = 'meta'): Promise<AdPaymentsResponse> {
    return http.get(`/admin/analytics/ad-payments?platform=${platform}`);
  }
  static adPaymentCreate(body: AdPaymentInput): Promise<AdPayment> {
    return http.post(`/admin/analytics/ad-payments`, body);
  }
  static adPaymentUpdate(id: string, body: Partial<AdPaymentInput>): Promise<AdPayment> {
    return http.put(`/admin/analytics/ad-payments/${encodeURIComponent(id)}`, body);
  }
  static adPaymentDelete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/admin/analytics/ad-payments/${encodeURIComponent(id)}`);
  }
  static marketingSummary(range: AnalyticsRange, excludeBots = true, excludeTests = true): Promise<MarketingSummary> {
    return http.get(
      `/admin/analytics/marketing-summary${qs(range, {
        ...(excludeBots ? {} : { excludeBots: '0' }),
        ...(excludeTests ? {} : { excludeTests: '0' }),
      })}`,
    );
  }
  static marketingBreakdown(
    range: AnalyticsRange,
    dimension: MarketingDimension,
    excludeBots = true,
    excludeTests = true,
  ): Promise<MarketingBreakdown> {
    return http.get(
      `/admin/analytics/marketing-breakdown${qs(range, {
        dimension,
        ...(excludeBots ? {} : { excludeBots: '0' }),
        ...(excludeTests ? {} : { excludeTests: '0' }),
      })}`,
    );
  }
  static backfillBuyerNames(limit = 200): Promise<{
    scanned: number; updated: number; genderInferred: number; skipped: number; errors: number;
  }> {
    return http.post(`/admin/analytics/backfill-buyer-names?limit=${limit}`, {});
  }
  static backfillBuyerGender(limit = 2000): Promise<{
    scanned: number; updated: number; byName: number; byEmail: number; skipped: number;
  }> {
    return http.post(`/admin/analytics/backfill-buyer-gender?limit=${limit}`, {});
  }

  // ============== Profitabilitate ==============
  static profitability(range: AnalyticsRange, days?: { fromDay: string; toDay: string }): Promise<ProfitReport> {
    return http.get(`/admin/analytics/profitability${qs(range, days ? { fromDay: days.fromDay, toDay: days.toDay } : undefined)}`);
  }
  static profitConfig(): Promise<ProfitConfigData> {
    return http.get(`/admin/analytics/profit-config`);
  }
  static profitConfigSave(data: ProfitConfigData): Promise<ProfitConfigData> {
    return http.put(`/admin/analytics/profit-config`, data);
  }
}

// ============== Profitabilitate — tipuri ==============

export interface ProfitExpenseItem {
  id: string;
  label: string;
  cadence: 'monthly' | 'yearly';
  currency: 'RON' | 'EUR' | 'USD';
  amounts: Record<string, number>;
  defaultAmount?: number | null;
  builtin?: string | null;
}

export interface FxRate {
  eurToRon: number;
  usdToRon: number;
}

export interface ProfitConfigData {
  /** Curs implicit (fallback) pentru săptămânile fără override în `fxWeekly`. */
  fx: FxRate;
  /** Curs per săptămână — cheia e lunea ISO (`YYYY-MM-DD`). */
  fxWeekly: Record<string, FxRate>;
  sunoUsdPerRequest: number;
  vatRatePct: number;
  microTaxRatePct: number;
  items: ProfitExpenseItem[];
}

export interface ProfitRecurringLine {
  id: string;
  label: string;
  cadence: 'monthly' | 'yearly';
  currency: 'RON' | 'EUR' | 'USD';
  builtin?: string | null;
  amountCents: number;
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
  preVatTotalRonCents: number;
  vatRatePct: number;
  vatRonCents: number;
  microTaxRatePct: number;
  microTaxRonCents: number;
  stripeFee: { ronCents: number; paymentsKnown: number; paymentsTotal: number };
  totalExpensesRonCents: number;
  profitRonCents: number;
  marginPct: number;
}

/** Dimensiunile suportate de matricea de marketing (rânduri). */
export type MarketingDimension =
  | 'source' | 'medium' | 'campaign' | 'device' | 'os' | 'browser' | 'country' | 'landing'
  | 'day' | 'hour' | 'dow'
  | 'package' | 'occasion' | 'voiceGender' | 'buyerGender';

export interface MarketingSummary {
  range: AnalyticsRange;
  sessions: number;
  visitors: number;
  pageViews: number;
  bounceRate: number;
  avgSessionSec: number;
  botSessions: number;
  checkoutsInitiated: number;
  purchases: number;
  failed: number;
  abandoned: number;
  revenueRon: number;
  aov: number;
  visitorConv: number;
  checkoutConv: number;
  buyerGenderCoverage: number;
  formStarts: number;
  funnel: Array<{ step: string; count: number }>;
  previous: {
    sessions: number;
    visitors: number;
    purchases: number;
    revenueRon: number;
    visitorConv: number;
  };
}

export interface MarketingBreakdownRow {
  key: string;
  label: string;
  sessions: number | null;
  visitors: number | null;
  pageViews: number | null;
  initiated: number;
  purchases: number;
  failed: number;
  revenueRon: number;
  aov: number | null;
  visitorConv: number | null;
  checkoutConv: number | null;
}

export interface MarketingBreakdown {
  dimension: string;
  hasTraffic: boolean;
  rows: MarketingBreakdownRow[];
}

/** Metrici comune fiecărui nivel din ierarhie (campanie / ad set / ad). */
export interface AdMetrics {
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValueCents: number;
  currency: string | null;
  costPerConversion: number | null;
}

export interface AdNode extends AdMetrics {
  adId: string;
  adName: string | null;
}

export interface AdsetNode extends AdMetrics {
  adsetId: string | null;
  adsetName: string | null;
  ads: AdNode[];
}

export interface CampaignNode extends AdMetrics {
  campaignId: string;
  campaignName: string | null;
  adsets: AdsetNode[];
}

export interface AdSpendPlatform extends AdMetrics {
  platform: 'meta' | 'tiktok';
  configured: boolean;
  fetchedAt: string | null;
  platformRoas: number | null;
  campaigns: CampaignNode[];
}

export interface AdSpendReport {
  range: AnalyticsRange;
  revenueCents: number;
  paidCount: number;
  totalSpendCents: number;
  totalConversions: number;
  roas: number | null;
  costPerConversion: number | null;
  platforms: AdSpendPlatform[];
}

export interface AdSpendSyncResult {
  siteId: string;
  meta: { ok: boolean; rows: number; error?: string };
  tiktok: { ok: boolean; rows: number; error?: string };
}

// ============== AD PAYMENTS (registru manual plăți către platforme de ads) ==============

export type AdPaymentType = 'fund_loading' | 'payment' | 'refund';

export interface AdPayment {
  id: string;
  siteId: string | null;
  platform: 'meta' | 'tiktok';
  type: AdPaymentType;
  amountCents: number;
  currency: string;
  date: string;
  reference: string | null;
  note: string | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body pentru create/update (sumă în cents, dată YYYY-MM-DD). */
export interface AdPaymentInput {
  platform?: 'meta' | 'tiktok';
  type: AdPaymentType;
  amountCents: number;
  currency: string;
  date: string;
  reference?: string | null;
  note?: string | null;
}

/** Toate valorile sunt ALL-TIME (nu depind de intervalul selectat în analitice). */
export interface AdPaymentReconciliation {
  currency: string;
  mixedCurrencies: boolean;
  totalPaidCents: number;
  totalSpentCents: number;
  balanceCents: number;
  balanceReliable: boolean;
  byType: Record<AdPaymentType, number>;
}

export interface AdPaymentsResponse {
  payments: AdPayment[];
  reconciliation: AdPaymentReconciliation;
}

export interface AnalyticsSessionRow {
  sessionKey: string;
  visitorId: string | null;
  userId: string | null;
  guestId: string | null;
  startedAt: string;
  lastActivityAt: string;
  durationSec: number;
  pageViews: number;
  events: number;
  bounced: boolean;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  landingPath: string | null;
  exitPath: string | null;
  device: string | null;
  deviceModel: string | null;
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
  osVersion: string | null;
  isBot: boolean;
  ip: string | null;
  country: string | null;
  countryName: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  language: string | null;
  timezone: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  screenWidth: number | null;
  screenHeight: number | null;
  connectionType: string | null;
  consentGiven: boolean;
  doNotTrack: boolean;
  botScore: number;
  botCategory: string;
  botReasons: Array<{ rule: string; weight: number; detail?: string }> | null;
}

export interface PaymentDetail {
  payment: {
    id: string;
    siteId: string | null;
    userId: string | null;
    guestId: string | null;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    providerSessionId: string | null;
    amountRonCents: number | null;
    exchangeRateToRon: string | null;
    failureReason: string | null;
    failureCode: string | null;
    createdAt: string;
    updatedAt: string;
  };
  user: { id: string; email: string; name: string | null } | null;
  session: AnalyticsSessionRow | null;
  relatedEvent: { type: string; createdAt: string; props: Record<string, unknown> | null } | null;
  /** Generarea legată (când `generations.paymentId == payment.id`). */
  generation: {
    id: string;
    type: 'demo' | 'full';
    status: string;
    recipientName: string;
    paidUnlocked: boolean;
    audioUrl: string | null;
    retryCount: number;
    nextRetryAt: string | null;
    lastRetryAt: string | null;
    providerJobId: string | null;
    createdAt: string;
  } | null;
}
