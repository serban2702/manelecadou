import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn } from 'class-validator';
import { GuestSessionsService } from './guest-sessions.service';
import { CurrentSiteId } from '../../common/decorators';

class SetEmailDto {
  @IsEmail()
  email!: string;
}

class FollowDto {
  @IsIn(['facebook', 'tiktok'])
  network!: 'facebook' | 'tiktok';
}

@Controller('guest-sessions')
export class GuestSessionsController {
  constructor(private readonly svc: GuestSessionsService) {}

  @Throttle({ short: { limit: 3, ttl: 60_000 }, medium: { limit: 10, ttl: 3_600_000 } })
  @Post()
  async create(
    @Body() body: { locale?: string; ua?: string } = {},
    @CurrentSiteId() siteId: string | null,
  ) {
    const g = await this.svc.create(siteId, { locale: body.locale, ua: body.ua });
    return {
      id: g.id,
      freeDemoUsed: g.freeDemoUsed,
      email: g.email,
      createdAt: g.createdAt,
    };
  }

  @Get('me')
  async me(@Headers('x-guest-id') guestId: string | undefined) {
    if (!guestId) return { id: null, freeDemoUsed: false, email: null };
    const g = await this.svc.findById(guestId);
    if (!g) return { id: null, freeDemoUsed: false, email: null };
    await this.svc.touch(g.id);
    const follow = this.svc.followState(g);
    return {
      id: g.id,
      freeDemoUsed: g.freeDemoUsed,
      email: g.email,
      claimedByUserId: g.userId,
      followFacebook: follow.facebook,
      followTiktok: follow.tiktok,
      followPromoCode: follow.promoCode,
    };
  }

  /**
   * Starea follow-ului + procentul care VA FI emis. Endpoint separat de `me`
   * fiindcă procentul cere un query pe `generations`, iar `me` e apelat de pe
   * fiecare pagină; aici se cere doar de secțiunea de follow.
   */
  @Get('me/follow')
  async followStatus(
    @Headers('x-guest-id') guestId: string | undefined,
    @CurrentSiteId() siteId: string | null,
  ) {
    if (!guestId) throw new BadRequestException('Missing X-Guest-Id');
    const g = await this.svc.findById(guestId);
    if (!g) throw new BadRequestException('Missing X-Guest-Id');
    const follow = this.svc.followState(g);
    return {
      ...follow,
      discountPercent: await this.svc.nextSongDiscountFor(g.id, g.siteId ?? siteId),
    };
  }

  @Post('me/follow')
  async follow(
    @Headers('x-guest-id') guestId: string | undefined,
    @Body() body: FollowDto,
    @CurrentSiteId() siteId: string | null,
  ) {
    if (!guestId) throw new BadRequestException('Missing X-Guest-Id');
    const state = await this.svc.markSocialFollow(guestId, body.network, siteId);
    return {
      ...state,
      discountPercent: await this.svc.nextSongDiscountFor(guestId, siteId),
    };
  }

  @Patch('me/email')
  async setEmail(
    @Headers('x-guest-id') guestId: string | undefined,
    @Body() body: SetEmailDto,
  ) {
    if (!guestId) throw new BadRequestException('Missing X-Guest-Id');
    const g = await this.svc.setEmail(guestId, body.email);
    return { id: g.id, email: g.email, freeDemoUsed: g.freeDemoUsed };
  }
}
