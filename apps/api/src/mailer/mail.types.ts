export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SendMailResult {
  /** True dacă a fost trimis (sau acceptat de provider). */
  sent: boolean;
  /** ID-ul mesajului întors de provider (când e disponibil). */
  messageId?: string;
  /** Numele provider-ului care a procesat mesajul. */
  provider: 'smtp' | 'mailgun' | 'noop';
  /** Note tehnice (ex: "logged in console" în dev). */
  notes?: string;
}

/**
 * Config rezolvat (decriptat) pe care MailerService îl pasează provider-elor.
 * Sursa poate fi: site.mailConfig (per-tenant) sau SettingsService (global).
 */
export interface ResolvedMailContext {
  /** Sursa configului — pentru logging. */
  source: 'site' | 'global';
  /** Slug-ul site-ului, dacă există. */
  siteSlug?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  mailgun?: {
    apiKey?: string;
    domain?: string;
    region?: 'eu' | 'us';
    apiUrl?: string;
    /** From-email specific Mailgun (override) — folosit dacă e setat. */
    fromEmail?: string;
  };
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
  };
}

export abstract class MailProvider {
  abstract readonly name: 'smtp' | 'mailgun' | 'noop';
  abstract send(opts: SendMailOptions, ctx: ResolvedMailContext): Promise<SendMailResult>;
}
