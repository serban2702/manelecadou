import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { MailService } from './mail.service';
import { ImapService, ParsedMessage } from './imap.service';
import { MailAccount } from './entities/mail-account.entity';
import { MailFolder, MailFolderRole } from './entities/mail-folder.entity';
import { MailMessage } from './entities/mail-message.entity';
import { MailGateway } from './mail.gateway';
import { TranslationService } from '../../openai/translation.service';

export const AI_REPLY_QUEUE = 'ai-reply';
export const IMAP_SYNC_QUEUE = 'imap-sync';

@Injectable()
export class MailSyncService {
  private readonly logger = new Logger('MailSyncService');

  constructor(
    private readonly mail: MailService,
    private readonly imap: ImapService,
    private readonly gateway: MailGateway,
    private readonly translation: TranslationService,
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

      // 2) Sync pe toate folderele standard. `other` rămâne exclus intenționat:
      //    sunt foldere custom ale userului (uneori zeci, cu mii de mailuri vechi)
      //    care ar umfla sync-ul fără să aducă ceva pentru operare.
      const folders = await this.mail.folders.find({ where: { accountId: acc.id } });
      const targetRoles: MailFolderRole[] = ['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive'];
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
          // AI + traducere doar pentru mailurile primite în Inbox. Spam/Coș/Arhivă
          // se sincronizează pentru vizibilitate, dar n-au ce căuta la sugestii —
          // ar arde tokeni OpenAI pe junk și ar propune răspunsuri la el.
          if (created.direction === 'in' && f.role === 'inbox') {
            await this.aiQueue.add('suggest', { messageId: created.id }, { removeOnComplete: 100, removeOnFail: 50 });
            // Auto-translate inbound non-RO → RO. Fire-and-forget: nu blocăm sync-ul
            // dacă traducerea durează / cade (mesajul e oricum vizibil în original).
            void this.translateInboundAsync(created.id);
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
      if (existing) {
        // Mesajul e deja la noi — tipic unul trimis de noi, salvat local la
        // trimitere și adus acum înapoi din `Sent` de APPEND. Nu-l duplicăm, dar
        // îl legăm de folderul și uid-ul real, altfel ar rămâne orfan
        // (folderId/uid null) și n-ar răspunde la acțiunile IMAP.
        let touched = false;
        if (!existing.folderId || existing.folderId !== folder.id) {
          existing.folderId = folder.id;
          touched = true;
        }
        if (!existing.uid) {
          existing.uid = m.uid;
          touched = true;
        }
        if (touched) await this.mail.messages.save(existing);
        return null;
      }
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

  /**
   * Rulează pipeline-ul de traducere multi-agent peste un mesaj inbound.
   * Salvează rezultatul (text RO + scor consens) sau lasă câmpurile null dacă mesajul
   * e deja în RO. Erorile sunt log-uite (mesajul rămâne vizibil în original).
   */
  private async translateInboundAsync(messageId: string): Promise<void> {
    try {
      const msg = await this.mail.messages.findOne({ where: { id: messageId } });
      if (!msg) return;
      const source = (msg.bodyText ?? msg.snippet ?? '').trim();
      if (!source) return;
      const result = await this.translation.translateToRo(source);
      const detected = result?.sourceLang ?? 'ro';
      msg.detectedLang = detected;
      if (result) {
        msg.bodyTextRo = result.final;
        msg.translationConsensus = result.consensus;
      }
      await this.mail.messages.save(msg);
      this.gateway.emitNewMessage(msg.accountId, msg.id);
    } catch (e) {
      this.logger.warn(`translate inbound mail ${messageId} failed: ${(e as Error).message}`);
    }
  }
}
