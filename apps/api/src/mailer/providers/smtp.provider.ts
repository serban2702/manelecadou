import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MailProvider, SendMailOptions, SendMailResult } from '../mail.types';
import { SettingsService } from '../../modules/settings/settings.service';

@Injectable()
export class SmtpMailProvider extends MailProvider {
  readonly name = 'smtp' as const;
  private readonly logger = new Logger('SmtpMailProvider');
  private transporter: nodemailer.Transporter | null = null;
  private cacheKey = '';

  constructor(private readonly settings: SettingsService) {
    super();
  }

  private async ensureTransporter(): Promise<nodemailer.Transporter | null> {
    const host = await this.settings.get('SMTP_HOST');
    const portStr = await this.settings.get('SMTP_PORT');
    const port = Number(portStr) || 0;
    const user = await this.settings.get('SMTP_USER');
    const pass = await this.settings.get('SMTP_PASS');
    const secureRaw = await this.settings.get('SMTP_SECURE');

    if (!host || !port) {
      this.transporter = null;
      this.cacheKey = '';
      return null;
    }
    const secure = secureRaw === 'true' || port === 465;
    const key = `${host}|${port}|${secure}|${user}|${pass.length}`;
    if (this.transporter && key === this.cacheKey) return this.transporter;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
    this.cacheKey = key;
    this.logger.log(`SMTP transport ready: ${host}:${port} (secure=${secure})`);
    return this.transporter;
  }

  async send(opts: SendMailOptions): Promise<SendMailResult> {
    const fromAddr = (await this.settings.get('MAIL_FROM')) || 'no-reply@manelecadou.ro';
    const fromName = await this.settings.get('MAIL_FROM_NAME');
    const from = opts.from ?? (fromName ? `${fromName} <${fromAddr}>` : fromAddr);

    const transporter = await this.ensureTransporter();
    if (!transporter) {
      this.logger.warn(
        `[smtp dev-log] to=${opts.to} subject="${opts.subject}"\n${opts.text ?? opts.html}`,
      );
      return {
        sent: false,
        provider: 'smtp',
        notes: 'SMTP not configured — logged to console',
      };
    }

    const info = await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: opts.replyTo,
    });
    return {
      sent: true,
      provider: 'smtp',
      messageId: info.messageId,
    };
  }
}
