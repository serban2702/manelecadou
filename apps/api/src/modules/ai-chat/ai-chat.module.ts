import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Conversation } from '../chat/conversation.entity';
import { ChatMessage } from '../chat/message.entity';
import { AIChatAgentService } from './ai-chat-agent.service';
import { AILearnerService } from './ai-learner.service';
import { AiChatAdminController } from './ai-chat-admin.controller';
import { AiMemory } from './ai-memory.entity';
import { AiToolCall } from './ai-tool-call.entity';
import { OpenAiModule } from '../../openai/openai.module';
import { SettingsModule } from '../settings/settings.module';
import { KbModule } from '../kb/kb.module';
import { SitesModule } from '../sites/sites.module';
import { ChatModule } from '../chat/chat.module';
import { PaymentsModule } from '../payments/payments.module';
import { GenerationsModule } from '../generations/generations.module';
import { GuestSessionsModule } from '../guest-sessions/guest-sessions.module';
import { MetaCapiModule } from '../meta-capi/meta-capi.module';
import { AdminGuard } from '../../common/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ChatMessage, AiMemory, AiToolCall]),
    ScheduleModule.forRoot(),
    OpenAiModule,
    SettingsModule,
    KbModule,
    SitesModule,
    PaymentsModule,
    GenerationsModule,
    GuestSessionsModule,
    MetaCapiModule,
    forwardRef(() => ChatModule),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [AIChatAgentService, AILearnerService, AdminGuard],
  controllers: [AiChatAdminController],
  exports: [AIChatAgentService],
})
export class AiChatModule {}
