import { Injectable, Logger } from '@nestjs/common';
import { BuiltMime, MailProvider, ResolvedMailContext, SendMailOptions, SendMailResult } from '../mail.types';

/**
 * Apelează Mailgun HTTP API direct (fără SDK).
 * Configul vine din `ResolvedMailContext.mailgun` (per-site sau global).
 *
 * Endpoint: https://api[.eu].mailgun.net/v3/{domain}/messages.mime
 *
 * Folosim `messages.mime` (nu `messages`) ca să trimitem exact MIME-ul construit
 * de `buildMime`: același conținut ajunge la client și în copia din `Sent`, iar
 * atașamentele și `Message-ID`-ul nostru trec neatinse. Varianta veche
 * (`/messages` cu form urlencoded) nu putea purta atașamente.
 */
@Injectable()
export class MailgunMailProvider extends MailProvider {
  readonly name = 'mailgun' as const;
  private readonly logger = new Logger('MailgunMailProvider');

  async send(opts: SendMailOptions, ctx: ResolvedMailContext, mime: BuiltMime): Promise<SendMailResult> {
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
    const url = `${baseHost}/v3/${encodeURIComponent(domain)}/messages.mime`;

    // La `messages.mime`, câmpurile `to` din form determină envelope-ul (cui
    // livrează efectiv Mailgun) — headerele din MIME sunt doar afișare. Trimitem
    // toți destinatarii, inclusiv Bcc, care rămân ascunși pentru că MIME-ul
    // construit de nodemailer nu conține header Bcc.
    const form = new FormData();
    for (const r of mime.recipients) form.append('to', r);
    form.append('message', new Blob([new Uint8Array(mime.raw)], { type: 'message/rfc822' }), 'message.mime');

    const auth = Buffer.from(`api:${apiKey}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Mailgun ${res.status}: ${body}`);
    }
    const json = (await res.json()) as { id?: string; message?: string };
    return {
      sent: true,
      provider: 'mailgun',
      // Mailgun păstrează Message-ID-ul nostru din MIME; `json.id` îl repetă.
      messageId: (json.id ?? mime.messageId).replace(/^<|>$/g, ''),
      notes: json.message,
    };
  }
}
