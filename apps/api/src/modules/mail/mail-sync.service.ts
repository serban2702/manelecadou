import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { MailService } from './mail.service';
import { ImapService, ParsedMessage } from './imap.service';
import { MailAccount } from './entities/mail-account.entity';
import { MailFolder, MailFolderRole } from './entities/mail-folder.entity';
import { MailMessage } from './entities/mail-message.entity';
import { MailGateway } from './mail.gateway';

export const AI_REPLY_QUEUE = 'ai-reply';
export const IMAP_SYNC_QUEUE = 'imap-sync';

@Injectable()
export class MailSyncService {
  private readonly logger = new Logger('MailSyncService');

  constructor(
    private readonly mail: MailService,
    private readonly imap: ImapService,
    private readonly gateway: MailGateway,
    @InjectQueue(AI_REPLY_QUEUE) private readonly aiQueue: Queue,
  ) {}

  async syncAccount(accountId: string): Promise<{ ingested: number }> {
    const acc = await this.mail.getAccount(accountId);
    let ingested = 0;
    try {
      // 1) Refresh folder list
      const remoteFolders = await this.imap.listFolders(acc);
      for (const rf of remoteFolders) {
        let f = await this.mail.folders.findOne({ where: { accountId: acc.id, path: rf.path } });
        if (!f) {
          f = this.mail.folders.create({
            accountId: acc.id,
            siteId: acc.siteId ?? null,
            path: rf.path,
            name: rf.name,
            role: rf.role,
            uidValidity: rf.uidValidity,
            lastUid: '0',
            unreadCount: rf.unseen,
            totalCount: rf.exists,
          });
          await this.mail.folders.save(f);
        } else {
          f.role = rf.role;
          f.unreadCount = rf.unseen;
          f.totalCount = rf.exists;
          // uidValidity changed → re-scan from 0
          if (String(f.uidValidity) !== String(rf.uidValidity)) {
            this.logger.warn(`uidValidity changed for ${acc.email}/${rf.path} (${f.uidValidity} → ${rf.uidValidity}); resetting lastUid`);
            f.uidValidity = rf.uidValidity;
            f.lastUid = '0';
          }
          await this.mail.folders.save(f);
        }
      }

      // 2) Sync inbox + sent (cele mai relevante)
      const folders = await this.mail.folders.find({ where: { accountId: acc.id } });
      const targetRoles: MailFolderRole[] = ['inbox', 'sent'];
      for (const f of folders) {
        if (!targetRoles.includes(f.role)) continue;
        const result = await this.imap.fetchNew(acc, f.path, f.lastUid);
        if (String(f.uidValidity) !== result.uidValidity) {
          f.uidValidity = result.uidValidity;
          f.lastUid = '0';
        }
        for (const m of result.messages) {
          const created = await this.persistMessage(acc, f, m);
          if (!created) continue;
          ingested++;
          // Only enqueue AI for inbound, non-AI messages.
          if (created.direction === 'in') {
            await this.aiQueue.add('suggest', { messageId: created.id }, { removeOnComplete: 100, removeOnFail: 50 });
          }
          this.gateway.emitNewMessage(acc.id, created.id);
          if (BigInt(m.uid) > BigInt(f.lastUid)) f.lastUid = m.uid;
        }
        await this.mail.folders.save(f);
      }

      acc.lastSyncAt = new Date();
      acc.lastError = null;
      await this.mail.accounts.save(acc);
    } catch (e) {
      acc.lastError = (e as Error).message.slice(0, 500);
      await this.mail.accounts.save(acc);
      this.logger.warn(`sync failed for ${acc.email}: ${acc.lastError}`);
      throw e;
    }
    return { ingested };
  }

  private async persistMessage(acc: MailAccount, folder: MailFolder, m: ParsedMessage): Promise<MailMessage | null> {
    if (m.messageId) {
      const existing = await this.mail.messages.findOne({ where: { accountId: acc.id, messageId: m.messageId } });
      if (existing) return null;
    }
    const threadId = m.references[0] ?? m.inReplyTo ?? m.messageId ?? null;
    const msg = this.mail.messages.create({
      accountId: acc.id,
      siteId: acc.siteId ?? null,
      folderId: folder.id,
      uid: m.uid,
      messageId: m.messageId,
      inReplyTo: m.inReplyTo,
      references: m.references,
      threadId,
      fromAddr: m.fromAddr,
      fromName: m.fromName,
      toAddrs: m.toAddrs,
      cc: m.cc,
      bcc: m.bcc,
      subject: (m.subject ?? '').slice(0, 500),
      snippet: m.snippet,
      bodyHtml: m.bodyHtml,
      bodyText: m.bodyText,
      headers: m.headers,
      rawSize: m.rawSize,
      seen: m.seen,
      flagged: m.flagged,
      direction: m.direction,
      aiGenerated: false,
      attachmentCount: m.attachments.length,
      sentAt: m.sentAt,
      receivedAt: m.receivedAt,
    });
    const saved = await this.mail.messages.save(msg);
    if (m.attachments.length) {
      const records = await this.imap.writeAttachmentsToDisk(saved.id, m.attachments);
      for (const r of records) {
        await this.mail.attachments.save(this.mail.attachments.create({ messageId: saved.id, ...r }));
      }
    }
    return saved;
  }
}
