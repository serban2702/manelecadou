import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { MailAccount } from './entities/mail-account.entity';
import { MailFolder } from './entities/mail-folder.entity';
import { MailMessage } from './entities/mail-message.entity';
import { MailAttachment } from './entities/mail-attachment.entity';
import { encryptSecret, decryptSecret, maskSecret } from '../../common/crypto.util';

const ATTACH_DIR = process.env.MAIL_ATTACH_DIR ?? '/tmp/manelecadou-mail-attach';

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
  ) {}

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
      for (const mid of msgIds) await this.removeAttachmentDir(mid);
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
      await this.removeAttachmentDir(messageId); // cleanup pentru orfane
      return 0;
    }
    await this.removeAttachmentDir(messageId);
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
   * Șterge complet mesajul (DB + atașamente pe disc + rânduri DB pentru atașamente).
   * NU șterge mesajul de pe serverul IMAP remote — doar local.
   */
  async deleteMessage(messageId: string): Promise<void> {
    const msg = await this.messages.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Mesaj inexistent');
    await this.removeAttachmentDir(messageId);
    await this.attachments.delete({ messageId });
    await this.messages.delete({ id: messageId });
  }

  /** Șterge silențios directorul de atașamente al unui mesaj. */
  private async removeAttachmentDir(messageId: string): Promise<void> {
    const dir = path.join(ATTACH_DIR, messageId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (e) {
      this.logger.warn(`removeAttachmentDir failed for ${messageId}: ${(e as Error).message}`);
    }
  }

  decryptCredentials(acc: MailAccount): { imapPass: string; smtpPass: string } {
    return {
      imapPass: decryptSecret(acc.imapPassEnc),
      smtpPass: decryptSecret(acc.smtpPassEnc),
    };
  }
}
