import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId, CurrentUser, type AuthedRequestUser } from '../../common/decorators';
import { SettingsService } from '../settings/settings.service';
import { MarketingService } from './marketing.service';
import { MarketingCronService } from './marketing-cron.service';
import type { CampaignAudience, RuleTrigger } from './marketing.entities';

class PreviewDto {
  @IsString() templateId!: string;
  @IsOptional() @IsObject() overrides?: Record<string, unknown>;
}

class CreateCampaignDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(64) templateId!: string;
  @IsEnum(['all', 'payers', 'nonpayers']) audience!: CampaignAudience;
  @IsOptional() @IsString() promoCodeId?: string | null;
  @IsOptional() @IsObject() overrides?: Record<string, unknown> | null;
}

class CreateRuleDto {
  @IsString() @MaxLength(200) name!: string;
  @IsEnum(['nonpayer', 'payer']) trigger!: RuleTrigger;
  @IsInt() @Min(0) @Max(3650) daysAfter!: number;
  @IsString() @MaxLength(64) templateId!: string;
  @IsEnum(['percent', 'fixed']) discountType!: 'percent' | 'fixed';
  @IsInt() @Min(1) @Max(1_000_000) discountValue!: number;
  @IsInt() @Min(1) @Max(3650) validDays!: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class UpdateRuleDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsEnum(['nonpayer', 'payer']) trigger?: RuleTrigger;
  @IsOptional() @IsInt() @Min(0) @Max(3650) daysAfter?: number;
  @IsOptional() @IsString() @MaxLength(64) templateId?: string;
  @IsOptional() @IsEnum(['percent', 'fixed']) discountType?: 'percent' | 'fixed';
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) discountValue?: number;
  @IsOptional() @IsInt() @Min(1) @Max(3650) validDays?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

@UseGuards(AdminGuard)
@Controller('admin/marketing')
export class AdminMarketingController {
  constructor(
    private readonly svc: MarketingService,
    private readonly cron: MarketingCronService,
    private readonly settings: SettingsService,
  ) {}

  // ---- Șabloane ----

  @Get('templates')
  templates() {
    return this.svc.listTemplates();
  }

  @Post('templates/preview')
  preview(@Body() dto: PreviewDto, @CurrentSiteId() siteId: string | null) {
    return this.svc.previewTemplate(siteId, dto.templateId, dto.overrides);
  }

  // ---- Audiență ----

  @Get('audience')
  audience(@CurrentSiteId() siteId: string | null) {
    return this.svc.audienceCounts(siteId);
  }

  // ---- Campanii ----

  @Get('campaigns')
  listCampaigns(@CurrentSiteId() siteId: string | null) {
    return this.svc.listCampaigns(siteId);
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id') id: string) {
    return this.svc.getCampaign(id);
  }

  @Post('campaigns')
  createCampaign(
    @Body() dto: CreateCampaignDto,
    @CurrentSiteId() siteId: string | null,
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    return this.svc.createCampaign(
      siteId,
      {
        name: dto.name,
        templateId: dto.templateId,
        audience: dto.audience,
        promoCodeId: dto.promoCodeId ?? null,
        overrides: dto.overrides ?? null,
      },
      user?.email ?? null,
    );
  }

  // ---- Reguli automate ----

  @Get('rules')
  listRules(@CurrentSiteId() siteId: string | null) {
    return this.svc.listRules(siteId);
  }

  @Post('rules')
  createRule(@Body() dto: CreateRuleDto, @CurrentSiteId() siteId: string | null) {
    return this.svc.createRule(siteId, dto);
  }

  @Patch('rules/:id')
  updateRule(@Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.svc.updateRule(id, dto);
  }

  @Delete('rules/:id')
  deleteRule(@Param('id') id: string) {
    return this.svc.deleteRule(id);
  }

  @Post('rules/:id/run')
  async runRule(@Param('id') id: string) {
    const max = Number(await this.settings.get('MARKETING_RULE_MAX_PER_RUN')) || 200;
    return this.svc.runRule(id, max);
  }

  @Post('rules/run-all')
  runAll() {
    return this.cron.runAllActive();
  }
}
