import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { AdminGuard } from '../../common/admin.guard';
import { OptionalJwtAuthGuard } from '../../common/jwt.guard';
import { CurrentSiteId } from '../../common/decorators';
import { AnalyticsService } from './analytics.service';
import { AdSpendService } from './ad-spend.service';
import { SitesService } from '../sites/sites.service';
import { TrackBatchDto, TrackEventDto } from './dto';

function clientIp(req: Request): string | null {
  const fwd = (req.headers['x-forwarded-for'] as string) || '';
  if (fwd) return fwd.split(',')[0].trim();
  return (req.ip || req.socket?.remoteAddress) ?? null;
}

function userAgent(req: Request): string | null {
  return (req.headers['user-agent'] as string | undefined) ?? null;
}

function guestIdHeader(req: Request): string | null {
  // Web client trimite `X-Guest-Id` (vezi apps/web/lib/api.ts).
  const raw = req.headers['x-guest-id'] ?? req.headers['x-guest-session-id'];
  if (!raw) return null;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function rangeFromQuery(q: { from?: string; to?: string }): { from: Date; to: Date } {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from, to };
}

@Controller('analytics')
export class AnalyticsPublicController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Endpoint public — folosit de tracker-ul din browser. Rate-limit moderat. */
  @Throttle({ medium: { limit: 120, ttl: 60_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  /** Returnează IP-ul real al clientului (din `X-Forwarded-For` setat de Caddy).
   *  Folosit de OpenReplay tracker (apps/web/components/OpenReplay.tsx) ca să
   *  poată trimite `setUserID('ip:<X>')` la sesiunile anonimoase — astfel
   *  poți distinge utilizatorii din dashboard fără să te bazezi pe geo
   *  approximate. NU expune nimic sensibil — IP-ul oricum era în log-uri. */
  @SkipThrottle()
  @Get('whoami')
  whoami(@Req() req: Request) {
    return { ip: clientIp(req) };
  }

  @Post('track')
  @HttpCode(204)
  async track(
    @Body() dto: TrackEventDto,
    @Req() req: Request,
    @CurrentSiteId() siteId: string | null,
  ) {
    const userId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
    const guestId = guestIdHeader(req);
    await this.analytics.ingest(dto, {
      userId,
      guestId: userId ? null : guestId,
      ip: clientIp(req),
      userAgent: userAgent(req),
      siteId,
      req,
    });
  }

  @Throttle({ medium: { limit: 30, ttl: 60_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post('track/batch')
  @HttpCode(204)
  async trackBatch(
    @Body() dto: TrackBatchDto,
    @Req() req: Request,
    @CurrentSiteId() siteId: string | null,
  ) {
    const userId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
    const guestId = guestIdHeader(req);
    const effectiveGuestId = userId ? null : guestId;
    const ip = clientIp(req);
    const ua = userAgent(req);
    for (const ev of dto.events) {
      await this.analytics.ingest(ev, { userId, guestId: effectiveGuestId, ip, userAgent: ua, siteId, req });
    }
  }
}

@SkipThrottle()
@UseGuards(AdminGuard)
@Controller('admin/analytics')
export class AnalyticsAdminController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly adSpend: AdSpendService,
    private readonly sites: SitesService,
  ) {}

  /** Raport cheltuieli ads (Meta + TikTok) defalcat pe campanie + ROAS.
   *  `fromDay`/`toDay` (YYYY-MM-DD, zile locale) — folosite pentru filtrul pe
   *  cheltuieli ca să evite off-by-one din conversia UTC a datepicker-ului. */
  @Get('ad-spend')
  adSpendReport(
    @Query() q: { from?: string; to?: string; fromDay?: string; toDay?: string },
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.adSpend.report(rangeFromQuery(q), siteId, { fromDay: q.fromDay, toDay: q.toDay });
  }

  /** Trigger manual de sincronizare din Marketing API. Dacă `x-site-id: all`
   *  (siteId null) sincronizează toate site-urile configurate; altfel doar
   *  site-ul curent. `days` opțional (default 7). */
  @Post('ad-spend/sync')
  @HttpCode(200)
  async adSpendSync(
    @Query() q: { days?: string },
    @CurrentSiteId() siteId: string | null,
  ) {
    const days = Math.min(90, Math.max(1, parseInt(q.days ?? '7', 10) || 7));
    if (!siteId) {
      const results = await this.adSpend.syncAll(days);
      return { ok: true, scope: 'all', results };
    }
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');
    const result = await this.adSpend.syncSite(site, days);
    return { ok: true, scope: 'site', results: [result] };
  }

  @Get('overview')
  overview(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.overview(rangeFromQuery(q), siteId);
  }

  @Get('time-series')
  timeSeries(
    @Query() q: { from?: string; to?: string; bucket?: 'hour' | 'day' },
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.analytics.timeSeries(rangeFromQuery(q), q.bucket === 'hour' ? 'hour' : 'day', siteId);
  }

  @Get('funnel')
  funnel(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.funnel(rangeFromQuery(q), siteId);
  }

  @Get('sources')
  sources(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.sources(rangeFromQuery(q), siteId);
  }

  @Get('top-pages')
  topPages(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.topPages(rangeFromQuery(q), siteId);
  }

  @Get('devices')
  devices(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.devices(rangeFromQuery(q), siteId);
  }

  @Get('users')
  users(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.userCohorts(rangeFromQuery(q), siteId);
  }

  @Get('stripe-reconciliation')
  stripeReconciliation(
    @Query() q: { from?: string; to?: string },
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.analytics.stripeReconciliation(rangeFromQuery(q), siteId);
  }

  @Get('pixel-cross-check')
  pixelCrossCheck(
    @Query() q: { from?: string; to?: string },
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.analytics.pixelCrossCheck(rangeFromQuery(q), siteId);
  }

  @Get('countries')
  countries(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.countries(rangeFromQuery(q), siteId);
  }

  @Get('browsers')
  browsers(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.browsers(rangeFromQuery(q), siteId);
  }

  @Get('os')
  os(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.os(rangeFromQuery(q), siteId);
  }

  @Get('screens')
  screens(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.screens(rangeFromQuery(q), siteId);
  }

  @Get('languages')
  languages(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.languages(rangeFromQuery(q), siteId);
  }

  @Get('web-vitals')
  webVitals(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.webVitals(rangeFromQuery(q), siteId);
  }

  @Get('sessions')
  sessions(
    @Query() q: { from?: string; to?: string; limit?: string; offset?: string; country?: string; browser?: string; device?: string; category?: string; excludeBots?: string },
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.analytics.recentSessions(
      rangeFromQuery(q),
      siteId,
      {
        limit: Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10) || 50)),
        offset: Math.max(0, parseInt(q.offset ?? '0', 10) || 0),
        country: q.country,
        browser: q.browser,
        device: q.device,
        category: q.category,
        excludeBots: q.excludeBots === '1' || q.excludeBots === 'true',
      },
    );
  }

  @Get('bots')
  bots(@Query() q: { from?: string; to?: string }, @CurrentSiteId() siteId: string | null) {
    return this.analytics.botStats(rangeFromQuery(q), siteId);
  }

  @Get('sessions/:key')
  async sessionDetail(@Param('key') key: string, @CurrentSiteId() siteId: string | null) {
    const result = await this.analytics.sessionDetail(key, siteId);
    if (!result) throw new NotFoundException('Sesiune negăsită');
    return result;
  }

  @Get('payments/:id')
  async paymentDetail(@Param('id') id: string, @CurrentSiteId() siteId: string | null) {
    const result = await this.analytics.paymentDetail(id, siteId);
    if (!result) throw new NotFoundException('Plată negăsită');
    return result;
  }
}
