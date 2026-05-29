import { Body, Controller, Headers, HttpCode, Ip, Logger, Post, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { MetaCapiService } from './meta-capi.service';
import { CurrentSite } from '../../common/decorators';
import { Site } from '../sites/site.entity';
import { Payment } from '../payments/payment.entity';
import type { Request } from 'express';

class TrackEventDto {
  @IsString()
  @MaxLength(64)
  eventName!: string;
  @IsString()
  @MaxLength(128)
  eventId!: string;
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventSourceUrl?: string;
  @IsOptional()
  @IsString()
  email?: string;
  @IsOptional()
  @IsString()
  externalId?: string;
  // Câmpuri Advanced Matching opționale — cresc EMQ semnificativ (3 → 8+).
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsString()
  firstName?: string;
  @IsOptional()
  @IsString()
  lastName?: string;
  @IsOptional()
  @IsString()
  city?: string;
  @IsOptional()
  @IsString()
  state?: string;
  @IsOptional()
  @IsString()
  zip?: string;
  @IsOptional()
  @IsString()
  country?: string;
  @IsOptional()
  value?: number;
  @IsOptional()
  @IsString()
  currency?: string;
  @IsOptional()
  @IsString()
  contentName?: string;
  @IsOptional()
  contentIds?: string[];
  @IsOptional()
  @IsObject()
  customData?: Record<string, unknown>;
}

/**
 * Endpoint internal pentru ca frontend-ul să trimită evenimente Meta server-side
 * cu deduplicare. FE apelează pixel client (cu același eventId) + ăsta în paralel.
 *
 * Server adaugă: IP real, User-Agent, fbp/fbc din cookies.
 */
@Controller('meta-capi')
export class MetaCapiController {
  private readonly logger = new Logger('MetaCAPI:Ctrl');

  constructor(
    private readonly meta: MetaCapiService,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
  ) {}

  // Rate limit ridicat — PageView CAPI mirror generează evenimente per SPA navigation
  // (poate fi ~10-30 events/min per user activ). 120/min lasă suficientă marjă fără
  // să satureze accidentat (chat-spammer).
  @Throttle({ short: { limit: 120, ttl: 60_000 }, medium: { limit: 2000, ttl: 3_600_000 } })
  @Post('track')
  @HttpCode(204)
  async track(
    @Body() dto: TrackEventDto,
    @Headers('user-agent') ua: string | undefined,
    @Headers('x-forwarded-for') xff: string | undefined,
    @Headers('referer') referer: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
    @CurrentSite() site: Site | null,
  ): Promise<void> {
    // ============== Cross-path idempotency pentru Purchase ==============
    // Browser fires fbq Purchase + paralel apelează acest endpoint (FE mirror).
    // În paralel, Stripe webhook fires direct CAPI Purchase din payments.service.
    // Ambele căi folosesc același event_id (`pay-${paymentId}`). Meta deduplicates
    // în reporting, dar „Total server events received" arată raw counts → 2 servers
    // per Purchase, ratio anormal browser:server, EMQ scade, statistical modeling
    // umflă „Conversions" raportate în campanii.
    //
    // FIX: același UPDATE atomic ca în webhook. PRIMA fire câștigă lock-ul →
    // fires CAPI; A DOUA (oricare cale vine a doua) → skip silent.
    if (dto.eventName === 'Purchase' && dto.eventId.startsWith('pay-')) {
      const paymentId = dto.eventId.slice(4); // strip „pay-"
      if (paymentId && /^[0-9a-f-]{8,}$/i.test(paymentId)) {
        try {
          const lock = await this.payments
            .createQueryBuilder()
            .update(Payment)
            .set({ capiPurchaseSentAt: () => 'NOW()' })
            .where('id = :id AND "capiPurchaseSentAt" IS NULL', { id: paymentId })
            .execute();
          if (!lock.affected || lock.affected === 0) {
            this.logger.log(
              `Purchase FE-mirror skip (event_id=${dto.eventId.slice(0, 12)}) — already sent (webhook or earlier mirror)`,
            );
            return;
          }
        } catch (err) {
          // Dacă lock-ul eșuează (ex. paymentId invalid), continuăm cu sendEvent
          // și lăsăm Meta să facă dedup prin event_id. Worst case: dedup în reporting.
          this.logger.warn(`Purchase lock check failed: ${(err as Error).message}`);
        }
      }
    }

    // Extract fbp / fbc din cookie header
    const cookieHeader = req.headers.cookie ?? '';
    const fbp = readCookie(cookieHeader, '_fbp');
    const fbc = readCookie(cookieHeader, '_fbc');
    const realIp = (xff && xff.split(',')[0].trim()) || ip || null;

    // Determine action_source — dacă URL conține /chat-style trigger, e chat, altfel website
    const action: 'chat' | 'website' = dto.eventSourceUrl?.includes('chat') ? 'chat' : 'website';

    await this.meta.sendEvent(
      dto.eventName,
      {
        eventId: dto.eventId,
        email: dto.email,
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        externalId: dto.externalId,
        ip: realIp,
        userAgent: ua ?? null,
        fbp: fbp ?? null,
        fbc: fbc ?? null,
        city: dto.city,
        state: dto.state,
        zip: dto.zip,
        country: dto.country,
        eventSourceUrl: dto.eventSourceUrl ?? referer ?? null,
        value: dto.value,
        currency: dto.currency,
        contentName: dto.contentName,
        contentIds: dto.contentIds,
        customData: dto.customData,
      },
      action,
      site,
    );
  }
}

function readCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
