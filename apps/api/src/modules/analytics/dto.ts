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
