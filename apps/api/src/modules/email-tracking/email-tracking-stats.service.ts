import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EmailLink } from './email-link.entity';
import { EmailLinkClick } from './email-link-click.entity';

/** Suma plății normalizată în bani RON — aceeași expresie ca în AnalyticsService. */
const AMOUNT_RON = `
  CASE
    WHEN p."amountRonCents" IS NOT NULL THEN p."amountRonCents"
    WHEN upper(p.currency) = 'RON' THEN p.amount
    WHEN p."exchangeRateToRon" IS NOT NULL THEN round(p.amount * p."exchangeRateToRon")::int
    ELSE round(p.amount * 5.23)::int
  END`;

export type EmailStatsDimension = 'kind' | 'campaign' | 'link' | 'day';

export interface EmailPerformanceRow {
  key: string;
  /** Mailuri distincte trimise care conțineau linkuri urmărite. */
  sent: number;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  /** Clicuri respinse ca fiind de la roboți de scanare (informativ). */
  botClicks: number;
  openRate: number | null;
  clickRate: number | null;
  /** Din cei care au deschis, câți au și apăsat. */
  clickToOpenRate: number | null;
  purchases: number;
  revenueRon: number;
  conversionRate: number | null;
}

interface RangeInput {
  from?: string;
  to?: string;
  siteId: string | null;
  includeBots?: boolean;
}

function resolveRange(q: { from?: string; to?: string }): { from: string; to: string } {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 24 * 3600_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 10000) / 100;
}

/**
 * Rapoartele de email: cine a deschis, cine a apăsat, de câte ori și cât a
 * cumpărat după.
 *
 * Legătura cu banii se face prin `payments.attributionEmailToken`, adică prin
 * tokenul EXACT al linkului apăsat — nu prin „a fost cândva pe email". Așa un
 * mesaj de recuperare la 24h își vede venitul separat de cel de la 72h, iar o
 * campanie își vede venitul separat de restul traficului din email.
 */
@Injectable()
export class EmailTrackingStatsService {
  constructor(
    @InjectRepository(EmailLink) private readonly linkRepo: Repository<EmailLink>,
    @InjectRepository(EmailLinkClick) private readonly clickRepo: Repository<EmailLinkClick>,
  ) {}

  async performance(
    q: RangeInput & { dimension: EmailStatsDimension },
  ): Promise<{ dimension: EmailStatsDimension; rows: EmailPerformanceRow[] }> {
    const { from, to } = resolveRange(q);
    const params: unknown[] = [from, to];
    let site = '';
    if (q.siteId) {
      params.push(q.siteId);
      site = `AND l."siteId" = $${params.length}::uuid`;
    }
    const keyExpr =
      q.dimension === 'kind'
        ? `COALESCE(NULLIF(l.kind,''),'(fără categorie)')`
        : q.dimension === 'link'
          ? `COALESCE(NULLIF(l."linkKey",''),'(necunoscut)')`
          : q.dimension === 'day'
            ? `to_char((l."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Bucharest','YYYY-MM-DD')`
            : `COALESCE(NULLIF(l.campaign,''),'(fără campanie)')`;

    // Pixelul de deschidere e un rând de link ca oricare altul; îl excludem din
    // numărătoarea de linkuri, dar îl păstrăm ca destinatar (mailul a plecat).
    const linkRows = (await this.linkRepo.query(
      // `outboundEmailId` e null doar pentru rânduri scrise în afara fluxului
      // normal de trimitere; retragerea pe destinatar ține numărul onest în loc
      // să raporteze zero mailuri trimise pentru clicuri care există.
      `SELECT ${keyExpr} AS key,
              COUNT(DISTINCT COALESCE(l."outboundEmailId"::text, l."recipientEmail"))::int AS sent,
              COUNT(DISTINCT l."recipientEmail")::int AS recipients
         FROM email_links l
        WHERE l."createdAt" BETWEEN $1 AND $2 ${site}
        GROUP BY key`,
      params,
    )) as Array<{ key: string; sent: number; recipients: number }>;

    const noBots = q.includeBots ? '' : `AND c."isBot" = false`;
    const clickRows = (await this.clickRepo.query(
      `SELECT ${keyExpr} AS key,
              COUNT(*) FILTER (WHERE c."eventType"='click' ${noBots})::int AS clicks,
              COUNT(DISTINCT c."recipientEmail") FILTER (WHERE c."eventType"='click' ${noBots})::int AS unique_clicks,
              COUNT(*) FILTER (WHERE c."eventType"='open' ${noBots})::int AS opens,
              COUNT(DISTINCT c."recipientEmail") FILTER (WHERE c."eventType"='open' ${noBots})::int AS unique_opens,
              COUNT(*) FILTER (WHERE c."isBot" = true)::int AS bot_clicks
         FROM email_link_clicks c
         JOIN email_links l ON l.id = c."linkId"
        WHERE l."createdAt" BETWEEN $1 AND $2 ${site}
        GROUP BY key`,
      params,
    )) as Array<{
      key: string; clicks: number; unique_clicks: number; opens: number; unique_opens: number; bot_clicks: number;
    }>;

    const payRows = (await this.linkRepo.query(
      `SELECT ${keyExpr} AS key,
              COUNT(*) FILTER (WHERE p.status='paid')::int AS purchases,
              COALESCE(SUM(${AMOUNT_RON}) FILTER (WHERE p.status='paid'),0)::int AS revenue
         FROM email_links l
         JOIN payments p ON p."attributionEmailToken" = l.token
        WHERE l."createdAt" BETWEEN $1 AND $2 ${site}
        GROUP BY key`,
      params,
    )) as Array<{ key: string; purchases: number; revenue: number }>;

    const map = new Map<string, EmailPerformanceRow>();
    const blank = (key: string): EmailPerformanceRow => ({
      key, sent: 0, recipients: 0, opens: 0, uniqueOpens: 0, clicks: 0, uniqueClicks: 0,
      botClicks: 0, openRate: null, clickRate: null, clickToOpenRate: null,
      purchases: 0, revenueRon: 0, conversionRate: null,
    });
    const get = (key: string) => {
      let row = map.get(key);
      if (!row) { row = blank(key); map.set(key, row); }
      return row;
    };

    for (const r of linkRows) {
      const row = get(r.key);
      row.sent = Number(r.sent);
      row.recipients = Number(r.recipients);
    }
    for (const r of clickRows) {
      const row = get(r.key);
      row.clicks = Number(r.clicks);
      row.uniqueClicks = Number(r.unique_clicks);
      row.opens = Number(r.opens);
      row.uniqueOpens = Number(r.unique_opens);
      row.botClicks = Number(r.bot_clicks);
    }
    for (const r of payRows) {
      const row = get(r.key);
      row.purchases = Number(r.purchases);
      row.revenueRon = Number(r.revenue);
    }

    const rows = Array.from(map.values());
    for (const r of rows) {
      // Baza e numărul de DESTINATARI, nu de mailuri: un mail cu trei linkuri
      // produce trei rânduri în `email_links`, dar un singur om.
      r.openRate = rate(r.uniqueOpens, r.recipients);
      r.clickRate = rate(r.uniqueClicks, r.recipients);
      r.clickToOpenRate = rate(r.uniqueClicks, r.uniqueOpens);
      r.conversionRate = rate(r.purchases, r.uniqueClicks);
    }
    rows.sort((a, b) => b.revenueRon - a.revenueRon || b.uniqueClicks - a.uniqueClicks || b.recipients - a.recipients);
    return { dimension: q.dimension, rows };
  }

  /** Lista destinatarilor cu activitate — „cine, când, de câte ori". */
  async recipients(q: RangeInput & { campaign?: string; kind?: string; email?: string; limit: number }) {
    const { from, to } = resolveRange(q);
    const params: unknown[] = [from, to];
    const where: string[] = [`l."createdAt" BETWEEN $1 AND $2`, `l."recipientEmail" IS NOT NULL`];
    if (q.siteId) { params.push(q.siteId); where.push(`l."siteId" = $${params.length}::uuid`); }
    if (q.campaign) { params.push(q.campaign); where.push(`l.campaign = $${params.length}`); }
    if (q.kind) { params.push(q.kind); where.push(`l.kind = $${params.length}`); }
    if (q.email) { params.push(`%${q.email.toLowerCase()}%`); where.push(`l."recipientEmail" ILIKE $${params.length}`); }
    params.push(q.limit);
    const limitIdx = params.length;
    const noBots = q.includeBots ? '' : `AND c."isBot" = false`;

    // Trei agregări separate, unite la final pe email. Un singur JOIN între
    // linkuri, clicuri și plăți ar fi înmulțit venitul cu numărul de clicuri:
    // un om care apasă butonul de trei ori ar fi apărut cu venit triplu.
    return this.linkRepo.query(
      `WITH lk AS (
         SELECT * FROM email_links l WHERE ${where.join(' AND ')}
       ),
       sent AS (
         SELECT l."recipientEmail" AS email,
                MIN(l.kind) AS kind,
                MIN(l.campaign) AS campaign,
                COUNT(DISTINCT COALESCE(l."outboundEmailId"::text, l.campaign))::int AS emails,
                MIN(l."createdAt") AS "firstSentAt",
                MAX(l."createdAt") AS "lastSentAt"
           FROM lk l GROUP BY l."recipientEmail"
       ),
       act AS (
         SELECT l."recipientEmail" AS email,
                COUNT(*) FILTER (WHERE c."eventType"='click' ${noBots})::int AS clicks,
                COUNT(*) FILTER (WHERE c."eventType"='open' ${noBots})::int AS opens,
                MIN(c."clickedAt") FILTER (WHERE c."eventType"='click' ${noBots}) AS "firstClickAt",
                MAX(c."clickedAt") FILTER (WHERE c."eventType"='click' ${noBots}) AS "lastClickAt"
           FROM email_link_clicks c JOIN lk l ON l.id = c."linkId"
          GROUP BY l."recipientEmail"
       ),
       rev AS (
         SELECT l."recipientEmail" AS email,
                COUNT(*) FILTER (WHERE p.status='paid')::int AS purchases,
                COALESCE(SUM(${AMOUNT_RON}) FILTER (WHERE p.status='paid'),0)::int AS "revenueRon"
           FROM payments p JOIN lk l ON l.token = p."attributionEmailToken"
          GROUP BY l."recipientEmail"
       )
       SELECT sent.*,
              COALESCE(act.clicks,0) AS clicks,
              COALESCE(act.opens,0) AS opens,
              act."firstClickAt", act."lastClickAt",
              COALESCE(rev.purchases,0) AS purchases,
              COALESCE(rev."revenueRon",0) AS "revenueRon"
         FROM sent
         LEFT JOIN act ON act.email = sent.email
         LEFT JOIN rev ON rev.email = sent.email
        ORDER BY clicks DESC, sent."lastSentAt" DESC
        LIMIT $${limitIdx}`,
      params,
    );
  }

  /** Clicurile brute — fiecare apăsare, cu ora, device-ul și a câta oară a fost. */
  async clicks(q: { email?: string; token?: string; siteId: string | null; limit: number }) {
    const params: unknown[] = [];
    const where: string[] = ['1=1'];
    if (q.siteId) { params.push(q.siteId); where.push(`c."siteId" = $${params.length}::uuid`); }
    if (q.email) { params.push(q.email.toLowerCase()); where.push(`c."recipientEmail" = $${params.length}`); }
    if (q.token) { params.push(q.token); where.push(`c.token = $${params.length}`); }
    params.push(q.limit);
    return this.clickRepo.query(
      `SELECT c.id, c.token, c.kind, c.campaign, c."linkKey", c."recipientEmail" AS email,
              c."eventType", c.sequence, c.device, c.country, c."isBot", c."clickedAt",
              l."targetUrl"
         FROM email_link_clicks c
         LEFT JOIN email_links l ON l.id = c."linkId"
        WHERE ${where.join(' AND ')}
        ORDER BY c."clickedAt" DESC
        LIMIT $${params.length}`,
      params,
    );
  }
}
