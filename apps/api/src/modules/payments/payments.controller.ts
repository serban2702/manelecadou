import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { IsBoolean, IsEmail, IsInt, IsObject, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaymentsService } from './payments.service';
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
  };
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
    @CurrentSite() site: Site,
    @Query('tipAmount') tipAmount?: string,
    @Query('premium') premium?: string,
  ) {
    const tip = Math.max(0, Math.min(1_000_000_000, Number(tipAmount ?? '0') || 0));
    return this.svc.quote(site, { tipAmount: tip, premium: premium === 'true' });
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
  ) {
    return this.svc.createCheckoutSession({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      generationId: body.generationId,
      tipAmount: body.tipAmount ?? 0,
      premium: body.premium ?? false,
      promoCode: body.promoCode,
      email: body.email ?? (await this.resolveEmail(user, guestId)),
      site,
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
  ) {
    return this.svc.createDirectCheckoutSession({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      generation: body.generation,
      tipAmount: body.tipAmount ?? body.generation.tipAmount ?? 0,
      premium: body.premium ?? body.generation.premium ?? false,
      promoCode: body.promoCode,
      email: body.email ?? (await this.resolveEmail(user, guestId)),
      site,
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
