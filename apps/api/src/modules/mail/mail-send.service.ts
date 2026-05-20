import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { htmlToText } from 'html-to-text';
import juice from 'juice';

import { MailService } from './mail.service';
import { ImapService } from './imap.service';
import { MailMessage } from './entities/mail-message.entity';
import { renderBrandedEmail } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';
import { SitesService } from '../sites/sites.service';

export interface SendReplyInput {
  inReplyToId: string;
  htmlBody: string;
  /** Override pentru recipienți; default = răspunde la `from` + `cc`. */
  to?: string[];
  cc?: string[];
  subject?: string;
  aiGenerated?: boolean;
}

@Injectable()
export class MailSendService {
  private readonly logger = new Logger('MailSendService');

  constructor(
    private readonly mail: MailService,
    private readonly imap: ImapService,
    private readonly sites: SitesService,
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

  private replySubject(subj: string): string {
    if (!subj) return 'Re:';
    return /^re:/i.test(subj) ? subj : `Re: ${subj}`;
  }
}
