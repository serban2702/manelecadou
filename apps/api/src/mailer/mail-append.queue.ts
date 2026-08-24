import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { StorageService } from '../storage/storage.service';
import { LEGACY_MAIL_ATTACH_DIR, deleteMailFile, mailKey } from './mail-storage';

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
  /**
   * Cheia de storage a fișierului .eml (MIME-ul brut trimis), relativă la uploads:
   * `mail-attach/outbox/<uuid>.eml`. Joburile puse la coadă înainte de mutarea pe
   * R2 au aici o cale absolută pe volumul vechi — citirea le acceptă pe amândouă.
   */
  mimePath: string;
  messageId: string;
  subject: string;
  to: string;
}

/** Prefixul din storage. Vechiul director rămâne doar pentru joburile în zbor. */
const OUTBOX_PREFIX = 'outbox';
const LEGACY_OUTBOX_DIR = path.join(LEGACY_MAIL_ATTACH_DIR, OUTBOX_PREFIX);

/**
 * Persistă MIME-ul prin `StorageService` (disc + R2) și întoarce cheia. Nu trecem
 * octeții prin Redis: un mail cu atașamente poate avea zeci de MB, iar
 * payload-urile mari degradează întreaga coadă. Cu R2 activ, copia în `Sent`
 * merge și dacă jobul e luat de alt container decât cel care a trimis mailul.
 */
export async function stashMime(storage: StorageService, raw: Buffer): Promise<string> {
  const key = mailKey(OUTBOX_PREFIX, `${randomUUID()}.eml`);
  await storage.saveBuffer(key, raw, 'message/rfc822');
  return key;
}

/** Șterge un MIME din outbox. Best-effort — un fișier rămas nu strică nimic. */
export async function discardMime(storage: StorageService, mimePath: string): Promise<void> {
  await deleteMailFile(storage, mimePath);
}

/**
 * Curăță fișierele .eml mai vechi decât `maxAgeMs` — plasă pentru joburile care
 * au eșuat definitiv și nu și-au mai șters fișierul. Vechimea se citește de pe
 * disc (copia locală scrisă de `saveBuffer`); ștergerea merge și în bucket.
 */
export async function pruneOutbox(storage: StorageService, maxAgeMs: number): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  const dirs: Array<{ abs: string; key: ((name: string) => string) | null }> = [
    { abs: storage.localAbs(mailKey(OUTBOX_PREFIX)), key: (n) => mailKey(OUTBOX_PREFIX, n) },
    { abs: LEGACY_OUTBOX_DIR, key: null },
  ];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir.abs);
    } catch {
      continue; // directorul nu există (încă)
    }
    for (const name of entries) {
      const fp = path.join(dir.abs, name);
      try {
        const st = await fs.stat(fp);
        if (st.mtimeMs >= cutoff) continue;
        if (dir.key) await storage.delete(dir.key(name));
        else await fs.unlink(fp);
        removed++;
      } catch {
        /* ignore */
      }
    }
  }
  return removed;
}
