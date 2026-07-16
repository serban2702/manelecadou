import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { MailAccount } from './entities/mail-account.entity';
import { MailFolder } from './entities/mail-folder.entity';
import { MailMessage } from './entities/mail-message.entity';
import { MailAttachment } from './entities/mail-attachment.entity';
import { MailDraft } from './entities/mail-draft.entity';

import { MailService } from './mail.service';
import { ImapService } from './imap.service';
import { MailSendService } from './mail-send.service';
import { OutboxAttachmentsService } from './outbox-attachments.service';
import { MailSyncService, IMAP_SYNC_QUEUE, AI_REPLY_QUEUE } from './mail-sync.service';
import { ImapSyncProcessor } from './imap-sync.processor';
import { MailAppendProcessor } from './mail-append.processor';
import { AiReplyService } from './ai-reply.service';
import { AiReplyProcessor } from './ai-reply.processor';
import { MAIL_APPEND_QUEUE } from '../../mailer/mail-append.queue';
import { MailGateway } from './mail.gateway';
import { MailController } from './mail.controller';

import { AdminGuard } from '../../common/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { KbModule } from '../kb/kb.module';
import { OpenAiModule } from '../../openai/openai.module';
import { SitesModule } from '../sites/sites.module';
import { MailerModule } from '../../mailer/mailer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MailAccount, MailFolder, MailMessage, MailAttachment, MailDraft]),
    BullModule.registerQueue({ name: IMAP_SYNC_QUEUE }, { name: AI_REPLY_QUEUE }, { name: MAIL_APPEND_QUEUE }),
    AuthModule,
    KbModule,
    OpenAiModule,
    SitesModule,
    MailerModule,
  ],
  providers: [
    MailService,
    ImapService,
    MailSendService,
    OutboxAttachmentsService,
    MailSyncService,
    ImapSyncProcessor,
    MailAppendProcessor,
    AiReplyService,
    AiReplyProcessor,
    MailGateway,
    AdminGuard,
  ],
  controllers: [MailController],
  exports: [MailService, MailSendService],
})
export class MailModule {}
