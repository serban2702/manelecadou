import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { MailAttachmentInput } from '../../mailer/mail.types';
import { StorageService } from '../../storage/storage.service';
import {
  LEGACY_MAIL_ATTACH_DIR,
  mailKey,
  safeMailName,
  sanitizeMailMime,
} from '../../mailer/mail-storage';

/** Prefixul de storage: `mail-attach/staging/<id>/...` (disc + R2). */
const STAGING_PREFIX = 'staging';
/** Directorul vechi, doar pentru fișierele rămase în lucru peste deploy. */
const LEGACY_STAGING_DIR = path.join(LEGACY_MAIL_ATTACH_DIR, 'staging');
/** Numele fișierului cu metadate. Vechiul `.meta.json` e citit în continuare. */
const META_NAME = 'meta.json';
const LEGACY_META_NAME = '.meta.json';

/** Limita per fișier. PowerMail acceptă maximum 25 MB de atașamente per mesaj. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Limita pe tot mailul (suma atașamentelor), din același motiv. */
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Vechimea peste care un fișier neatașat vreunui mail e considerat abandonat. */
const STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StagedAttachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
}

interface StagedMeta {
  filename: string;
  mime: string;
  size: number;
}

/**
 * Ține fișierele atașate în timp ce adminul compune un mail, până la trimitere.
 *
 * Fișierele trec prin `StorageService` (disc + R2), nu prin DB sau memorie: un
 * mail poate avea zeci de MB, iar compunerea poate dura minute. Un `id` opac
 * (uuid) e tot ce circulă prin API. Cu R2 activ, compunerea supraviețuiește și
 * dacă mailul pleacă de pe alt container decât cel care a primit upload-ul.
 */
@Injectable()
export class OutboxAttachmentsService {
  private readonly logger = new Logger('OutboxAttachmentsService');

  constructor(private readonly storage: StorageService) {}

  async save(file: { buffer: Buffer; originalName: string; mime: string }): Promise<StagedAttachment> {
    if (!file.buffer?.length) throw new BadRequestException('Fișier gol');
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException(`Fișierul depășește ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB`);
    }
    const id = randomUUID();
    const meta: StagedMeta = { filename: file.originalName, mime: file.mime, size: file.buffer.length };
    // MIME-ul vine din upload (control admin, dar tot input) — sanitizat înainte de bucket.
    await this.storage.saveBuffer(this.fileKey(id, meta.filename), file.buffer, sanitizeMailMime(file.mime));
    await this.storage.saveBuffer(
      this.metaKey(id),
      Buffer.from(JSON.stringify(meta)),
      'application/json',
    );
    void this.prune();
    return { id, ...meta };
  }

  /** Încarcă atașamentele pregătite, în forma cerută de builder-ul de MIME. */
  async load(ids: string[]): Promise<MailAttachmentInput[]> {
    const out: MailAttachmentInput[] = [];
    let total = 0;
    for (const id of ids) {
      if (!isUuid(id)) throw new BadRequestException('Atașament invalid');
      const staged = await this.read(id);
      if (!staged) throw new BadRequestException('Atașamentul a expirat — încarcă-l din nou');
      total += staged.content.length;
      if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new BadRequestException(
          `Atașamentele depășesc ${Math.round(MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024)}MB în total`,
        );
      }
      out.push({ filename: staged.meta.filename, content: staged.content, contentType: staged.meta.mime });
    }
    return out;
  }

  async discard(ids: string[]): Promise<void> {
    for (const id of ids) {
      if (!isUuid(id)) continue;
      await this.remove(id);
    }
  }

  /** Citește un atașament pregătit: întâi din storage, apoi de pe volumul vechi. */
  private async read(id: string): Promise<{ meta: StagedMeta; content: Buffer } | null> {
    try {
      const meta = JSON.parse((await this.storage.readBuffer(this.metaKey(id))).toString('utf8')) as StagedMeta;
      const content = await this.storage.readBuffer(this.fileKey(id, meta.filename));
      return { meta, content };
    } catch {
      /* poate e un upload început înainte de mutarea pe storage */
    }
    try {
      const dir = path.join(LEGACY_STAGING_DIR, id);
      const meta = JSON.parse(await fs.readFile(path.join(dir, LEGACY_META_NAME), 'utf8')) as StagedMeta;
      const content = await fs.readFile(path.join(dir, safeMailName(meta.filename)));
      return { meta, content };
    } catch {
      return null;
    }
  }

  /** Șterge un atașament pregătit din toate locurile (storage + volum vechi). */
  private async remove(id: string): Promise<void> {
    for (const key of await this.storage.list(mailKey(STAGING_PREFIX, id)).catch(() => [])) {
      await this.storage.delete(key).catch(() => undefined);
    }
    await fs
      .rm(path.join(LEGACY_STAGING_DIR, id), { recursive: true, force: true })
      .catch(() => undefined);
  }

  /**
   * Șterge fișierele rămase de la compuneri abandonate.
   *
   * Vechimea se citește de pe disc (copia locală scrisă de `saveBuffer`), pentru
   * că listarea din bucket nu întoarce data. Pe un container pornit din zero, cu
   * fișierele doar în R2, nu are ce prune-ui — obiectele rămase sunt mici și rare.
   */
  private async prune(): Promise<void> {
    const cutoff = Date.now() - STAGING_MAX_AGE_MS;
    for (const dir of [this.storage.localAbs(mailKey(STAGING_PREFIX)), LEGACY_STAGING_DIR]) {
      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch {
        continue; // directorul nu există (încă)
      }
      for (const name of entries) {
        const st = await fs.stat(path.join(dir, name)).catch(() => null);
        if (!st || st.mtimeMs >= cutoff) continue;
        if (isUuid(name)) {
          await this.remove(name);
        } else {
          await fs.rm(path.join(dir, name), { recursive: true, force: true }).catch(() => undefined);
        }
      }
    }
  }

  private fileKey(id: string, filename: string): string {
    return mailKey(STAGING_PREFIX, id, safeMailName(filename));
  }

  private metaKey(id: string): string {
    return mailKey(STAGING_PREFIX, id, META_NAME);
  }
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
