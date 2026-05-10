import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { AdminGuard } from '../../common/admin.guard';
import { SunoLog } from '../suno/suno-log.entity';
import { SunoCreditPurchase } from '../suno/suno-credit-purchase.entity';
import { SunoLogService } from '../suno/suno-log.service';

class CreatePurchaseDto {
  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  credits!: number;

  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  amountRon!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  amountUsd?: number;

  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

interface AuthedReq extends Request {
  user?: { id: string; email: string; role?: string };
}

@UseGuards(AdminGuard)
@Controller('admin/suno')
export class AdminSunoController {
  constructor(
    @InjectRepository(SunoLog) private readonly logs: Repository<SunoLog>,
    @InjectRepository(SunoCreditPurchase)
    private readonly purchases: Repository<SunoCreditPurchase>,
    private readonly sunoLogSvc: SunoLogService,
  ) {}

  // ===== Log-uri Suno =====

  @Get('logs')
  async listLogs(
    @Query('limit') limit = '50',
    @Query('outcome') outcome?: string,
    @Query('generationId') generationId?: string,
  ) {
    const qb = this.logs.createQueryBuilder('l').orderBy('l.createdAt', 'DESC');
    if (outcome) qb.andWhere('l.outcome = :outcome', { outcome });
    if (generationId) qb.andWhere('l.generationId = :gid', { gid: generationId });
    qb.take(Math.min(Number(limit) || 50, 500));
    const items = await qb.getMany();
    return items.map((l) => ({
      id: l.id,
      generationId: l.generationId,
      endpoint: l.endpoint,
      requestType: l.requestType,
      responseStatus: l.responseStatus,
      taskId: l.taskId,
      providerStatus: l.providerStatus,
      outcome: l.outcome,
      errorMessage: l.errorMessage,
      costCredits: Number(l.costCredits),
      createdAt: l.createdAt,
      completedAt: l.completedAt,
    }));
  }

  @Get('logs/:id')
  async getLog(@Param('id') id: string) {
    const l = await this.logs.findOne({ where: { id } });
    if (!l) return { ok: false, reason: 'not_found' };
    return {
      ...l,
      costCredits: Number(l.costCredits),
    };
  }

  // ===== Achiziții credite =====

  @Get('credit-purchases')
  async listPurchases(@Query('limit') limit = '100') {
    const items = await this.purchases.find({
      order: { purchasedAt: 'DESC', createdAt: 'DESC' },
      take: Math.min(Number(limit) || 100, 500),
    });
    return items.map((p) => ({
      id: p.id,
      credits: Number(p.credits),
      amountRon: Number(p.amountRon),
      amountUsd: p.amountUsd != null ? Number(p.amountUsd) : null,
      notes: p.notes,
      purchasedAt: p.purchasedAt,
      createdAt: p.createdAt,
      recordedByEmail: p.recordedByEmail,
    }));
  }

  @Post('credit-purchases')
  async createPurchase(@Body() dto: CreatePurchaseDto, @Req() req: AuthedReq) {
    const created = this.purchases.create({
      credits: dto.credits.toFixed(2),
      amountRon: dto.amountRon.toFixed(2),
      amountUsd: dto.amountUsd != null ? dto.amountUsd.toFixed(2) : null,
      notes: dto.notes ?? null,
      purchasedAt: dto.purchasedAt ?? new Date().toISOString().slice(0, 10),
      recordedByEmail: req.user?.email ?? null,
    });
    const saved = await this.purchases.save(created);
    return {
      id: saved.id,
      credits: Number(saved.credits),
      amountRon: Number(saved.amountRon),
      amountUsd: saved.amountUsd != null ? Number(saved.amountUsd) : null,
      notes: saved.notes,
      purchasedAt: saved.purchasedAt,
      createdAt: saved.createdAt,
      recordedByEmail: saved.recordedByEmail,
    };
  }

  @Delete('credit-purchases/:id')
  async deletePurchase(@Param('id') id: string) {
    await this.purchases.delete({ id });
    return { ok: true };
  }

  // ===== Sumar / sold =====

  @Get('summary')
  async summary() {
    const purchasesAgg = await this.purchases
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.credits), 0)', 'credits')
      .addSelect('COALESCE(SUM(p.amountRon), 0)', 'ron')
      .addSelect('COALESCE(SUM(p.amountUsd), 0)', 'usd')
      .getRawOne<{ credits: string; ron: string; usd: string }>();

    const usedAgg = await this.logs
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.costCredits), 0)', 'used')
      .getRawOne<{ used: string }>();

    const last24hAgg = await this.logs
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.costCredits), 0)', 'used')
      .where(`l.createdAt >= NOW() - INTERVAL '24 hours'`)
      .getRawOne<{ used: string }>();

    const counts = await this.logs
      .createQueryBuilder('l')
      .select('l.outcome', 'outcome')
      .addSelect('COUNT(*)', 'count')
      .groupBy('l.outcome')
      .getRawMany<{ outcome: string; count: string }>();

    const purchasedCredits = Number(purchasesAgg?.credits ?? 0);
    const purchasedRon = Number(purchasesAgg?.ron ?? 0);
    const purchasedUsd = Number(purchasesAgg?.usd ?? 0);
    const usedCredits = Number(usedAgg?.used ?? 0);
    const usedLast24h = Number(last24hAgg?.used ?? 0);
    const balance = purchasedCredits - usedCredits;
    const ronPerCredit = purchasedCredits > 0 ? purchasedRon / purchasedCredits : 0;
    const usedRonEstimate = usedCredits * ronPerCredit;

    const outcomeCounts: Record<string, number> = {};
    for (const c of counts) outcomeCounts[c.outcome] = Number(c.count);

    return {
      defaultCostPerGenerate: this.sunoLogSvc.defaultCostCredits(),
      purchased: {
        credits: purchasedCredits,
        amountRon: purchasedRon,
        amountUsd: purchasedUsd,
      },
      used: {
        credits: usedCredits,
        last24hCredits: usedLast24h,
        ronEstimate: Number(usedRonEstimate.toFixed(2)),
      },
      balance: {
        credits: Number(balance.toFixed(2)),
        ronPerCredit: Number(ronPerCredit.toFixed(4)),
      },
      outcomeCounts,
    };
  }
}
