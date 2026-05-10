import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class SuggestMessageDto {
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
  @MaxLength(120)
  dedication?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  voiceArtist?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  currentDraft?: string;

  @IsOptional()
  @IsString()
  @Length(2, 5)
  locale?: string;
}
