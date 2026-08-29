import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { experienceSlugFromRequest } from '../experiences/request-slug';
import { isKnownExperienceSlug } from '../experiences/catalog';

/** Slug de interfață venit din query string — acceptat doar dacă e în catalog. */
function normalizeUiParam(ui?: string): string | null {
  const v = (ui ?? '').trim();
  return v && isKnownExperienceSlug(v) ? v : null;
}

/** Extrage o valoare de cookie din header brut. */
function readCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Citește un header simplu (string), trunchiat la 64 caractere. */
function readHeader(req: Request, name: string): string | null {
  const v = req.headers[name];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim().slice(0, 64) : null;
}

/** Extrage atribuire Meta (fbp/fbc/UA/IP) + tracking analytics (sessionKey/visitorId). */
function extractMetaContext(req: Request, ua: string | undefined, xff: string | undefined, ip: string) {
  const cookieHeader = req.headers.cookie;
  return {
    fbp: readCookieValue(cookieHeader, '_fbp'),
    fbc: readCookieValue(cookieHeader, '_fbc'),
    userAgent: ua ?? null,
    ipAddress: ((xff && xff.split(',')[0].trim()) || ip || null) as string | null,
    // Tracker-ul de analytics (apps/web) le trimite ca headere la checkout —
    // leagă plata de sesiunea exactă pentru atribuire precisă pe surse/campanii.
    sessionKey: readHeader(req, 'x-mc-session-key'),
    visitorId: readHeader(req, 'x-mc-visitor-id'),
  };
}
import { IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaymentsService } from './payments.service';
import { normalizeTier, isPackageTier } from './packages';
import { GuestSessionsService } from '../guest-sessions/guest-sessions.service';
import { OptionalJwtAuthGuard } from '../../common/jwt.guard';
import {
  AuthedRequestUser,
  CurrentGuestId,
  CurrentSite,
  CurrentUser,
} from '../../common/decorators';
import { Site } from '../sites/site.entity';

class CheckoutDto {
  @IsOptional()
  @IsUUID()
  generationId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  tipAmount?: number;

  @IsOptional()
  @IsBoolean()
  premium?: boolean;

  /** Tier-ul pachetului (model nou). Când e setat, totalul = prețul pachetului. */
  @IsOptional()
  @IsIn(['basic', 'plus', 'premium'])
  packageTier?: string;

  @IsOptional()
  promoCode?: string;

  /** Override email destinație (input editabil pe step 5). Dacă lipsește,
   *  folosim email-ul contului logat / guest-ului curent. */
  @IsOptional()
  @IsEmail()
  email?: string;
}

class DirectCheckoutDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  tipAmount?: number;

  @IsOptional()
  @IsBoolean()
  premium?: boolean;

  @IsOptional()
  promoCode?: string;

  /** Override email destinație (input editabil pe step 5). */
  @IsOptional()
  @IsEmail()
  email?: string;

  // Câmpurile generation — validare minimă (DTO-ul de pe createGeneration are
  // class-validator decorators dar îl primim ca obiect plain pentru flexibilitate).
  // Trebuie marcat ca obiect, altfel ValidationPipe ({ whitelist: true,
  // forbidNonWhitelisted: true }) îl strip-uiește/respinge → 400 + frontend
  // afișează „Nu s-a putut deschide plata".
  @IsObject()
  generation!: {
    style: string;
    occasion: string;
    recipientName: string;
    message: string;
    dedication?: string;
    voiceArtist: string;
    customLyrics?: string;
    locale?: string;
    tipAmount?: number;
    premium?: boolean;
    /** Tier-ul pachetului ales (basic|plus|premium). Default 'basic'. */
    packageTier?: string;
  };
}

class UpgradeCheckoutDto {
  @IsUUID()
  generationId!: string;

  @IsIn(['plus', 'premium'])
  targetTier!: 'plus' | 'premium';

  @IsOptional()
  @IsEmail()
  email?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly svc: PaymentsService,
    private readonly guests: GuestSessionsService,
  ) {}

  private async resolveEmail(
    user: AuthedRequestUser | null,
    guestId: string | null,
  ): Promise<string | undefined> {
    if (user?.email) return user.email;
    if (guestId) {
      const g = await this.guests.findById(guestId);
      if (g?.email) return g.email;
    }
    return undefined;
  }

  @Get('quote')
  async quote(
    @Req() req: Request,
    @CurrentSite() site: Site,
    @Query('packageTier') packageTier?: string,
    @Query('ui') ui?: string,
  ) {
    // `packageTier` e obligatoriu. Exista și o cale fără el — preț de bază +
    // supliment premium + suprataxă pe dedicație — dar niciuna din cele 838 de
    // comenzi din producție n-a folosit-o, iar site-ul n-o mai apelează.
    if (!packageTier || !isPackageTier(packageTier)) {
      throw new BadRequestException('packageTier este obligatoriu (basic | plus | premium)');
    }
    return this.svc.quote(site, {
      packageTier: normalizeTier(packageTier),
      // `?ui=` explicit, altfel interfața curentă a clientului (header-ul pe
      // care lib/api.ts îl pune pe fiecare request). Fără fallback-ul ăsta,
      // prețul AFIȘAT s-ar lua de pe `defaultSlug`, iar checkout-ul de pe
      // interfața reală — două cifre diferite pe același ecran.
      // `?ui=` e controlat de client — îl validăm pe catalog înainte să
      // influențeze prețul afișat.
      experienceSlug: normalizeUiParam(ui) || experienceSlugFromRequest(req),
    });
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const p = await this.svc.findById(id);
    if (!p) return null;
    return {
      id: p.id,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      // Suma în RON la cursul BNR de dinainte de data plății — pixelurile
      // raportează în lei, consistent cu statisticile (vezi FxRateService).
      amountRonCents: p.amountRonCents ?? null,
      createdAt: p.createdAt,
    };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('checkout-session')
  async createSession(
    @Body() body: CheckoutDto,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSite() site: Site,
    @Headers('user-agent') ua: string | undefined,
    @Headers('x-forwarded-for') xff: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.svc.createCheckoutSession({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      generationId: body.generationId,
      packageTier: body.packageTier ? normalizeTier(body.packageTier) : undefined,
      promoCode: body.promoCode,
      email: body.email ?? (await this.resolveEmail(user, guestId)),
      site,
      experienceSlug: experienceSlugFromRequest(req),
      ...extractMetaContext(req, ua, xff, ip),
    });
  }

  /**
   * Checkout pentru flow „pay-first" (site.demoEnabled=false). Creează o
   * generation pending + payment + Stripe Checkout într-o singură cerere.
   * Pe webhook payment success, generation se marchează paid + queueează.
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Post('checkout-direct')
  async createDirect(
    @Body() body: DirectCheckoutDto,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSite() site: Site,
    @Headers('user-agent') ua: string | undefined,
    @Headers('x-forwarded-for') xff: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.svc.createDirectCheckoutSession({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      generation: body.generation,
      promoCode: body.promoCode,
      email: body.email ?? (await this.resolveEmail(user, guestId)),
      site,
      experienceSlug: experienceSlugFromRequest(req),
      ...extractMetaContext(req, ua, xff, ip),
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('checkout-upgrade')
  async createUpgrade(
    @Body() body: UpgradeCheckoutDto,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSite() site: Site,
    @Headers('user-agent') ua: string | undefined,
    @Headers('x-forwarded-for') xff: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.svc.createUpgradeCheckoutSession({
      generationId: body.generationId,
      targetTier: body.targetTier,
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      email: body.email ?? (await this.resolveEmail(user, guestId)),
      site,
      experienceSlug: experienceSlugFromRequest(req),
      ...extractMetaContext(req, ua, xff, ip),
    });
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) return { ok: false };
    await this.svc.handleWebhook(req.rawBody, signature);
    return { ok: true };
  }
}
