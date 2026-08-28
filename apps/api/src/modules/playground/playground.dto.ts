import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PLAYGROUND_ENGINES,
  PLAYGROUND_LYRICS_MODES,
} from './playground.constants';

export class PlaygroundRequestDto {
  @IsOptional()
  @IsIn([...PLAYGROUND_ENGINES])
  engine?: 'suno' | 'google';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  experienceSlug?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  styleId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  occasionId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  voiceId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  tipAmount?: number;

  @IsOptional()
  @IsIn([...PLAYGROUND_LYRICS_MODES])
  lyricsMode?: 'generate' | 'writer_only' | 'custom' | 'instrumental';

  @IsOptional()
  @IsString()
  @MaxLength(12_000)
  lyrics?: string;

  @IsOptional()
  @IsBoolean()
  skipCritic?: boolean;

  @IsOptional()
  @IsBoolean()
  phonetic?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  openaiModel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  openaiTemperature?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  writerSystemPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  writerUserTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  criticSystemPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  criticUserTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  languageOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  sunoModel?: string;

  @IsOptional()
  @IsBoolean()
  sunoCustomMode?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  sunoBasePrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  sunoStylePrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  sunoOccasionPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  sunoPromptOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sunoTitle?: string;

  @IsOptional()
  @IsIn(['m', 'f'])
  vocalGender?: 'm' | 'f';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  styleWeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  weirdnessConstraint?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  negativeTags?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  personaId?: string;

  @IsOptional()
  @IsIn(['style_persona', 'voice_persona'])
  personaModel?: 'style_persona' | 'voice_persona';

  @IsOptional()
  @IsBoolean()
  instrumental?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(30)
  @Max(240)
  durationSec?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lyriaModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  lyriaStylePrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  lyriaOccasionPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  lyriaPromptOverride?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(2)
  variantCount?: number;
}
