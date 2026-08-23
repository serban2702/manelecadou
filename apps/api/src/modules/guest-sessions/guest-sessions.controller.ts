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

  @Post('me/follow')
  async follow(
    @Headers('x-guest-id') guestId: string | undefined,
    @Body() body: FollowDto,
    @CurrentSiteId() siteId: string | null,
  ) {
    if (!guestId) throw new BadRequestException('Missing X-Guest-Id');
    return this.svc.markSocialFollow(guestId, body.network, siteId);
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
