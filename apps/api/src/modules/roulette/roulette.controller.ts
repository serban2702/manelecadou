import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional } from 'class-validator';
import { RouletteService } from './roulette.service';
import { OptionalJwtAuthGuard } from '../../common/jwt.guard';
import {
  AuthedRequestUser,
  CurrentGuestId,
  CurrentSiteId,
  CurrentUser,
} from '../../common/decorators';

class SpinDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}

@UseGuards(OptionalJwtAuthGuard)
@Controller('roulette')
export class RouletteController {
  constructor(private readonly svc: RouletteService) {}

  @Get('prizes')
  prizes() {
    return this.svc.getPrizes();
  }

  @Get('status')
  status(
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.svc.canSpin({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      siteId,
    });
  }

  @Throttle({ short: { limit: 1, ttl: 5_000 }, medium: { limit: 5, ttl: 86_400_000 } })
  @Post('spin')
  async spin(
    @Body() dto: SpinDto,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.svc.spin({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      email: user?.email ?? dto.email,
      siteId,
    });
  }
}
