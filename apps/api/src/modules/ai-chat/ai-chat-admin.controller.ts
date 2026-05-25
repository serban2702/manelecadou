import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminGuard } from '../../common/admin.guard';
import { AuthedRequestUser, CurrentSiteId, CurrentUser } from '../../common/decorators';
import { AiMemory, AiMemoryKind } from './ai-memory.entity';
import { AiToolCall } from './ai-tool-call.entity';
import { AILearnerService } from './ai-learner.service';

const KINDS: AiMemoryKind[] = ['fact', 'faq', 'tone_example', 'edge_case', 'product', 'policy'];

class CreateMemoryDto {
  @IsString() @IsIn(KINDS)
  kind!: AiMemoryKind;
  @IsString() @MinLength(5) @MaxLength(1000)
  content!: string;
  @IsOptional() @IsBoolean()
  approved?: boolean;
}

class UpdateMemoryDto {
  @IsOptional() @IsString() @IsIn(KINDS)
  kind?: AiMemoryKind;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(1000)
  content?: string;
  @IsOptional() @IsBoolean()
  approved?: boolean;
}

@UseGuards(AdminGuard)
@Controller('admin/ai-chat')
export class AiChatAdminController {
  constructor(
    @InjectRepository(AiMemory) private readonly memory: Repository<AiMemory>,
    @InjectRepository(AiToolCall) private readonly audit: Repository<AiToolCall>,
    private readonly learner: AILearnerService,
  ) {}

  // ============== MEMORY ==============

  @Get('memory')
  async listMemory(
    @CurrentSiteId() siteId: string | null,
    @Query('approved') approvedStr?: string,
  ) {
    const qb = this.memory.createQueryBuilder('m');
    if (siteId) qb.where('(m.siteId = :siteId OR m.siteId IS NULL)', { siteId });
    if (approvedStr === 'true') qb.andWhere('m.approved = true');
    if (approvedStr === 'false') qb.andWhere('m.approved = false');
    return qb
      .orderBy('m.approved', 'ASC') // unapproved first (review queue)
      .addOrderBy('m."usageCount"', 'DESC')
      .addOrderBy('m."createdAt"', 'DESC')
      .take(200)
      .getMany();
  }

  @Get('memory/stats')
  async memoryStats(@CurrentSiteId() siteId: string | null) {
    const qb = this.memory.createQueryBuilder('m');
    if (siteId) qb.where('(m.siteId = :siteId OR m.siteId IS NULL)', { siteId });
    const [total, approved, pending] = await Promise.all([
      qb.clone().getCount(),
      qb.clone().andWhere('m.approved = true').getCount(),
      qb.clone().andWhere('m.approved = false').getCount(),
    ]);
    return { total, approved, pending };
  }

  @Post('memory')
  async createMemory(
    @Body() dto: CreateMemoryDto,
    @CurrentSiteId() siteId: string | null,
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    const row = this.memory.create({
      siteId,
      kind: dto.kind,
      content: dto.content.trim(),
      approved: dto.approved !== false, // admin-created = default approved
      approvedBy: dto.approved !== false ? user?.id ?? null : null,
      approvedAt: dto.approved !== false ? new Date() : null,
    });
    return this.memory.save(row);
  }

  @Put('memory/:id')
  async updateMemory(
    @Param('id') id: string,
    @Body() dto: UpdateMemoryDto,
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    const row = await this.memory.findOne({ where: { id } });
    if (!row) throw new Error('Memory not found');
    if (dto.kind) row.kind = dto.kind;
    if (dto.content) row.content = dto.content.trim();
    if (typeof dto.approved === 'boolean') {
      row.approved = dto.approved;
      if (dto.approved && !row.approvedAt) {
        row.approvedAt = new Date();
        row.approvedBy = user?.id ?? null;
      }
    }
    return this.memory.save(row);
  }

  @Delete('memory/:id')
  async deleteMemory(@Param('id') id: string) {
    await this.memory.delete({ id });
    return { ok: true };
  }

  @Post('memory/extract-now')
  async extractNow() {
    return this.learner.runManual();
  }

  // ============== TOOL CALL AUDIT ==============

  @Get('audit')
  async listAudit(
    @CurrentSiteId() siteId: string | null,
    @Query('conversationId') conversationId?: string,
    @Query('toolName') toolName?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitStr ?? '100', 10) || 100, 1), 500);
    const qb = this.audit.createQueryBuilder('a');
    if (siteId) qb.where('(a.siteId = :siteId OR a.siteId IS NULL)', { siteId });
    if (conversationId) qb.andWhere('a.conversationId = :cid', { cid: conversationId });
    if (toolName) qb.andWhere('a.toolName = :tn', { tn: toolName });
    return qb.orderBy('a.createdAt', 'DESC').take(limit).getMany();
  }

  @Get('audit/cost-summary')
  async costSummary(@CurrentSiteId() siteId: string | null) {
    const qb = this.audit
      .createQueryBuilder('a')
      .select('a.model', 'model')
      .addSelect('COUNT(*)::int', 'calls')
      .addSelect('SUM(COALESCE(a."totalPromptTokens", 0))::int', 'tokensIn')
      .addSelect('SUM(COALESCE(a."totalCompletionTokens", 0))::int', 'tokensOut');
    if (siteId) qb.where('(a.siteId = :siteId OR a.siteId IS NULL)', { siteId });
    qb.andWhere(`a."createdAt" >= NOW() - INTERVAL '7 days'`);
    qb.groupBy('a.model');
    return qb.getRawMany();
  }
}
