import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const EVENT_TYPES = [
  'page_view',
  'click',
  'scroll_depth',
  'outbound_click',
  'session_end',
  'signup',
  'login',
  'generation_start',
  'generation_complete',
  'lyrics_complete',
  'audio_complete',
  'purchase_init',
  'purchase_success',
  'purchase_failed',
  'gift_purchase_init',
  'gift_purchase_success',
  'promo_apply',
  'chat_open',
  'chat_message_sent',
  // form tracking
  'form_start',
  'form_field_change',
  'form_abandon',
  'form_submit',
  // performance
  'web_vital',
  // privacy / consent
  'consent_given',
  'consent_denied',
  // engagement pe piesa livrată (pagina /m/[id]) — câți useri apasă pe astea
  'song_play',
  'song_download',
  'song_share',
  'image_download',
] as const;

export type AnalyticsEventType = (typeof EVENT_TYPES)[number];

export class TrackEventDto {
  @IsString()
  @Length(1, 64)
  eventId!: string;

  @IsIn(EVENT_TYPES as unknown as string[])
  type!: AnalyticsEventType;

  @IsString()
  @Length(1, 64)
  sessionKey!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  visitorId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  url?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  path?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 256)
  referrer?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_00)
  valueCents?: number;

  @IsOptional()
  @IsString()
  @Length(2, 8)
  currency?: string;

  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  source?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  medium?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  campaign?: string;

  @IsOptional()
  @IsString()
  @Length(0, 256)
  utmContent?: string;

  @IsOptional()
  @IsString()
  @Length(0, 256)
  utmTerm?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  device?: string;

  // ===== UTM extins + click-id-uri (vezi `utm-standard.ts`) =====
  // Toate opționale: o sesiune directă nu trimite niciunul. Lungimile sunt
  // aceleași ca ale coloanelor din `analytics_sessions` — un `utm_content`
  // de 900 de caractere (se întâmplă, la nume de reclamă generate automat)
  // ar fi picat tot evenimentul, nu doar câmpul, dacă validam mai strict.

  @IsOptional()
  @IsString()
  @Length(0, 128)
  utmId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  utmSourcePlatform?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  utmCreativeFormat?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  utmMarketingTactic?: string;

  @IsOptional()
  @IsString()
  @Length(0, 256)
  adsetName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  adsetId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 256)
  adName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  adId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  placement?: string;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  clickId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 16)
  clickIdSource?: string;

  @IsOptional()
  @IsObject()
  clickIds?: Record<string, string>;

  /** Tokenul linkului din email (`mc_eid`) — leagă sesiunea de mailul concret. */
  @IsOptional()
  @IsString()
  @Length(0, 64)
  emailToken?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1024)
  landingQuery?: string;

  // ===== Prima atingere (localStorage, 90 zile) =====

  @IsOptional()
  @IsString()
  @Length(0, 64)
  firstSource?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  firstMedium?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  firstCampaign?: string;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  firstLandingPath?: string;

  @IsOptional()
  @IsInt()
  firstTouchAt?: number;

  // ============ CLIENT-SIDE ENRICHMENT (sent o singura data per sesiune) ============

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20000)
  screenWidth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20000)
  screenHeight?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20000)
  viewportWidth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20000)
  viewportHeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  devicePixelRatio?: number;

  @IsOptional()
  @IsBoolean()
  touchCapable?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 16)
  colorScheme?: string;

  @IsOptional()
  @IsBoolean()
  reducedMotion?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 16)
  language?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(-720)
  @Max(840)
  timezoneOffsetMin?: number;

  @IsOptional()
  @IsString()
  @Length(0, 16)
  connectionType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  connectionDownlink?: number;

  @IsOptional()
  @IsBoolean()
  saveData?: boolean;

  @IsOptional()
  @IsBoolean()
  doNotTrack?: boolean;

  @IsOptional()
  @IsBoolean()
  consentGiven?: boolean;

  @IsOptional()
  @IsInt()
  ts?: number;
}

export class TrackBatchDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TrackEventDto)
  events!: TrackEventDto[];
}

// ============== AD PAYMENTS (registru manual plăți către platforme de ads) ==============

export const AD_PAYMENT_TYPES = ['fund_loading', 'payment', 'refund'] as const;
export const AD_PAYMENT_PLATFORMS = ['meta', 'tiktok'] as const;

export class AdPaymentCreateDto {
  @IsOptional()
  @IsIn(AD_PAYMENT_PLATFORMS as unknown as string[])
  platform?: 'meta' | 'tiktok';

  @IsIn(AD_PAYMENT_TYPES as unknown as string[])
  type!: 'fund_loading' | 'payment' | 'refund';

  /** Suma în cents (cele mai mici unități ale monedei). Max 10.000.000 unități. */
  @IsInt()
  @Min(0)
  @Max(1_000_000_000_0)
  amountCents!: number;

  @IsString()
  @Length(2, 8)
  currency!: string;

  /** Ziua plății, format YYYY-MM-DD. */
  @IsString()
  @Length(10, 10)
  date!: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  reference?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string | null;
}

export class AdPaymentUpdateDto {
  @IsOptional()
  @IsIn(AD_PAYMENT_PLATFORMS as unknown as string[])
  platform?: 'meta' | 'tiktok';

  @IsOptional()
  @IsIn(AD_PAYMENT_TYPES as unknown as string[])
  type?: 'fund_loading' | 'payment' | 'refund';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000_0)
  amountCents?: number;

  @IsOptional()
  @IsString()
  @Length(2, 8)
  currency?: string;

  @IsOptional()
  @IsString()
  @Length(10, 10)
  date?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  reference?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string | null;
}
