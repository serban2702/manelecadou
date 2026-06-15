import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * Input pentru faza de detecție/moderare a versurilor înainte de a permite
 * trecerea la pasul următor în wizard. `recipientName` / `dedication` sunt
 * trecute ca nume permise (destinatar/expeditor) ca să nu fie semnalate.
 */
export class ValidateLyricsDto {
  @IsString()
  @Length(1, 8000)
  lyrics!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dedication?: string;

  @IsOptional()
  @IsString()
  @Length(2, 5)
  locale?: string;
}
