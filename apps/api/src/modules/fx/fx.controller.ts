import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminGuard } from '../../common/admin.guard';
import { FxRate } from './fx-rate.entity';
import { FxRateService } from './fx-rate.service';

@Controller('admin/fx')
@UseGuards(AdminGuard)
export class FxAdminController {
  constructor(
    private readonly fx: FxRateService,
    @InjectRepository(FxRate) private readonly repo: Repository<FxRate>,
  ) {}

  @Get('status')
  async status() {
    const count = await this.repo.count();
    const latest = await this.repo
      .createQueryBuilder('fx')
      .where('fx.currency = :c', { c: 'EUR' })
      .orderBy('fx.date', 'DESC')
      .limit(1)
      .getOne();
    return {
      count,
      latestEur: latest ? { date: latest.date, rate: Number(latest.rateToRon) } : null,
    };
  }

  @Post('refresh')
  async refresh() {
    const latest = await this.fx.refreshLatest();
    const tenDays = await this.fx.refresh10Days();
    return { ok: true, latest, tenDays };
  }

  @Post('import-year')
  async importYear(@Body() body: { year?: number }) {
    const year = Number(body?.year) || new Date().getFullYear();
    const n = await this.fx.importYear(year);
    return { ok: true, year, imported: n };
  }

  @Get('rate')
  async rate(@Query('currency') currency = 'EUR', @Query('date') date?: string) {
    const when = date ? new Date(date + 'T12:00:00Z') : new Date();
    const rate = await this.fx.getRateToRon(currency, when);
    return { currency: currency.toUpperCase(), date: date ?? null, rate };
  }
}
