import { Module } from '@nestjs/common';
import { OpenAiClient } from './openai.client';
import { TranslationService } from './translation.service';

@Module({
  providers: [OpenAiClient, TranslationService],
  exports: [OpenAiClient, TranslationService],
})
export class OpenAiModule {}
