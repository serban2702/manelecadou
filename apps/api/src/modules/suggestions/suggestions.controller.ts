import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SuggestMessageDto } from './dto/suggest-message.dto';
import { SuggestionsService } from './suggestions.service';

@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly svc: SuggestionsService) {}

  @Throttle({ medium: { limit: 4, ttl: 60_000 } })
  @Post('message')
  suggestMessage(@Body() dto: SuggestMessageDto) {
    return this.svc.generate(dto);
  }
}
