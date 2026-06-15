import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';
import { LyricsModule } from '../lyrics/lyrics.module';

@Module({
  imports: [ConfigModule, LyricsModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
})
export class SuggestionsModule {}
