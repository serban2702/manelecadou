import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Generation } from '../generations/generation.entity';
import { Payment } from '../payments/payment.entity';
import { PaymentsService } from '../payments/payments.service';
import { AnalyticsSession } from '../analytics/analytics-session.entity';
import { AnalyticsEvent } from '../analytics/analytics-event.entity';
import { TEAM_TEST_EMAILS } from '../analytics/profitability.service';
import { MailerService } from '../../mailer/mailer.module';
import { SeederService } from '../../database/seeder/seeder.service';
import { SitesService } from '../sites/sites.service';
import {
  GenerationsService,
  type AdminRegenerateInput,
} from '../generations/generations.service';
import { SunoProvider } from '../suno/suno.types';

class TestMailDto {
  @IsEmail()
  to!: string;
  @IsString()
  @MinLength(1)
  subject!: string;
  @IsString()
  @MinLength(1)
  body!: string;
}

class CreateUserDto {
  @IsEmail()
  email!: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
  @IsIn(['user', 'admin'])
  role!: 'user' | 'admin';
  /** Obligatoriu: userii sunt unici pe (siteId, email), iar magic link-ul îl caută
   *  scoped pe site-ul rezolvat din Host. Pentru admini = site-ul default. */
  @IsUUID()
  siteId!: string;
}

/**
 * Statisticile dashboard-ului „încep" pe 25 mai 2026 — la fel ca analytics
 * (vezi ANALYTICS_EPOCH în analytics.controller.ts): înainte = teste interne.
 */
const STATS_EPOCH = new Date('2026-05-25T00:00:00+03:00');

/** Suma plății în bani RON indiferent de valută (alias `t`) — aceeași logică cu
 *  ProfitabilityService.AMOUNT_RON (amountRonCents → RON → curs Stripe → fallback EUR). */
const AMOUNT_RON_SQL = `
  CASE
    WHEN t."amountRonCents" IS NOT NULL THEN t."amountRonCents"
    WHEN upper(t.currency) = 'RON' THEN t.amount
    WHEN t."exchangeRateToRon" IS NOT NULL THEN round(t.amount * t."exchangeRateToRon")::int
    ELSE round(t.amount * 4.97)::int
  END`;

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(Generation) private readonly generations: Repository<Generation>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(AnalyticsSession) private readonly analyticsSessions: Repository<AnalyticsSession>,
    @InjectRepository(AnalyticsEvent) private readonly analyticsEvents: Repository<AnalyticsEvent>,
    private readonly mailer: MailerService,
    private readonly paymentsService: PaymentsService,
    private readonly seeder: SeederService,
    private readonly sites: SitesService,
    private readonly generationsService: GenerationsService,
    private readonly suno: SunoProvider,
  ) {}

  @Post('seeder/run')
  async runSeeder() {
    return this.seeder.run();
  }

  @Get('mail/status')
  async mailStatus(@CurrentSiteId() siteId: string | null) {
    const site = siteId ? await this.sites.findById(siteId) : null;
    return { provider: await this.mailer.providerName(site), source: site?.mailConfig?.provider ? 'site' : 'global' };
  }

  @Post('mail/test')
  async testMail(@Body() body: TestMailDto, @CurrentSiteId() siteId: string | null) {
    const site = siteId ? await this.sites.findById(siteId) : null;
    return this.mailer.sendDetailed(
      {
        to: body.to,
        subject: body.subject,
        html: `<p>${body.body}</p>`,
        text: body.body,
        from: site?.fromEmail ?? undefined,
      },
      { site, kind: 'admin_test' },
    );
  }

  @Get('stats')
  async stats(@CurrentSiteId() siteId: string | null) {
    // siteId === null = agregat cross-site (selectorul „Toate"). Doar admin (AdminGuard).
    const w = (extra: Record<string, unknown> = {}) =>
      siteId ? { ...extra, siteId } : extra;

    const [users, guests, gens, demos, fulls, succ, failed, paidPayments, paidUnlocked] = await Promise.all([
      this.users.count({ where: w() }),
      this.guests.count({ where: w() }),
      this.generations.count({ where: w() }),
      this.generations.count({ where: w({ type: 'demo' }) }),
      this.generations.count({ where: w({ type: 'full' }) }),
      this.generations.count({ where: w({ status: 'succeeded' }) }),
      this.generations.count({ where: w({ status: 'failed' }) }),
      this.payments.count({ where: w({ status: 'paid' }) }),
      this.generations.count({ where: w({ paidUnlocked: true }) }),
    ]);

    const revenueQb = this.payments
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'sum')
      .where('p.status = :s', { s: 'paid' });
    if (siteId) revenueQb.andWhere('p."siteId" = :siteId', { siteId });
    const revenueRow = await revenueQb.getRawOne<{ sum: string }>();
    const totalRevenueCents = Number(revenueRow?.sum ?? 0);

    const recentQb = this.payments
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'sum')
      .where('p.status = :s', { s: 'paid' })
      .andWhere(`p.createdAt >= NOW() - INTERVAL '7 days'`);
    if (siteId) recentQb.andWhere('p."siteId" = :siteId', { siteId });
    const recentRow = await recentQb.getRawOne<{ sum: string }>();
    const revenue7dCents = Number(recentRow?.sum ?? 0);

    const conversionRate = demos > 0 ? Math.round((paidUnlocked / demos) * 1000) / 10 : 0;

    return {
      siteId,
      users,
      guests,
      generations: { total: gens, demos, fulls, succeeded: succ, failed, paidUnlocked },
      paidPayments,
      revenue: { totalCents: totalRevenueCents, last7dCents: revenue7dCents },
      conversionRate,
    };
  }

  /**
   * KPI-uri + serii zilnice pe un interval ales (dashboard-ul nou). Sumele sunt
   * normalizate în bani RON (cross-currency) și EXCLUD plățile de test ale echipei
   * (aceeași listă ca raportul de profitabilitate). Zilele = Europe/Bucharest.
   */
  @Get('stats/range')
  async statsRange(
    @Query('from') fromRaw: string | undefined,
    @Query('to') toRaw: string | undefined,
    @CurrentSiteId() siteId: string | null,
  ) {
    const to = toRaw ? new Date(toRaw) : new Date();
    let from = fromRaw ? new Date(fromRaw) : STATS_EPOCH;
    if (isNaN(from.getTime())) from = STATS_EPOCH;
    if (from.getTime() < STATS_EPOCH.getTime()) from = STATS_EPOCH;
    const toSafe = isNaN(to.getTime()) ? new Date() : to;

    const params: unknown[] = [from.toISOString(), toSafe.toISOString()];
    const siteFilter = siteId ? `AND t."siteId" = $3` : '';
    if (siteId) params.push(siteId);

    const emailList = TEAM_TEST_EMAILS.map((e) => `'${e}'`).join(',');
    // Plățile de test ale echipei ies din toate sumele/counturile de payments.
    const payBase = `
      FROM payments t
      LEFT JOIN guest_sessions gst ON gst.id = t."guestId"
      LEFT JOIN users u ON u.id = t."userId"
      WHERE t."createdAt" BETWEEN $1 AND $2 ${siteFilter}
        AND lower(COALESCE(t."customerEmail", gst.email, u.email, '')) NOT IN (${emailList})`;
    const AMOUNT = AMOUNT_RON_SQL;

    const [payKpi, paySeries, genKpi, genSeries, userSeries, usersCount, guestsCount] =
      await Promise.all([
        this.payments.query(
          `SELECT
             COALESCE(SUM(${AMOUNT}) FILTER (WHERE t.status='paid'),0)::bigint AS revenue,
             COUNT(*) FILTER (WHERE t.status='paid')::int AS paid,
             COUNT(*) FILTER (WHERE t.status='failed')::int AS failed,
             COUNT(*) FILTER (WHERE t.status='refunded')::int AS refunded,
             COUNT(*) FILTER (WHERE t.status='pending')::int AS pending
           ${payBase}`,
          params,
        ),
        this.payments.query(
          `SELECT to_char((t."createdAt" AT TIME ZONE 'Europe/Bucharest')::date,'YYYY-MM-DD') AS day,
             COALESCE(SUM(${AMOUNT}) FILTER (WHERE t.status='paid'),0)::bigint AS revenue,
             COUNT(*) FILTER (WHERE t.status='paid')::int AS orders
           ${payBase} GROUP BY 1 ORDER BY 1`,
          params,
        ),
        this.generations.query(
          `SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE t.type='demo')::int AS demos,
             COUNT(*) FILTER (WHERE t.type='full')::int AS fulls,
             COUNT(*) FILTER (WHERE t.status='succeeded')::int AS succeeded,
             COUNT(*) FILTER (WHERE t.status='failed')::int AS failed,
             COUNT(*) FILTER (WHERE t.status NOT IN ('succeeded','failed'))::int AS running,
             COUNT(*) FILTER (WHERE t."paidUnlocked")::int AS "paidUnlocked"
           FROM generations t WHERE t."createdAt" BETWEEN $1 AND $2 ${siteFilter}`,
          params,
        ),
        this.generations.query(
          `SELECT to_char((t."createdAt" AT TIME ZONE 'Europe/Bucharest')::date,'YYYY-MM-DD') AS day,
             COUNT(*)::int AS generations
           FROM generations t WHERE t."createdAt" BETWEEN $1 AND $2 ${siteFilter}
           GROUP BY 1 ORDER BY 1`,
          params,
        ),
        this.users.query(
          `SELECT to_char((t."createdAt" AT TIME ZONE 'Europe/Bucharest')::date,'YYYY-MM-DD') AS day,
             COUNT(*)::int AS users
           FROM users t WHERE t."createdAt" BETWEEN $1 AND $2 ${siteFilter}
           GROUP BY 1 ORDER BY 1`,
          params,
        ),
        this.users.count({
          where: siteId ? { siteId } : {},
        }),
        this.guests.count({ where: siteId ? { siteId } : {} }),
      ]);

    // Breakdown per site — doar în scope „Toate site-urile".
    let bySite: Array<{ siteId: string | null; revenueRonCents: number; orders: number }> = [];
    if (!siteId) {
      const rows = (await this.payments.query(
        `SELECT t."siteId" AS site_id,
           COALESCE(SUM(${AMOUNT}) FILTER (WHERE t.status='paid'),0)::bigint AS revenue,
           COUNT(*) FILTER (WHERE t.status='paid')::int AS orders
         ${payBase} GROUP BY 1 ORDER BY 2 DESC`,
        params,
      )) as Array<{ site_id: string | null; revenue: string; orders: number }>;
      bySite = rows.map((r) => ({
        siteId: r.site_id,
        revenueRonCents: parseInt(r.revenue, 10) || 0,
        orders: Number(r.orders) || 0,
      }));
    }

    // Merge seriile pe zile (union de chei, zile lipsă = 0).
    const dayMap = new Map<string, { day: string; revenueRonCents: number; orders: number; generations: number; newUsers: number }>();
    const ensure = (day: string) => {
      let e = dayMap.get(day);
      if (!e) { e = { day, revenueRonCents: 0, orders: 0, generations: 0, newUsers: 0 }; dayMap.set(day, e); }
      return e;
    };
    for (const r of paySeries as Array<{ day: string; revenue: string; orders: number }>) {
      const e = ensure(r.day);
      e.revenueRonCents = parseInt(r.revenue, 10) || 0;
      e.orders = Number(r.orders) || 0;
    }
    for (const r of genSeries as Array<{ day: string; generations: number }>) {
      ensure(r.day).generations = Number(r.generations) || 0;
    }
    for (const r of userSeries as Array<{ day: string; users: number }>) {
      ensure(r.day).newUsers = Number(r.users) || 0;
    }
    const series = Array.from(dayMap.values()).sort((a, b) => (a.day < b.day ? -1 : 1));

    const pk = (payKpi as Array<Record<string, unknown>>)[0] ?? {};
    const gk = (genKpi as Array<Record<string, unknown>>)[0] ?? {};
    const revenue = parseInt(String(pk.revenue ?? '0'), 10) || 0;
    const paid = Number(pk.paid) || 0;
    const demos = Number(gk.demos) || 0;
    const paidUnlocked = Number(gk.paidUnlocked) || 0;

    return {
      range: { from: from.toISOString(), to: toSafe.toISOString() },
      revenue: {
        totalRonCents: revenue,
        paidCount: paid,
        aovRonCents: paid > 0 ? Math.round(revenue / paid) : 0,
        failedCount: Number(pk.failed) || 0,
        refundedCount: Number(pk.refunded) || 0,
        pendingCount: Number(pk.pending) || 0,
      },
      totals: { users: usersCount, guests: guestsCount },
      generations: {
        total: Number(gk.total) || 0,
        demos,
        fulls: Number(gk.fulls) || 0,
        succeeded: Number(gk.succeeded) || 0,
        failed: Number(gk.failed) || 0,
        running: Number(gk.running) || 0,
        paidUnlocked,
      },
      conversionRate: demos > 0 ? Math.round((paidUnlocked / demos) * 1000) / 10 : 0,
      series,
      bySite,
    };
  }

  @Get('users')
  async listUsers(@Query('limit') limit = '50', @CurrentSiteId() siteId: string | null) {
    return this.users.find({
      where: siteId ? { siteId } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(Number(limit) || 50, 200),
    });
  }

  @Get('guests')
  async listGuests(@Query('limit') limit = '50', @CurrentSiteId() siteId: string | null) {
    const guests = await this.guests.find({
      where: siteId ? { siteId } : {},
      order: { lastSeenAt: 'DESC' },
      take: Math.min(Number(limit) || 50, 200),
    });
    if (guests.length === 0) return [];

    // Pentru fiecare guest, luăm cea mai recentă analytics_session (care conține
    // geo, device, browser, sursă). Folosim DISTINCT ON pentru a primi un singur
    // rând per guestId într-un singur query.
    const guestIds = guests.map((g) => g.id);
    const sessions = await this.analyticsSessions
      .createQueryBuilder('s')
      .where('s."guestId" IN (:...ids)', { ids: guestIds })
      .orderBy('s."guestId"')
      .addOrderBy('s."lastActivityAt"', 'DESC')
      .distinctOn(['s."guestId"'])
      .getMany();
    const byGuest = new Map(sessions.map((s) => [s.guestId, s]));

    // Nivelul atins în wizard-ul de comandă, per guest. Etapele 1-2 vin din
    // analytics_events (form_start / form_field_change — best effort, evenimentele
    // vechi nu poartă guestId); etapele 3-5 vin din FAPTE certe din DB:
    // generations.ownerGuestId = comandă creată (3), payments.guestId = a ajuns
    // la checkout (4), payment paid = a plătit (5).
    const [wizardRows, genRows, payRows] = await Promise.all([
      this.analyticsEvents.query(
        `SELECT e."guestId" AS gid,
           MAX(CASE e.type
             WHEN 'purchase_success' THEN 5
             WHEN 'purchase_init' THEN 4
             WHEN 'generation_start' THEN 3
             WHEN 'form_field_change' THEN 2
             WHEN 'form_start' THEN 1
             ELSE 0 END)::int AS stage,
           COUNT(DISTINCT e.props->>'field') FILTER (WHERE e.type='form_field_change')::int AS fields,
           MAX(e."createdAt") FILTER (WHERE e.type IN
             ('form_start','form_field_change','generation_start','purchase_init','purchase_success')
           ) AS last_at
         FROM analytics_events e
         WHERE e."guestId" = ANY($1::uuid[])
         GROUP BY 1`,
        [guestIds],
      ) as Promise<Array<{ gid: string; stage: number; fields: number; last_at: Date | string | null }>>,
      this.generations.query(
        `SELECT "ownerGuestId" AS gid, MAX("createdAt") AS last_at
         FROM generations WHERE "ownerGuestId" = ANY($1::uuid[]) GROUP BY 1`,
        [guestIds],
      ) as Promise<Array<{ gid: string; last_at: Date | string }>>,
      this.payments.query(
        `SELECT "guestId" AS gid,
           COUNT(*) FILTER (WHERE status='paid')::int AS paid,
           MAX("createdAt") AS last_at
         FROM payments WHERE "guestId" = ANY($1::uuid[]) GROUP BY 1`,
        [guestIds],
      ) as Promise<Array<{ gid: string; paid: number; last_at: Date | string }>>,
    ]);

    const wizardByGuest = new Map<string, { stage: number; fieldsTouched: number; lastEventAt: string | null }>();
    const bump = (gid: string, stage: number, at: Date | string | null, fields = 0) => {
      const cur = wizardByGuest.get(gid) ?? { stage: 0, fieldsTouched: 0, lastEventAt: null };
      const atIso = at ? new Date(at).toISOString() : null;
      wizardByGuest.set(gid, {
        stage: Math.max(cur.stage, stage),
        fieldsTouched: Math.max(cur.fieldsTouched, fields),
        lastEventAt: !cur.lastEventAt || (atIso && atIso > cur.lastEventAt) ? atIso : cur.lastEventAt,
      });
    };
    for (const r of wizardRows) bump(r.gid, Number(r.stage) || 0, r.last_at, Number(r.fields) || 0);
    for (const r of genRows) bump(r.gid, 3, r.last_at);
    for (const r of payRows) bump(r.gid, Number(r.paid) > 0 ? 5 : 4, r.last_at);

    return guests.map((g) => {
      const s = byGuest.get(g.id);
      return {
        ...g,
        wizard: wizardByGuest.get(g.id) ?? null,
        analytics: s
          ? {
              country: s.country,
              countryName: s.countryName,
              city: s.city,
              device: s.device,
              browserName: s.browserName,
              osName: s.osName,
              source: s.source,
              medium: s.medium,
              pageViews: s.pageViews,
              durationSec: s.durationSec,
              isBot: s.isBot,
              botCategory: s.botCategory,
            }
          : null,
      };
    });
  }

  @Get('generations')
  async listGenerations(@Query('limit') limit = '50', @CurrentSiteId() siteId: string | null) {
    const gens = await this.generations.find({
      where: siteId ? { siteId } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(Number(limit) || 50, 200),
    });
    if (gens.length === 0) return [];

    // Pentru fiecare generare, recuperăm payment-ul legat (via paymentId direct
    // SAU prin generations.id == payments.generation — căutăm cel mai recent
    // paid). Plus emailul owner-ului. Astfel admin vede într-un singur tabel
    // suma plătită + cardul + statusul plății, fără să comute pe pagina Plăți.
    const paymentIds = Array.from(
      new Set(gens.map((g) => g.paymentId).filter((x): x is string => !!x)),
    );
    const userIds = Array.from(
      new Set(gens.map((g) => g.ownerUserId).filter((x): x is string => !!x)),
    );
    const guestIds = Array.from(
      new Set(gens.map((g) => g.ownerGuestId).filter((x): x is string => !!x)),
    );

    const [pays, usersList, guestsList] = await Promise.all([
      paymentIds.length
        ? this.payments.find({ where: paymentIds.map((id) => ({ id })) })
        : Promise.resolve([]),
      userIds.length
        ? this.users.find({ where: userIds.map((id) => ({ id })) })
        : Promise.resolve([]),
      guestIds.length
        ? this.guests.find({ where: guestIds.map((id) => ({ id })) })
        : Promise.resolve([]),
    ]);

    const payById = new Map(pays.map((p) => [p.id, p]));
    const userEmail = new Map(usersList.map((u) => [u.id, u.email]));
    const guestEmail = new Map(guestsList.map((g) => [g.id, g.email]));

    return gens.map((g) => {
      const p = g.paymentId ? payById.get(g.paymentId) : undefined;
      const email = g.ownerUserId
        ? userEmail.get(g.ownerUserId) ?? null
        : g.ownerGuestId
          ? guestEmail.get(g.ownerGuestId) ?? null
          : null;
      return {
        ...g,
        ownerEmail: email,
        payment: p
          ? {
              id: p.id,
              amount: p.amount,
              currency: p.currency,
              status: p.status,
              provider: p.provider,
              createdAt: p.createdAt,
            }
          : null,
      };
    });
  }

  @Get('generations/:id')
  async getGeneration(@Param('id') id: string) {
    return this.generations.findOne({ where: { id } });
  }

  @Get('payments')
  async listPayments(
    @Query('limit') limitRaw = '20',
    @Query('offset') offsetRaw = '0',
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @CurrentSiteId() siteId: string | null = null,
  ) {
    const limit = Math.min(Math.max(Number(limitRaw) || 20, 1), 200);
    const offset = Math.max(Number(offsetRaw) || 0, 0);

    // Construim query-ul cu builder ca să putem aplica join-ul pe email
    // (user.email / guest.email) + filtru pe sursă într-o singură fetchare
    // paginabilă. Asta înlocuiește vechiul .find() + filtrare in-memory.
    // TypeORM `leftJoin` cu prim arg string așteaptă numele unei relații, nu
    // al tabelei — pentru join pe entitate fără relație definită folosim clasa
    // entității. Altfel: TypeError: Cannot read properties of undefined
    // (reading 'databaseName'). Filtrul `search` (email) îl aplicăm doar dacă
    // user/guest au email — îl filtrăm prin scalar subquery ca să evităm
    // dependența de relații care nu există în entități.
    const qb = this.payments
      .createQueryBuilder('p')
      .orderBy('p."createdAt"', 'DESC');

    if (siteId) qb.andWhere('p."siteId" = :siteId', { siteId });
    if (status && status !== 'all') qb.andWhere('p.status = :status', { status });

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(
          EXISTS (SELECT 1 FROM users u WHERE u.id = p."userId" AND LOWER(u.email) LIKE :term)
          OR EXISTS (SELECT 1 FROM guest_sessions g WHERE g.id = p."guestId" AND LOWER(g.email) LIKE :term)
        )`,
        { term },
      );
    }
    if (from) {
      const d = new Date(from);
      if (!isNaN(d.getTime())) qb.andWhere('p."createdAt" >= :from', { from: d.toISOString() });
    }
    if (to) {
      const d = new Date(to);
      if (!isNaN(d.getTime())) qb.andWhere('p."createdAt" <= :to', { to: d.toISOString() });
    }

    // Filtru pe sursă: cea mai recentă sesiune a userului/guest-ului înainte
    // de plată trebuie să match-uiască. Folosim EXISTS cu LATERAL similar ca
    // pentru attribution map de mai jos. `source=none` = plăți fără attribution.
    if (source && source !== 'all') {
      if (source === 'none') {
        qb.andWhere(
          `NOT EXISTS (
            SELECT 1 FROM analytics_sessions s
            WHERE (
              (s."userId" IS NOT NULL AND s."userId" = p."userId")
              OR (s."guestId" IS NOT NULL AND s."guestId" = p."guestId")
              OR (p."ipAddress" IS NOT NULL AND s.ip IS NOT NULL AND s.ip = p."ipAddress")
            )
              AND s."startedAt" <= p."createdAt"
              AND s.source IS NOT NULL
              AND s.source NOT ILIKE 'stripe%'
              AND s.source NOT ILIKE 'checkout.stripe%'
          )`,
        );
      } else {
        // Pattern match pe substring ca să acoperim atât 'facebook' cât și
        // 'm.facebook.com'. Cazurile speciale: 'meta' include 'fb' și 'facebook',
        // 'instagram' include 'ig'.
        const patterns: string[] = [`%${source}%`];
        if (source === 'facebook' || source === 'meta') patterns.push('fb', 'fb%');
        if (source === 'instagram') patterns.push('ig');
        if (source === 'whatsapp') patterns.push('wa');
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM analytics_sessions s
            WHERE (
              (s."userId" IS NOT NULL AND s."userId" = p."userId")
              OR (s."guestId" IS NOT NULL AND s."guestId" = p."guestId")
              OR (p."ipAddress" IS NOT NULL AND s.ip IS NOT NULL AND s.ip = p."ipAddress")
            )
              AND s."startedAt" <= p."createdAt"
              AND s.source IS NOT NULL
              AND s.source NOT ILIKE 'stripe%'
              AND (${patterns.map((_, i) => `LOWER(s.source) LIKE :sp${i}`).join(' OR ')})
          )`,
          patterns.reduce((acc, val, i) => ({ ...acc, [`sp${i}`]: val.toLowerCase() }), {}),
        );
      }
    }

    const total = await qb.getCount();
    const payments = await qb.skip(offset).take(limit).getMany();

    if (payments.length === 0) return { items: [], total };

    const userIds = Array.from(
      new Set(payments.map((p) => p.userId).filter((x): x is string => !!x)),
    );
    const guestIds = Array.from(
      new Set(payments.map((p) => p.guestId).filter((x): x is string => !!x)),
    );
    const [usersList, guestsList] = await Promise.all([
      userIds.length
        ? this.users.find({ where: userIds.map((id) => ({ id })) })
        : Promise.resolve([]),
      guestIds.length
        ? this.guests.find({ where: guestIds.map((id) => ({ id })) })
        : Promise.resolve([]),
    ]);
    const userEmail = new Map(usersList.map((u) => [u.id, u.email]));
    const guestEmail = new Map(guestsList.map((g) => [g.id, g.email]));

    // Generarea legată: cel mai des e `generations.paymentId == payment.id`.
    // Acoperim ambele direcții (paymentId direct + lookup invers prin guest/user)
    // dar prima e suficientă pentru 99% din cazuri.
    const paymentIdList = payments.map((p) => p.id);
    const linkedGens = paymentIdList.length
      ? await this.generations
          .createQueryBuilder('g')
          .where('g."paymentId" IN (:...ids)', { ids: paymentIdList })
          .getMany()
      : [];
    const genByPaymentId = new Map(
      linkedGens.map((g) => [g.paymentId as string, g]),
    );

    // Factura asociată (dacă există) — pentru coloana „Facturat" din lista de
    // plăți. Raw query pe conexiunea existentă (ca la attribution mai jos) ca să
    // nu injectăm un repository nou aici. O plată are cel mult o factură (UNIQUE).
    const invRows: Array<{ paymentId: string; id: string; status: string }> =
      paymentIdList.length
        ? await this.payments.query(
            `SELECT "paymentId", id, status FROM invoices WHERE "paymentId" = ANY($1::uuid[])`,
            [paymentIdList],
          )
        : [];
    const invoiceByPaymentId = new Map(
      invRows.map((r) => [r.paymentId, { id: r.id, status: r.status as 'issued' | 'failed' }]),
    );

    // Attribution: pentru fiecare plată găsim cea mai recentă sesiune analytics
    // a aceluiași user/guest ÎNAINTE sau în clipa creării plății. E sursa care
    // a adus userul pe site înainte să plătească (last-touch attribution).
    // Folosim un singur query cu LATERAL JOIN ca să nu facem N+1.
    const attrByPaymentId = new Map<
      string,
      {
        source: string | null;
        medium: string | null;
        campaign: string | null;
        campaignName: string | null;
        creative: string | null;
        referrer: string | null;
        landingPath: string | null;
      }
    >();
    // utm_campaign / utm_content vin uneori URL-encoded (C3+%E2%80%94+OCAZII) sau
    // ca ID-uri Meta numerice (deja rezolvate în SQL prin ad_spend). Decodăm aici.
    const decodeUtm = (v: string | null): string | null => {
      if (!v) return null;
      try {
        return decodeURIComponent(v.replace(/\+/g, ' ')).trim() || null;
      } catch {
        return v.replace(/\+/g, ' ').trim() || null;
      }
    };
    if (paymentIdList.length > 0) {
      // Legăm plata de sesiuni prin userId / guestId / ipAddress. `guestId` pe
      // analytics_sessions e aproape mereu null (tracker anonim), deci IP-ul e
      // puntea reală pentru vizitatorii neînregistrați. Preferăm „last non-direct
      // touch" (ultima sursă de campanie reală), apoi cădem pe ultima sesiune.
      const matchSql = `(
        (a."userId" IS NOT NULL AND a."userId" = p."userId")
        OR (a."guestId" IS NOT NULL AND a."guestId" = p."guestId")
        OR (p."ipAddress" IS NOT NULL AND a.ip IS NOT NULL AND a.ip = p."ipAddress")
      )`;
      const rows: Array<{
        payment_id: string;
        source: string | null;
        medium: string | null;
        campaign: string | null;
        campaign_name: string | null;
        creative: string | null;
        referrer: string | null;
        landing_path: string | null;
        has_session: boolean;
      }> = await this.payments.query(
        `
        SELECT p.id AS payment_id, s.source, s.medium, s.campaign, s.referrer, s."landingPath" AS landing_path,
          -- Campania: traduce ID-ul Meta numeric în nume real (ad_spend), altfel păstrează utm_campaign.
          COALESCE(
            (SELECT sp."campaignName" FROM ad_spend sp WHERE sp."campaignId" = s.campaign AND sp."campaignName" IS NOT NULL LIMIT 1),
            s.campaign
          ) AS campaign_name,
          -- Creativul (ad-ul): din utm_content; ID-ul ad-ului → nume real (ad_spend.adName).
          COALESCE(
            (SELECT sp."adName" FROM ad_spend sp WHERE sp."adId" = s."utmContent" AND sp."adName" IS NOT NULL LIMIT 1),
            s."utmContent"
          ) AS creative,
          -- Există VREO sesiune a cumpărătorului (incl. imediat după plată, aceeași zi)?
          -- Dacă da dar fără touch de campanie → e client „Direct", nu „date lipsă".
          -- Fereastra +1 zi prinde fluxul chat/AI (plata = când se trimite linkul,
          -- userul navighează adesea imediat după).
          EXISTS (
            SELECT 1 FROM analytics_sessions a2
            WHERE (
              (a2."userId" IS NOT NULL AND a2."userId" = p."userId")
              OR (a2."guestId" IS NOT NULL AND a2."guestId" = p."guestId")
              OR (p."ipAddress" IS NOT NULL AND a2.ip IS NOT NULL AND a2.ip = p."ipAddress")
            )
              AND a2."siteId" = p."siteId"
              AND a2."startedAt" BETWEEN p."createdAt" - INTERVAL '60 days' AND p."createdAt" + INTERVAL '1 day'
              AND a2.source IS NOT NULL
              AND a2.source NOT ILIKE 'stripe%' AND a2.source NOT ILIKE 'checkout.stripe%'
          ) AS has_session
        FROM payments p
        LEFT JOIN LATERAL (
          SELECT a.source, a.medium, a.campaign, a.referrer, a."landingPath", a."utmContent"
          FROM analytics_sessions a
          WHERE ${matchSql}
            AND a."siteId" = p."siteId"
            AND a."startedAt" <= p."createdAt"
            AND a."startedAt" >= p."createdAt" - INTERVAL '60 days'
            AND a.source IS NOT NULL
            -- Exclude redirect-urile post-checkout — Stripe revine pe site cu
            -- referrer=checkout.stripe.com, ceea ce ar atribui plata altui retry
            -- ulterior. Cazuri reale de „venit prin Stripe" nu există.
            AND a.source NOT ILIKE 'stripe%'
            AND a.source NOT ILIKE 'checkout.stripe%'
          -- Prioritate: sursele de campanie (non-direct) înaintea celor „direct".
          ORDER BY (CASE WHEN a.source ILIKE 'direct' OR a.source = '(direct)' THEN 1 ELSE 0 END) ASC,
                   a."startedAt" DESC
          LIMIT 1
        ) s ON true
        WHERE p.id = ANY($1::uuid[])
        `,
        [paymentIdList],
      );
      for (const r of rows) {
        if (r.source) {
          // Touch de campanie/sesiune înainte de plată — atribuire completă.
          attrByPaymentId.set(r.payment_id, {
            source: r.source,
            medium: r.medium,
            campaign: r.campaign,
            campaignName: decodeUtm(r.campaign_name),
            creative: decodeUtm(r.creative),
            referrer: r.referrer,
            landingPath: r.landing_path,
          });
        } else if (r.has_session) {
          // Cumpărătorul există în analytics dar fără touch de campanie → „Direct".
          attrByPaymentId.set(r.payment_id, {
            source: 'direct',
            medium: null,
            campaign: null,
            campaignName: null,
            creative: null,
            referrer: null,
            landingPath: null,
          });
        }
        // Altfel: nicio sesiune → rămâne neatribuit („—").
      }
    }

    const items = payments.map((p) => {
      const g = genByPaymentId.get(p.id) ?? null;
      const attr = attrByPaymentId.get(p.id) ?? null;
      return {
        ...p,
        email: p.userId
          ? userEmail.get(p.userId) ?? null
          : p.guestId
            ? guestEmail.get(p.guestId) ?? null
            : null,
        attribution: attr,
        invoice: invoiceByPaymentId.get(p.id) ?? null,
        generation: g
          ? {
              id: g.id,
              status: g.status,
              type: g.type,
              recipientName: g.recipientName,
              paidUnlocked: g.paidUnlocked,
              audioUrl: g.audioUrl,
              nextRetryAt: g.nextRetryAt,
              retryCount: g.retryCount,
            }
          : null,
      };
    });
    return { items, total };
  }

  @Get('payments/:id/stripe-details')
  async getPaymentStripeDetails(@Param('id') id: string) {
    return this.paymentsService.fetchStripeCustomerDetails(id);
  }

  @Post('payments/:id/refund')
  async refundPayment(
    @Param('id') id: string,
    @Body() body: { amountCents?: number; reason?: string },
  ) {
    return this.paymentsService.refund(id, {
      amountCents: body?.amountCents,
      reason: body?.reason,
    });
  }

  /** Marchează plata ca 'refunded' doar ca status (fără Stripe, fără storno). */
  @Post('payments/:id/mark-refunded')
  async markPaymentRefunded(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.paymentsService.markRefunded(id, { reason: body?.reason });
  }

  /**
   * Backfill one-time al adresei de facturare (nume + adresă) din Stripe pe
   * plățile vechi. Rulează în fundal (throttled). Întoarce imediat câți candidați
   * există. După ce termină, /facturare și /clienti au date instant, fără Stripe.
   */
  @Post('payments/backfill-billing')
  async backfillBilling(@Body() body: { limit?: number; force?: boolean } = {}) {
    const candidates = await this.paymentsService.countBillingBackfillCandidates(!!body.force);
    void this.paymentsService.backfillBillingDetails({ limit: body.limit, force: body.force });
    return { started: true, candidates };
  }

  // ===== Action endpoints =====

  @Post('generations/:id/force-unlock')
  async forceUnlock(@Param('id') id: string) {
    const g = await this.generations.findOne({ where: { id } });
    if (!g) return { ok: false, reason: 'not_found' };
    g.paidUnlocked = true;
    await this.generations.save(g);
    return { ok: true };
  }

  /**
   * Manual upload: admin generează pe Suno extern și încarcă cele 2 versiuni
   * direct (multipart cu field-urile `main` și optional `bonus`, max 25MB fiecare).
   * Sare peste lyrics + suno API; setează status=succeeded și trimite email + chat
   * notification owner-ului. ffmpeg re-encode-ează la mp3 128k indiferent de format.
   */
  @Post('generations/:id/manual-upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'main', maxCount: 1 },
        { name: 'bonus', maxCount: 1 },
      ],
      { limits: { fileSize: 25 * 1024 * 1024 } },
    ),
  )
  async manualUpload(
    @Param('id') id: string,
    @UploadedFiles()
    files: {
      main?: Array<{ buffer: Buffer; originalname: string; size: number; mimetype: string }>;
      bonus?: Array<{ buffer: Buffer; originalname: string; size: number; mimetype: string }>;
    },
  ) {
    const main = files?.main?.[0];
    const bonus = files?.bonus?.[0];
    if (!main) throw new BadRequestException('Lipsește fișierul principal (field: main)');
    const g = await this.generationsService.adminManualUpload(id, main.buffer, bonus?.buffer ?? null);
    return {
      ok: true,
      status: g.status,
      audioUrl: g.audioUrl,
      bonusAudioUrl: g.bonusAudioUrl,
      demoAudioUrl: g.demoAudioUrl,
      demoBonusAudioUrl: g.demoBonusAudioUrl,
    };
  }

  /**
   * Upload manual al unui MP3 ca VARIAȚIE nouă (field `file`, max 25MB). Nu
   * atinge piesa live; apare în Studio la „Toate piesele generate", de unde se
   * promovează ca principală/bonus. Admin poate încărca oricâte variante vrea.
   */
  @Post('generations/:id/manual-upload-variation')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async manualUploadVariation(
    @Param('id') id: string,
    @Body('label') label: string | undefined,
    @UploadedFile() file?: { buffer: Buffer; originalname: string; size: number; mimetype: string },
  ) {
    if (!file) throw new BadRequestException('Lipsește fișierul (field: file)');
    const g = await this.generationsService.adminManualUploadVariation(id, file.buffer, label);
    return { ok: true, id: g.id, status: g.status, audioUrl: g.audioUrl, variationLabel: g.variationLabel };
  }

  /** Re-trimite emailul de livrare („melodia ta e gata") + chat notify. */
  @Post('generations/:id/resend-email')
  async resendDeliveryEmail(@Param('id') id: string) {
    return this.generationsService.adminResendDeliveryEmail(id);
  }

  /** Scoate de pe pagina clientului piesa principală (`main`) sau bonusul (`bonus`). */
  @Post('generations/:id/clear-slot')
  async clearSlot(@Param('id') id: string, @Body('slot') slot: 'main' | 'bonus') {
    if (slot !== 'main' && slot !== 'bonus') throw new BadRequestException('slot invalid (main|bonus)');
    const g = await this.generationsService.adminClearSlot(id, slot);
    return { ok: true, id: g.id, audioUrl: g.audioUrl, bonusAudioUrl: g.bonusAudioUrl };
  }

  @Post('generations/:id/retry')
  async retryGeneration(@Param('id') id: string) {
    const g = await this.generationsService.adminRetry(id);
    return { ok: true, status: g.status, retryCount: g.retryCount };
  }

  /**
   * Upgrade de pachet pe comanda existentă (basic→plus/premium, plus→premium):
   * schimbă tier-ul FĂRĂ să regenereze melodia și generează în fundal doar
   * livrabilele lipsă (imagini social / videoclip). Plata existentă nu e atinsă.
   */
  @Post('generations/:id/upgrade-package')
  async upgradePackage(@Param('id') id: string, @Body() body: { tier?: string }) {
    if (!body?.tier) throw new BadRequestException('tier lipsă (plus|premium)');
    const res = await this.generationsService.adminUpgradePackage(id, body.tier);
    return {
      ok: true,
      id: res.generation.id,
      packageTier: res.generation.packageTier,
      deliverablesQueued: res.deliverablesQueued,
    };
  }

  // ============== Regenerare + variații + unelte Suno ==============

  /** Regenerare cu editări + țintă (overwrite | new_track | new_order). */
  @Post('generations/:id/regenerate')
  async regenerate(@Param('id') id: string, @Body() body: AdminRegenerateInput) {
    const g = await this.generationsService.adminRegenerate(id, body);
    return { ok: true, id: g.id, status: g.status, parentGenerationId: g.parentGenerationId };
  }

  /** Re-roll: variație nouă cu aceleași versuri. */
  @Post('generations/:id/reroll')
  async reroll(@Param('id') id: string) {
    const g = await this.generationsService.adminReroll(id);
    return { ok: true, id: g.id, status: g.status };
  }

  /** Interschimbă piesa principală cu bonusul. */
  @Post('generations/:id/swap-tracks')
  async swapTracks(@Param('id') id: string) {
    const g = await this.generationsService.adminSwapTracks(id);
    return { ok: true, audioUrl: g.audioUrl, bonusAudioUrl: g.bonusAudioUrl };
  }

  /** Lista variațiilor unei comenzi. */
  @Get('generations/:id/variations')
  async listVariations(@Param('id') id: string) {
    return this.generationsService.adminListVariations(id);
  }

  /** Promovează o variație în slot-ul principal/bonus al comenzii. */
  @Post('generations/:id/promote')
  async promoteVariation(
    @Param('id') variationId: string,
    @Body() body: { slot?: 'main' | 'bonus'; notify?: boolean },
  ) {
    const g = await this.generationsService.adminPromoteVariation(
      variationId,
      body.slot === 'bonus' ? 'bonus' : 'main',
      { notify: !!body.notify },
    );
    return { ok: true, id: g.id, audioUrl: g.audioUrl, bonusAudioUrl: g.bonusAudioUrl };
  }

  @Delete('generations/:id/variation')
  async deleteVariation(@Param('id') id: string) {
    await this.generationsService.adminDeleteVariation(id);
    return { ok: true };
  }

  /** Rearanjează variațiile comenzii (id = comanda-părinte). */
  @Post('generations/:id/reorder-variations')
  async reorderVariations(@Param('id') id: string, @Body() body: { ids?: string[] }) {
    await this.generationsService.adminReorderVariations(id, body.ids ?? []);
    return { ok: true };
  }

  /** Prelungește o piesă (Suno extend) → variație nouă mai lungă. */
  @Post('generations/:id/extend')
  async extend(
    @Param('id') id: string,
    @Body() body: { slot?: 'main' | 'bonus'; continueAt?: number; style?: string },
  ) {
    const g = await this.generationsService.adminExtend(id, body);
    return { ok: true, id: g.id, status: g.status };
  }

  /** Cover/restyle → variație nouă cu alt stil. */
  @Post('generations/:id/cover')
  async cover(
    @Param('id') id: string,
    @Body() body: { slot?: 'main' | 'bonus'; style?: string; instrumental?: boolean; label?: string },
  ) {
    const g = await this.generationsService.adminCover(id, body);
    return { ok: true, id: g.id, status: g.status };
  }

  /** Înlocuiește o secțiune (refren/interval) cu alt stil. */
  @Post('generations/:id/replace-section')
  async replaceSection(
    @Param('id') id: string,
    @Body()
    body: {
      slot?: 'main' | 'bonus';
      infillStartS?: number;
      infillEndS?: number;
      autoChorus?: boolean;
      style?: string;
      prompt?: string;
    },
  ) {
    const g = await this.generationsService.adminReplaceSection(id, body);
    return { ok: true, id: g.id, status: g.status };
  }

  /** WAV studio pentru un slot. */
  @Post('generations/:id/wav')
  async wav(@Param('id') id: string, @Body() body: { slot?: 'main' | 'bonus' }) {
    return this.generationsService.adminConvertWav(id, body.slot === 'bonus' ? 'bonus' : 'main');
  }

  /** Separare voce/instrumental (karaoke) sau stem-uri. */
  @Post('generations/:id/separate-vocals')
  async separateVocals(
    @Param('id') id: string,
    @Body() body: { slot?: 'main' | 'bonus'; type?: 'separate_vocal' | 'split_stem' },
  ) {
    return this.generationsService.adminSeparateVocals(
      id,
      body.slot === 'bonus' ? 'bonus' : 'main',
      body.type === 'split_stem' ? 'split_stem' : 'separate_vocal',
    );
  }

  /** Videoclip MP4 oficial Suno. */
  @Post('generations/:id/music-video')
  async musicVideo(@Param('id') id: string, @Body() body: { slot?: 'main' | 'bonus' }) {
    return this.generationsService.adminMusicVideo(id, body.slot === 'bonus' ? 'bonus' : 'main');
  }

  /** Soldul real de credite din contul Suno. */
  @Get('suno/credits')
  async sunoCredits() {
    const credits = await this.suno.getCredits();
    return { credits };
  }

  @Delete('generations/:id')
  async deleteGeneration(@Param('id') id: string) {
    await this.generations.delete({ id });
    return { ok: true };
  }

  /**
   * Creare user din admin (inclusiv admini). Userii sunt unici pe (siteId, email),
   * deci site-ul e obligatoriu. ATENȚIE pentru admini: magic link-ul cerut de pe
   * admin.manelecadou.ro caută userul pe site-ul DEFAULT — creează adminii acolo,
   * altfel la login se creează un duplicat cu role='user'.
   */
  @Post('users')
  async createUser(@Body() body: CreateUserDto) {
    const email = body.email.toLowerCase().trim();
    const site = await this.sites.findById(body.siteId);
    if (!site) throw new BadRequestException('Site inexistent');
    const existing = await this.users.findOne({ where: { email, siteId: site.id } });
    if (existing) {
      throw new BadRequestException(
        `Există deja un user cu emailul ${email} pe site-ul ${site.domain}`,
      );
    }
    const user = this.users.create({
      email,
      name: body.name?.trim() || null,
      role: body.role === 'admin' ? 'admin' : 'user',
      siteId: site.id,
    });
    await this.users.save(user);
    return user;
  }

  @Patch('users/:id/role')
  async setUserRole(
    @Param('id') id: string,
    @Body() body: { role: 'user' | 'admin' },
  ) {
    const u = await this.users.findOne({ where: { id } });
    if (!u) return { ok: false, reason: 'not_found' };
    u.role = body.role === 'admin' ? 'admin' : 'user';
    await this.users.save(u);
    return { ok: true, role: u.role };
  }

  @Post('users/:id/reset-demo')
  async resetUserDemo(@Param('id') id: string) {
    const u = await this.users.findOne({ where: { id } });
    if (!u) return { ok: false, reason: 'not_found' };
    u.freeDemoUsed = false;
    await this.users.save(u);
    return { ok: true };
  }
}
