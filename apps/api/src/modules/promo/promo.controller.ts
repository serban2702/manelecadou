import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import { PromoService } from './promo.service';

class ValidatePromoDto {
  @IsString()
  @MaxLength(64)
  code!: string;
  @IsOptional()
  @IsEmail()
  email?: string;
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  baseAmountCents?: number;
}

class CreatePromoDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;
  @IsEnum(['percent', 'fixed'])
  discountType!: 'percent' | 'fixed';
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  discountValue!: number;
  @IsOptional()
  @IsDateString()
  validFrom?: string;
  @IsOptional()
  @IsDateString()
  validUntil?: string;
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  maxUses?: number;
  @IsOptional()
  @IsEmail()
  restrictedToEmail?: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

@Controller('promo')
export class PromoController {
  constructor(private readonly svc: PromoService) {}

  @Throttle({ short: { limit: 5, ttl: 30_000 }, medium: { limit: 30, ttl: 3_600_000 } })
  @Post('validate')
  async validate(@Body() dto: ValidatePromoDto, @CurrentSiteId() siteId: string | null) {
    return this.svc.validate(dto.code, dto.email, dto.baseAmountCents, siteId);
  }
}

@UseGuards(AdminGuard)
@Controller('admin/promo')
export class AdminPromoController {
  constructor(private readonly svc: PromoService) {}

  @Get()
  list(@CurrentSiteId() siteId: string | null) {
    return this.svc.list(siteId);
  }

  @Post()
  create(@Body() dto: CreatePromoDto, @CurrentSiteId() siteId: string | null) {
    return this.svc.create({
      siteId,
      code: dto.code,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      maxUses: dto.maxUses,
      restrictedToEmail: dto.restrictedToEmail ?? null,
      note: dto.note ?? null,
    });
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.svc.setActive(id, !!body.active);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.svc.stats(id);
  }
}
