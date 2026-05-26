import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './conversation.entity';
import { ChatMessage } from './message.entity';
import { QuickReply } from './quick-reply.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { AnalyticsSession } from '../analytics/analytics-session.entity';
import { ChatService } from './chat.service';
import { ChatController, AdminChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatAttachmentsService } from './chat-attachments.service';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';
import { OpenAiModule } from '../../openai/openai.module';
import { KbModule } from '../kb/kb.module';
import { WebPushModule } from '../web-push/web-push.module';
import { PaymentsModule } from '../payments/payments.module';
import { SitesModule } from '../sites/sites.module';
import { SettingsModule } from '../settings/settings.module';
import { LyricsModule } from '../lyrics/lyrics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ChatMessage, GuestSession, User, AnalyticsSession, QuickReply]),
    AuthModule,
    OpenAiModule,
    KbModule,
    WebPushModule,
    PaymentsModule,
    SitesModule,
    SettingsModule,
    LyricsModule,
  ],
  providers: [ChatService, ChatGateway, ChatAttachmentsService, AdminGuard],
  exports: [ChatService, ChatGateway],
  controllers: [ChatController, AdminChatController],
})
export class ChatModule {}
