/** Fișier atașat unui email trimis. Conținutul e ținut în memorie (max 25MB/mail). */
export interface MailAttachmentInput {
  filename: string;
  content: Buffer;
  contentType?: string;
  /** Content-ID pentru imagini inline (`<img src="cid:...">`). */
  cid?: string;
}

export interface SendMailOptions {
  to: string;
  /** Destinatari în copie (comma-separated). Opțional — folosit la compunere din Inbox. */
  cc?: string;
  /** Destinatari în copie ascunsă (comma-separated). Opțional. */
  bcc?: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: MailAttachmentInput[];
  /** Message-ID al mesajului la care răspundem (threading RFC 5322). */
  inReplyTo?: string;
  /** Lanțul de References pentru threading. */
  references?: string[];
}

/**
 * Mesajul serializat în MIME, construit O SINGURĂ DATĂ de `MailerService` și
 * pasat provider-ului. Aceiași octeți pleacă la destinatar și sunt salvați prin
 * IMAP APPEND în folderul `Sent` — copia din webmail e bit-identică cu ce a
 * primit clientul, iar `messageId` e generat de noi (nu de provider), ca să
 * putem corela rândul local cu mesajul adus înapoi de sync.
 */
export interface BuiltMime {
  raw: Buffer;
  /** Message-ID fără parantezele unghiulare. */
  messageId: string;
  /** Adresa de expeditor folosită în envelope (fără display name). */
  envelopeFrom: string;
  /** Toți destinatarii (to + cc + bcc) — envelope recipients. */
  recipients: string[];
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
  abstract send(opts: SendMailOptions, ctx: ResolvedMailContext, mime: BuiltMime): Promise<SendMailResult>;
}
