import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGenerationDto {
  @IsEnum(['demo', 'full'])
  type!: 'demo' | 'full';

  @IsString()
  @Length(1, 64)
  style!: string;

  @IsString()
  @Length(1, 64)
  occasion!: string;

  @IsString()
  @Length(1, 120)
  recipientName!: string;

  @IsString()
  @MaxLength(600)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dedication?: string;

  @IsString()
  @Length(1, 64)
  @IsIn(['male', 'female'])
  voiceArtist!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  customLyrics?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  tipAmount?: number;

  @IsOptional()
  @IsBoolean()
  premium?: boolean;

  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 5)
  locale?: string;
}
