import { Module } from '@nestjs/common';
import { OpenAiClient } from './openai.client';

@Module({
  providers: [OpenAiClient],
  exports: [OpenAiClient],
})
export class OpenAiModule {}
