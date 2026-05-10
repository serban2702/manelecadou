import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { AnalyticsEvent } from './analytics-event.entity';
import { AnalyticsSession } from './analytics-session.entity';
import { Payment } from '../payments/payment.entity';
import { User } from '../users/user.entity';
import { TrackEventDto } from './dto';
import { AnalyticsForwarders } from './forwarders';
import { SettingsService } from '../settings/settings.service';
import { GeoIpService } from './geoip.service';
import { parseUserAgent } from './ua-parser';
import { evaluateBot } from './bot-detection';

interface RangeQuery {
  from: Date;
  to: Date;
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
    event.forwardStatus = r.ok
      ? this.forwarders.ga4Configured || this.forwarders.capiConfigured
        ? 'sent'
        : 'skipped'
      : 'failed';
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
      ga4Enabled: this.forwarders.ga4Configured,
      capiEnabled: this.forwarders.capiConfigured,
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
