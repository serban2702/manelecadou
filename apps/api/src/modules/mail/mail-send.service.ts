import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { htmlToText } from 'html-to-text';
import juice from 'juice';

import { MailService } from './mail.service';
import { MailAccount } from './entities/mail-account.entity';
import { MailMessage } from './entities/mail-message.entity';
import { renderBrandedEmail } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';
import { SitesService } from '../sites/sites.service';
import { MailerService } from '../../mailer/mailer.module';
import type { MailAttachmentInput } from '../../mailer/mail.types';

export interface SendReplyInput {
  inReplyToId: string;
  htmlBody: string;
  /** Override pentru recipienți; default = răspunde la `from` + `cc`. */
  to?: string[];
  cc?: string[];
  subject?: string;
  aiGenerated?: boolean;
  attachments?: MailAttachmentInput[];
}

export interface SendComposeInput {
  /** Contul (adresa) din care se trimite — determină branding-ul + identitatea expeditorului. */
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  attachments?: MailAttachmentInput[];
}

export interface ForwardInput {
  messageId: string;
  to: string[];
  cc?: string[];
  /** Comentariul adăugat deasupra mesajului redirecționat. */
  htmlBody?: string;
  /** Include atașamentele mesajului original (dacă mai există pe disc). */
  includeAttachments?: boolean;
}

interface DeliverParams {
  acc: MailAccount;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  /** Mesajul la care răspundem — pentru threading (In-Reply-To / References). */
  replyTo?: MailMessage | null;
  attachments?: MailAttachmentInput[];
  aiGenerated?: boolean;
  /** Categoria pentru auditul din `outbound_emails`. */
  kind: string;
}

@Injectable()
export class MailSendService {
  private readonly logger = new Logger('MailSendService');

  constructor(
    private readonly mail: MailService,
    private readonly sites: SitesService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Trimite un mail din căsuța `acc` și îl persistă local ca mesaj `out`.
   *
   * Toate trimiterile din inbox trec pe aici, prin `MailerService` — adică prin
   * pipeline-ul de mail al platformei (Mailgun pentru site-urile care îl au
   * configurat), nu prin SMTP-ul contului IMAP. Câștigăm deliverability, audit în
   * `outbound_emails` și copia automată în `Sent` (coada `mail-append`).
   *
   * Nu forțăm Mailgun: site-urile fără credențiale Mailgun proprii (bg, gr) ar
   * cădea pe cele globale, care aparțin altui proiect — clientul ar primi mail
   * de la un expeditor străin. Providerul site-ului e sursa de adevăr.
   */
  private async deliver(p: DeliverParams): Promise<MailMessage> {
    const to = clean(p.to);
    const cc = clean(p.cc);
    const bcc = clean(p.bcc);
    if (!to.length) throw new BadRequestException('Adaugă cel puțin un destinatar');
    const subject = p.subject.trim();

    const site = p.acc.siteId ? await this.sites.findById(p.acc.siteId) : null;
    const branded = renderBrandedEmail({
      subject,
      bodyHtml: p.htmlBody,
      signatureHtml: p.acc.signatureHtml ?? null,
      fromName: p.acc.fromName,
      locale: site?.locale ?? 'ro',
      branding: brandingFromSite(site),
    });
    const inlinedHtml = juice(branded);
    const plain = htmlToText(inlinedHtml, {
      wordwrap: 100,
      selectors: [{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } }],
    });

    const refs = p.replyTo
      ? [...new Set([...(p.replyTo.references ?? []), p.replyTo.messageId].filter(Boolean) as string[])]
      : [];

    const result = await this.mailer.sendDetailed(
      {
        to: to.join(', '),
        cc: cc.length ? cc.join(', ') : undefined,
        bcc: bcc.length ? bcc.join(', ') : undefined,
        subject,
        html: inlinedHtml,
        text: plain,
        from: p.acc.fromName ? `"${p.acc.fromName}" <${p.acc.email}>` : p.acc.email,
        replyTo: p.acc.email,
        inReplyTo: p.replyTo?.messageId ?? undefined,
        references: refs,
        attachments: p.attachments,
      },
      { site, kind: p.kind, relatedId: p.replyTo?.id ?? null },
    );
    if (!result.sent) {
      throw new BadRequestException(
        `Email-ul nu a putut fi trimis: ${result.notes ?? 'provider neconfigurat'}`,
      );
    }

    const outMessageId = (result.messageId ?? '').replace(/^<|>$/g, '');
    // Îl punem direct în folderul Sent local ca să apară imediat la „Trimise",
    // fără să așteptăm sync-ul. Când sync-ul aduce mesajul înapoi din Sent, se
    // deduplică pe `messageId` și primește uid-ul real (vezi MailSyncService).
    const sentFolder = await this.mail.folders.findOne({
      where: { accountId: p.acc.id, role: 'sent' },
    });

    const msg = this.mail.messages.create({
      siteId: p.acc.siteId ?? null,
      accountId: p.acc.id,
      folderId: sentFolder?.id ?? null,
      uid: null,
      messageId: outMessageId || null,
      inReplyTo: p.replyTo?.messageId ?? null,
      references: refs,
      // Răspuns → firul existent. Mail nou → thread nou ancorat pe propriul Message-ID.
      threadId: p.replyTo ? (p.replyTo.threadId ?? p.replyTo.messageId ?? null) : outMessageId || null,
      fromAddr: p.acc.email,
      fromName: p.acc.fromName,
      toAddrs: to.map((address) => ({ address })),
      cc: cc.map((address) => ({ address })),
      bcc: bcc.map((address) => ({ address })),
      subject,
      snippet: plain.replace(/\s+/g, ' ').trim().slice(0, 280),
      bodyHtml: inlinedHtml,
      bodyText: plain,
      headers: {},
      rawSize: Buffer.byteLength(inlinedHtml, 'utf8'),
      seen: true,
      flagged: false,
      direction: 'out',
      aiGenerated: !!p.aiGenerated,
      attachmentCount: p.attachments?.length ?? 0,
      sentAt: new Date(),
      receivedAt: new Date(),
    });
    const saved = await this.mail.messages.save(msg);
    if (!saved.threadId) {
      saved.threadId = saved.id;
      await this.mail.messages.save(saved);
    }
    return saved;
  }

  async sendReply(input: SendReplyInput): Promise<MailMessage> {
    const orig = await this.mail.messages.findOne({ where: { id: input.inReplyToId } });
    if (!orig) throw new NotFoundException('Mesaj inexistent');
    const acc = await this.mail.getAccount(orig.accountId);

    const to = input.to?.length ? input.to : [orig.fromAddr ?? ''];
    if (!clean(to).length) throw new BadRequestException('Nu există destinatar pentru răspuns');

    return this.deliver({
      acc,
      to,
      cc: input.cc,
      subject: input.subject ?? this.replySubject(orig.subject),
      htmlBody: input.htmlBody,
      replyTo: orig,
      attachments: input.attachments,
      aiGenerated: input.aiGenerated,
      kind: 'inbox_reply',
    });
  }

  /** Compune și trimite un email NOU (nu un răspuns) către un destinatar arbitrar. */
  async sendCompose(input: SendComposeInput): Promise<MailMessage> {
    const acc = await this.mail.getAccount(input.accountId);
    const subject = (input.subject ?? '').trim();
    if (!subject) throw new BadRequestException('Adaugă un subiect');
    return this.deliver({
      acc,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject,
      htmlBody: input.htmlBody,
      attachments: input.attachments,
      kind: 'inbox_compose',
    });
  }

  /**
   * Redirecționează un mesaj: comentariul adminului sus, mesajul original citat
   * dedesubt, opțional cu atașamentele lui.
   */
  async forward(input: ForwardInput): Promise<MailMessage> {
    const orig = await this.mail.messages.findOne({ where: { id: input.messageId } });
    if (!orig) throw new NotFoundException('Mesaj inexistent');
    const acc = await this.mail.getAccount(orig.accountId);

    let attachments: MailAttachmentInput[] | undefined;
    if (input.includeAttachments && orig.attachmentCount > 0 && !orig.attachmentsPurged) {
      attachments = await this.mail.loadAttachmentsForSend(orig.id);
    }

    return this.deliver({
      acc,
      to: input.to,
      cc: input.cc,
      subject: this.forwardSubject(orig.subject),
      htmlBody: `${input.htmlBody ?? ''}${quoteOriginal(orig)}`,
      attachments,
      kind: 'inbox_forward',
    });
  }

  private replySubject(subj: string): string {
    if (!subj) return 'Re:';
    return /^re:/i.test(subj) ? subj : `Re: ${subj}`;
  }

  private forwardSubject(subj: string): string {
    if (!subj) return 'Fwd:';
    return /^fwd?:/i.test(subj) ? subj : `Fwd: ${subj}`;
  }
}

/** Blocul cu mesajul original, atașat sub comentariul de forward. */
function quoteOriginal(m: MailMessage): string {
  const when = m.sentAt ? new Date(m.sentAt).toLocaleString('ro-RO') : '';
  const body = m.bodyHtml ?? `<pre>${escapeHtml(m.bodyText ?? '')}</pre>`;
  return `
    <br />
    <div style="border-left:3px solid #d4af37;padding-left:12px;margin-top:16px;color:#555">
      <p style="font-size:12px;margin:0 0 8px">
        ---------- Mesaj redirecționat ----------<br />
        De la: ${escapeHtml(m.fromName ? `${m.fromName} <${m.fromAddr}>` : (m.fromAddr ?? ''))}<br />
        Data: ${escapeHtml(when)}<br />
        Subiect: ${escapeHtml(m.subject)}<br />
        Către: ${escapeHtml(m.toAddrs.map((t) => t.address).join(', '))}
      </p>
      ${body}
    </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clean(list?: string[]): string[] {
  return (list ?? []).map((s) => s.trim()).filter(Boolean);
}
