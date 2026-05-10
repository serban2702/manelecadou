import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { GenerationsService } from './generations.service';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { GiftCodesService } from '../gift-codes/gift-codes.service';
import {
  CurrentGuestId,
  CurrentSiteId,
  CurrentUser,
  AuthedRequestUser,
} from '../../common/decorators';
import { OptionalJwtAuthGuard } from '../../common/jwt.guard';

@Controller('generations')
export class GenerationsController {
  constructor(
    private readonly svc: GenerationsService,
    private readonly giftCodes: GiftCodesService,
  ) {}

  @Get('recent')
  async recent(@CurrentSiteId() siteId: string | null, @Query('limit') limit?: string) {
    const n = Number(limit ?? '12');
    const items = await this.svc.listRecent(Number.isFinite(n) ? n : 12, siteId);
    return items.map((g) => ({
      id: g.id,
      style: g.style,
      occasion: g.occasion,
      recipientName: g.recipientName,
      voiceArtist: g.voiceArtist,
      audioUrl: g.audioUrl,
      coverUrl: g.coverUrl,
      createdAt: g.createdAt,
    }));
  }

  @Get('public')
  async listPublic(
    @CurrentSiteId() siteId: string | null,
    @Query('style') style?: string,
    @Query('occasion') occasion?: string,
    @Query('voice') voice?: string,
    @Query('period') period?: 'week' | 'month' | 'all',
    @Query('sort') sort?: 'recent' | 'popular',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const { items, total } = await this.svc.listPublic({
      style,
      occasion,
      voice,
      period,
      sort,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      siteId,
    });
    return {
      total,
      items: items.map((g) => ({
        id: g.id,
        style: g.style,
        occasion: g.occasion,
        recipientName: g.recipientName,
        voiceArtist: g.voiceArtist,
        audioUrl: g.audioUrl,
        coverUrl: g.coverUrl,
        viewCount: g.viewCount,
        createdAt: g.createdAt,
      })),
    };
  }

  @Throttle({ short: { limit: 1, ttl: 30_000 }, medium: { limit: 5, ttl: 3_600_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  async create(
    @Body() dto: CreateGenerationDto,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.svc.create(dto, {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      siteId,
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    // Întâi încercăm ca owner (date complete)
    try {
      return await this.svc.findOne(id, {
        userId: user?.id ?? null,
        guestId: user ? null : guestId,
      });
    } catch {
      // Fallback: dacă generation-ul e succeeded, expunem o vedere publică restrânsă
      const pub = await this.svc.findOnePublic(id);
      if (!pub || pub.status !== 'succeeded') throw new Error('Not your generation');
      // Demo neplătit → privat pentru owner. Nu îl expunem public.
      if (pub.type === 'demo' && !pub.paidUnlocked) throw new Error('Not your generation');
      // best-effort view tracking; ignorăm eșecul (nu blochează request-ul)
      this.svc.incrementViewCount(pub.id).catch(() => {});
      return {
        id: pub.id,
        type: pub.type,
        status: pub.status,
        durationSec: pub.durationSec,
        style: pub.style,
        occasion: pub.occasion,
        recipientName: pub.recipientName,
        voiceArtist: pub.voiceArtist,
        audioUrl: pub.audioUrl,
        bonusAudioUrl: pub.bonusAudioUrl,
        coverUrl: pub.coverUrl,
        lyrics: pub.lyrics,
        paidUnlocked: pub.paidUnlocked,
        createdAt: pub.createdAt,
        completedAt: pub.completedAt,
        // datele sensibile (message, dedication, owner ids, custom lyrics) NU expuse public
      };
    }
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async list(
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    return this.svc.listMine({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
    });
  }

  /** Câte manele a generat utilizatorul curent (sau guest-ul curent). */
  @SkipThrottle({ short: true, medium: true, long: true })
  @UseGuards(OptionalJwtAuthGuard)
  @Get('count/mine')
  async countMine(
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    const count = await this.svc.countMine({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
    });
    return { count, scope: user ? 'user' : guestId ? 'guest' : 'anonymous' };
  }

  /** Total manele generate pe site-ul curent (public). */
  @SkipThrottle({ short: true, medium: true, long: true })
  @Get('count/total')
  async countTotal(@CurrentSiteId() siteId: string | null) {
    return { count: await this.svc.countAll(siteId) };
  }

  @Throttle({ short: { limit: 1, ttl: 10_000 }, medium: { limit: 5, ttl: 3_600_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/retry')
  async retry(
    @Param('id') id: string,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    return this.svc.retry(id, {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/unlock-with-gift')
  async unlockWithGift(
    @Param('id') id: string,
    @Body() body: { code: string },
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.svc.unlockWithGift(
      id,
      () =>
        this.giftCodes.consume(body.code, {
          userId: user?.id ?? null,
          guestId: user ? null : guestId,
          siteId,
        }),
      {
        userId: user?.id ?? null,
        guestId: user ? null : guestId,
      },
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/unlock')
  async unlock(
    @Param('id') id: string,
    @Body() body: { paymentId: string },
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    return this.svc.unlockWithPayment(id, body.paymentId, {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
    });
  }
}
