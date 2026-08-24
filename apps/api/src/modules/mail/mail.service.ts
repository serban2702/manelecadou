import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { MailAccount } from './entities/mail-account.entity';
import { MailFolder } from './entities/mail-folder.entity';
import { MailMessage } from './entities/mail-message.entity';
import { MailAttachment } from './entities/mail-attachment.entity';
import { MailDraft } from './entities/mail-draft.entity';
import { ImapService } from './imap.service';
import { encryptSecret, decryptSecret, maskSecret } from '../../common/crypto.util';
import { StorageService } from '../../storage/storage.service';
import { LEGACY_MAIL_ATTACH_DIR, deleteMailFile, mailKey, readMailFile } from '../../mailer/mail-storage';

export interface MailAccountInput {
  label: string;
  email: string;
  fromName?: string | null;
  siteId?: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass?: string;
  signatureHtml?: string | null;
  autoReplyEnabled?: boolean;
  autoReplyThreshold?: number;
  syncEnabled?: boolean;
}

export type MailAccountSafe = Omit<MailAccount, 'imapPassEnc' | 'smtpPassEnc'> & {
  imapPassMask: string;
  smtpPassMask: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');

  constructor(
    @InjectRepository(MailAccount) public readonly accounts: Repository<MailAccount>,
    @InjectRepository(MailFolder) public readonly folders: Repository<MailFolder>,
    @InjectRepository(MailMessage) public readonly messages: Repository<MailMessage>,
    @InjectRepository(MailAttachment) public readonly attachments: Repository<MailAttachment>,
    @InjectRepository(MailDraft) public readonly drafts: Repository<MailDraft>,
    private readonly imap: ImapService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Salvează ciorna în lucru (autosave din compose). Un singur rând per ciornă:
   * la fiecare salvare îl actualizăm, nu acumulăm versiuni.
   */
  async saveDraft(input: {
    id?: string | null;
    accountId: string;
    to: string[];
    subject: string;
    bodyHtml: string;
    inReplyToMessageId?: string | null;
  }): Promise<MailDraft> {
    const acc = await this.getAccount(input.accountId);
    const draft = input.id ? await this.drafts.findOne({ where: { id: input.id } }) : null;
    const row = draft ?? this.drafts.create({ accountId: acc.id, siteId: acc.siteId ?? null });
    row.accountId = acc.id;
    row.siteId = acc.siteId ?? null;
    row.toAddrs = input.to.filter(Boolean).map((address) => ({ address }));
    row.subject = (input.subject ?? '').slice(0, 500);
    row.bodyHtml = input.bodyHtml ?? '';
    row.inReplyToMessageId = input.inReplyToMessageId ?? null;
    return this.drafts.save(row);
  }

  /** Cea mai recentă ciornă a unui cont — cea propusă la redeschiderea compose-ului. */
  async latestDraft(accountId: string): Promise<MailDraft | null> {
    return this.drafts.findOne({ where: { accountId }, order: { updatedAt: 'DESC' } });
  }

  async deleteDraft(id: string): Promise<void> {
    await this.drafts.delete({ id });
  }

  toSafe(acc: MailAccount): MailAccountSafe {
    const { imapPassEnc, smtpPassEnc, ...rest } = acc;
    return {
      ...rest,
      imapPassMask: maskSecret(imapPassEnc),
      smtpPassMask: maskSecret(smtpPassEnc),
    } as MailAccountSafe;
  }

  /** Listare conturi. siteId === null = cross-site (admin „Toate"). */
  async listAccounts(siteId: string | null = null): Promise<MailAccountSafe[]> {
    const rows = await this.accounts.find({
      where: siteId ? { siteId } : {},
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => this.toSafe(r));
  }

  /** Conturi active pentru sync (folosit de cron-ul global de IMAP). */
  async listActiveAccountsForSync(): Promise<MailAccount[]> {
    return this.accounts.find({ where: { syncEnabled: true } });
  }

  /**
   * Citește atașamentele unui mesaj, în forma cerută la trimitere (folosit la
   * forward). Sursa poate fi volumul vechi, uploads local sau R2 — rezolvarea e
   * în `readMailFile`. Fișierele lipsă sunt sărite: un mesaj arhivat își pierde
   * atașamentele, iar forward-ul trebuie să meargă oricum.
   */
  async loadAttachmentsForSend(
    messageId: string,
  ): Promise<Array<{ filename: string; content: Buffer; contentType: string; cid?: string }>> {
    const rows = await this.attachments.find({ where: { messageId } });
    const out: Array<{ filename: string; content: Buffer; contentType: string; cid?: string }> = [];
    for (const r of rows) {
      try {
        out.push({
          filename: r.filename,
          content: await readMailFile(this.storage, r.storagePath),
          contentType: r.mime,
          cid: r.contentId ?? undefined,
        });
      } catch (e) {
        this.logger.warn(`attachment ${r.id} unreadable: ${(e as Error).message}`);
      }
    }
    return out;
  }

  async getAccount(id: string): Promise<MailAccount> {
    const acc = await this.accounts.findOne({ where: { id } });
    if (!acc) throw new NotFoundException('Cont email inexistent');
    return acc;
  }

  async createAccount(input: MailAccountInput): Promise<MailAccount> {
    if (!input.imapPass || !input.smtpPass) {
      throw new Error('IMAP și SMTP password sunt obligatorii la creare');
    }
    const acc = this.accounts.create({
      label: input.label,
      email: input.email,
      fromName: input.fromName ?? null,
      siteId: input.siteId ?? null,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecure: input.imapSecure,
      imapUser: input.imapUser,
      imapPassEnc: encryptSecret(input.imapPass),
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      smtpUser: input.smtpUser,
      smtpPassEnc: encryptSecret(input.smtpPass),
      signatureHtml: input.signatureHtml ?? null,
      autoReplyEnabled: input.autoReplyEnabled ?? false,
      autoReplyThreshold: input.autoReplyThreshold ?? 0.8,
      syncEnabled: input.syncEnabled ?? true,
    });
    return this.accounts.save(acc);
  }

  async updateAccount(id: string, patch: Partial<MailAccountInput>): Promise<MailAccount> {
    const acc = await this.getAccount(id);
    if (patch.siteId !== undefined) acc.siteId = patch.siteId;
    if (patch.label != null) acc.label = patch.label;
    if (patch.email != null) acc.email = patch.email;
    if (patch.fromName !== undefined) acc.fromName = patch.fromName;
    if (patch.imapHost != null) acc.imapHost = patch.imapHost;
    if (patch.imapPort != null) acc.imapPort = patch.imapPort;
    if (patch.imapSecure != null) acc.imapSecure = patch.imapSecure;
    if (patch.imapUser != null) acc.imapUser = patch.imapUser;
    if (patch.imapPass) acc.imapPassEnc = encryptSecret(patch.imapPass);
    if (patch.smtpHost != null) acc.smtpHost = patch.smtpHost;
    if (patch.smtpPort != null) acc.smtpPort = patch.smtpPort;
    if (patch.smtpSecure != null) acc.smtpSecure = patch.smtpSecure;
    if (patch.smtpUser != null) acc.smtpUser = patch.smtpUser;
    if (patch.smtpPass) acc.smtpPassEnc = encryptSecret(patch.smtpPass);
    if (patch.signatureHtml !== undefined) acc.signatureHtml = patch.signatureHtml;
    if (patch.autoReplyEnabled != null) acc.autoReplyEnabled = patch.autoReplyEnabled;
    if (patch.autoReplyThreshold != null) acc.autoReplyThreshold = patch.autoReplyThreshold;
    if (patch.syncEnabled != null) acc.syncEnabled = patch.syncEnabled;
    return this.accounts.save(acc);
  }

  async deleteAccount(id: string): Promise<void> {
    const acc = await this.getAccount(id);
    const msgs = await this.messages.find({ where: { accountId: id }, select: ['id'] });
    const msgIds = msgs.map((m) => m.id);
    if (msgIds.length) {
      // Șterge fișierele de pe disc înainte să pierzi referințele DB.
      for (const mid of msgIds) await this.removeAttachmentFiles(mid);
      await this.attachments.delete({ messageId: In(msgIds) });
      await this.messages.delete({ id: In(msgIds) });
    }
    await this.folders.delete({ accountId: id });
    await this.accounts.delete({ id: acc.id });
  }

  /**
   * Șterge fișierele atașamentelor de pe disc + rândurile DB pentru un mesaj.
   * NU atinge mesajul în sine. Întoarce numărul de fișiere șterse.
   */
  async purgeAttachments(messageId: string): Promise<number> {
    const atts = await this.attachments.find({ where: { messageId } });
    if (!atts.length) {
      await this.removeAttachmentFiles(messageId); // cleanup pentru orfane
      return 0;
    }
    await this.removeAttachmentFiles(messageId);
    await this.attachments.delete({ messageId });
    const msg = await this.messages.findOne({ where: { id: messageId } });
    if (msg) {
      msg.attachmentsPurged = true;
      msg.attachmentCount = 0;
      await this.messages.save(msg);
    }
    return atts.length;
  }

  async archiveMessage(messageId: string): Promise<MailMessage> {
    const msg = await this.messages.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Mesaj inexistent');
    if (msg.attachmentCount > 0 && !msg.attachmentsPurged) {
      await this.purgeAttachments(messageId);
    }
    msg.archived = true;
    msg.archivedAt = new Date();
    msg.attachmentsPurged = true;
    msg.attachmentCount = 0;
    return this.messages.save(msg);
  }

  async unarchiveMessage(messageId: string): Promise<MailMessage> {
    const msg = await this.messages.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Mesaj inexistent');
    msg.archived = false;
    msg.archivedAt = null;
    return this.messages.save(msg);
  }

  /**
   * Marchează citit/steluță local ȘI pe server.
   *
   * IMAP-ul e best-effort: dacă serverul e jos, marcajul rămâne local și se
   * corectează la următorul sync. Un mail marcat citit în admin trebuie să apară
   * citit și pe telefon.
   */
  async setMessageFlags(
    messageId: string,
    flags: { seen?: boolean; flagged?: boolean },
  ): Promise<MailMessage> {
    const msg = await this.messages.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Mesaj inexistent');
    if (flags.seen !== undefined) msg.seen = flags.seen;
    if (flags.flagged !== undefined) msg.flagged = flags.flagged;
    const saved = await this.messages.save(msg);

    if (msg.uid && msg.folderId) {
      const folder = await this.folders.findOne({ where: { id: msg.folderId } });
      if (folder) {
        try {
          const acc = await this.getAccount(msg.accountId);
          await this.imap.setFlags(acc, folder.path, msg.uid, flags);
        } catch (e) {
          this.logger.warn(`IMAP setFlags failed for ${messageId}: ${(e as Error).message}`);
        }
      }
    }
    return saved;
  }

  /** Mută mesajul în alt folder, pe server și local. */
  async moveMessage(messageId: string, targetFolderId: string): Promise<MailMessage> {
    const msg = await this.messages.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Mesaj inexistent');
    const target = await this.folders.findOne({ where: { id: targetFolderId } });
    if (!target || target.accountId !== msg.accountId) {
      throw new NotFoundException('Folder inexistent pentru acest cont');
    }
    const source = msg.folderId ? await this.folders.findOne({ where: { id: msg.folderId } }) : null;

    if (msg.uid && source) {
      const acc = await this.getAccount(msg.accountId);
      const { newUid } = await this.imap.moveMessage(acc, source.path, msg.uid, target.path);
      // UID-ul e valabil doar în folderul lui: dacă serverul nu ne-a dat unul nou,
      // îl golim ca să nu acționăm pe UID-ul altui mesaj din folderul destinație.
      msg.uid = newUid;
    }
    msg.folderId = target.id;
    return this.messages.save(msg);
  }

  /**
   * „Șterge" în sensul unui client de mail: mută în Coș pe server. Dacă mesajul
   * e deja în Coș (sau contul n-are Coș), îl șterge definitiv de pe server și
   * local, împreună cu atașamentele de pe disc.
   */
  async deleteMessage(messageId: string): Promise<{ trashed: boolean }> {
    const msg = await this.messages.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Mesaj inexistent');
    const source = msg.folderId ? await this.folders.findOne({ where: { id: msg.folderId } }) : null;
    const trash = await this.folders.findOne({ where: { accountId: msg.accountId, role: 'trash' } });

    if (trash && source && source.id !== trash.id && msg.uid) {
      await this.moveMessage(messageId, trash.id);
      return { trashed: true };
    }

    if (msg.uid && source) {
      try {
        const acc = await this.getAccount(msg.accountId);
        await this.imap.deleteMessage(acc, source.path, msg.uid);
      } catch (e) {
        // Serverul poate fi jos sau mesajul deja șters remote — local tot îl curățăm.
        this.logger.warn(`IMAP delete failed for ${messageId}: ${(e as Error).message}`);
      }
    }
    await this.removeAttachmentFiles(messageId);
    await this.attachments.delete({ messageId });
    await this.messages.delete({ id: messageId });
    return { trashed: false };
  }

  /**
   * Șterge silențios fișierele atașate unui mesaj — din storage (disc + R2) și
   * de pe volumul vechi, pentru rândurile de dinainte de migrare.
   */
  private async removeAttachmentFiles(messageId: string): Promise<void> {
    try {
      const rows = await this.attachments.find({ where: { messageId } });
      for (const r of rows) await deleteMailFile(this.storage, r.storagePath);
      if (!rows.length) {
        // Fără rânduri în DB: măturăm „folderul" după orfani (scriere întreruptă
        // la sync). Doar în cazul ăsta — pe R2 fiecare listare e un request, iar
        // ștergerea unui cont întreg ar face mii degeaba.
        for (const key of await this.storage.list(mailKey(messageId)).catch(() => [])) {
          await this.storage.delete(key).catch(() => undefined);
        }
      }
      await fs.rm(path.join(LEGACY_MAIL_ATTACH_DIR, messageId), { recursive: true, force: true });
    } catch (e) {
      this.logger.warn(`removeAttachmentFiles failed for ${messageId}: ${(e as Error).message}`);
    }
  }

  decryptCredentials(acc: MailAccount): { imapPass: string; smtpPass: string } {
    return {
      imapPass: decryptSecret(acc.imapPassEnc),
      smtpPass: decryptSecret(acc.smtpPassEnc),
    };
  }
}
