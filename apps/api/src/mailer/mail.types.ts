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

export abstract class MailProvider {
  abstract readonly name: 'smtp' | 'mailgun' | 'noop';
  abstract send(opts: SendMailOptions): Promise<SendMailResult>;
}
