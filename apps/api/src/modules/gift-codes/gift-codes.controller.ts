import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsEnum, IsInt, IsString, Min } from 'class-validator';
import { GiftCodesService } from './gift-codes.service';
import { GiftTier } from './gift-code.entity';
import { PaymentsService } from '../payments/payments.service';
import {
  AuthedRequestUser,
  CurrentGuestId,
  CurrentSite,
  CurrentSiteId,
  CurrentUser,
} from '../../common/decorators';
import { Site } from '../sites/site.entity';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../../common/jwt.guard';
import { AdminGuard } from '../../common/admin.guard';

class PurchaseGiftDto {
  @IsEnum(['single', 'pack3', 'pack10'])
  tier!: GiftTier;
  @IsEmail()
  email!: string;
}

class RedeemDto {
  @IsString()
  code!: string;
}

@Controller('gift-codes')
export class GiftCodesController {
  constructor(
    private readonly svc: GiftCodesService,
    private readonly payments: PaymentsService,
  ) {}

  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @Post('validate')
  async validate(@Body() body: { code: string }, @CurrentSite() site: Site) {
    const r = await this.svc.validate(body.code, site.id);
    if (!r.ok) return { ok: false, reason: r.reason };
    return {
      ok: true,
      tier: r.code!.tier,
      usesLeft: r.code!.usesLeft,
      validUntil: r.code!.validUntil,
    };
  }

  @Throttle({ short: { limit: 1, ttl: 30_000 }, medium: { limit: 5, ttl: 3_600_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post('purchase')
  async purchase(
    @Body() dto: PurchaseGiftDto,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSite() site: Site,
  ) {
    return this.payments.createGiftCheckoutSession({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      tier: dto.tier,
      email: dto.email,
      site,
    });
  }

  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post('redeem')
  async redeem(
    @Body() dto: RedeemDto,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSite() site: Site,
  ) {
    return this.svc.consume(dto.code, {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      siteId: site.id,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async mine(@CurrentUser() user: AuthedRequestUser) {
    const items = await this.svc.listMine(user.id);
    return items.map((c) => ({
      id: c.id,
      code: c.code,
      tier: c.tier,
      usesLeft: c.usesLeft,
      totalUses: c.totalUses,
      validUntil: c.validUntil,
      active: c.active,
      createdAt: c.createdAt,
    }));
  }
}

@UseGuards(AdminGuard)
@Controller('admin/gift-codes')
export class AdminGiftCodesController {
  constructor(private readonly svc: GiftCodesService) {}

  @Get()
  list(@CurrentSiteId() siteId: string | null) {
    return this.svc.listAll(siteId);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.svc.setActive(id, !!body.active);
  }

  @Patch(':id/extend')
  extend(@Param('id') id: string, @Body() body: { days: number }) {
    return this.svc.extend(id, Math.max(1, Math.min(3650, Number(body.days) || 30)));
  }
}
