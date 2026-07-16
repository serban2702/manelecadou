import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { BuiltMime, MailProvider, ResolvedMailContext, SendMailOptions, SendMailResult } from '../mail.types';

@Injectable()
export class SmtpMailProvider extends MailProvider {
  readonly name = 'smtp' as const;
  private readonly logger = new Logger('SmtpMailProvider');
  /** Cache de transporters per (host|port|secure|user|passHash). Evităm
   *  re-create la fiecare mail; cheia include configul ca să nu reutilizăm
   *  greșit transportul când se schimbă credențialele unui site. */
  private readonly cache = new Map<string, nodemailer.Transporter>();

  private getCacheKey(s: NonNullable<ResolvedMailContext['smtp']>): string {
    return `${s.host}|${s.port}|${s.secure ? 1 : 0}|${s.user ?? ''}|${(s.pass ?? '').length}`;
  }

  private ensureTransporter(s: ResolvedMailContext['smtp']): nodemailer.Transporter | null {
    if (!s?.host || !s.port) return null;
    const key = this.getCacheKey(s);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure ?? s.port === 465,
      auth: s.user && s.pass ? { user: s.user, pass: s.pass } : undefined,
    });
    this.cache.set(key, transporter);
    this.logger.log(`SMTP transport ready: ${s.host}:${s.port} (secure=${!!s.secure})`);
    return transporter;
  }

  async send(opts: SendMailOptions, ctx: ResolvedMailContext, mime: BuiltMime): Promise<SendMailResult> {
    const transporter = this.ensureTransporter(ctx.smtp);
    if (!transporter) {
      this.logger.warn(
        `[smtp dev-log src=${ctx.source}${ctx.siteSlug ? ' site=' + ctx.siteSlug : ''}] to=${opts.to} subject="${opts.subject}"\n${opts.text ?? opts.html}`,
      );
      return {
        sent: false,
        provider: 'smtp',
        notes: 'SMTP not configured — logged to console',
      };
    }

    // Trimitem MIME-ul deja construit (`raw`), nu câmpuri separate: aceiași octeți
    // ajung la client și în copia din `Sent`. Envelope-ul e explicit pentru că un
    // mesaj raw nu are Bcc în headere.
    const info = await transporter.sendMail({
      envelope: { from: mime.envelopeFrom, to: mime.recipients },
      raw: mime.raw,
    });
    return {
      sent: true,
      provider: 'smtp',
      messageId: (info.messageId ?? mime.messageId).replace(/^<|>$/g, ''),
    };
  }
}
