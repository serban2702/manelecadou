import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SitesService } from '../sites/sites.service';
import { verifyUnsubscribeToken } from './unsubscribe-token';
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

/**
 * Endpoint PUBLIC de dezabonare (one-click, fără login). Linkul vine din footer-ul
 * mailurilor de marketing. NU afectează mailurile tranzacționale.
 */
@Controller('marketing')
export class MarketingPublicController {
  constructor(
    private readonly svc: MarketingService,
    private readonly sites: SitesService,
  ) {}

  @Throttle({ short: { limit: 10, ttl: 60_000 }, medium: { limit: 60, ttl: 3_600_000 } })
  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribe(@Query('token') token: string): Promise<string> {
    const parsed = token ? verifyUnsubscribeToken(token) : null;
    if (!parsed) {
      return page('Link invalid', 'Linkul de dezabonare nu este valid sau a expirat.', null);
    }
    await this.svc.optOut(parsed.siteId, parsed.email, 'link');
    const site = parsed.siteId ? await this.sites.findById(parsed.siteId) : null;
    return page(
      'Te-ai dezabonat',
      `Adresa <b>${escapeHtml(parsed.email)}</b> nu va mai primi mailuri de marketing. Vei primi în continuare doar confirmările importante (plată, melodie gata).`,
      site?.name ?? null,
    );
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Pagină HTML minimală, brandată (dark + gold), pentru confirmarea dezabonării. */
function page(title: string, body: string, brandName: string | null): string {
  const name = escapeHtml(brandName || 'Manele Cadou');
  return `<!DOCTYPE html><html lang="ro"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#0c0707;color:#fff5dc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
    <div style="font-size:44px;margin-bottom:16px;">✉️</div>
    <h1 style="font-size:24px;color:#ffe28a;margin:0 0 14px;font-family:'Times New Roman',serif;">${escapeHtml(title)}</h1>
    <p style="font-size:15px;line-height:1.6;color:rgba(255,245,220,0.85);margin:0;">${body}</p>
    <p style="margin-top:32px;font-size:12px;color:rgba(255,245,220,0.4);">${name}</p>
  </div>
</body></html>`;
}
