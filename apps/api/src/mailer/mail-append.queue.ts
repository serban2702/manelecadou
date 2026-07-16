import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Coadă pentru copierea în `Sent` (IMAP APPEND) a fiecărui mail trimis.
 *
 * Trăiește în `mailer/` (nu în `modules/mail/`) ca să poată fi folosită de
 * `MailerService` fără să importe `MailModule` — care la rândul lui importă
 * `MailerModule`. Comunicarea se face doar prin Redis: producătorul e
 * `MailerService`, consumatorul e `MailAppendProcessor` din `MailModule`.
 */
export const MAIL_APPEND_QUEUE = 'mail-append';

export interface MailAppendJob {
  /** Site-ul din contextul trimiterii (poate lipsi pentru mailuri fără tenant). */
  siteId: string | null;
  /** Adresa reală de expeditor — cheia principală după care găsim căsuța. */
  fromAddr: string;
  /** Calea fișierului .eml de pe disc (MIME-ul brut trimis). */
  mimePath: string;
  messageId: string;
  subject: string;
  to: string;
}

const OUTBOX_DIR = path.join(process.env.MAIL_ATTACH_DIR ?? '/tmp/manelecadou-mail-attach', 'outbox');

/**
 * Persistă MIME-ul pe disc și întoarce calea. Nu trecem octeții prin Redis:
 * un mail cu atașamente poate avea zeci de MB, iar payload-urile mari degradează
 * întreaga coadă. Volumul e deja montat persistent în prod (`api_mail_attach`).
 */
export async function stashMime(raw: Buffer): Promise<string> {
  await fs.mkdir(OUTBOX_DIR, { recursive: true });
  const fp = path.join(OUTBOX_DIR, `${randomUUID()}.eml`);
  await fs.writeFile(fp, raw);
  return fp;
}

/** Șterge un MIME din outbox. Best-effort — un fișier rămas nu strică nimic. */
export async function discardMime(mimePath: string): Promise<void> {
  try {
    await fs.unlink(mimePath);
  } catch {
    /* deja șters sau inexistent */
  }
}

/**
 * Curăță fișierele .eml mai vechi decât `maxAgeMs` — plasă pentru joburile care
 * au eșuat definitiv și nu și-au mai șters fișierul.
 */
export async function pruneOutbox(maxAgeMs: number): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await fs.readdir(OUTBOX_DIR);
  } catch {
    return 0;
  }
  const cutoff = Date.now() - maxAgeMs;
  for (const name of entries) {
    const fp = path.join(OUTBOX_DIR, name);
    try {
      const st = await fs.stat(fp);
      if (st.mtimeMs < cutoff) {
        await fs.unlink(fp);
        removed++;
      }
    } catch {
      /* ignore */
    }
  }
  return removed;
}
