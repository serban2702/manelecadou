import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './conversation.entity';
import { ChatMessage } from './message.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { AnalyticsSession } from '../analytics/analytics-session.entity';
import { ChatService } from './chat.service';
import { ChatController, AdminChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../../common/admin.guard';
import { OpenAiModule } from '../../openai/openai.module';
import { KbModule } from '../kb/kb.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ChatMessage, GuestSession, User, AnalyticsSession]),
    AuthModule,
    OpenAiModule,
    KbModule,
  ],
  providers: [ChatService, ChatGateway, AdminGuard],
  exports: [ChatService, ChatGateway],
  controllers: [ChatController, AdminChatController],
})
export class ChatModule {}
