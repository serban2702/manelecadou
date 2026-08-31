import { Injectable, Logger } from '@nestjs/common';
import {
  BlockedRecipient,
  BuiltMime,
  MailProvider,
  ResolvedMailContext,
  SendMailOptions,
  SendMailResult,
} from '../mail.types';
import { resolveFromHeader, splitAddresses } from '../mime.builder';

/** Instanța implicită. Overridable din `POWERMAIL_API_URL` dacă se mută vreodată. */
const DEFAULT_BASE_URL = 'https://api.powermail.wingo.ro';

/** Timeout per încercare, conform recomandării din documentația PowerMail. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Reîncercări doar pe 429 și 5xx, cu backoff 1s, 2s, 4s, 8s (4 pauze = 5 încercări). */
const MAX_ATTEMPTS = 5;

/**
 * Mailurile care sunt „bulk" în sensul RFC 8058: destinatarul are dreptul să le
 * oprească fără să piardă și confirmările de comandă.
 *
 * Împărțirea contează mai mult decât pare. PowerMail pune `List-Unsubscribe` pe
 * TOATE mesajele, iar unul trimis fără categorie cade în categoria implicită a
 * proiectului. Dacă aceea e dezabonabilă, un click pe „Unsubscribe" în Gmail —
 * dat pe un mail de recuperare — taie și magic link-ul, și mailul cu melodia
 * plătită. De aceea fiecare mesaj pleacă cu o categorie explicită: cele bulk cu
 * `POWERMAIL_UNSUBSCRIBE_GROUP`, restul cu `POWERMAIL_TRANSACTIONAL_GROUP`,
 * care în panou trebuie bifată „tranzacțională" (nu se poate dezabona nimeni de
 * la ea).
 */
const BULK_KINDS = new Set(['marketing_campaign', 'marketing_rule', 'recovery']);

interface PowerMailAttachment {
  filename: string;
  content: string;
  contentType?: string;
  cid?: string;
}

interface PowerMailRequest {
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: PowerMailAttachment[];
  tags?: Record<string, string>;
  idempotencyKey?: string;
  unsubscribeGroup?: string;
}

interface PowerMailResponse {
  id?: string;
  status?: string;
  to?: string[];
  blocked?: BlockedRecipient[];
  message?: string;
}

interface PowerMailError {
  statusCode?: number;
  error?: string;
  message?: string;
  requestId?: string;
}

/**
 * Trimite prin PowerMail (https://api.powermail.wingo.ro), platforma proprie
 * peste Amazon SES. A înlocuit Mailgun în 31 august 2026.
 *
 * O singură cheie de proiect acoperă toate site-urile; identitatea (de pe ce
 * adresă pleacă mailul) se alege prin câmpul `from`, care vine din
 * `site.mailConfig.fromEmail` → `site.fromEmail` → `MAIL_FROM`. Adresa trebuie
 * să existe ca identitate verificată în proiectul PowerMail, altfel API-ul
 * răspunde 403 „expeditor neautorizat".
 *
 * ⚠️ Spre deosebire de SMTP, PowerMail primește câmpuri structurate (JSON), nu
 * MIME brut — nu are endpoint de raw MIME. MIME-ul construit de `buildMime`
 * rămâne folosit pentru copia din `Sent` (IMAP APPEND), deci acolo apare
 * varianta noastră, nu octeții exacți pe care i-a compus SES. Diferența e
 * vizibilă într-un singur loc: `Message-ID`-ul mesajului livrat e al lui SES,
 * deci un răspuns al clientului nu se lipește automat de firul din Inbox Hub.
 */
@Injectable()
export class PowerMailProvider extends MailProvider {
  readonly name = 'powermail' as const;
  private readonly logger = new Logger('PowerMailProvider');

  async send(opts: SendMailOptions, ctx: ResolvedMailContext, mime: BuiltMime): Promise<SendMailResult> {
    const pm = ctx.powermail ?? {};
    const apiKey = pm.apiKey?.trim();

    if (!apiKey) {
      this.logger.warn(
        `[powermail dev-log src=${ctx.source}${ctx.siteSlug ? ' site=' + ctx.siteSlug : ''}] to=${opts.to} subject="${opts.subject}" (POWERMAIL_API_KEY lipsă)`,
      );
      return {
        sent: false,
        provider: 'powermail',
        notes: 'PowerMail not configured — logged to console',
      };
    }

    const base = (pm.apiUrl?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
    const body = this.buildRequest(opts, ctx, mime);
    const json = await this.post(`${base}/v1/emails`, apiKey, body);

    const blocked = json.blocked ?? [];
    if (blocked.length) {
      // Destinatar eliminat NU e eroare — sistemul tocmai a oprit un bounce.
      for (const b of blocked) {
        this.logger.warn(
          `powermail blocked ${b.email}: ${b.reason}${b.detail ? ` — ${b.detail}` : ''}${b.suggestion ? ` (sugestie: ${b.suggestion})` : ''}`,
        );
      }
    }

    const suppressed = json.status === 'suppressed';
    const notes = [
      json.status && json.status !== 'queued' ? `status=${json.status}` : null,
      json.message,
      blocked.length ? `blocked: ${blocked.map((b) => `${b.email} (${b.reason})`).join(', ')}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      // 202 = acceptat. Chiar și `suppressed` e un răspuns valid al API-ului, nu
      // un eșec de integrare; cine are nevoie de distincție citește `suppressed`.
      sent: true,
      provider: 'powermail',
      messageId: mime.messageId,
      providerRef: json.id,
      notes: notes || undefined,
      blocked: blocked.length ? blocked : undefined,
      suppressed: suppressed || undefined,
    };
  }

  private buildRequest(opts: SendMailOptions, ctx: ResolvedMailContext, mime: BuiltMime): PowerMailRequest {
    const cc = splitAddresses(opts.cc);
    const bcc = splitAddresses(opts.bcc);
    const replyTo = opts.replyTo ?? ctx.replyTo;

    // Threading pentru răspunsurile din Inbox Hub. `Message-ID` NU se trimite:
    // SES îl generează pe al lui, iar un antet duplicat e mai rău decât unul
    // divergent.
    const headers: Record<string, string> = {};
    if (opts.inReplyTo) headers['In-Reply-To'] = wrapId(opts.inReplyTo);
    if (opts.references?.length) headers['References'] = opts.references.map(wrapId).join(' ');

    const kind = ctx.kind;
    const tags: Record<string, string> = {};
    if (kind) tags.kind = kind;
    if (ctx.siteSlug) tags.site = ctx.siteSlug;

    return {
      from: resolveFromHeader(opts, ctx),
      to: splitAddresses(opts.to),
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      replyTo: replyTo ? [replyTo] : undefined,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      headers: Object.keys(headers).length ? headers : undefined,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
        contentType: a.contentType,
        cid: a.cid,
      })),
      tags: Object.keys(tags).length ? tags : undefined,
      // Message-ID-ul nostru e unic per apel `send()` și stabil pe durata
      // reîncercărilor de mai jos — exact ce trebuie ca un retry pe 5xx să nu
      // producă un al doilea mail, dar o retrimitere voită (butonul „Retrimite
      // mailul") să producă unul nou.
      idempotencyKey: mime.messageId,
      unsubscribeGroup: groupFor(ctx, kind),
    };
  }

  /**
   * POST cu timeout și reîncercări. Conform documentației PowerMail: retry doar
   * pe 429 și 5xx, backoff exponențial, maximum 5 încercări. Restul erorilor
   * (400 validare, 401 cheie, 403 expeditor neautorizat) sunt permanente — o
   * reîncercare doar ar întârzia eroarea.
   */
  private async post(url: string, apiKey: string, body: PowerMailRequest): Promise<PowerMailResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (e) {
        // Rețea căzută sau timeout — tranzitoriu, deci reîncercabil.
        lastError = new Error(`PowerMail request failed: ${(e as Error).message}`);
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(backoffMs(attempt));
        continue;
      }

      if (res.ok) return (await res.json().catch(() => ({}))) as PowerMailResponse;

      const raw = await res.text();
      const parsed = safeJson<PowerMailError>(raw);
      const detail = [parsed?.message ?? raw.slice(0, 300), parsed?.requestId ? `requestId=${parsed.requestId}` : null]
        .filter(Boolean)
        .join(' · ');
      lastError = new Error(`PowerMail ${res.status} ${parsed?.error ?? ''}: ${detail}`.replace(/\s+/g, ' ').trim());

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) break;

      const wait = retryAfterMs(res) ?? backoffMs(attempt);
      this.logger.warn(`PowerMail ${res.status} — reîncerc în ${Math.round(wait / 1000)}s (${attempt}/${MAX_ATTEMPTS})`);
      await sleep(wait);
    }

    throw lastError ?? new Error('PowerMail: eroare necunoscută');
  }
}

/**
 * Categoria potrivită pentru mesaj. Un `kind` necunoscut (sau lipsă) e tratat ca
 * tranzacțional — asta acoperă testul din admin și orice trimitere nouă care ar
 * uita să-și declare categoria: mai bine nedezabonabil din greșeală decât
 * dezabonabil din greșeală.
 */
function groupFor(ctx: ResolvedMailContext, kind?: string): string | undefined {
  const pm = ctx.powermail;
  const g = kind && BULK_KINDS.has(kind) ? pm?.unsubscribeGroup : pm?.transactionalGroup;
  return g?.trim() || undefined;
}

function backoffMs(attempt: number): number {
  return 1000 * 2 ** (attempt - 1);
}

/** `Retry-After` în secunde, dacă serverul îl trimite (plafonat la 60s). */
function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds, 60) * 1000;
}

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function wrapId(id: string): string {
  const bare = id.replace(/^<|>$/g, '');
  return `<${bare}>`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
