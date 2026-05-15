import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../common/admin.guard';
import { LyricsLog } from '../lyrics/lyrics-log.entity';

@UseGuards(AdminGuard)
@Controller('admin/lyrics')
export class AdminLyricsController {
  constructor(
    @InjectRepository(LyricsLog) private readonly logs: Repository<LyricsLog>,
  ) {}

  @Get('logs')
  async listLogs(
    @Query('limit') limit = '100',
    @Query('outcome') outcome?: string,
    @Query('stage') stage?: string,
    @Query('generationId') generationId?: string,
    @Query('siteId') siteId?: string,
  ) {
    const qb = this.logs.createQueryBuilder('l').orderBy('l.createdAt', 'DESC');
    if (outcome) qb.andWhere('l.outcome = :outcome', { outcome });
    if (stage) qb.andWhere('l.stage = :stage', { stage });
    if (generationId) qb.andWhere('l.generationId = :gid', { gid: generationId });
    if (siteId) qb.andWhere('l.siteId = :sid', { sid: siteId });
    qb.take(Math.min(Number(limit) || 100, 500));
    const items = await qb.getMany();
    return items.map((l) => ({
      id: l.id,
      siteId: l.siteId,
      generationId: l.generationId,
      stage: l.stage,
      model: l.model,
      locale: l.locale,
      responseStatus: l.responseStatus,
      tokensPrompt: l.tokensPrompt,
      tokensCompletion: l.tokensCompletion,
      tokensTotal: l.tokensTotal,
      durationMs: l.durationMs,
      outcome: l.outcome,
      errorMessage: l.errorMessage,
      createdAt: l.createdAt,
      completedAt: l.completedAt,
    }));
  }

  @Get('logs/:id')
  async getLog(@Param('id') id: string) {
    const l = await this.logs.findOne({ where: { id } });
    if (!l) return { ok: false, reason: 'not_found' };
    return l;
  }

  @Get('summary')
  async summary() {
    const counts = await this.logs
      .createQueryBuilder('l')
      .select('l.outcome', 'outcome')
      .addSelect('COUNT(*)', 'count')
      .groupBy('l.outcome')
      .getRawMany<{ outcome: string; count: string }>();

    const last24h = await this.logs
      .createQueryBuilder('l')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(l.tokensTotal), 0)', 'tokens')
      .where(`l.createdAt >= NOW() - INTERVAL '24 hours'`)
      .getRawOne<{ count: string; tokens: string }>();

    const totals = await this.logs
      .createQueryBuilder('l')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(l.tokensTotal), 0)', 'tokens')
      .addSelect('COALESCE(SUM(l.tokensPrompt), 0)', 'prompt')
      .addSelect('COALESCE(SUM(l.tokensCompletion), 0)', 'completion')
      .getRawOne<{ count: string; tokens: string; prompt: string; completion: string }>();

    const stageCounts = await this.logs
      .createQueryBuilder('l')
      .select('l.stage', 'stage')
      .addSelect('COUNT(*)', 'count')
      .groupBy('l.stage')
      .getRawMany<{ stage: string; count: string }>();

    const outcomeCounts: Record<string, number> = {};
    for (const c of counts) outcomeCounts[c.outcome] = Number(c.count);
    const stageCountsMap: Record<string, number> = {};
    for (const s of stageCounts) stageCountsMap[s.stage] = Number(s.count);

    return {
      total: Number(totals?.count ?? 0),
      totalTokens: Number(totals?.tokens ?? 0),
      totalTokensPrompt: Number(totals?.prompt ?? 0),
      totalTokensCompletion: Number(totals?.completion ?? 0),
      last24h: {
        count: Number(last24h?.count ?? 0),
        tokens: Number(last24h?.tokens ?? 0),
      },
      outcomeCounts,
      stageCounts: stageCountsMap,
    };
  }
}
