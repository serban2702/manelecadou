import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Generation } from '../generations/generation.entity';
import { Payment } from '../payments/payment.entity';
import { MailerService } from '../../mailer/mailer.module';
import { SeederService } from '../../database/seeder/seeder.service';

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
    private readonly mailer: MailerService,
    private readonly seeder: SeederService,
  ) {}

  @Post('seeder/run')
  async runSeeder() {
    return this.seeder.run();
  }

  @Get('mail/status')
  mailStatus() {
    return { provider: this.mailer.providerName };
  }

  @Post('mail/test')
  async testMail(@Body() body: TestMailDto) {
    return this.mailer.sendDetailed({
      to: body.to,
      subject: body.subject,
      html: `<p>${body.body}</p>`,
      text: body.body,
    });
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
    return this.guests.find({
      where: siteId ? { siteId } : {},
      order: { lastSeenAt: 'DESC' },
      take: Math.min(Number(limit) || 50, 200),
    });
  }

  @Get('generations')
  async listGenerations(@Query('limit') limit = '50', @CurrentSiteId() siteId: string | null) {
    return this.generations.find({
      where: siteId ? { siteId } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(Number(limit) || 50, 200),
    });
  }

  @Get('generations/:id')
  async getGeneration(@Param('id') id: string) {
    return this.generations.findOne({ where: { id } });
  }

  @Get('payments')
  async listPayments(@Query('limit') limit = '50', @CurrentSiteId() siteId: string | null) {
    return this.payments.find({
      where: siteId ? { siteId } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(Number(limit) || 50, 200),
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
