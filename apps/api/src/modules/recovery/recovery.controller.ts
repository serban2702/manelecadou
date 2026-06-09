import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { RecoveryService } from './recovery.service';

class ConfirmUnsubscribeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

/**
 * Endpoint-uri PUBLICE (fără auth) pentru dezabonarea de la recovery emails.
 * Linkul din footer-ul emailurilor duce la pagina web `/unsubscribe?token=X`,
 * care consumă aceste rute. Dezabonarea cere confirmare activă: userul trebuie
 * să-și TASTEZE adresa completă (anti dezabonare accidentală din scanere de
 * linkuri ale clienților de mail).
 */
@Controller('recovery')
export class RecoveryController {
  constructor(private readonly svc: RecoveryService) {}

  @Throttle({ short: { limit: 10, ttl: 60_000 }, medium: { limit: 60, ttl: 3_600_000 } })
  @Get('unsubscribe/:token')
  info(@Param('token') token: string) {
    return this.svc.getUnsubscribeInfo(token);
  }

  @Throttle({ short: { limit: 5, ttl: 60_000 }, medium: { limit: 30, ttl: 3_600_000 } })
  @Post('unsubscribe/:token')
  confirm(@Param('token') token: string, @Body() dto: ConfirmUnsubscribeDto) {
    return this.svc.confirmUnsubscribe(token, dto.email, dto.reason);
  }
}
