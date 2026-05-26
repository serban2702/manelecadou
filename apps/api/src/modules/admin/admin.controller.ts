import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
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
import { MailerService } from '../../mailer/mailer.module';
import { SeederService } from '../../database/seeder/seeder.service';
import { SitesService } from '../sites/sites.service';
import { GenerationsService } from '../generations/generations.service';

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

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(Generation) private readonly generations: Repository<Generation>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(AnalyticsSession) private readonly analyticsSessions: Repository<AnalyticsSession>,
    private readonly mailer: MailerService,
    private readonly paymentsService: PaymentsService,
    private readonly seeder: SeederService,
    private readonly sites: SitesService,
    private readonly generationsService: GenerationsService,
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

    return guests.map((g) => {
      const s = byGuest.get(g.id);
      return {
        ...g,
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
  async listPayments(@Query('limit') limit = '50', @CurrentSiteId() siteId: string | null) {
    const payments = await this.payments.find({
      where: siteId ? { siteId } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(Number(limit) || 50, 200),
    });
    if (payments.length === 0) return [];

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

    return payments.map((p) => {
      const g = genByPaymentId.get(p.id) ?? null;
      return {
        ...p,
        email: p.userId
          ? userEmail.get(p.userId) ?? null
          : p.guestId
            ? guestEmail.get(p.guestId) ?? null
            : null,
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

  @Post('generations/:id/retry')
  async retryGeneration(@Param('id') id: string) {
    const g = await this.generationsService.adminRetry(id);
    return { ok: true, status: g.status, retryCount: g.retryCount };
  }

  @Delete('generations/:id')
  async deleteGeneration(@Param('id') id: string) {
    await this.generations.delete({ id });
    return { ok: true };
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
