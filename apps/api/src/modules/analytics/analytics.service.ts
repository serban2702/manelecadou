import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { AnalyticsEvent } from './analytics-event.entity';
import { AnalyticsSession } from './analytics-session.entity';
import { Payment } from '../payments/payment.entity';
import { Generation } from '../generations/generation.entity';
import { User } from '../users/user.entity';
import { TrackEventDto } from './dto';
import { AnalyticsForwarders } from './forwarders';
import { SettingsService } from '../settings/settings.service';
import { GeoIpService } from './geoip.service';
import { parseUserAgent } from './ua-parser';
import { evaluateBot } from './bot-detection';
import { inferGenderFromName, inferGenderFromEmail } from './gender-infer';
import {
  normalizeSourceSql,
  attributionOrderBySql,
} from './attribution-sql';

interface RangeQuery {
  from: Date;
  to: Date;
}

/** Un rând din matricea de marketing (o valoare a dimensiunii selectate). */
export interface MarketingBreakdownRow {
  key: string;
  label: string;
  /** Trafic — null pentru dimensiuni de comandă (package/occasion/voce/gen cumpărător). */
  sessions: number | null;
  visitors: number | null;
  pageViews: number | null;
  /** Plăți. initiated = checkout-uri create (orice status). */
  initiated: number;
  purchases: number;
  failed: number;
  revenueRon: number;
  /** Derivate (calculate în finalizeRows). */
  aov: number | null;
  visitorConv: number | null;
  checkoutConv: number | null;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger('AnalyticsService');
  // Stripe instance lazy — re-created când STRIPE_SECRET_KEY se schimbă în admin.
  private stripeInstance: Stripe | null = null;
  private lastStripeKey: string | null = null;

  constructor(
    @InjectRepository(AnalyticsEvent) private readonly events: Repository<AnalyticsEvent>,
    @InjectRepository(AnalyticsSession) private readonly sessions: Repository<AnalyticsSession>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Generation) private readonly generations: Repository<Generation>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
    private readonly forwarders: AnalyticsForwarders,
    private readonly settings: SettingsService,
    private readonly geoip: GeoIpService,
  ) {}

  private async getStripe(): Promise<Stripe | null> {
    const key = await this.settings.get('STRIPE_SECRET_KEY');
    if (!key) {
      this.stripeInstance = null;
      this.lastStripeKey = null;
      return null;
    }
    if (key !== this.lastStripeKey) {
      this.stripeInstance = new Stripe(key, { apiVersion: '2024-09-30.acacia' as Stripe.LatestApiVersion });
      this.lastStripeKey = key;
    }
    return this.stripeInstance;
  }

  // ============== INGEST ==============

  async ingest(
    dto: TrackEventDto,
    ctx: {
      userId: string | null;
      guestId: string | null;
      ip: string | null;
      userAgent: string | null;
      siteId?: string | null;
      req?: import('express').Request | null;
    },
  ): Promise<void> {
    const session = await this.upsertSession(dto, ctx);

    const event = this.events.create({
      eventId: dto.eventId,
      type: dto.type,
      sessionKey: dto.sessionKey,
      visitorId: dto.visitorId ?? null,
      userId: ctx.userId,
      guestId: ctx.guestId,
      siteId: ctx.siteId ?? session.siteId ?? null,
      url: dto.url ?? null,
      path: dto.path ?? null,
      referrer: dto.referrer ?? null,
      valueCents: dto.valueCents ?? null,
      currency: dto.currency ?? null,
      props: dto.props ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      forwardStatus: 'pending',
    });

    try {
      await this.events.save(event);
    } catch (err) {
      // Dedup pe eventId — dacă același event vine din 2 surse (client + server), păstrăm prima.
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        this.logger.debug(`duplicate event ${dto.eventId} skipped`);
        return;
      }
      throw err;
    }

    void this.afterIngest(event, session);
  }

  /**
   * Variantă "server-only" pentru ingest — folosită din webhook-uri (ex. Stripe
   * `checkout.session.completed`) unde nu există sesiune browser. Salvează un
   * `AnalyticsEvent` cu `sessionKey` sintetic (`server:<eventId>`) și forward-ează
   * direct prin `forwarders.forward()` (GA4 Measurement Protocol + Meta CAPI).
   *
   * eventId trebuie să fie STABIL și UNIC per tranzacție (ex. paymentId Stripe)
   * — în view.tsx browser-ul folosește același paymentId ca `event_id`/`eventID`,
   * iar Meta/GA fac dedup browser↔server automat.
   */
  async ingestServerEvent(input: {
    type: string;
    eventId: string;
    siteId: string | null;
    userId?: string | null;
    guestId?: string | null;
    userEmail?: string | null;
    valueCents?: number | null;
    currency?: string | null;
    url?: string | null;
    path?: string | null;
    props?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    const event = this.events.create({
      eventId: input.eventId,
      type: input.type,
      sessionKey: `server:${input.eventId}`,
      visitorId: null,
      userId: input.userId ?? null,
      guestId: input.guestId ?? null,
      siteId: input.siteId,
      url: input.url ?? null,
      path: input.path ?? null,
      referrer: null,
      valueCents: input.valueCents ?? null,
      currency: input.currency ?? null,
      props: input.props ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      forwardStatus: 'pending',
    });

    try {
      await this.events.save(event);
    } catch (err) {
      // Dedup pe eventId — webhook poate fi livrat de Stripe de >1 ori (retry).
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        this.logger.debug(`duplicate server event ${input.eventId} skipped`);
        return;
      }
      throw err;
    }

    const r = await this.forwarders.forward(event, input.userEmail ?? null);
    event.forwardStatus = !r.attempted ? 'skipped' : r.ok ? 'sent' : 'failed';
    event.forwardError = r.error ?? null;
    await this.events.save(event);
  }

  private async afterIngest(event: AnalyticsEvent, session: AnalyticsSession) {
    if (event.type === 'page_view') {
      session.pageViews += 1;
      if (session.pageViews > 1) session.bounced = false;
    }
    session.events += 1;
    session.exitPath = event.path ?? session.exitPath;
    const now = new Date();
    session.durationSec = Math.max(
      0,
      Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000),
    );
    if (event.type === 'session_end') {
      session.endedAt = now;
    }
    session.userId = session.userId ?? event.userId;
    session.guestId = session.guestId ?? event.guestId;
    await this.sessions.save(session);

    // Forward async — nu bloca request-ul.
    let userEmail: string | null = null;
    if (event.userId) {
      const u = await this.users.findOne({ where: { id: event.userId }, select: ['email'] });
      userEmail = u?.email ?? null;
    }
    const r = await this.forwarders.forward(event, userEmail);
    event.forwardStatus = !r.attempted ? 'skipped' : r.ok ? 'sent' : 'failed';
    event.forwardError = r.error ?? null;
    await this.events.save(event);
  }

  private async upsertSession(
    dto: TrackEventDto,
    ctx: {
      userId: string | null;
      guestId: string | null;
      ip: string | null;
      userAgent: string | null;
      siteId?: string | null;
      req?: import('express').Request | null;
    },
  ): Promise<AnalyticsSession> {
    let session = await this.sessions.findOne({ where: { sessionKey: dto.sessionKey } });
    if (session) {
      let dirty = false;
      if (!session.userId && ctx.userId) {
        session.userId = ctx.userId;
        dirty = true;
      }
      if (!session.guestId && ctx.guestId) {
        session.guestId = ctx.guestId;
        dirty = true;
      }
      // Enrichment leneș: dacă datele de browser au lipsit la primul event,
      // le populăm pe primul payload care le aduce (eg. `page_view` cu screen).
      const enrichFields: Array<[keyof AnalyticsSession, unknown]> = [
        ['screenWidth', dto.screenWidth],
        ['screenHeight', dto.screenHeight],
        ['viewportWidth', dto.viewportWidth],
        ['viewportHeight', dto.viewportHeight],
        ['devicePixelRatio', dto.devicePixelRatio != null ? String(dto.devicePixelRatio) : null],
        ['touchCapable', dto.touchCapable],
        ['colorScheme', dto.colorScheme ?? null],
        ['reducedMotion', dto.reducedMotion],
        ['language', dto.language ?? null],
        ['timezone', dto.timezone ?? null],
        ['timezoneOffsetMin', dto.timezoneOffsetMin],
        ['connectionType', dto.connectionType ?? null],
        ['connectionDownlink', dto.connectionDownlink != null ? String(dto.connectionDownlink) : null],
        ['saveData', dto.saveData],
        ['utmContent', dto.utmContent ?? null],
        ['utmTerm', dto.utmTerm ?? null],
      ];
      const sessionAny = session as unknown as Record<string, unknown>;
      for (const [k, v] of enrichFields) {
        if (v !== undefined && v !== null && sessionAny[k as string] == null) {
          sessionAny[k as string] = v;
          dirty = true;
        }
      }
      if (dto.consentGiven === true && !session.consentGiven) {
        session.consentGiven = true;
        dirty = true;
      }
      if (dto.doNotTrack === true && !session.doNotTrack) {
        session.doNotTrack = true;
        dirty = true;
      }
      if (dirty) await this.sessions.save(session);
      return session;
    }

    // Parse User-Agent (rapid, sincron)
    const ua = parseUserAgent(ctx.userAgent);
    // Geo lookup async (cu fallback + cache)
    const geo = await this.geoip.lookup(ctx.ip);
    // Bot detection (multi-signal scoring)
    const bot = evaluateBot({ ua, userAgent: ctx.userAgent, geo, dto, req: ctx.req ?? null });

    session = this.sessions.create({
      sessionKey: dto.sessionKey,
      visitorId: dto.visitorId ?? null,
      userId: ctx.userId,
      guestId: ctx.guestId,
      siteId: ctx.siteId ?? null,
      source: dto.source ?? null,
      medium: dto.medium ?? null,
      campaign: dto.campaign ?? null,
      utmContent: dto.utmContent ?? null,
      utmTerm: dto.utmTerm ?? null,
      referrer: dto.referrer ?? null,
      landingPath: dto.path ?? null,
      device: dto.device ?? ua.device,
      deviceVendor: ua.deviceVendor,
      deviceModel: ua.deviceModel,
      browserName: ua.browserName,
      browserVersion: ua.browserVersion,
      osName: ua.osName,
      osVersion: ua.osVersion,
      engineName: ua.engineName,
      isBot: ua.isBot || bot.score >= 70,
      botScore: bot.score,
      botCategory: bot.category,
      botReasons: bot.reasons.length ? bot.reasons : null,
      screenWidth: dto.screenWidth ?? null,
      screenHeight: dto.screenHeight ?? null,
      viewportWidth: dto.viewportWidth ?? null,
      viewportHeight: dto.viewportHeight ?? null,
      devicePixelRatio: dto.devicePixelRatio != null ? String(dto.devicePixelRatio) : null,
      touchCapable: dto.touchCapable ?? null,
      colorScheme: dto.colorScheme ?? null,
      reducedMotion: dto.reducedMotion ?? null,
      language: dto.language ?? null,
      timezone: dto.timezone ?? geo.timezone ?? null,
      timezoneOffsetMin: dto.timezoneOffsetMin ?? null,
      connectionType: dto.connectionType ?? null,
      connectionDownlink: dto.connectionDownlink != null ? String(dto.connectionDownlink) : null,
      saveData: dto.saveData ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      country: geo.country,
      countryName: geo.countryName,
      region: geo.region,
      city: geo.city,
      postalCode: geo.postalCode,
      latitude: geo.latitude != null ? String(geo.latitude) : null,
      longitude: geo.longitude != null ? String(geo.longitude) : null,
      isp: geo.isp,
      org: geo.org,
      asn: geo.asn,
      geoSource: geo.source,
      doNotTrack: dto.doNotTrack === true,
      consentGiven: dto.consentGiven === true,
    });
    return this.sessions.save(session);
  }

  // ============== ADMIN AGGREGATES ==============

  private fmtRange(range: RangeQuery) {
    return { from: range.from.toISOString(), to: range.to.toISOString() };
  }

  /** Aplică filtrul siteId pe query-ul curent dacă e setat. siteId === null = cross-site. */
  private applySite<T extends import('typeorm').ObjectLiteral>(
    qb: import('typeorm').SelectQueryBuilder<T>,
    alias: string,
    siteId: string | null,
  ): import('typeorm').SelectQueryBuilder<T> {
    if (siteId) qb.andWhere(`${alias}."siteId" = :siteId`, { siteId });
    return qb;
  }

  async overview(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);

    const [sessionsRow, prevSessionsRow] = await Promise.all([
      this.applySite(
        this.sessions
          .createQueryBuilder('s')
          .select('COUNT(*)', 'sessions')
          .addSelect('COUNT(DISTINCT s.visitorId)', 'visitors')
          .addSelect('COALESCE(AVG(s.durationSec), 0)::float', 'avgDuration')
          .addSelect(`COALESCE(AVG(CASE WHEN s.bounced THEN 1 ELSE 0 END) * 100, 0)::float`, 'bounceRate')
          .addSelect(`COALESCE(SUM(s.pageViews), 0)::int`, 'pageViews')
          .where('s.startedAt BETWEEN :from AND :to', r),
        's',
        siteId,
      ).getRawOne<{ sessions: string; visitors: string; avgDuration: number; bounceRate: number; pageViews: number }>(),
      this.previousPeriodMetrics(range, siteId),
    ]);

    const revenueRow = await this.applySite(
      this.payments
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)::int', 'sum')
        .addSelect('COUNT(*)::int', 'count')
        .where('p.status = :s', { s: 'paid' })
        .andWhere('p.createdAt BETWEEN :from AND :to', r),
      'p',
      siteId,
    ).getRawOne<{ sum: number; count: number }>();

    const purchaseEventsRow = await this.applySite(
      this.events
        .createQueryBuilder('e')
        .select('COALESCE(SUM(e.valueCents), 0)::int', 'sum')
        .addSelect('COUNT(*)::int', 'count')
        .where(`e.type = 'purchase_success'`)
        .andWhere('e.createdAt BETWEEN :from AND :to', r),
      'e',
      siteId,
    ).getRawOne<{ sum: number; count: number }>();

    const conversions = await this.applySite(
      this.events
        .createQueryBuilder('e')
        .select(`e.type`, 'type')
        .addSelect('COUNT(*)::int', 'n')
        .where('e.createdAt BETWEEN :from AND :to', r)
        .andWhere(
          `e.type IN ('page_view','generation_start','generation_complete','purchase_init','purchase_success','signup','login')`,
        ),
      'e',
      siteId,
    ).groupBy('e.type').getRawMany<{ type: string; n: number }>();

    return {
      range: r,
      sessions: Number(sessionsRow?.sessions ?? 0),
      visitors: Number(sessionsRow?.visitors ?? 0),
      pageViews: Number(sessionsRow?.pageViews ?? 0),
      avgSessionSec: Math.round((sessionsRow?.avgDuration ?? 0) * 10) / 10,
      bounceRate: Math.round((sessionsRow?.bounceRate ?? 0) * 10) / 10,
      revenueCents: revenueRow?.sum ?? 0,
      paidCount: revenueRow?.count ?? 0,
      pixelRevenueCents: purchaseEventsRow?.sum ?? 0,
      pixelPurchases: purchaseEventsRow?.count ?? 0,
      eventCounts: Object.fromEntries(conversions.map((c) => [c.type, Number(c.n)])),
      previous: prevSessionsRow,
    };
  }

  private async previousPeriodMetrics(range: RangeQuery, siteId: string | null = null) {
    const span = range.to.getTime() - range.from.getTime();
    const prevFrom = new Date(range.from.getTime() - span);
    const prevTo = new Date(range.from.getTime() - 1);
    const r = { from: prevFrom.toISOString(), to: prevTo.toISOString() };

    const sessions = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select('COUNT(*)::int', 'sessions')
        .addSelect('COUNT(DISTINCT s.visitorId)::int', 'visitors')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    ).getRawOne<{ sessions: number; visitors: number }>();
    const revenue = await this.applySite(
      this.payments
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)::int', 'sum')
        .where('p.status = :s', { s: 'paid' })
        .andWhere('p.createdAt BETWEEN :from AND :to', r),
      'p',
      siteId,
    ).getRawOne<{ sum: number }>();

    return {
      sessions: sessions?.sessions ?? 0,
      visitors: sessions?.visitors ?? 0,
      revenueCents: revenue?.sum ?? 0,
    };
  }

  async timeSeries(range: RangeQuery, bucket: 'hour' | 'day' = 'day', siteId: string | null = null) {
    const r = this.fmtRange(range);
    const truncFn = bucket === 'hour' ? `date_trunc('hour', s."startedAt")` : `date_trunc('day', s."startedAt")`;

    const sessionsTs = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select(`${truncFn}`, 'bucket')
        .addSelect('COUNT(*)::int', 'sessions')
        .addSelect('COUNT(DISTINCT s.visitorId)::int', 'visitors')
        .addSelect('COALESCE(SUM(s.pageViews), 0)::int', 'pageViews')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    )
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<{ bucket: Date; sessions: number; visitors: number; pageViews: number }>();

    const truncP = bucket === 'hour' ? `date_trunc('hour', p."createdAt")` : `date_trunc('day', p."createdAt")`;
    const revenueTs = await this.applySite(
      this.payments
        .createQueryBuilder('p')
        .select(`${truncP}`, 'bucket')
        .addSelect('COALESCE(SUM(p.amount), 0)::int', 'revenueCents')
        .addSelect('COUNT(*)::int', 'count')
        .where('p.status = :s', { s: 'paid' })
        .andWhere('p.createdAt BETWEEN :from AND :to', r),
      'p',
      siteId,
    )
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<{ bucket: Date; revenueCents: number; count: number }>();

    return { sessions: sessionsTs, revenue: revenueTs };
  }

  async funnel(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const types = ['page_view', 'generation_start', 'generation_complete', 'purchase_init', 'purchase_success'];
    const rows = await this.applySite(
      this.events
        .createQueryBuilder('e')
        .select('e.type', 'type')
        .addSelect('COUNT(DISTINCT e.sessionKey)::int', 'sessions')
        .where('e.type IN (:...types)', { types })
        .andWhere('e.createdAt BETWEEN :from AND :to', r),
      'e',
      siteId,
    )
      .groupBy('e.type')
      .getRawMany<{ type: string; sessions: number }>();

    const map = Object.fromEntries(rows.map((r) => [r.type, Number(r.sessions)]));
    return types.map((t, i) => {
      const count = map[t] ?? 0;
      const top = map[types[0]] ?? 0;
      const prev = i === 0 ? count : map[types[i - 1]] ?? 0;
      return {
        step: t,
        count,
        rateOfTotal: top > 0 ? Math.round((count / top) * 1000) / 10 : 0,
        rateOfPrevious: prev > 0 ? Math.round((count / prev) * 1000) / 10 : 0,
      };
    });
  }

  async sources(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const rows = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select(`COALESCE(s.source, 'direct')`, 'source')
        .addSelect('COUNT(*)::int', 'sessions')
        .addSelect('COALESCE(AVG(s.durationSec),0)::float', 'avgDuration')
        .addSelect(`COALESCE(AVG(CASE WHEN s.bounced THEN 1 ELSE 0 END) * 100, 0)::float`, 'bounceRate')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    )
      .groupBy('source')
      .orderBy('sessions', 'DESC')
      .limit(20)
      .getRawMany<{ source: string; sessions: number; avgDuration: number; bounceRate: number }>();
    return rows.map((r) => ({
      source: r.source,
      sessions: Number(r.sessions),
      avgSessionSec: Math.round(r.avgDuration * 10) / 10,
      bounceRate: Math.round(r.bounceRate * 10) / 10,
    }));
  }

  /**
   * Venit (plăți paid) defalcat pe sursa de achiziție.
   *
   * Atribuirea unei plăți la o sursă e grea pentru că `analytics_sessions.guestId`
   * e aproape mereu null (tracker-ul e anonim — știe doar `visitorId`/`ip`). Așa că
   * legăm plata de sesiuni prin TREI căi, în ordinea încrederii:
   *   1. userId (cel mai sigur — user logat)
   *   2. guestId (când tracker-ul a primit guestId-ul)
   *   3. ipAddress (puntea pentru vizitatorii anonimi — plata are `ipAddress`,
   *      sesiunea are `ip`)
   *
   * Pentru fiecare plată alegem „last NON-direct touch" (ultima sesiune cu o sursă
   * reală de campanie înainte de plată) — asta arată ce canal a adus banii, util
   * pentru decizii de buget. Dacă nu există touch de campanie, cădem pe ultima
   * sesiune (de obicei `direct`). Sursele Stripe (redirect post-checkout) sunt
   * excluse ca să nu poluăm atribuirea.
   */
  async revenueBySource(range: RangeQuery, siteId: string | null = null) {
    const params: unknown[] = [range.from.toISOString(), range.to.toISOString()];
    let siteFilter = '';
    if (siteId) {
      params.push(siteId);
      siteFilter = `AND p."siteId" = $${params.length}::uuid`;
    }
    const matches = `(
      (s."userId" IS NOT NULL AND s."userId" = p."userId")
      OR (s."guestId" IS NOT NULL AND s."guestId" = p."guestId")
      OR (p."ipAddress" IS NOT NULL AND s.ip IS NOT NULL AND s.ip = p."ipAddress")
    )`;
    const rows: Array<{ source: string; paid_count: string; revenue_cents: string }> =
      await this.payments.query(
        `
        SELECT
          src AS source,
          COUNT(*)::int AS paid_count,
          COALESCE(SUM(amount), 0)::bigint AS revenue_cents
        FROM (
          SELECT
            p.id,
            p.amount AS amount,
            -- Un singur touch responsabil: Meta câștigă dacă a apărut în ultimele
            -- 7 zile înainte de plată (attributionOrderBy), altfel ultima sursă
            -- non-direct, altfel cea mai recentă. Normalizat la canal canonic
            -- (Gmail app → email, nu google). Fallback 'direct' dacă nicio sesiune.
            COALESCE(
              (SELECT ${normalizeSourceSql('s.source')} FROM analytics_sessions s
                WHERE ${matches}
                  AND s."siteId" = p."siteId"
                  AND s."startedAt" <= p."createdAt"
                  AND s."startedAt" >= p."createdAt" - INTERVAL '60 days'
                  AND s.source IS NOT NULL
                  AND s.source NOT ILIKE 'stripe%' AND s.source NOT ILIKE 'checkout.stripe%'
                ORDER BY ${attributionOrderBySql('s.source', 's."startedAt"', 'p."createdAt"')}
                LIMIT 1),
              'direct'
            ) AS src
          FROM payments p
          WHERE p.status = 'paid'
            AND p."createdAt" BETWEEN $1 AND $2
            ${siteFilter}
        ) t
        GROUP BY 1
        ORDER BY revenue_cents DESC
        `,
        params,
      );
    return rows.map((r) => ({
      source: r.source,
      paidCount: Number(r.paid_count),
      revenueCents: Number(r.revenue_cents),
    }));
  }

  /**
   * Venit defalcat pe CAMPANIE (utm_campaign), nu doar pe sursă. Folosește aceeași
   * punte de atribuire (user/guest/IP, last non-direct touch), dar reține și
   * `campaign` din sesiunea care a atribuit plata. Numele de campanie vin uneori
   * URL-encoded (`C1+%E2%80%94+DIASPORA`) → le decodăm și le re-agregăm în JS ca
   * să nu se dubleze rândurile.
   */
  async revenueByCampaign(range: RangeQuery, siteId: string | null = null) {
    const params: unknown[] = [range.from.toISOString(), range.to.toISOString()];
    let siteFilter = '';
    if (siteId) {
      params.push(siteId);
      siteFilter = `AND p."siteId" = $${params.length}::uuid`;
    }
    const matches = `(
      (s."userId" IS NOT NULL AND s."userId" = p."userId")
      OR (s."guestId" IS NOT NULL AND s."guestId" = p."guestId")
      OR (p."ipAddress" IS NOT NULL AND s.ip IS NOT NULL AND s.ip = p."ipAddress")
    )`;
    const rows: Array<{ source: string | null; campaign: string | null; paid_count: string; revenue_cents: string }> =
      await this.payments.query(
        `
        SELECT a.norm_source AS source, a.campaign AS campaign,
          COUNT(*)::int AS paid_count, COALESCE(SUM(p.amount), 0)::bigint AS revenue_cents
        FROM payments p
        LEFT JOIN LATERAL (
          SELECT
            ${normalizeSourceSql('s.source')} AS norm_source,
            -- Când utm_campaign e un ID Meta numeric, îl traducem în numele real
            -- din ad_spend (tras din Marketing API). Altfel păstrăm numele brut.
            COALESCE(
              (SELECT sp."campaignName" FROM ad_spend sp
                 WHERE sp."campaignId" = s.campaign AND sp."campaignName" IS NOT NULL
                 LIMIT 1),
              s.campaign
            ) AS campaign
          FROM analytics_sessions s
          WHERE ${matches}
            AND s."siteId" = p."siteId"
            AND s."startedAt" <= p."createdAt"
            AND s."startedAt" >= p."createdAt" - INTERVAL '60 days'
            AND s.source IS NOT NULL
            AND s.source NOT ILIKE 'stripe%' AND s.source NOT ILIKE 'checkout.stripe%'
          ORDER BY ${attributionOrderBySql('s.source', 's."startedAt"', 'p."createdAt"')}
          LIMIT 1
        ) a ON true
        WHERE p.status = 'paid'
          AND p."createdAt" BETWEEN $1 AND $2
          ${siteFilter}
        GROUP BY a.norm_source, a.campaign
        ORDER BY revenue_cents DESC
        `,
        params,
      );

    // Decode + re-agregare în JS: encoded și decoded sunt rânduri SQL diferite.
    const decodeCampaign = (c: string | null): string => {
      if (!c) return '';
      try {
        return decodeURIComponent(c.replace(/\+/g, ' ')).trim();
      } catch {
        return c.replace(/\+/g, ' ').trim();
      }
    };
    const merged = new Map<string, { source: string; campaign: string; paidCount: number; revenueCents: number }>();
    for (const r of rows) {
      const source = r.source ?? 'direct';
      const campaign = decodeCampaign(r.campaign);
      const key = `${source}|${campaign}`;
      const prev = merged.get(key) ?? { source, campaign, paidCount: 0, revenueCents: 0 };
      prev.paidCount += Number(r.paid_count);
      prev.revenueCents += Number(r.revenue_cents);
      merged.set(key, prev);
    }
    return Array.from(merged.values()).sort((a, b) => b.revenueCents - a.revenueCents);
  }

  async topPages(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const rows = await this.applySite(
      this.events
        .createQueryBuilder('e')
        .select(`COALESCE(e.path, '/')`, 'path')
        .addSelect('COUNT(*)::int', 'views')
        .addSelect('COUNT(DISTINCT e.sessionKey)::int', 'uniqueSessions')
        .where(`e.type = 'page_view'`)
        .andWhere('e.createdAt BETWEEN :from AND :to', r),
      'e',
      siteId,
    )
      .groupBy('path')
      .orderBy('views', 'DESC')
      .limit(20)
      .getRawMany<{ path: string; views: number; uniqueSessions: number }>();
    return rows.map((r) => ({ path: r.path, views: Number(r.views), uniqueSessions: Number(r.uniqueSessions) }));
  }

  async devices(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const rows = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select(`COALESCE(s.device, 'unknown')`, 'device')
        .addSelect('COUNT(*)::int', 'sessions')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    )
      .groupBy('device')
      .orderBy('sessions', 'DESC')
      .getRawMany<{ device: string; sessions: number }>();
    return rows.map((r) => ({ device: r.device, sessions: Number(r.sessions) }));
  }

  /**
   * Engagement pe piesa livrată: câți useri apasă pe play / download / share /
   * download poză pe pagina /m/[id]. `count` = total click-uri, `uniqueSessions`
   * = persoane distincte. Pentru share, defalcăm și pe canal (props.channel:
   * native/facebook/whatsapp/twitter/copy_link).
   */
  async engagement(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const TYPES = ['song_play', 'song_download', 'song_share', 'image_download'];
    const rows = await this.applySite(
      this.events
        .createQueryBuilder('e')
        .select('e.type', 'type')
        .addSelect('COUNT(*)::int', 'count')
        .addSelect('COUNT(DISTINCT e.sessionKey)::int', 'uniqueSessions')
        .where('e.type IN (:...types)', { types: TYPES })
        .andWhere('e.createdAt BETWEEN :from AND :to', r),
      'e',
      siteId,
    )
      .groupBy('e.type')
      .getRawMany<{ type: string; count: number; uniqueSessions: number }>();

    const shareRows = await this.applySite(
      this.events
        .createQueryBuilder('e')
        .select(`COALESCE(e.props->>'channel', 'other')`, 'channel')
        .addSelect('COUNT(*)::int', 'count')
        .where(`e.type = 'song_share'`)
        .andWhere('e.createdAt BETWEEN :from AND :to', r),
      'e',
      siteId,
    )
      .groupBy('channel')
      .orderBy('count', 'DESC')
      .getRawMany<{ channel: string; count: number }>();

    const byType = new Map(rows.map((x) => [x.type, x]));
    const order = ['song_play', 'song_download', 'song_share', 'image_download'];
    return {
      events: order.map((type) => ({
        type,
        count: Number(byType.get(type)?.count ?? 0),
        uniqueSessions: Number(byType.get(type)?.uniqueSessions ?? 0),
      })),
      shareChannels: shareRows.map((x) => ({ channel: x.channel, count: Number(x.count) })),
    };
  }

  async userCohorts(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const newUsersQb = this.users
      .createQueryBuilder('u')
      .select(`date_trunc('day', u.createdAt)`, 'bucket')
      .addSelect('COUNT(*)::int', 'count')
      .where('u.createdAt BETWEEN :from AND :to', r);
    if (siteId) newUsersQb.andWhere('u."siteId" = :siteId', { siteId });
    const newUsers = await newUsersQb.groupBy('bucket').orderBy('bucket', 'ASC').getRawMany<{ bucket: Date; count: number }>();

    const returningRow = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select('COUNT(DISTINCT s.userId)::int', 'returning')
        .where('s.userId IS NOT NULL')
        .andWhere('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    ).getRawOne<{ returning: number }>();

    const totalUsers = await this.users.count(siteId ? { where: { siteId } } : {});

    return {
      newUsersTimeSeries: newUsers,
      returningUsers: returningRow?.returning ?? 0,
      totalUsers,
    };
  }

  // ============== MARKETING DASHBOARD (plăți × trafic × conversie) ==============

  /**
   * SQL pentru suma plății normalizată în bani (cents) RON, indiferent de valuta
   * site-ului. Prioritate: amountRonCents (setat la webhook din balance_transaction)
   * → amount dacă RON → amount × cursul Stripe → fallback EUR≈4.97. Alias `p`.
   */
  private static readonly AMOUNT_RON = `
    CASE
      WHEN p."amountRonCents" IS NOT NULL THEN p."amountRonCents"
      WHEN upper(p.currency) = 'RON' THEN p.amount
      WHEN p."exchangeRateToRon" IS NOT NULL THEN round(p.amount * p."exchangeRateToRon")::int
      ELSE round(p.amount * 4.97)::int
    END`;

  /** Conversie UTC→ora locală RO pentru bucketing temporal corect. Alias dat de caller. */
  private localTs(col: string): string {
    return `((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Bucharest')`;
  }

  /**
   * Filtru SQL care exclude comenzile de test interne (emailul owner-ului sau
   * adrese @manelecadou.ro). Necesită un `LEFT JOIN guest_sessions gst ON gst.id =
   * p."guestId"` în query. Null-safe (COALESCE la ''). Alias plată = `p`.
   */
  private testFilter(excludeTests: boolean): string {
    if (!excludeTests) return '';
    const e = `COALESCE(lower(COALESCE(p."customerEmail", gst.email)),'')`;
    return `AND ${e} NOT LIKE 'serban2702%' AND ${e} NOT LIKE '%@manelecadou.ro'`;
  }

  /**
   * Sumar marketing: trafic (sesiuni ne-bot), plăți inițiate/finalizate/eșuate/
   * abandonate, revenue RON, AOV, rate de conversie + funnel + trend vs perioada
   * anterioară. Baza dashboard-ului din admin `/analytics` tab Marketing.
   */
  async marketingSummary(
    range: RangeQuery,
    siteId: string | null = null,
    opts: { excludeBots?: boolean; excludeTests?: boolean } = {},
  ) {
    const excludeBots = opts.excludeBots !== false;
    const excludeTests = opts.excludeTests !== false;
    const r = this.fmtRange(range);

    const traffic = await this.marketingTraffic(range, siteId, excludeBots);
    const pay = await this.marketingPayments(range, siteId, excludeTests);

    // Câți au început formularul (indicativ — eveniment sub-raportat istoric, nu-l
    // punem în funnel ca să nu rupem monotonia, dar îl expunem separat).
    const formStartRow = await this.applySite(
      this.events
        .createQueryBuilder('e')
        .select('COUNT(DISTINCT e.sessionKey)::int', 'n')
        .where(`e.type IN ('form_start','generation_start')`)
        .andWhere('e.createdAt BETWEEN :from AND :to', r),
      'e',
      siteId,
    ).getRawOne<{ n: number }>();

    // Perioada anterioară (același span) pentru trend.
    const span = range.to.getTime() - range.from.getTime();
    const prevRange: RangeQuery = {
      from: new Date(range.from.getTime() - span),
      to: new Date(range.from.getTime() - 1),
    };
    const prevTraffic = await this.marketingTraffic(prevRange, siteId, excludeBots);
    const prevPay = await this.marketingPayments(prevRange, siteId, excludeTests);

    const sessions = traffic.sessions;
    const visitorConv = sessions > 0 ? Math.round((pay.purchases / sessions) * 10000) / 100 : 0;
    const checkoutConv = pay.initiated > 0 ? Math.round((pay.purchases / pay.initiated) * 10000) / 100 : 0;
    const aov = pay.purchases > 0 ? Math.round(pay.revenue / pay.purchases) : 0;

    const prevVisitorConv =
      prevTraffic.sessions > 0 ? (prevPay.purchases / prevTraffic.sessions) * 100 : 0;

    return {
      range: r,
      // trafic
      sessions,
      visitors: traffic.visitors,
      pageViews: traffic.pageViews,
      bounceRate: traffic.bounceRate,
      avgSessionSec: traffic.avgSessionSec,
      botSessions: traffic.botSessions,
      // plăți
      checkoutsInitiated: pay.initiated,
      purchases: pay.purchases,
      failed: pay.failed,
      abandoned: pay.abandoned,
      revenueRon: pay.revenue,
      aov,
      // conversie
      visitorConv,
      checkoutConv,
      buyerGenderCoverage:
        pay.purchases > 0 ? Math.round((pay.genderKnown / pay.purchases) * 1000) / 10 : 0,
      formStarts: formStartRow?.n ?? 0,
      // Funnel monoton: vizitatori → checkout inițiat → plată finalizată.
      funnel: [
        { step: 'visitors', count: sessions },
        { step: 'checkout_init', count: pay.initiated },
        { step: 'purchase', count: pay.purchases },
      ],
      previous: {
        sessions: prevTraffic.sessions,
        visitors: prevTraffic.visitors,
        purchases: prevPay.purchases,
        revenueRon: prevPay.revenue,
        visitorConv: Math.round(prevVisitorConv * 100) / 100,
      },
    };
  }

  /** Agregat trafic (sesiuni) pentru un range. excludeBots filtrează `isBot`. */
  private async marketingTraffic(range: RangeQuery, siteId: string | null, excludeBots: boolean) {
    const params: unknown[] = [range.from.toISOString(), range.to.toISOString()];
    let site = '';
    if (siteId) {
      params.push(siteId);
      site = `AND s."siteId" = $${params.length}::uuid`;
    }
    const bot = excludeBots ? `AND s."isBot" = false` : '';
    const row = (
      await this.sessions.query(
        `SELECT
           COUNT(*)::int AS sessions,
           COUNT(DISTINCT s."visitorId")::int AS visitors,
           COALESCE(SUM(s."pageViews"),0)::int AS page_views,
           COALESCE(AVG(s."durationSec"),0)::float AS avg_dur,
           COALESCE(AVG(CASE WHEN s.bounced THEN 1 ELSE 0 END)*100,0)::float AS bounce,
           COUNT(*) FILTER (WHERE s."isBot" = true)::int AS bots
         FROM analytics_sessions s
         WHERE s."startedAt" BETWEEN $1 AND $2 ${site} ${bot}`,
        params,
      )
    )[0] as {
      sessions: number; visitors: number; page_views: number; avg_dur: number; bounce: number; bots: number;
    };
    // botSessions trebuie numărat indiferent de filtru — refacem doar dacă a fost exclus.
    let botSessions = Number(row?.bots ?? 0);
    if (excludeBots) {
      const bParams: unknown[] = [range.from.toISOString(), range.to.toISOString()];
      let bSite = '';
      if (siteId) {
        bParams.push(siteId);
        bSite = `AND s."siteId" = $${bParams.length}::uuid`;
      }
      const b = (
        await this.sessions.query(
          `SELECT COUNT(*) FILTER (WHERE s."isBot" = true)::int AS bots
           FROM analytics_sessions s WHERE s."startedAt" BETWEEN $1 AND $2 ${bSite}`,
          bParams,
        )
      )[0] as { bots: number };
      botSessions = Number(b?.bots ?? 0);
    }
    return {
      sessions: Number(row?.sessions ?? 0),
      visitors: Number(row?.visitors ?? 0),
      pageViews: Number(row?.page_views ?? 0),
      avgSessionSec: Math.round((row?.avg_dur ?? 0) * 10) / 10,
      bounceRate: Math.round((row?.bounce ?? 0) * 10) / 10,
      botSessions,
    };
  }

  /** Agregat plăți pentru un range (toate statusurile, revenue normalizat RON). */
  private async marketingPayments(range: RangeQuery, siteId: string | null, excludeTests = true) {
    const params: unknown[] = [range.from.toISOString(), range.to.toISOString()];
    let site = '';
    if (siteId) {
      params.push(siteId);
      site = `AND p."siteId" = $${params.length}::uuid`;
    }
    const row = (
      await this.payments.query(
        `SELECT
           COUNT(*)::int AS initiated,
           COUNT(*) FILTER (WHERE p.status='paid')::int AS purchases,
           COUNT(*) FILTER (WHERE p.status='failed')::int AS failed,
           COUNT(*) FILTER (WHERE p.status='pending')::int AS abandoned,
           COALESCE(SUM(${AnalyticsService.AMOUNT_RON}) FILTER (WHERE p.status='paid'),0)::int AS revenue,
           COUNT(*) FILTER (WHERE p.status='paid' AND p."buyerGender" IS NOT NULL)::int AS gender_known
         FROM payments p
         LEFT JOIN guest_sessions gst ON gst.id = p."guestId"
         WHERE p."createdAt" BETWEEN $1 AND $2 ${site} ${this.testFilter(excludeTests)}`,
        params,
      )
    )[0] as {
      initiated: number; purchases: number; failed: number; abandoned: number; revenue: number; gender_known: number;
    };
    return {
      initiated: Number(row?.initiated ?? 0),
      purchases: Number(row?.purchases ?? 0),
      failed: Number(row?.failed ?? 0),
      abandoned: Number(row?.abandoned ?? 0),
      revenue: Number(row?.revenue ?? 0),
      genderKnown: Number(row?.gender_known ?? 0),
    };
  }

  /**
   * Defalcare matrice: o dimensiune (rânduri) × metrici (coloane). Inima
   * dashboard-ului. Trei familii de dimensiuni:
   *  - trafic atribuit (source/medium/campaign/device/os/browser/country/landing):
   *    sesiuni din analytics_sessions + plăți atribuite prin sessionKey→visitorId→IP+timp;
   *  - temporale (day/hour/dow): sesiuni pe startedAt, plăți pe createdAt (fără atribuire);
   *  - comandă (package/occasion/voiceGender/buyerGender): doar plăți/generări.
   */
  async marketingBreakdown(
    range: RangeQuery,
    dimension: string,
    siteId: string | null = null,
    opts: { excludeBots?: boolean; excludeTests?: boolean } = {},
  ): Promise<{ dimension: string; hasTraffic: boolean; rows: MarketingBreakdownRow[] }> {
    const excludeBots = opts.excludeBots !== false;
    const excludeTests = opts.excludeTests !== false;
    const TRAFFIC: Record<string, { sess: string; att: string }> = {
      source: { sess: normalizeSourceSql('s.source'), att: normalizeSourceSql('att.source') },
      medium: { sess: `COALESCE(NULLIF(s.medium,''),'(none)')`, att: `COALESCE(NULLIF(att.medium,''),'(none)')` },
      campaign: { sess: `COALESCE(NULLIF(s.campaign,''),'(none)')`, att: `COALESCE(NULLIF(att.campaign,''),'(none)')` },
      device: { sess: `COALESCE(NULLIF(s.device,''),'unknown')`, att: `COALESCE(NULLIF(att.device,''),'unknown')` },
      os: { sess: `COALESCE(NULLIF(s."osName",''),'unknown')`, att: `COALESCE(NULLIF(att.os,''),'unknown')` },
      browser: { sess: `COALESCE(NULLIF(s."browserName",''),'unknown')`, att: `COALESCE(NULLIF(att.browser,''),'unknown')` },
      country: { sess: `COALESCE(NULLIF(s.country,''),'??')`, att: `COALESCE(NULLIF(att.country,''),'??')` },
      landing: { sess: `COALESCE(NULLIF(s."landingPath",''),'/')`, att: `COALESCE(NULLIF(att.landing,''),'/')` },
    };

    if (TRAFFIC[dimension]) {
      return { dimension, hasTraffic: true, rows: await this.breakdownTraffic(range, dimension, TRAFFIC[dimension], siteId, excludeBots, excludeTests) };
    }
    if (dimension === 'day' || dimension === 'hour' || dimension === 'dow') {
      return { dimension, hasTraffic: true, rows: await this.breakdownTemporal(range, dimension, siteId, excludeBots, excludeTests) };
    }
    if (dimension === 'buyerGender') {
      return { dimension, hasTraffic: false, rows: await this.breakdownBuyerGender(range, siteId, excludeTests) };
    }
    if (dimension === 'package' || dimension === 'occasion' || dimension === 'voiceGender') {
      return { dimension, hasTraffic: false, rows: await this.breakdownGeneration(range, dimension, siteId, excludeTests) };
    }
    throw new BadRequestException(`Dimensiune necunoscută: ${dimension}`);
  }

  private finalizeRows(
    rows: MarketingBreakdownRow[],
    hasTraffic: boolean,
  ): MarketingBreakdownRow[] {
    for (const r of rows) {
      r.aov = r.purchases > 0 ? Math.round(r.revenueRon / r.purchases) : null;
      r.checkoutConv = r.initiated > 0 ? Math.round((r.purchases / r.initiated) * 10000) / 100 : null;
      r.visitorConv =
        hasTraffic && r.sessions != null && r.sessions > 0
          ? Math.round((r.purchases / r.sessions) * 10000) / 100
          : null;
    }
    // Sortare implicită: revenue desc, apoi inițieri desc, apoi sesiuni desc.
    return rows.sort(
      (a, b) =>
        b.revenueRon - a.revenueRon ||
        b.initiated - a.initiated ||
        (b.sessions ?? 0) - (a.sessions ?? 0),
    );
  }

  private async breakdownTraffic(
    range: RangeQuery,
    dim: string,
    cfg: { sess: string; att: string },
    siteId: string | null,
    excludeBots: boolean,
    excludeTests = true,
  ): Promise<MarketingBreakdownRow[]> {
    // 1. Plăți atribuite la sesiunea responsabilă (last non-direct touch).
    const pParams: unknown[] = [range.from.toISOString(), range.to.toISOString()];
    let pSite = '';
    if (siteId) {
      pParams.push(siteId);
      pSite = `AND p."siteId" = $${pParams.length}::uuid`;
    }
    const payRows = (await this.payments.query(
      `WITH paid AS (
         SELECT p.id, p.status, p."createdAt", p."userId", p."guestId", p."ipAddress",
                p."sessionKey" AS p_skey, p."visitorId" AS p_vid,
                (${AnalyticsService.AMOUNT_RON}) AS amount_ron
         FROM payments p
         LEFT JOIN guest_sessions gst ON gst.id = p."guestId"
         WHERE p."createdAt" BETWEEN $1 AND $2 ${pSite} ${this.testFilter(excludeTests)}
       ),
       att AS (
         SELECT paid.*, s.source, s.medium, s.campaign, s.device,
                s."osName" AS os, s."browserName" AS browser, s.country, s."landingPath" AS landing
         FROM paid
         LEFT JOIN LATERAL (
           SELECT s2.* FROM analytics_sessions s2
           WHERE (paid.p_skey IS NOT NULL AND s2."sessionKey" = paid.p_skey)
              OR (paid.p_vid IS NOT NULL AND s2."visitorId" = paid.p_vid)
              OR (paid."ipAddress" IS NOT NULL AND s2.ip = paid."ipAddress"
                  AND s2."startedAt" <= paid."createdAt" + INTERVAL '2 hours'
                  AND s2."startedAt" >= paid."createdAt" - INTERVAL '24 hours')
           ORDER BY
             CASE WHEN paid.p_skey IS NOT NULL AND s2."sessionKey" = paid.p_skey THEN 0
                  WHEN paid.p_vid IS NOT NULL AND s2."visitorId" = paid.p_vid THEN 1
                  ELSE 2 END,
             CASE WHEN COALESCE(s2.source,'') NOT IN ('','direct')
                       AND s2.source NOT LIKE '%stripe%' THEN 0 ELSE 1 END,
             s2."startedAt" DESC
           LIMIT 1
         ) s ON TRUE
       )
       SELECT ${cfg.att} AS key,
              COUNT(*)::int AS initiated,
              COUNT(*) FILTER (WHERE status='paid')::int AS purchases,
              COUNT(*) FILTER (WHERE status='failed')::int AS failed,
              COALESCE(SUM(amount_ron) FILTER (WHERE status='paid'),0)::int AS revenue
       FROM att GROUP BY key`,
      pParams,
    )) as Array<{ key: string; initiated: number; purchases: number; failed: number; revenue: number }>;

    // 2. Sesiuni pe aceeași dimensiune.
    const sParams: unknown[] = [range.from.toISOString(), range.to.toISOString()];
    let sSite = '';
    if (siteId) {
      sParams.push(siteId);
      sSite = `AND s."siteId" = $${sParams.length}::uuid`;
    }
    const bot = excludeBots ? `AND s."isBot" = false` : '';
    const sessRows = (await this.sessions.query(
      `SELECT ${cfg.sess} AS key,
              COUNT(*)::int AS sessions,
              COUNT(DISTINCT s."visitorId")::int AS visitors,
              COALESCE(SUM(s."pageViews"),0)::int AS page_views
       FROM analytics_sessions s
       WHERE s."startedAt" BETWEEN $1 AND $2 ${sSite} ${bot}
       GROUP BY key`,
      sParams,
    )) as Array<{ key: string; sessions: number; visitors: number; page_views: number }>;

    const map = new Map<string, MarketingBreakdownRow>();
    for (const s of sessRows) {
      map.set(s.key, {
        key: s.key, label: s.key,
        sessions: Number(s.sessions), visitors: Number(s.visitors), pageViews: Number(s.page_views),
        initiated: 0, purchases: 0, failed: 0, revenueRon: 0,
        aov: null, visitorConv: null, checkoutConv: null,
      });
    }
    for (const p of payRows) {
      const ex = map.get(p.key);
      if (ex) {
        ex.initiated = Number(p.initiated); ex.purchases = Number(p.purchases);
        ex.failed = Number(p.failed); ex.revenueRon = Number(p.revenue);
      } else {
        map.set(p.key, {
          key: p.key, label: p.key,
          sessions: 0, visitors: 0, pageViews: 0,
          initiated: Number(p.initiated), purchases: Number(p.purchases),
          failed: Number(p.failed), revenueRon: Number(p.revenue),
          aov: null, visitorConv: null, checkoutConv: null,
        });
      }
    }
    return this.finalizeRows(Array.from(map.values()), true);
  }

  private async breakdownTemporal(
    range: RangeQuery,
    dim: 'day' | 'hour' | 'dow',
    siteId: string | null,
    excludeBots: boolean,
    excludeTests = true,
  ): Promise<MarketingBreakdownRow[]> {
    const DOW_RO = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
    const keyExpr = (col: string) =>
      dim === 'day'
        ? `to_char(${this.localTs(col)},'YYYY-MM-DD')`
        : dim === 'hour'
          ? `lpad(extract(hour FROM ${this.localTs(col)})::text,2,'0')`
          : `extract(isodow FROM ${this.localTs(col)})::int::text`;

    const sParams: unknown[] = [range.from.toISOString(), range.to.toISOString()];
    let sSite = '';
    if (siteId) {
      sParams.push(siteId);
      sSite = `AND s."siteId" = $${sParams.length}::uuid`;
    }
    const bot = excludeBots ? `AND s."isBot" = false` : '';
    const sessRows = (await this.sessions.query(
      `SELECT ${keyExpr('s."startedAt"')} AS key,
              COUNT(*)::int AS sessions, COUNT(DISTINCT s."visitorId")::int AS visitors,
              COALESCE(SUM(s."pageViews"),0)::int AS page_views
       FROM analytics_sessions s
       WHERE s."startedAt" BETWEEN $1 AND $2 ${sSite} ${bot}
       GROUP BY key`,
      sParams,
    )) as Array<{ key: string; sessions: number; visitors: number; page_views: number }>;

    const pParams: unknown[] = [range.from.toISOString(), range.to.toISOString()];
    let pSite = '';
    if (siteId) {
      pParams.push(siteId);
      pSite = `AND p."siteId" = $${pParams.length}::uuid`;
    }
    const payRows = (await this.payments.query(
      `SELECT ${keyExpr('p."createdAt"')} AS key,
              COUNT(*)::int AS initiated,
              COUNT(*) FILTER (WHERE p.status='paid')::int AS purchases,
              COUNT(*) FILTER (WHERE p.status='failed')::int AS failed,
              COALESCE(SUM(${AnalyticsService.AMOUNT_RON}) FILTER (WHERE p.status='paid'),0)::int AS revenue
       FROM payments p
       LEFT JOIN guest_sessions gst ON gst.id = p."guestId"
       WHERE p."createdAt" BETWEEN $1 AND $2 ${pSite} ${this.testFilter(excludeTests)}
       GROUP BY key`,
      pParams,
    )) as Array<{ key: string; initiated: number; purchases: number; failed: number; revenue: number }>;

    const map = new Map<string, MarketingBreakdownRow>();
    const ensure = (key: string) => {
      let row = map.get(key);
      if (!row) {
        row = {
          key, label: key, sessions: 0, visitors: 0, pageViews: 0,
          initiated: 0, purchases: 0, failed: 0, revenueRon: 0,
          aov: null, visitorConv: null, checkoutConv: null,
        };
        map.set(key, row);
      }
      return row;
    };
    for (const s of sessRows) {
      const row = ensure(s.key);
      row.sessions = Number(s.sessions); row.visitors = Number(s.visitors); row.pageViews = Number(s.page_views);
    }
    for (const p of payRows) {
      const row = ensure(p.key);
      row.initiated = Number(p.initiated); row.purchases = Number(p.purchases);
      row.failed = Number(p.failed); row.revenueRon = Number(p.revenue);
    }

    const rows = Array.from(map.values());
    for (const r of rows) {
      r.aov = r.purchases > 0 ? Math.round(r.revenueRon / r.purchases) : null;
      r.checkoutConv = r.initiated > 0 ? Math.round((r.purchases / r.initiated) * 10000) / 100 : null;
      r.visitorConv = r.sessions && r.sessions > 0 ? Math.round((r.purchases / r.sessions) * 10000) / 100 : null;
      if (dim === 'dow') {
        r.label = DOW_RO[Number(r.key) % 7] ?? r.key;
      } else if (dim === 'hour') {
        const h = Number(r.key);
        r.label = `${String(h).padStart(2, '0')}:00 – ${String((h + 1) % 24).padStart(2, '0')}:00`;
      }
    }
    // Temporal = sortare cronologică (nu pe revenue).
    return rows.sort((a, b) => a.key.localeCompare(b.key));
  }

  private async breakdownBuyerGender(range: RangeQuery, siteId: string | null, excludeTests = true): Promise<MarketingBreakdownRow[]> {
    const params: unknown[] = [range.from.toISOString(), range.to.toISOString()];
    let site = '';
    if (siteId) {
      params.push(siteId);
      site = `AND p."siteId" = $${params.length}::uuid`;
    }
    const rows = (await this.payments.query(
      `SELECT COALESCE(p."buyerGender",'?') AS key,
              COUNT(*)::int AS initiated,
              COUNT(*) FILTER (WHERE p.status='paid')::int AS purchases,
              COUNT(*) FILTER (WHERE p.status='failed')::int AS failed,
              COALESCE(SUM(${AnalyticsService.AMOUNT_RON}) FILTER (WHERE p.status='paid'),0)::int AS revenue
       FROM payments p
       LEFT JOIN guest_sessions gst ON gst.id = p."guestId"
       WHERE p."createdAt" BETWEEN $1 AND $2 ${site} ${this.testFilter(excludeTests)}
       GROUP BY key`,
      params,
    )) as Array<{ key: string; initiated: number; purchases: number; failed: number; revenue: number }>;
    const LABEL: Record<string, string> = { M: 'Bărbat', F: 'Femeie', '?': 'Necunoscut' };
    return this.finalizeRows(
      rows.map((r) => ({
        key: r.key, label: LABEL[r.key] ?? r.key,
        sessions: null, visitors: null, pageViews: null,
        initiated: Number(r.initiated), purchases: Number(r.purchases),
        failed: Number(r.failed), revenueRon: Number(r.revenue),
        aov: null, visitorConv: null, checkoutConv: null,
      })),
      false,
    );
  }

  private async breakdownGeneration(
    range: RangeQuery,
    dim: 'package' | 'occasion' | 'voiceGender',
    siteId: string | null,
    excludeTests = true,
  ): Promise<MarketingBreakdownRow[]> {
    const keyExpr =
      dim === 'package'
        ? `COALESCE(NULLIF(g."packageTier",''),'basic')`
        : dim === 'occasion'
          ? `COALESCE(NULLIF(g.occasion,''),'(necunoscut)')`
          : `CASE
               WHEN lower(g."voiceArtist") IN ('female','f','mariana','adita','elena','maria','ana','adriana','irina') THEN 'Voce feminină'
               WHEN lower(g."voiceArtist") IN ('male','m','florinel','ticu','gigi','nicu','adi','stavros','nicolae') THEN 'Voce masculină'
               WHEN g."voiceArtist" IS NULL OR g."voiceArtist"='' THEN 'Nespecificat'
               ELSE 'Altă voce'
             END`;
    const params: unknown[] = [range.from.toISOString(), range.to.toISOString()];
    let site = '';
    if (siteId) {
      params.push(siteId);
      site = `AND g."siteId" = $${params.length}::uuid`;
    }
    const rows = (await this.generations.query(
      `SELECT ${keyExpr} AS key,
              COUNT(*)::int AS initiated,
              COUNT(*) FILTER (WHERE p.status='paid')::int AS purchases,
              COUNT(*) FILTER (WHERE p.status='failed')::int AS failed,
              COALESCE(SUM(${AnalyticsService.AMOUNT_RON}) FILTER (WHERE p.status='paid'),0)::int AS revenue
       FROM generations g
       LEFT JOIN payments p ON p.id = g."paymentId"
       LEFT JOIN guest_sessions gst ON gst.id = p."guestId"
       WHERE g."createdAt" BETWEEN $1 AND $2 ${site} ${this.testFilter(excludeTests)}
       GROUP BY key`,
      params,
    )) as Array<{ key: string; initiated: number; purchases: number; failed: number; revenue: number }>;
    return this.finalizeRows(
      rows.map((r) => ({
        key: r.key, label: r.key,
        sessions: null, visitors: null, pageViews: null,
        initiated: Number(r.initiated), purchases: Number(r.purchases),
        failed: Number(r.failed), revenueRon: Number(r.revenue),
        aov: null, visitorConv: null, checkoutConv: null,
      })),
      false,
    );
  }

  /**
   * Backfill nume + email cumpărător din Stripe pentru plăți istorice (înainte ca
   * webhook-ul să le persiste). Iterează plățile cu `providerSessionId` (cs_…) fără
   * `customerName`, face retrieve la Checkout Session și inferează genul. Idempotent
   * — rulabil în loturi. Returnează un sumar.
   */
  async backfillBuyerNames(limit = 200): Promise<{
    scanned: number; updated: number; genderInferred: number; skipped: number; errors: number;
  }> {
    const stripe = await this.getStripe();
    if (!stripe) throw new BadRequestException('Stripe nu e configurat (STRIPE_SECRET_KEY lipsă)');

    const candidates = await this.payments
      .createQueryBuilder('p')
      .where(`p."providerSessionId" LIKE 'cs_%'`)
      .andWhere('p."customerName" IS NULL')
      .orderBy('p."createdAt"', 'DESC')
      .limit(Math.min(500, Math.max(1, limit)))
      .getMany();

    let updated = 0;
    let genderInferred = 0;
    let skipped = 0;
    let errors = 0;
    for (const p of candidates) {
      if (!p.providerSessionId) { skipped++; continue; }
      try {
        const session = await stripe.checkout.sessions.retrieve(p.providerSessionId, {
          expand: ['customer_details'],
        });
        const name = (session.customer_details?.name ?? '').trim() || null;
        const email = (session.customer_details?.email ?? '').trim() || null;
        if (!name && !email) { skipped++; continue; }
        const gender = name ? inferGenderFromName(name) : null;
        await this.payments.update(
          { id: p.id },
          {
            customerName: name ? name.slice(0, 160) : null,
            customerEmail: email ? email.slice(0, 320) : null,
            buyerGender: gender,
          },
        );
        updated++;
        if (gender) genderInferred++;
      } catch (err) {
        errors++;
        this.logger.warn(`backfillBuyerNames ${p.id}: ${(err as Error).message}`);
      }
    }
    return { scanned: candidates.length, updated, genderInferred, skipped, errors };
  }

  /**
   * Completează `buyerGender` pe TOATE plățile fără gen, folosind toate sursele
   * despre cumpărător: numele Stripe → prefixul emailului (Stripe sau guest).
   * Emailurile interne/de test sunt sărite. Idempotent (atinge doar gen IS NULL),
   * 100% pe date locale (nu cheamă Stripe), deci rapid pe mii de rânduri.
   */
  async backfillBuyerGender(limit = 2000): Promise<{
    scanned: number; updated: number; byName: number; byEmail: number; skipped: number;
  }> {
    const rows = (await this.payments.query(
      `SELECT p.id, p."customerName" AS name,
              COALESCE(p."customerEmail", gs.email) AS email
       FROM payments p
       LEFT JOIN guest_sessions gs ON gs.id = p."guestId"
       WHERE p."buyerGender" IS NULL
       ORDER BY p."createdAt" DESC
       LIMIT $1`,
      [Math.min(10000, Math.max(1, limit))],
    )) as Array<{ id: string; name: string | null; email: string | null }>;

    let updated = 0;
    let byName = 0;
    let byEmail = 0;
    let skipped = 0;
    for (const r of rows) {
      const fromName = inferGenderFromName(r.name);
      const gender = fromName ?? inferGenderFromEmail(r.email);
      if (!gender) {
        skipped++;
        continue;
      }
      await this.payments.update({ id: r.id }, { buyerGender: gender });
      updated++;
      if (fromName) byName++;
      else byEmail++;
    }
    return { scanned: rows.length, updated, byName, byEmail, skipped };
  }

  // ============== EXTENDED BREAKDOWNS ==============

  async countries(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const rows = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select(`COALESCE(s.country, 'unknown')`, 'country')
        .addSelect(`COALESCE(MAX(s.countryName), '')`, 'countryName')
        .addSelect('COUNT(*)::int', 'sessions')
        .addSelect('COUNT(DISTINCT s.visitorId)::int', 'visitors')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    )
      .groupBy('country')
      .orderBy('sessions', 'DESC')
      .limit(20)
      .getRawMany<{ country: string; countryName: string; sessions: number; visitors: number }>();
    return rows.map((r) => ({ country: r.country, countryName: r.countryName || null, sessions: Number(r.sessions), visitors: Number(r.visitors) }));
  }

  async browsers(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const rows = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select(`COALESCE(s.browserName, 'unknown')`, 'browser')
        .addSelect('COUNT(*)::int', 'sessions')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    )
      .groupBy('browser')
      .orderBy('sessions', 'DESC')
      .limit(15)
      .getRawMany<{ browser: string; sessions: number }>();
    return rows.map((r) => ({ browser: r.browser, sessions: Number(r.sessions) }));
  }

  async os(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const rows = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select(`COALESCE(s.osName, 'unknown')`, 'os')
        .addSelect('COUNT(*)::int', 'sessions')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    )
      .groupBy('os')
      .orderBy('sessions', 'DESC')
      .limit(15)
      .getRawMany<{ os: string; sessions: number }>();
    return rows.map((r) => ({ os: r.os, sessions: Number(r.sessions) }));
  }

  async screens(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const rows = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select(
          `CASE
             WHEN s.viewportWidth IS NULL THEN 'unknown'
             WHEN s.viewportWidth < 480 THEN '<480'
             WHEN s.viewportWidth < 768 THEN '480-767'
             WHEN s.viewportWidth < 1024 THEN '768-1023'
             WHEN s.viewportWidth < 1440 THEN '1024-1439'
             WHEN s.viewportWidth < 1920 THEN '1440-1919'
             ELSE '1920+'
           END`,
          'bucket',
        )
        .addSelect('COUNT(*)::int', 'sessions')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    )
      .groupBy('bucket')
      .orderBy('sessions', 'DESC')
      .getRawMany<{ bucket: string; sessions: number }>();
    return rows.map((r) => ({ bucket: r.bucket, sessions: Number(r.sessions) }));
  }

  async languages(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const rows = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select(`COALESCE(s.language, 'unknown')`, 'language')
        .addSelect('COUNT(*)::int', 'sessions')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    )
      .groupBy('language')
      .orderBy('sessions', 'DESC')
      .limit(15)
      .getRawMany<{ language: string; sessions: number }>();
    return rows.map((r) => ({ language: r.language, sessions: Number(r.sessions) }));
  }

  async webVitals(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    // Web vitals events au props: { metric: 'LCP'|'FID'|'CLS'|..., value: number }
    const rows = await this.applySite(
      this.events
        .createQueryBuilder('e')
        .select(`e.props->>'metric'`, 'metric')
        .addSelect(`COUNT(*)::int`, 'samples')
        .addSelect(`AVG((e.props->>'value')::float)`, 'avg')
        .addSelect(`PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (e.props->>'value')::float)`, 'p75')
        .addSelect(`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (e.props->>'value')::float)`, 'p95')
        .where(`e.type = 'web_vital'`)
        .andWhere('e.createdAt BETWEEN :from AND :to', r)
        .andWhere(`e.props->>'metric' IS NOT NULL`)
        .andWhere(`e.props->>'value' IS NOT NULL`),
      'e',
      siteId,
    )
      .groupBy(`e.props->>'metric'`)
      .getRawMany<{ metric: string; samples: number; avg: number; p75: number; p95: number }>();
    return rows.map((r) => ({
      metric: r.metric,
      samples: Number(r.samples),
      avg: Math.round(Number(r.avg) * 100) / 100,
      p75: Math.round(Number(r.p75) * 100) / 100,
      p95: Math.round(Number(r.p95) * 100) / 100,
    }));
  }

  // ============== BOT STATS ==============

  async botStats(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const totalQb = this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select('COUNT(*)::int', 'total')
        .addSelect(`COUNT(*) FILTER (WHERE s."botScore" >= 70)::int`, 'bots')
        .addSelect(`COUNT(*) FILTER (WHERE s."botScore" >= 40 AND s."botScore" < 70)::int`, 'suspicious')
        .addSelect(`COUNT(*) FILTER (WHERE s."botScore" < 40)::int`, 'humans')
        .addSelect('COALESCE(AVG(s."botScore"), 0)::float', 'avgScore')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    );
    const totals = await totalQb.getRawOne<{
      total: number;
      bots: number;
      suspicious: number;
      humans: number;
      avgScore: number;
    }>();

    const byCategory = await this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .select('s.botCategory', 'category')
        .addSelect('COUNT(*)::int', 'sessions')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    )
      .groupBy('s.botCategory')
      .orderBy('sessions', 'DESC')
      .getRawMany<{ category: string; sessions: number }>();

    // Top bot rules — raw SQL pentru lateral join cu jsonb_array_elements
    const reasonsRows = await this.sessions
      .query<Array<{ rule: string; hits: string }>>(
        `SELECT elem->>'rule' AS rule, COUNT(*)::int AS hits
         FROM analytics_sessions s, jsonb_array_elements(s."botReasons") elem
         WHERE s."botReasons" IS NOT NULL
           AND s."startedAt" BETWEEN $1 AND $2
           AND ($3::uuid IS NULL OR s."siteId" = $3::uuid)
         GROUP BY rule
         ORDER BY hits DESC
         LIMIT 15`,
        [r.from, r.to, siteId],
      )
      .catch(() => [] as Array<{ rule: string; hits: string }>);

    const total = Number(totals?.total ?? 0);
    return {
      total,
      bots: Number(totals?.bots ?? 0),
      suspicious: Number(totals?.suspicious ?? 0),
      humans: Number(totals?.humans ?? 0),
      avgScore: Math.round((totals?.avgScore ?? 0) * 10) / 10,
      botRate: total > 0 ? Math.round((Number(totals?.bots ?? 0) / total) * 1000) / 10 : 0,
      byCategory: byCategory.map((c) => ({ category: c.category || 'human', sessions: Number(c.sessions) })),
      topRules: reasonsRows.map((r) => ({ rule: r.rule, hits: Number(r.hits) })),
    };
  }

  // ============== SESSIONS DRILL-DOWN ==============

  async recentSessions(
    range: RangeQuery,
    siteId: string | null,
    opts: { limit: number; offset: number; country?: string; browser?: string; device?: string; category?: string; excludeBots?: boolean },
  ) {
    const r = this.fmtRange(range);
    const qb = this.applySite(
      this.sessions
        .createQueryBuilder('s')
        .where('s.startedAt BETWEEN :from AND :to', r),
      's',
      siteId,
    );
    if (opts.country) qb.andWhere('s.country = :country', { country: opts.country });
    if (opts.browser) qb.andWhere('s.browserName = :browser', { browser: opts.browser });
    if (opts.device) qb.andWhere('s.device = :device', { device: opts.device });
    if (opts.category) qb.andWhere('s.botCategory = :cat', { cat: opts.category });
    if (opts.excludeBots) qb.andWhere('s.botScore < 70');

    const [items, total] = await qb
      .orderBy('s.startedAt', 'DESC')
      .skip(opts.offset)
      .take(opts.limit)
      .getManyAndCount();

    return {
      total,
      items: items.map((s) => ({
        sessionKey: s.sessionKey,
        visitorId: s.visitorId,
        userId: s.userId,
        guestId: s.guestId,
        startedAt: s.startedAt,
        lastActivityAt: s.lastActivityAt,
        durationSec: s.durationSec,
        pageViews: s.pageViews,
        events: s.events,
        bounced: s.bounced,
        source: s.source,
        medium: s.medium,
        campaign: s.campaign,
        referrer: s.referrer,
        landingPath: s.landingPath,
        exitPath: s.exitPath,
        device: s.device,
        deviceModel: s.deviceModel,
        browserName: s.browserName,
        browserVersion: s.browserVersion,
        osName: s.osName,
        osVersion: s.osVersion,
        isBot: s.isBot,
        ip: s.ip,
        country: s.country,
        countryName: s.countryName,
        region: s.region,
        city: s.city,
        isp: s.isp,
        language: s.language,
        timezone: s.timezone,
        viewportWidth: s.viewportWidth,
        viewportHeight: s.viewportHeight,
        screenWidth: s.screenWidth,
        screenHeight: s.screenHeight,
        connectionType: s.connectionType,
        consentGiven: s.consentGiven,
        doNotTrack: s.doNotTrack,
        botScore: s.botScore,
        botCategory: s.botCategory,
        botReasons: s.botReasons,
      })),
    };
  }

  async sessionDetail(sessionKey: string, siteId: string | null) {
    const session = await this.sessions.findOne({ where: { sessionKey } });
    if (!session) return null;
    if (siteId && session.siteId && session.siteId !== siteId) return null;
    const events = await this.events.find({
      where: { sessionKey },
      order: { createdAt: 'ASC' },
      take: 500,
    });
    return {
      session,
      events: events.map((e) => ({
        id: e.id,
        eventId: e.eventId,
        type: e.type,
        path: e.path,
        url: e.url,
        valueCents: e.valueCents,
        currency: e.currency,
        props: e.props,
        forwardStatus: e.forwardStatus,
        forwardError: e.forwardError,
        createdAt: e.createdAt,
      })),
    };
  }

  async paymentDetail(id: string, siteId: string | null) {
    const p = await this.payments.findOne({ where: { id } });
    if (!p) return null;
    if (siteId && p.siteId && p.siteId !== siteId) return null;

    let user: { id: string; email: string; name: string | null } | null = null;
    if (p.userId) {
      const u = await this.users.findOne({
        where: { id: p.userId },
        select: ['id', 'email', 'name'],
      });
      if (u) user = { id: u.id, email: u.email, name: u.name };
    }

    // Find related session via purchase events
    const purchaseEvent = await this.events.findOne({
      where: [
        { type: 'purchase_success', userId: p.userId ?? undefined },
        { type: 'purchase_init', userId: p.userId ?? undefined },
      ],
      order: { createdAt: 'DESC' },
    });
    let session: AnalyticsSession | null = null;
    if (purchaseEvent) {
      session = await this.sessions.findOne({ where: { sessionKey: purchaseEvent.sessionKey } });
    }

    return {
      payment: {
        id: p.id,
        siteId: p.siteId,
        userId: p.userId,
        guestId: p.guestId,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        provider: (p as unknown as { provider?: string }).provider ?? 'stripe',
        providerSessionId: p.providerSessionId,
        amountRonCents: (p as unknown as { amountRonCents?: number | null }).amountRonCents ?? null,
        exchangeRateToRon: (p as unknown as { exchangeRateToRon?: string | null }).exchangeRateToRon ?? null,
        failureReason: (p as unknown as { failureReason?: string | null }).failureReason ?? null,
        failureCode: (p as unknown as { failureCode?: string | null }).failureCode ?? null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      user,
      session: session
        ? {
            sessionKey: session.sessionKey,
            visitorId: session.visitorId,
            country: session.country,
            countryName: session.countryName,
            city: session.city,
            ip: session.ip,
            browserName: session.browserName,
            browserVersion: session.browserVersion,
            osName: session.osName,
            osVersion: session.osVersion,
            device: session.device,
            source: session.source,
            medium: session.medium,
            campaign: session.campaign,
            referrer: session.referrer,
            landingPath: session.landingPath,
          }
        : null,
      relatedEvent: purchaseEvent
        ? {
            type: purchaseEvent.type,
            createdAt: purchaseEvent.createdAt,
            props: purchaseEvent.props,
          }
        : null,
      generation: await (async () => {
        // Generarea legată direct prin paymentId (cel mai sigur link).
        const g = await this.generations.findOne({ where: { paymentId: p.id } });
        if (!g) return null;
        return {
          id: g.id,
          type: g.type,
          status: g.status,
          recipientName: g.recipientName,
          paidUnlocked: g.paidUnlocked,
          audioUrl: g.audioUrl,
          retryCount: g.retryCount ?? 0,
          nextRetryAt: g.nextRetryAt ? g.nextRetryAt.toISOString() : null,
          lastRetryAt: g.lastRetryAt ? g.lastRetryAt.toISOString() : null,
          providerJobId: g.providerJobId,
          createdAt: g.createdAt,
        };
      })(),
    };
  }

  // ============== STRIPE RECONCILIATION ==============

  async stripeReconciliation(range: RangeQuery, siteId: string | null = null): Promise<{
    configured: boolean;
    range: { from: string; to: string };
    summary: {
      stripePaid: number;
      stripeAmountCents: number;
      localPaid: number;
      localAmountCents: number;
      matched: number;
      missingInLocal: number;
      missingInStripe: number;
      amountMismatch: number;
    };
    rows: Array<{
      sessionId: string;
      stripeAmountCents: number | null;
      localAmountCents: number | null;
      currency: string;
      status: 'matched' | 'missing_local' | 'missing_stripe' | 'amount_mismatch';
      paidAt: string | null;
      localId: string | null;
    }>;
  }> {
    const stripe = await this.getStripe();
    if (!stripe) {
      return {
        configured: false,
        range: this.fmtRange(range),
        summary: {
          stripePaid: 0,
          stripeAmountCents: 0,
          localPaid: 0,
          localAmountCents: 0,
          matched: 0,
          missingInLocal: 0,
          missingInStripe: 0,
          amountMismatch: 0,
        },
        rows: [],
      };
    }

    const r = this.fmtRange(range);
    const fromTs = Math.floor(range.from.getTime() / 1000);
    const toTs = Math.floor(range.to.getTime() / 1000);

    // Pull all checkout sessions completed în interval (paginat).
    const stripeSessions: Stripe.Checkout.Session[] = [];
    let starting_after: string | undefined = undefined;
    let pages = 0;
    while (pages < 10) {
      const list = await stripe.checkout.sessions.list({
        limit: 100,
        created: { gte: fromTs, lte: toTs },
        starting_after,
      });
      stripeSessions.push(...list.data);
      if (!list.has_more || list.data.length === 0) break;
      starting_after = list.data[list.data.length - 1].id;
      pages += 1;
    }

    const localPayments = await this.applySite(
      this.payments
        .createQueryBuilder('p')
        .where('p.createdAt BETWEEN :from AND :to', r),
      'p',
      siteId,
    ).getMany();
    const localBySession = new Map(localPayments.filter((p) => p.providerSessionId).map((p) => [p.providerSessionId!, p]));

    type Row = {
      sessionId: string;
      stripeAmountCents: number | null;
      localAmountCents: number | null;
      currency: string;
      status: 'matched' | 'missing_local' | 'missing_stripe' | 'amount_mismatch';
      paidAt: string | null;
      localId: string | null;
    };
    const rows: Row[] = [];

    let stripePaid = 0;
    let stripeAmountCents = 0;
    let matched = 0;
    let missingInLocal = 0;
    let amountMismatch = 0;

    for (const s of stripeSessions) {
      const isPaid = s.payment_status === 'paid';
      if (isPaid) {
        stripePaid += 1;
        stripeAmountCents += s.amount_total ?? 0;
      }
      const local = localBySession.get(s.id);
      if (!local) {
        if (isPaid) missingInLocal += 1;
        rows.push({
          sessionId: s.id,
          stripeAmountCents: s.amount_total,
          localAmountCents: null,
          currency: s.currency ?? 'ron',
          status: isPaid ? 'missing_local' : 'matched',
          paidAt: s.created ? new Date(s.created * 1000).toISOString() : null,
          localId: null,
        });
        continue;
      }
      if (isPaid && local.amount !== (s.amount_total ?? 0)) {
        amountMismatch += 1;
        rows.push({
          sessionId: s.id,
          stripeAmountCents: s.amount_total,
          localAmountCents: local.amount,
          currency: local.currency.toLowerCase(),
          status: 'amount_mismatch',
          paidAt: s.created ? new Date(s.created * 1000).toISOString() : null,
          localId: local.id,
        });
      } else if (isPaid) {
        matched += 1;
        rows.push({
          sessionId: s.id,
          stripeAmountCents: s.amount_total,
          localAmountCents: local.amount,
          currency: local.currency.toLowerCase(),
          status: 'matched',
          paidAt: s.created ? new Date(s.created * 1000).toISOString() : null,
          localId: local.id,
        });
      }
    }

    // Plăți locale care NU au corespondent în Stripe.
    const stripeIds = new Set(stripeSessions.map((s) => s.id));
    let missingInStripe = 0;
    let localPaid = 0;
    let localAmountCents = 0;
    for (const p of localPayments) {
      if (p.status === 'paid') {
        localPaid += 1;
        localAmountCents += p.amount;
      }
      if (p.providerSessionId && !stripeIds.has(p.providerSessionId) && p.status === 'paid') {
        missingInStripe += 1;
        rows.push({
          sessionId: p.providerSessionId,
          stripeAmountCents: null,
          localAmountCents: p.amount,
          currency: p.currency.toLowerCase(),
          status: 'missing_stripe',
          paidAt: p.createdAt.toISOString(),
          localId: p.id,
        });
      }
    }

    return {
      configured: true,
      range: r,
      summary: {
        stripePaid,
        stripeAmountCents,
        localPaid,
        localAmountCents,
        matched,
        missingInLocal,
        missingInStripe,
        amountMismatch,
      },
      rows: rows.slice(0, 500),
    };
  }

  // ============== CROSS-CHECK PIXEL ==============

  async pixelCrossCheck(range: RangeQuery, siteId: string | null = null) {
    const r = this.fmtRange(range);
    const types = ['page_view', 'purchase_init', 'purchase_success', 'signup'];

    const eventStats = await this.applySite(
      this.events
        .createQueryBuilder('e')
        .select('e.type', 'type')
        .addSelect('COUNT(*)::int', 'count')
        .addSelect(`COUNT(*) FILTER (WHERE e.forwardStatus = 'sent')::int`, 'forwarded')
        .addSelect(`COUNT(*) FILTER (WHERE e.forwardStatus = 'failed')::int`, 'failed')
        .addSelect(`COUNT(*) FILTER (WHERE e.forwardStatus = 'skipped' OR e.forwardStatus IS NULL)::int`, 'skipped')
        .where('e.createdAt BETWEEN :from AND :to', r)
        .andWhere('e.type IN (:...types)', { types }),
      'e',
      siteId,
    )
      .groupBy('e.type')
      .getRawMany<{ type: string; count: number; forwarded: number; failed: number; skipped: number }>();

    return {
      ga4Enabled: await this.forwarders.anyGa4Configured(siteId),
      capiEnabled: await this.forwarders.anyCapiConfigured(siteId),
      events: eventStats.map((s) => ({
        type: s.type,
        captured: Number(s.count),
        forwarded: Number(s.forwarded),
        failed: Number(s.failed),
        skipped: Number(s.skipped),
        coverage: Number(s.count) > 0 ? Math.round((Number(s.forwarded) / Number(s.count)) * 1000) / 10 : 0,
      })),
    };
  }
}
