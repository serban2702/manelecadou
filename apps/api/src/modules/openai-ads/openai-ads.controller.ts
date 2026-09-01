import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import { SitesService } from '../sites/sites.service';
import { OpenAiAdsService } from './openai-ads.service';

class OpenAiAdsTestDto {
  /** Implicit `true` — verifică forma și credențialele FĂRĂ să înregistreze o conversie. */
  @IsOptional()
  @IsBoolean()
  validateOnly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;
}

/**
 * Testul de configurare pentru ChatGPT Ads.
 *
 * Rulează cu `validate_only: true` implicit: OpenAI verifică pixel ID-ul, cheia
 * și forma payload-ului, dar nu înregistrează nimic. Altfel, fiecare apăsare pe
 * „Testează" ar fi umflat raportul de conversii cu comenzi inexistente.
 */
@UseGuards(AdminGuard)
@Controller('admin/openai-ads')
export class OpenAiAdsAdminController {
  constructor(
    private readonly openai: OpenAiAdsService,
    private readonly sites: SitesService,
  ) {}

  @Post('test')
  async test(@Body() dto: OpenAiAdsTestDto, @CurrentSiteId() siteId: string | null) {
    if (!siteId) {
      throw new BadRequestException('Alege un site anume — cheia și pixelul sunt per-site.');
    }
    const site = await this.sites.findById(siteId);
    if (!site) throw new BadRequestException('Site inexistent.');
    if (!site.analytics?.openaiPixelId) {
      throw new BadRequestException('Completează mai întâi Pixel ID-ul ChatGPT Ads și salvează.');
    }
    if (!site.analyticsSecrets?.openaiConversionsApiKey) {
      throw new BadRequestException('Completează mai întâi cheia Conversions API și salvează.');
    }

    const res = await this.openai.sendEvent({
      site,
      event: 'order_created',
      eventId: `test-${Date.now()}`,
      dataType: 'contents',
      amountMinor: 1,
      currency: site.currency || 'RON',
      sourceUrl: site.domain ? `https://${site.domain}/` : undefined,
      user: dto.email ? { email: dto.email } : undefined,
      validateOnly: dto.validateOnly !== false,
    });

    return {
      ok: res.sent,
      validateOnly: dto.validateOnly !== false,
      status: res.status ?? null,
      response: res.body ?? null,
      reason: res.skippedReason ?? null,
    };
  }
}
