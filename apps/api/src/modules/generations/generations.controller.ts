import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { GenerationsService } from './generations.service';
import { SocialImageUploadService } from './social-image-upload.service';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { GiftCodesService } from '../gift-codes/gift-codes.service';
import {
  CurrentGuestId,
  CurrentSiteId,
  CurrentUser,
  AuthedRequestUser,
} from '../../common/decorators';
import { OptionalJwtAuthGuard } from '../../common/jwt.guard';
import { verifyUnlock } from '../../common/unlock';

/**
 * Endpoint public pentru pagina /top. Întoarce `{ source, items }`:
 *  - `source: 'seed'` → items=null; web app folosește lista hardcoded din seed-data.
 *  - `source: 'live'` → items = top după viewCount, agregat din `generations`.
 * Comutarea seed/live se face din admin (per-site, câmp `topSource`).
 */
@Controller('public/top')
export class PublicTopController {
  constructor(private readonly svc: GenerationsService) {}

  @SkipThrottle({ short: true, medium: true, long: true })
  @Get()
  async top(
    @Req() req: Request,
    @CurrentSiteId() siteId: string | null,
    @Query('period') period?: 'week' | 'month' | 'all',
    @Query('limit') limit?: string,
  ) {
    const source: 'seed' | 'live' = req.site?.topSource === 'live' ? 'live' : 'seed';
    if (source === 'seed') {
      return { source, items: null as null };
    }
    const items = await this.svc.listTop({
      siteId,
      period,
      limit: limit ? Number(limit) : 5,
    });
    return {
      source,
      items: items.map((g, idx) => ({
        rk: idx + 1,
        id: g.id,
        ttl: g.recipientName
          ? `Manea pentru ${g.recipientName}`
          : `Manea #${g.id.slice(0, 6)}`,
        by: g.voiceArtist,
        pl: formatPlays(g.viewCount),
        playsRaw: g.viewCount,
        voice: g.voiceArtist,
        style: g.style,
        occasion: g.occasion,
      })),
    };
  }
}

function formatPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

@Controller('generations')
export class GenerationsController {
  constructor(
    private readonly svc: GenerationsService,
    private readonly giftCodes: GiftCodesService,
    private readonly socialUpload: SocialImageUploadService,
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
      // Vitrina publică — expunem DOAR demo-ul, niciodată audio-ul complet.
      audioUrl: g.demoAudioUrl,
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
        // "De la cine" — dedicație publică, nume scurt (truncat defensiv).
        // Mesajul propriu-zis (g.message) și emailul NU sunt expuse niciodată.
        senderName: g.dedication ? g.dedication.slice(0, 64) : null,
        voiceArtist: g.voiceArtist,
        audioUrl: g.demoAudioUrl,
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
    @Headers('x-unlock-password') unlockPassword?: string,
  ) {
    // Întâi încercăm ca owner (date complete)
    try {
      const g = await this.svc.findOne(id, {
        userId: user?.id ?? null,
        guestId: user ? null : guestId,
      });
      // SECURITATE: owner-ul neplătit primește DOAR fișierul demo. URL-ul
      // fișierului complet nu apare niciodată în payload pentru un user
      // fără paidUnlocked sau fără type='full'.
      const sanitized = sanitizeAudio(g) as unknown as Record<string, unknown>;
      // NU expunem hash-ul parolei către client.
      const hasUnlockPassword = !!sanitized.unlockPasswordHash;
      delete sanitized.unlockPasswordHash;
      return { ...sanitized, isOwner: true, hasUnlockPassword, unlocked: true };
    } catch {
      // Fallback: orice generation succeeded e accesibil public cu URL-ul direct.
      // Pentru demo neplătit → expunem demoAudioUrl. Pentru paidUnlocked sau type='full'
      // → expunem audioUrl complet. Eliminăm vechiul block care arunca „Not your
      // generation" pe demo neplătit — admin trimite linkul către cine vrea.
      const pub = await this.svc.findOnePublic(id);
      if (!pub || pub.status !== 'succeeded') {
        throw new NotFoundException('Generation indisponibilă');
      }
      // best-effort view tracking; ignorăm eșecul (nu blochează request-ul)
      this.svc.incrementViewCount(pub.id).catch(() => {});
      // Vizitatorii anonimi pe link partajat — doar demo, niciodată full.
      const isPaid = pub.type === 'full' || pub.paidUnlocked;
      // Conținut PRIVAT (poza custom încărcată) — vizibil non-owner DOAR cu parola.
      const unlocked = verifyUnlock(pub.id, unlockPassword ?? null, pub.unlockPasswordHash);
      return {
        isOwner: false,
        hasUnlockPassword: !!pub.unlockPasswordHash,
        unlocked,
        id: pub.id,
        type: pub.type,
        status: pub.status,
        durationSec: pub.durationSec,
        style: pub.style,
        occasion: pub.occasion,
        recipientName: pub.recipientName,
        voiceArtist: pub.voiceArtist,
        audioUrl: isPaid ? pub.audioUrl : pub.demoAudioUrl,
        bonusAudioUrl: isPaid ? pub.bonusAudioUrl : pub.demoBonusAudioUrl,
        coverUrl: pub.coverUrl,
        lyrics: pub.lyrics,
        paidUnlocked: pub.paidUnlocked,
        // Model PACHETE — livrabile extra (instrumental/video doar pentru plătiți).
        packageTier: pub.packageTier,
        socialImages: pub.socialImages ?? [],
        socialImageSelected: pub.socialImageSelected,
        // Poza custom ÎNCĂRCATĂ de owner e privată — doar cu parola corectă.
        socialImageUploaded: unlocked ? pub.socialImageUploaded : null,
        instrumentalUrl: isPaid ? pub.instrumentalUrl : null,
        videoUrl: isPaid ? pub.videoUrl : null,
        videoUrlBonus: isPaid ? pub.videoUrlBonus : null,
        deliverablesReady: pub.deliverablesReady,
        createdAt: pub.createdAt,
        completedAt: pub.completedAt,
        // datele sensibile (message, dedication, owner ids, custom lyrics) NU expuse public
      };
    }
  }

  /** Owner setează/șterge parola de deblocare a conținutului privat al manelei. */
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/unlock-password')
  @HttpCode(200)
  async setUnlockPassword(
    @Param('id') id: string,
    @Body() body: { password?: string | null },
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    return this.svc.setUnlockPassword(
      id,
      { userId: user?.id ?? null, guestId: user ? null : guestId },
      body?.password ?? null,
    );
  }

  /** Vizitator non-owner verifică parola de deblocare (link + parolă). */
  @SkipThrottle({ long: true })
  @Post(':id/unlock-check')
  @HttpCode(200)
  async checkUnlockPassword(@Param('id') id: string, @Body() body: { password?: string }) {
    const ok = await this.svc.checkUnlock(id, (body?.password ?? '').trim());
    return { ok };
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

  /** Alege imaginea socială curentă (din variantele generate sau upload propriu). */
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/social-image/select')
  async selectSocialImage(
    @Param('id') id: string,
    @Body() body: { url: string },
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    if (!body?.url) throw new BadRequestException('url este obligatoriu');
    const gen = await this.svc.selectSocialImage(id, body.url, {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
    });
    return { ok: true, socialImageSelected: gen.socialImageSelected };
  }

  /** Upload imagine socială proprie (png/jpg/webp, max 5MB). O setează ca selectată. */
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/social-image/upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadSocialImage(
    @Param('id') id: string,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; size: number; mimetype: string } | undefined,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    if (!file) throw new BadRequestException('Lipsește fișierul (field name: file)');
    // Verificăm ownership ÎNAINTE de a scrie pe disc.
    const ctx = { userId: user?.id ?? null, guestId: user ? null : guestId };
    await this.svc.findOne(id, ctx);
    const saved = await this.socialUpload.save({
      generationId: id,
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mime: file.mimetype,
    });
    const gen = await this.svc.setUploadedSocialImage(id, saved.url, ctx);
    return {
      ok: true,
      url: saved.url,
      socialImageUploaded: gen.socialImageUploaded,
      socialImageSelected: gen.socialImageSelected,
    };
  }
}

/**
 * Filtrează URL-urile audio din payload: dacă userul nu are dreptul la
 * fișierul complet, înlocuiește audioUrl/bonusAudioUrl cu URL-urile demo.
 * Astfel inspectarea Network nu dezvăluie niciodată URL-ul fișierului full.
 */
function sanitizeAudio<T extends {
  type?: string;
  paidUnlocked?: boolean;
  audioUrl?: string | null;
  bonusAudioUrl?: string | null;
  demoAudioUrl?: string | null;
  demoBonusAudioUrl?: string | null;
  instrumentalUrl?: string | null;
  videoUrl?: string | null;
  videoUrlBonus?: string | null;
}>(g: T): T {
  const isPaid = g.type === 'full' || g.paidUnlocked === true;
  if (isPaid) return g;
  return {
    ...g,
    audioUrl: g.demoAudioUrl ?? null,
    bonusAudioUrl: g.demoBonusAudioUrl ?? null,
    // Livrabile premium gated până la plată.
    instrumentalUrl: null,
    videoUrl: null,
    videoUrlBonus: null,
  };
}
