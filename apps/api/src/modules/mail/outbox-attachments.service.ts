import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { MailAttachmentInput } from '../../mailer/mail.types';

const STAGING_DIR = path.join(process.env.MAIL_ATTACH_DIR ?? '/tmp/manelecadou-mail-attach', 'staging');

/** Limita per fișier. Mailgun refuză mailurile peste ~25MB, deci n-are rost mai mult. */
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

/**
 * Ține fișierele atașate în timp ce adminul compune un mail, până la trimitere.
 *
 * Fișierele stau pe disc (volumul `api_mail_attach`), nu în DB sau memorie: un
 * mail poate avea zeci de MB, iar compunerea poate dura minute. Un `id` opac
 * (uuid) e tot ce circulă prin API.
 */
@Injectable()
export class OutboxAttachmentsService {
  private readonly logger = new Logger('OutboxAttachmentsService');

  async save(file: { buffer: Buffer; originalName: string; mime: string }): Promise<StagedAttachment> {
    if (!file.buffer?.length) throw new BadRequestException('Fișier gol');
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException(`Fișierul depășește ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB`);
    }
    const id = randomUUID();
    const dir = path.join(STAGING_DIR, id);
    await fs.mkdir(dir, { recursive: true });
    const filename = safeName(file.originalName);
    await fs.writeFile(path.join(dir, filename), file.buffer);
    await fs.writeFile(
      path.join(dir, '.meta.json'),
      JSON.stringify({ filename: file.originalName, mime: file.mime, size: file.buffer.length }),
    );
    void this.prune();
    return { id, filename: file.originalName, mime: file.mime, size: file.buffer.length };
  }

  /** Încarcă atașamentele pregătite, în forma cerută de builder-ul de MIME. */
  async load(ids: string[]): Promise<MailAttachmentInput[]> {
    const out: MailAttachmentInput[] = [];
    let total = 0;
    for (const id of ids) {
      if (!isUuid(id)) throw new BadRequestException('Atașament invalid');
      const dir = path.join(STAGING_DIR, id);
      let meta: { filename: string; mime: string; size: number };
      try {
        meta = JSON.parse(await fs.readFile(path.join(dir, '.meta.json'), 'utf8'));
      } catch {
        throw new BadRequestException('Atașamentul a expirat — încarcă-l din nou');
      }
      const content = await fs.readFile(path.join(dir, safeName(meta.filename)));
      total += content.length;
      if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new BadRequestException(
          `Atașamentele depășesc ${Math.round(MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024)}MB în total`,
        );
      }
      out.push({ filename: meta.filename, content, contentType: meta.mime });
    }
    return out;
  }

  async discard(ids: string[]): Promise<void> {
    for (const id of ids) {
      if (!isUuid(id)) continue;
      await fs.rm(path.join(STAGING_DIR, id), { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Șterge fișierele rămase de la compuneri abandonate. */
  private async prune(): Promise<void> {
    try {
      const entries = await fs.readdir(STAGING_DIR);
      const cutoff = Date.now() - STAGING_MAX_AGE_MS;
      for (const name of entries) {
        const fp = path.join(STAGING_DIR, name);
        const st = await fs.stat(fp).catch(() => null);
        if (st && st.mtimeMs < cutoff) {
          await fs.rm(fp, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    } catch {
      /* directorul nu există încă */
    }
  }
}

/** Numele pe disc: fără separatoare de cale sau surprize de encoding. */
function safeName(name: string): string {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file';
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
