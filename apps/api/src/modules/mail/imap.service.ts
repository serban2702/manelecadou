import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { MailAccount } from './entities/mail-account.entity';
import type { MailFolderRole } from './entities/mail-folder.entity';
import type { MailAddr, MailDirection } from './entities/mail-message.entity';
import { decryptSecret } from '../../common/crypto.util';

export interface ImapTestResult {
  imap: { ok: boolean; error?: string };
  smtp: { ok: boolean; error?: string };
}

export interface FolderSummary {
  path: string;
  name: string;
  role: MailFolderRole;
  uidValidity: string;
  exists: number;
  unseen: number;
}

export interface ParsedMessage {
  uid: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  fromAddr: string | null;
  fromName: string | null;
  toAddrs: MailAddr[];
  cc: MailAddr[];
  bcc: MailAddr[];
  subject: string;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string | null;
  headers: Record<string, string | string[]>;
  rawSize: number;
  seen: boolean;
  flagged: boolean;
  direction: MailDirection;
  sentAt: Date | null;
  receivedAt: Date | null;
  attachments: Array<{
    filename: string;
    mime: string;
    size: number;
    contentId: string | null;
    inline: boolean;
    content: Buffer;
  }>;
}

const ATTACH_DIR = process.env.MAIL_ATTACH_DIR ?? '/tmp/manelecadou-mail-attach';
const MAX_ATTACH_BYTES = 25 * 1024 * 1024;

@Injectable()
export class ImapService {
  private readonly logger = new Logger('ImapService');

  buildClient(acc: MailAccount): ImapFlow {
    return new ImapFlow({
      host: acc.imapHost,
      port: acc.imapPort,
      secure: acc.imapSecure,
      auth: { user: acc.imapUser, pass: decryptSecret(acc.imapPassEnc) },
      logger: false,
      // No idle: we use polling.
      emitLogs: false,
    });
  }

  buildSmtpTransport(acc: MailAccount) {
    return nodemailer.createTransport({
      host: acc.smtpHost,
      port: acc.smtpPort,
      secure: acc.smtpSecure,
      auth: { user: acc.smtpUser, pass: decryptSecret(acc.smtpPassEnc) },
    });
  }

  async testConnection(acc: MailAccount): Promise<ImapTestResult> {
    const out: ImapTestResult = { imap: { ok: false }, smtp: { ok: false } };
    // IMAP
    const client = this.buildClient(acc);
    try {
      await client.connect();
      out.imap.ok = true;
    } catch (e) {
      out.imap.error = (e as Error).message;
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
    }
    // SMTP
    try {
      const tx = this.buildSmtpTransport(acc);
      await tx.verify();
      out.smtp.ok = true;
    } catch (e) {
      out.smtp.error = (e as Error).message;
    }
    return out;
  }

  /** Listează folderele cu metadate pentru un cont. */
  async listFolders(acc: MailAccount): Promise<FolderSummary[]> {
    const client = this.buildClient(acc);
    const out: FolderSummary[] = [];
    try {
      await client.connect();
      const list = await client.list();
      for (const m of list) {
        const role = inferRole(m.path, m.specialUse);
        let exists = 0;
        let unseen = 0;
        let uidValidity = '0';
        try {
          const status = await client.status(m.path, { messages: true, unseen: true, uidValidity: true });
          exists = Number(status.messages ?? 0);
          unseen = Number(status.unseen ?? 0);
          uidValidity = String(status.uidValidity ?? 0);
        } catch {
          /* ignore folders we can't status */
        }
        out.push({
          path: m.path,
          name: m.name,
          role,
          uidValidity,
          exists,
          unseen,
        });
      }
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
    }
    return out;
  }

  /**
   * Fetch mesaje noi (UID > sinceUid) din folder.
   * Returnează mesajele parsate și uidValidity curent.
   */
  async fetchNew(
    acc: MailAccount,
    folderPath: string,
    sinceUid: string,
  ): Promise<{ uidValidity: string; messages: ParsedMessage[] }> {
    const client = this.buildClient(acc);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(folderPath);
      try {
        const mbox: any = client.mailbox;
        const uidValidity = String(mbox?.uidValidity ?? 0);
        const messages: ParsedMessage[] = [];
        const range = `${BigInt(sinceUid) + 1n}:*`;
        // Ignore if folder empty or no new
        const exists = Number(mbox?.exists ?? 0);
        if (!exists) return { uidValidity, messages };

        for await (const msg of client.fetch(range, { uid: true, source: true, flags: true, envelope: true, internalDate: true, size: true }, { uid: true })) {
          if (!msg.source) continue;
          const parsed = await this.parseMessage(msg, acc);
          if (parsed) messages.push(parsed);
        }
        return { uidValidity, messages };
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }

  async markSeen(acc: MailAccount, folderPath: string, uid: string, seen: boolean): Promise<void> {
    const client = this.buildClient(acc);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(folderPath);
      try {
        if (seen) await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
        else await client.messageFlagsRemove({ uid }, ['\\Seen'], { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }

  /** Salvează mesaj în folder Sent (după trimitere) ca să apară și în Gmail Sent. */
  async appendToSent(acc: MailAccount, sentFolder: string, raw: Buffer): Promise<void> {
    const client = this.buildClient(acc);
    try {
      await client.connect();
      await client.append(sentFolder, raw, ['\\Seen']);
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }

  private async parseMessage(msg: any, acc: MailAccount): Promise<ParsedMessage | null> {
    try {
      const parsed: ParsedMail = await simpleParser(msg.source);
      const fromList = addrList(parsed.from);
      const direction: MailDirection = fromList.some((a) => a.address.toLowerCase() === acc.email.toLowerCase()) ? 'out' : 'in';

      const refs = parseReferences(parsed.references);
      const headers: Record<string, string | string[]> = {};
      parsed.headerLines?.forEach((h) => {
        const k = h.key.toLowerCase();
        if (headers[k] !== undefined) {
          if (Array.isArray(headers[k])) (headers[k] as string[]).push(h.line);
          else headers[k] = [headers[k] as string, h.line];
        } else {
          headers[k] = h.line;
        }
      });

      const flags: string[] = Array.isArray(msg.flags) ? msg.flags : Array.from(msg.flags ?? []);

      const attachments: ParsedMessage['attachments'] = [];
      for (const att of parsed.attachments ?? []) {
        if (!att.filename && !att.contentId) continue;
        if ((att.size ?? 0) > MAX_ATTACH_BYTES) continue;
        attachments.push({
          filename: att.filename ?? `attachment-${attachments.length + 1}`,
          mime: att.contentType ?? 'application/octet-stream',
          size: att.size ?? (att.content?.length ?? 0),
          contentId: att.contentId ?? null,
          inline: att.contentDisposition === 'inline',
          content: att.content as Buffer,
        });
      }

      return {
        uid: String(msg.uid),
        messageId: parsed.messageId ?? null,
        inReplyTo: parsed.inReplyTo ?? null,
        references: refs,
        fromAddr: fromList[0]?.address ?? null,
        fromName: fromList[0]?.name ?? null,
        toAddrs: addrList(parsed.to),
        cc: addrList(parsed.cc),
        bcc: addrList(parsed.bcc),
        subject: parsed.subject ?? '',
        snippet: makeSnippet(parsed.text ?? (parsed.html === false ? '' : parsed.html ?? '')),
        bodyHtml: parsed.html === false ? null : (parsed.html ?? null) as string | null,
        bodyText: parsed.text ?? null,
        headers,
        rawSize: Number(msg.size ?? 0),
        seen: flags.includes('\\Seen'),
        flagged: flags.includes('\\Flagged'),
        direction,
        sentAt: parsed.date ?? null,
        receivedAt: msg.internalDate ?? new Date(),
        attachments,
      };
    } catch (e) {
      this.logger.warn(`parseMessage failed uid=${msg.uid}: ${(e as Error).message}`);
      return null;
    }
  }

  async writeAttachmentsToDisk(messageId: string, atts: ParsedMessage['attachments']): Promise<Array<{ filename: string; mime: string; size: number; contentId: string | null; inline: boolean; storagePath: string }>> {
    if (!atts.length) return [];
    const dir = path.join(ATTACH_DIR, messageId);
    await fs.mkdir(dir, { recursive: true });
    const out = [] as Array<{ filename: string; mime: string; size: number; contentId: string | null; inline: boolean; storagePath: string }>;
    for (let i = 0; i < atts.length; i++) {
      const a = atts[i];
      const safe = a.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || `att-${i}`;
      const fp = path.join(dir, `${i}-${safe}`);
      await fs.writeFile(fp, a.content);
      out.push({
        filename: a.filename,
        mime: a.mime,
        size: a.size,
        contentId: a.contentId,
        inline: a.inline,
        storagePath: fp,
      });
    }
    return out;
  }
}

function addrList(v: AddressObject | AddressObject[] | undefined): MailAddr[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: MailAddr[] = [];
  for (const obj of arr) {
    for (const a of obj.value ?? []) {
      if (a.address) out.push({ address: a.address, name: a.name || undefined });
    }
  }
  return out;
}

function parseReferences(refs: string | string[] | undefined): string[] {
  if (!refs) return [];
  if (Array.isArray(refs)) return refs;
  return refs.split(/\s+/).filter(Boolean);
}

function makeSnippet(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
}

function inferRole(p: string, specialUse?: string | false | null): MailFolderRole {
  const lc = (p || '').toLowerCase();
  const su = (specialUse ? String(specialUse) : '').toLowerCase();
  if (su.includes('inbox') || lc === 'inbox') return 'inbox';
  if (su.includes('sent') || /sent|trimi/i.test(lc)) return 'sent';
  if (su.includes('drafts') || /draft|ciorn/i.test(lc)) return 'drafts';
  if (su.includes('trash') || /trash|gunoi|deleted/i.test(lc)) return 'trash';
  if (su.includes('junk') || su.includes('spam') || /junk|spam/i.test(lc)) return 'spam';
  if (su.includes('archive') || /archive|arhiv/i.test(lc)) return 'archive';
  return 'other';
}
