import { randomUUID } from 'node:crypto';
import MailComposer from 'nodemailer/lib/mail-composer';
import addressparser from 'nodemailer/lib/addressparser';

import type { BuiltMime, ResolvedMailContext, SendMailOptions } from './mail.types';

/**
 * Construiește mesajul MIME o singură dată, central. Rezultatul e folosit
 * pentru trimiterea prin SMTP (raw) și pentru copia salvată prin IMAP APPEND în
 * `Sent`.
 *
 * ⚠️ PowerMail primește câmpuri structurate, nu MIME brut (n-are endpoint de
 * raw). Pe traseul ăla, MIME-ul de aici rămâne doar copia din `Sent`: aceleași
 * conținut, expeditor și destinatari, dar nu octeții exacți compuși de SES.
 * `resolveFromHeader` e exportat tocmai ca `From`-ul să fie identic pe ambele
 * trasee.
 *
 * `Message-ID` e generat aici, nu de provider, ca să putem lega rândul din
 * `mail_messages` de mesajul pe care sync-ul îl aduce înapoi din folderul Sent
 * (dedupe pe `messageId`).
 */
export async function buildMime(opts: SendMailOptions, ctx: ResolvedMailContext): Promise<BuiltMime> {
  const fromHeader = resolveFromHeader(opts, ctx);
  const envelopeFrom = extractAddress(fromHeader);
  const messageId = `${randomUUID()}@${domainOf(envelopeFrom)}`;

  const recipients = [
    ...splitAddresses(opts.to),
    ...splitAddresses(opts.cc),
    ...splitAddresses(opts.bcc),
  ];

  const composer = new MailComposer({
    from: fromHeader,
    to: opts.to,
    cc: opts.cc || undefined,
    bcc: opts.bcc || undefined,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo ?? ctx.replyTo,
    inReplyTo: opts.inReplyTo ? wrap(opts.inReplyTo) : undefined,
    references: opts.references?.length ? opts.references.map(wrap).join(' ') : undefined,
    messageId: wrap(messageId),
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      cid: a.cid,
      contentDisposition: a.cid ? ('inline' as const) : ('attachment' as const),
    })),
  });

  const raw = await new Promise<Buffer>((resolve, reject) => {
    composer.compile().build((err, message) => {
      if (err) reject(err);
      else resolve(message);
    });
  });

  return { raw, messageId, envelopeFrom, recipients };
}

/**
 * Header-ul From complet (cu display name), în ordinea de precedență a
 * MailerService. Exportat pentru că PowerMail primește `from` ca String separat,
 * nu în MIME — și cele două trebuie să dea aceeași adresă, altfel identitatea
 * declarată la trimitere n-ar fi cea din copia salvată în `Sent`.
 */
export function resolveFromHeader(opts: SendMailOptions, ctx: ResolvedMailContext): string {
  if (opts.from) return opts.from;
  const addr = ctx.fromEmail || 'no-reply@manelecadou.ro';
  // Valoarea poate fi deja de forma `Nume <a@b.ro>` — nu o mai împacheta.
  if (/</.test(addr)) return addr;
  return ctx.fromName ? `"${ctx.fromName}" <${addr}>` : addr;
}

function wrap(id: string): string {
  const bare = id.replace(/^<|>$/g, '');
  return `<${bare}>`;
}

/** `Nume <a@b.ro>` → `a@b.ro`; `a@b.ro` → `a@b.ro`. */
function extractAddress(v: string): string {
  const m = v.match(/<([^>]+)>/);
  return (m ? m[1] : v).trim();
}

function domainOf(addr: string): string {
  const at = addr.lastIndexOf('@');
  return at > -1 ? addr.slice(at + 1) : 'manelecadou.ro';
}

/**
 * Extrage adresele dintr-o listă comma-separated, folosind parserul RFC al
 * nodemailer. Un split pe virgulă ar rupe `"Popescu, Ion" <ion@ex.ro>` în două,
 * iar jumătatea invalidă ar ajunge destinatar în envelope.
 */
export function splitAddresses(v?: string): string[] {
  if (!v) return [];
  // Parserul poate întoarce și grupuri („echipa: a@x.ro, b@x.ro;") — le aplatizăm.
  const flatten = (entries: ReturnType<typeof addressparser>): string[] =>
    entries.flatMap((e) =>
      'address' in e && e.address
        ? [e.address.trim()]
        : 'group' in e && Array.isArray(e.group)
          ? flatten(e.group as ReturnType<typeof addressparser>)
          : [],
    );
  return flatten(addressparser(v)).filter(Boolean);
}
