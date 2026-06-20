import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { htmlToText } from 'html-to-text';
import juice from 'juice';

import { MailService } from './mail.service';
import { ImapService } from './imap.service';
import { MailMessage } from './entities/mail-message.entity';
import { renderBrandedEmail } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';
import { SitesService } from '../sites/sites.service';
import { MailerService } from '../../mailer/mailer.module';

export interface SendReplyInput {
  inReplyToId: string;
  htmlBody: string;
  /** Override pentru recipienți; default = răspunde la `from` + `cc`. */
  to?: string[];
  cc?: string[];
  subject?: string;
  aiGenerated?: boolean;
}

export interface SendComposeInput {
  /** Contul (adresa) din care se trimite — determină branding-ul + identitatea expeditorului. */
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
}

@Injectable()
export class MailSendService {
  private readonly logger = new Logger('MailSendService');

  constructor(
    private readonly mail: MailService,
    private readonly imap: ImapService,
    private readonly sites: SitesService,
    private readonly mailer: MailerService,
  ) {}

  async sendReply(input: SendReplyInput): Promise<MailMessage> {
    const orig = await this.mail.messages.findOne({ where: { id: input.inReplyToId } });
    if (!orig) throw new NotFoundException('Mesaj inexistent');
    const acc = await this.mail.getAccount(orig.accountId);

    const subject = input.subject ?? this.replySubject(orig.subject);
    const to = (input.to && input.to.length ? input.to : [orig.fromAddr ?? '']).filter(Boolean);
    const cc = input.cc && input.cc.length ? input.cc : [];
    if (!to.length) throw new Error('Nu există destinatar pentru răspuns');

    const site = acc.siteId ? await this.sites.findById(acc.siteId) : null;
    const branded = renderBrandedEmail({
      subject,
      bodyHtml: input.htmlBody,
      signatureHtml: acc.signatureHtml ?? null,
      fromName: acc.fromName,
      locale: site?.locale ?? 'ro',
      branding: brandingFromSite(site),
    });
    const inlinedHtml = juice(branded);
    const plain = htmlToText(inlinedHtml, { wordwrap: 100, selectors: [{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } }] });

    const refs = [...new Set([...(orig.references ?? []), orig.messageId].filter(Boolean) as string[])];
    const transport = this.imap.buildSmtpTransport(acc);
    const result = await transport.sendMail({
      from: acc.fromName ? `"${acc.fromName}" <${acc.email}>` : acc.email,
      to,
      cc: cc.length ? cc : undefined,
      subject,
      html: inlinedHtml,
      text: plain,
      inReplyTo: orig.messageId ?? undefined,
      references: refs.length ? refs.join(' ') : undefined,
    });

    const threadId = orig.threadId ?? orig.messageId ?? null;
    const outMessageId = (result.messageId ?? '').replace(/^<|>$/g, '');

    const msg = this.mail.messages.create({
      accountId: acc.id,
      folderId: null,
      uid: null,
      messageId: outMessageId || null,
      inReplyTo: orig.messageId,
      references: refs,
      threadId,
      fromAddr: acc.email,
      fromName: acc.fromName,
      toAddrs: to.map((address) => ({ address })),
      cc: cc.map((address) => ({ address })),
      bcc: [],
      subject,
      snippet: plain.replace(/\s+/g, ' ').trim().slice(0, 280),
      bodyHtml: inlinedHtml,
      bodyText: plain,
      headers: {},
      rawSize: Buffer.byteLength(inlinedHtml, 'utf8'),
      seen: true,
      flagged: false,
      direction: 'out',
      aiGenerated: !!input.aiGenerated,
      attachmentCount: 0,
      sentAt: new Date(),
      receivedAt: new Date(),
    });
    return this.mail.messages.save(msg);
  }

  /**
   * Compune și trimite un email NOU (nu un răspuns) către un destinatar arbitrar.
   * Spre deosebire de `sendReply` (care folosește SMTP-ul contului IMAP), aici
   * trimitem prin `MailerService` — adică prin pipeline-ul de mail al platformei
   * (Mailgun în prod), pentru deliverability mai bună. Corpul e împachetat în
   * același șablon brandat ca restul email-urilor.
   */
  async sendCompose(input: SendComposeInput): Promise<MailMessage> {
    const acc = await this.mail.getAccount(input.accountId);

    const to = (input.to ?? []).map((s) => s.trim()).filter(Boolean);
    const cc = (input.cc ?? []).map((s) => s.trim()).filter(Boolean);
    const bcc = (input.bcc ?? []).map((s) => s.trim()).filter(Boolean);
    const subject = (input.subject ?? '').trim();
    if (!to.length) throw new BadRequestException('Adaugă cel puțin un destinatar');
    if (!subject) throw new BadRequestException('Adaugă un subiect');

    const site = acc.siteId ? await this.sites.findById(acc.siteId) : null;
    const branded = renderBrandedEmail({
      subject,
      bodyHtml: input.htmlBody,
      signatureHtml: acc.signatureHtml ?? null,
      fromName: acc.fromName,
      locale: site?.locale ?? 'ro',
      branding: brandingFromSite(site),
    });
    const inlinedHtml = juice(branded);
    const plain = htmlToText(inlinedHtml, { wordwrap: 100, selectors: [{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } }] });

    const from = acc.fromName ? `"${acc.fromName}" <${acc.email}>` : acc.email;
    const result = await this.mailer.sendDetailed(
      {
        to: to.join(', '),
        cc: cc.length ? cc.join(', ') : undefined,
        bcc: bcc.length ? bcc.join(', ') : undefined,
        subject,
        html: inlinedHtml,
        text: plain,
        from,
        replyTo: acc.email,
      },
      // forceProvider: trimitem mereu prin Mailgun („cu mail, nu prin SMTP"),
      // indiferent de MAIL_PROVIDER global sau de configul site-ului.
      { site, kind: 'inbox_compose', forceProvider: 'mailgun' },
    );
    if (!result.sent) {
      throw new BadRequestException(
        `Email-ul nu a putut fi trimis prin Mailgun: ${result.notes ?? 'provider neconfigurat'}`,
      );
    }

    const outMessageId = (result.messageId ?? '').replace(/^<|>$/g, '');
    const msg = this.mail.messages.create({
      siteId: acc.siteId ?? null,
      accountId: acc.id,
      folderId: null,
      uid: null,
      messageId: outMessageId || null,
      inReplyTo: null,
      references: [],
      // Email nou = thread nou; ancorăm pe propriul Message-ID (sau pe id-ul rândului dacă lipsește).
      threadId: outMessageId || null,
      fromAddr: acc.email,
      fromName: acc.fromName,
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
      aiGenerated: false,
      attachmentCount: 0,
      sentAt: new Date(),
      receivedAt: new Date(),
    });
    const saved = await this.mail.messages.save(msg);
    // Dacă n-avem Message-ID de la provider, folosește id-ul rândului ca thread (consistent cu sendReply).
    if (!saved.threadId) {
      saved.threadId = saved.id;
      await this.mail.messages.save(saved);
    }
    return saved;
  }

  private replySubject(subj: string): string {
    if (!subj) return 'Re:';
    return /^re:/i.test(subj) ? subj : `Re: ${subj}`;
  }
}
