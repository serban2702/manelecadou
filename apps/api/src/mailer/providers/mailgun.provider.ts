import { Injectable, Logger } from '@nestjs/common';
import { MailProvider, ResolvedMailContext, SendMailOptions, SendMailResult } from '../mail.types';

/**
 * Apelează Mailgun HTTP API direct (fără SDK).
 * Configul vine din `ResolvedMailContext.mailgun` (per-site sau global).
 *
 * Endpoint: https://api[.eu].mailgun.net/v3/{domain}/messages
 */
@Injectable()
export class MailgunMailProvider extends MailProvider {
  readonly name = 'mailgun' as const;
  private readonly logger = new Logger('MailgunMailProvider');

  async send(opts: SendMailOptions, ctx: ResolvedMailContext): Promise<SendMailResult> {
    const mg = ctx.mailgun ?? {};
    const apiKey = mg.apiKey;
    const domain = mg.domain;
    const region = (mg.region || 'us').toLowerCase();

    if (!apiKey || !domain) {
      this.logger.warn(
        `[mailgun dev-log src=${ctx.source}${ctx.siteSlug ? ' site=' + ctx.siteSlug : ''}] to=${opts.to} subject="${opts.subject}" (MAILGUN_API_KEY/DOMAIN lipsă)`,
      );
      return {
        sent: false,
        provider: 'mailgun',
        notes: 'Mailgun not configured — logged to console',
      };
    }

    const baseHost = mg.apiUrl
      ? mg.apiUrl.replace(/\/$/, '')
      : region === 'eu'
        ? 'https://api.eu.mailgun.net'
        : 'https://api.mailgun.net';
    const url = `${baseHost}/v3/${encodeURIComponent(domain)}/messages`;

    const fromAddr = mg.fromEmail || ctx.fromEmail || `no-reply@${domain}`;
    const fromName = ctx.fromName;
    const from =
      opts.from ??
      (fromName ? `"${fromName}" <${fromAddr}>` : fromAddr);

    const form = new URLSearchParams();
    form.append('from', from);
    form.append('to', opts.to);
    if (opts.cc) form.append('cc', opts.cc);
    if (opts.bcc) form.append('bcc', opts.bcc);
    form.append('subject', opts.subject);
    form.append('html', opts.html);
    if (opts.text) form.append('text', opts.text);
    const replyTo = opts.replyTo ?? ctx.replyTo;
    if (replyTo) form.append('h:Reply-To', replyTo);

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
