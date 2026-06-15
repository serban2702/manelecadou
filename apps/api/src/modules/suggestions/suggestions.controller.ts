import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { SuggestMessageDto } from './dto/suggest-message.dto';
import { GenerateLyricsDto } from './dto/generate-lyrics.dto';
import { ValidateLyricsDto } from './dto/validate-lyrics.dto';
import { SuggestionsService } from './suggestions.service';

@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly svc: SuggestionsService) {}

  @Throttle({ medium: { limit: 4, ttl: 60_000 } })
  @Post('message')
  suggestMessage(@Body() dto: SuggestMessageDto) {
    return this.svc.generate(dto);
  }

  /**
   * Generează versuri (writer + critic = 2 requesturi) pentru pasul de review
   * din wizard, ÎNAINTE de plată. Guest-friendly (fără auth), throttled.
   * `feedback` + `previousLyrics` = regenerare cu modificările cerute de user.
   * Site-ul curent (din Host) dă locale + prompturile Suno per-brand.
   */
  @Throttle({ medium: { limit: 15, ttl: 300_000 } })
  @Post('lyrics')
  generateLyrics(@Body() dto: GenerateLyricsDto, @Req() req: Request) {
    return this.svc.generateLyrics(dto, req.site ?? null);
  }

  /**
   * Validează versurile (faza de detecție GPT + listă artiști) înainte de a
   * permite trecerea la pasul următor. Returnează { ok, reason?, detail? }.
   */
  @Throttle({ medium: { limit: 20, ttl: 300_000 } })
  @Post('lyrics/validate')
  validateLyrics(@Body() dto: ValidateLyricsDto, @Req() req: Request) {
    return this.svc.validateLyrics(dto, req.site ?? null);
  }
}
