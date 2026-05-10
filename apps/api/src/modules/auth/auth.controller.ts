import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../../common/jwt.guard';
import { CurrentSiteId, CurrentUser, AuthedRequestUser } from '../../common/decorators';
import { UsersService } from '../users/users.service';

class RequestMagicLinkDto {
  @IsEmail()
  email!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Throttle({ short: { limit: 1, ttl: 10_000 }, medium: { limit: 5, ttl: 3_600_000 } })
  @Post('magic-link/request')
  async request(
    @Body() body: RequestMagicLinkDto,
    @Headers('x-guest-id') guestId: string | undefined,
    @Headers('x-locale') locale: string | undefined,
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.auth.requestMagicLink(body.email, guestId ?? null, locale, siteId);
  }

  @Get('magic-link/consume')
  async consume(
    @Query('token') token: string,
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.auth.consumeMagicLink(token, siteId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthedRequestUser) {
    const u = await this.users.findById(user.id);
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      locale: u.locale,
      freeDemoUsed: u.freeDemoUsed,
      createdAt: u.createdAt,
    };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('locale')
  async setLocale(
    @Body() body: { locale: string },
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    const allowed = new Set(['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs']);
    if (!body?.locale || !allowed.has(body.locale)) {
      return { ok: false };
    }
    if (user?.id) {
      await this.users.setLocale(user.id, body.locale);
    }
    return { ok: true, locale: body.locale };
  }

  @Throttle({ short: { limit: 1, ttl: 60_000 }, medium: { limit: 3, ttl: 86_400_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('gdpr/request')
  async gdprRequest(
    @CurrentUser() user: AuthedRequestUser,
    @Body() body: { type: 'export' | 'delete'; reason?: string },
  ) {
    return this.auth.submitGdprRequest(user.id, body.type, body.reason);
  }
}
