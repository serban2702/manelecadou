import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityPerson } from './identity-person.entity';
import { IdentityVisitor } from './identity-visitor.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Conversation } from '../chat/conversation.entity';
import { ChatMessage } from '../chat/message.entity';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { SitesModule } from '../sites/sites.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IdentityPerson, IdentityVisitor, GuestSession, Conversation, ChatMessage]),
    SitesModule,
  ],
  providers: [IdentityService],
  controllers: [IdentityController],
  exports: [IdentityService],
})
export class IdentityModule {}
