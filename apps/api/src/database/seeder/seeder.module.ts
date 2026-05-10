import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { User } from '../../modules/users/user.entity';
import { GuestSession } from '../../modules/guest-sessions/guest-session.entity';
import { Generation } from '../../modules/generations/generation.entity';
import { Conversation } from '../../modules/chat/conversation.entity';
import { ChatMessage } from '../../modules/chat/message.entity';
import { Site } from '../../modules/sites/site.entity';
import { AppSetting } from '../../modules/settings/app-setting.entity';
import { SeederService } from './seeder.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, GuestSession, Generation, Conversation, ChatMessage, Site, AppSetting]),
  ],
  providers: [SeederService],
  exports: [SeederService],
})
export class SeederModule {}
