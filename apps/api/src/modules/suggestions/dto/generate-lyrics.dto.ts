import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * Input pentru pasul de generare/review versuri din wizard (înainte de plată).
 * `feedback` + `previousLyrics` sunt prezente la regenerare (userul a cerut
 * modificări pe versiunea anterioară).
 */
export class GenerateLyricsDto {
  @IsString()
  @Length(1, 64)
  style!: string;

  @IsString()
  @Length(1, 64)
  occasion!: string;

  @IsString()
  @Length(1, 120)
  recipientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dedication?: string;

  @IsString()
  @Length(1, 64)
  voiceArtist!: string;

  /** Ce vrea userul schimbat la versiunea anterioară (regenerare). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;

  /** Versurile anterioare pe care le modificăm. */
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  previousLyrics?: string;

  @IsOptional()
  @IsString()
  @Length(2, 5)
  locale?: string;
}
