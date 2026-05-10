import { Injectable, Logger } from '@nestjs/common';
import { MailProvider, SendMailOptions, SendMailResult } from '../mail.types';
import { SettingsService } from '../../modules/settings/settings.service';

/**
 * Apelează Mailgun HTTP API direct (fără SDK).
 * Necesită:
 *   MAILGUN_API_KEY      — cheia privată
 *   MAILGUN_DOMAIN       — ex. mg.manelecadou.ro
 *   MAILGUN_REGION=eu|us — opțional (default us)
 *
 * Endpoint: https://api[.eu].mailgun.net/v3/{domain}/messages
 */
@Injectable()
export class MailgunMailProvider extends MailProvider {
  readonly name = 'mailgun' as const;
  private readonly logger = new Logger('MailgunMailProvider');

  constructor(private readonly settings: SettingsService) {
    super();
  }

  async send(opts: SendMailOptions): Promise<SendMailResult> {
    const apiKey = await this.settings.get('MAILGUN_API_KEY');
    const domain = await this.settings.get('MAILGUN_DOMAIN');
    const region = ((await this.settings.get('MAILGUN_REGION')) || 'us').toLowerCase();

    if (!apiKey || !domain) {
      this.logger.warn(
        `[mailgun dev-log] to=${opts.to} subject="${opts.subject}" (MAILGUN_API_KEY/DOMAIN lipsă)`,
      );
      return {
        sent: false,
        provider: 'mailgun',
        notes: 'Mailgun not configured — logged to console',
      };
    }

    const apiUrl = await this.settings.get('MAILGUN_API_URL');
    const baseHost = apiUrl
      ? apiUrl.replace(/\/$/, '')
      : region === 'eu'
        ? 'https://api.eu.mailgun.net'
        : 'https://api.mailgun.net';
    const url = `${baseHost}/v3/${encodeURIComponent(domain)}/messages`;

    const mailgunFrom = await this.settings.get('MAILGUN_FROM_EMAIL');
    const fromAddr = (await this.settings.get('MAIL_FROM')) || `no-reply@${domain}`;
    const fromName = await this.settings.get('MAIL_FROM_NAME');
    const from =
      opts.from ??
      mailgunFrom ??
      (fromName ? `${fromName} <${fromAddr}>` : fromAddr);

    const form = new URLSearchParams();
    form.append('from', from);
    form.append('to', opts.to);
    form.append('subject', opts.subject);
    form.append('html', opts.html);
    if (opts.text) form.append('text', opts.text);
    if (opts.replyTo) form.append('h:Reply-To', opts.replyTo);

    const auth = Buffer.from(`api:${apiKey}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Mailgun ${res.status}: ${body}`);
    }
    const json = (await res.json()) as { id?: string; message?: string };
    return {
      sent: true,
      provider: 'mailgun',
      messageId: json.id,
      notes: json.message,
    };
  }
}
