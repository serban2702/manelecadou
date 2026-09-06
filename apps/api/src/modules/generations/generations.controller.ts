import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  forwardRef,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { GenerationsService } from './generations.service';
import { SiteDemosService } from '../site-demos/site-demos.service';
import { SocialImageUploadService } from './social-image-upload.service';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { generationEntitlements } from './entitlements';
import { experienceSlugFromRequest } from '../experiences/request-slug';
import {
  CurrentGuestId,
  CurrentSite,
  CurrentSiteId,
  CurrentUser,
  AuthedRequestUser,
} from '../../common/decorators';
import { Site } from '../sites/site.entity';
import { PaymentsService } from '../payments/payments.service';
import { paidRemakeCentsFor } from '../payments/packages';
import { resolveSitePackage } from '../experiences/package-resolve';
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
  constructor(
    private readonly svc: GenerationsService,
    private readonly siteDemos: SiteDemosService,
  ) {}

  @SkipThrottle({ short: true, medium: true, long: true })
  @Get()
  async top(
    @Req() req: Request,
    @CurrentSiteId() siteId: string | null,
    @Query('period') period?: 'week' | 'month' | 'all',
    @Query('limit') limit?: string,
  ) {
    const topSource = req.site?.topSource;
    const source: 'seed' | 'live' | 'template' =
      topSource === 'live' ? 'live' : topSource === 'template' ? 'template' : 'seed';

    const max = limit ? Math.max(1, Math.min(50, Number(limit))) : 5;

    if (source === 'seed') {
      return { source, items: null as null };
    }

    // Top curat manual: intrările pointează la audio existent (stil/voce/demo).
    if (source === 'template') {
      const tpl = req.site?.topTemplate ?? [];
      const styleSamples = req.site?.suno?.styleSamples ?? {};
      const voiceSamples = req.site?.suno?.voiceSamples ?? {};

      // Demo-urile („Ascultă exemple") sunt într-un tabel separat — le aducem o
      // singură dată dacă există măcar o intrare de tip 'demo'.
      let demoMap: Map<string, { audioUrl: string; startSec: number }> | null = null;
      if (req.site?.id && tpl.some((it) => it.kind === 'demo')) {
        const demos = await this.siteDemos.listForSite(req.site.id);
        demoMap = new Map(
          demos.map((d) => [
            d.id,
            { audioUrl: d.audioUrl, startSec: d.previewStartSec ?? 0 },
          ]),
        );
      }

      const items = tpl
        .map((it) => {
          let audioUrl: string | undefined;
          let sampleStartSec = 0;
          if (it.kind === 'demo') {
            const d = demoMap?.get(it.key);
            audioUrl = d?.audioUrl;
            sampleStartSec = d?.startSec ?? 0;
          } else {
            const sample =
              it.kind === 'voice' ? voiceSamples[it.key] : styleSamples[it.key];
            audioUrl = sample?.audioUrl;
            sampleStartSec = sample?.startSec ?? 0;
          }
          if (!audioUrl) return null; // sursa a fost ștearsă → sari
          return {
            kind: it.kind,
            key: it.key,
            title: it.title ?? '',
            artist: it.artist ?? '',
            views: typeof it.views === 'number' ? it.views : 0,
            audioUrl,
            startSec: it.startSec ?? sampleStartSec,
            previewSec: it.previewSec ?? 0,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, max);

      return {
        source,
        items: items.map((it, idx) => ({
          rk: idx + 1,
          id: `tpl-${it.kind}-${it.key}-${idx}`,
          ttl: it.title,
          by: it.artist,
          pl: formatPlays(it.views),
          playsRaw: it.views,
          voice: it.kind === 'voice' ? it.key : '',
          style: it.kind === 'style' ? it.key : '',
          occasion: '',
          audioUrl: it.audioUrl,
          startSec: it.startSec,
          previewSec: it.previewSec,
        })),
      };
    }

    const items = await this.svc.listTop({
      siteId,
      period,
      limit: max,
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
        audioUrl: g.audioUrl ?? null,
        startSec: 0,
        previewSec: 0,
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
    private readonly socialUpload: SocialImageUploadService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
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
    @Req() req: Request,
  ) {
    return this.svc.create(dto, {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      siteId,
      experienceSlug: experienceSlugFromRequest(req),
    });
  }

  /**
   * Limba paginii de livrare a unei comenzi — citită de web ÎNAINTE de a randa
   * layoutul, ca `<html lang>` și textele să fie corecte din SSR, nu corectate
   * după hidratare.
   *
   * Endpoint separat și minimal (nu `GET :id`) din două motive: se apelează pe
   * calea de randare a fiecărei pagini `/m/<id>`, deci nu trebuie să tragă
   * payload-ul complet cu variante și drepturi; și n-are nevoie de sesiune, pe
   * când `GET :id` întoarce alt corp pentru owner față de vizitator.
   *
   * `locale: null` = comandă inexistentă sau fără site — apelantul cade pe
   * limba site-ului vizitat.
   */
  @SkipThrottle({ long: true })
  @Get(':id/locale')
  async deliveryLocale(@Param('id') id: string) {
    return { locale: await this.svc.resolveDeliveryLocale(id) };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSite() site: Site,
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
      const ownerPaid = g.type === 'full' || g.paidUnlocked === true;
      const variants = await this.svc.listPlayableVariants(g, ownerPaid);
      const workingVariants = await this.svc.listWorkingVariants(g);
      return {
        ...sanitized,
        isOwner: true,
        hasUnlockPassword,
        unlocked: true,
        variants,
        workingVariants,
        // Ce i s-a VÂNDUT comenzii (din packageSnapshot, cu fallback pe tier
        // pentru comenzile de dinainte de snapshot). Pagina melodiei decide din
        // asta ce livrabile arată, nu din tier-ul curent.
        entitlements: generationEntitlements(g),
        ...this.svc.remakeStats(g, resolveSitePackage(site, 'basic', g.experienceSlug).priceCents),
      };
    } catch {
      // Fallback: orice generation succeeded e accesibil public cu URL-ul direct.
      // Pentru demo neplătit → expunem demoAudioUrl. Pentru paidUnlocked sau type='full'
      // → expunem audioUrl complet. Eliminăm vechiul block care arunca „Not your
      // generation" pe demo neplătit — admin trimite linkul către cine vrea.
      const pub = await this.svc.findOnePublic(id);
      // Vizibile public prin link direct:
      //  • orice generare 'succeeded' (share link normal)
      //  • comenzi 'full' neplătite rămase 'pending' (recovery / reluare plată
      //    dintr-un alt device sau browser, fără sesiunea owner) → pagina arată
      //    secțiunea de reluare a plății. Audio-ul nu există încă, deci payload-ul
      //    public (nume + stil, fără mesaj/dedicație/owner ids) nu scurge nimic.
      const awaitingPayment =
        pub?.status === 'pending' && pub.type === 'full' && pub.paidUnlocked === false;
      if (!pub || (pub.status !== 'succeeded' && !awaitingPayment)) {
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
        variants: await this.svc.listPlayableVariants(pub, isPaid),
        coverUrl: pub.coverUrl,
        lyrics: pub.lyrics,
        paidUnlocked: pub.paidUnlocked,
        // Model PACHETE — livrabile extra (instrumental/video doar pentru plătiți).
        packageTier: pub.packageTier,
        // Drepturile vândute pe comandă — de aici știe pagina ce secțiuni arată
        // (colaj, felicitare etc.), inclusiv unui vizitator care a deblocat cu parola.
        entitlements: generationEntitlements(pub),
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

  @Throttle({ short: { limit: 1, ttl: 30_000 }, medium: { limit: 3, ttl: 3_600_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/remake')
  @HttpCode(200)
  async remake(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
  ) {
    return this.svc.requestFreeRemake(id, body?.notes ?? '', {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
    });
  }

  @Throttle({ short: { limit: 1, ttl: 30_000 }, medium: { limit: 3, ttl: 3_600_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/remake/pay')
  @HttpCode(200)
  async remakePay(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSite() site: Site,
    @Req() req: Request,
  ) {
    const prepared = await this.svc.preparePaidRemake(id, body?.notes ?? '', {
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
    });
    const slug = experienceSlugFromRequest(req);
    return this.payments.createCheckoutSession({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      // Aceeași sumă pe care o vede clientul în `remakeStats.paidRemakeCents`,
      // derivată din pachetul de intrare al site-ului. Constanta în RON ar fi
      // însemnat 15 EURO pe site-urile în euro.
      overrideAmount: paidRemakeCentsFor(resolveSitePackage(site, 'basic', slug).priceCents),
      overrideProductName: 'Refacere manea',
      remakeForGenerationId: id,
      remakeNotes: prepared.notes,
      site,
      experienceSlug: slug,
    });
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
