import { Module } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { AiAssistantController } from './ai-assistant.controller';
import { OpenAiModule } from '../../openai/openai.module';
import { KbModule } from '../kb/kb.module';
import { MailModule } from '../mail/mail.module';
import { ChatModule } from '../chat/chat.module';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';

@Module({
  imports: [OpenAiModule, KbModule, MailModule, ChatModule, AuthModule],
  providers: [AiAssistantService, AdminGuard],
  controllers: [AiAssistantController],
})
export class AiAssistantModule {}
