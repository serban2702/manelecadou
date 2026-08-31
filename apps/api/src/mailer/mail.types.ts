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

/** Un destinatar eliminat de PowerMail înainte de trimitere (listă neagră, dezabonare, validare). */
export interface BlockedRecipient {
  email: string;
  reason: string;
  scope?: string;
  detail?: string;
  suggestion?: string;
}

export interface SendMailResult {
  /** True dacă a fost trimis (sau acceptat de provider). */
  sent: boolean;
  /** Message-ID RFC 5322 al mesajului (cel din MIME-ul nostru). */
  messageId?: string;
  /**
   * Referința internă a provider-ului (ex. UUID-ul PowerMail), cu care mesajul
   * poate fi căutat în panoul lui. Se salvează în `outbound_emails.providerMessageId`;
   * `messageId` rămâne cel RFC, folosit la corelarea cu copia din `Sent`.
   */
  providerRef?: string;
  /** Numele provider-ului care a procesat mesajul. */
  provider: 'smtp' | 'powermail' | 'noop';
  /** Note tehnice (ex: "logged in console" în dev). */
  notes?: string;
  /**
   * Destinatari eliminați de provider (listă neagră / dezabonare / adresă invalidă).
   * NU e o eroare: restul mesajului a plecat normal. Se loghează ca avertisment.
   */
  blocked?: BlockedRecipient[];
  /**
   * True când TOȚI destinatarii au fost eliminați, deci mesajul n-a plecat nicăieri.
   * Fluxurile automate doar loghează; cele pornite de un om (compose din Inbox)
   * trebuie să-i spună operatorului, altfel crede că a trimis.
   */
  suppressed?: boolean;
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
  /**
   * Categoria funcțională a mesajului (`magic_link`, `recovery`, …), propagată
   * din `SendMailExtra.kind`. Provider-ele o folosesc pentru etichete și pentru
   * a decide dacă mesajul e de marketing (categorie de dezabonare) sau nu.
   */
  kind?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  powermail?: {
    /** Cheia de proiect (`pm_live_…`). Una singură pentru toate site-urile. */
    apiKey?: string;
    /** Baza API-ului. Gol = `https://api.powermail.wingo.ro`. */
    apiUrl?: string;
    /**
     * Categoria de dezabonare pentru mailurile bulk (marketing, recovery).
     * Gol = nu se trimite deloc (vezi comentariul din `powermail.provider.ts`).
     */
    unsubscribeGroup?: string;
    /**
     * Categoria pentru restul mailurilor — cele de sistem. Trebuie să fie una
     * marcată „tranzacțională" în panou, adică din care destinatarul NU se poate
     * dezabona: nimeni nu trebuie să piardă magic link-ul sau melodia plătită
     * apăsând „Unsubscribe" în Gmail.
     */
    transactionalGroup?: string;
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
  abstract readonly name: 'smtp' | 'powermail' | 'noop';
  abstract send(opts: SendMailOptions, ctx: ResolvedMailContext, mime: BuiltMime): Promise<SendMailResult>;
}
