import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';
import { KbEntry } from './entities/kb-entry.entity';
import { AiReplySuggestion } from './entities/ai-reply-suggestion.entity';
import { KbService } from './kb.service';
import { KbController } from './kb.controller';

@Module({
  imports: [TypeOrmModule.forFeature([KbEntry, AiReplySuggestion]), AuthModule],
  providers: [KbService, AdminGuard],
  controllers: [KbController],
  exports: [KbService, TypeOrmModule],
})
export class KbModule {}
