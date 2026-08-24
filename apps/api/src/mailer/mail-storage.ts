import { createReadStream } from 'node:fs';
import { readFile, stat, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';

import type { StorageService } from '../storage/storage.service';

/**
 * Fișierele de mail (atașamente primite, atașamente în curs de compunere, MIME-ul
 * copiat în `Sent`) trec prin `StorageService`, ca tot restul platformei: se scriu
 * pe disc ȘI în R2, sub prefixul `mail-attach/` din rădăcina uploads.
 *
 * Trăiește în `mailer/` (nu în `modules/mail/`) ca să-l poată folosi și
 * `MailerService`/coada de append, fără să importe `MailModule` — exact ca
 * `mail-append.queue.ts`.
 *
 * Compatibilitate: până acum fișierele stăteau pe un volum separat
 * (`MAIL_ATTACH_DIR`, în prod `/app/mail-attach`), iar `mail_attachments.storagePath`
 * păstrează calea ABSOLUTĂ de acolo. Rândurile vechi trebuie să meargă mai departe,
 * fie că fișierul e încă pe volumul vechi, fie că a fost deja urcat în R2 de
 * `scripts/migrate-mail-attachments-to-r2.mjs`. De asta orice citire trece prin
 * `resolveMailStoragePath` și încearcă, în ordine: volumul vechi → copia locală din
 * uploads → R2.
 */

/** Prefixul din rădăcina uploads (deci și cheia din bucket). */
export const MAIL_ATTACH_PREFIX = 'mail-attach';

/** Directorul vechi, dinainte de R2. Rămâne DOAR pentru citire — nu mai scriem în el. */
export const LEGACY_MAIL_ATTACH_DIR = process.env.MAIL_ATTACH_DIR ?? '/tmp/manelecadou-mail-attach';

/**
 * Rădăcinile vechi acceptate la citire. Pe lângă cea din env punem și valorile
 * standard (prod + default de dev): un rând scris pe alt stack, cu alt
 * `MAIL_ATTACH_DIR`, trebuie să rămână descifrabil.
 */
export const LEGACY_MAIL_ROOTS: string[] = [
  ...new Set(
    [LEGACY_MAIL_ATTACH_DIR, '/app/mail-attach', '/tmp/manelecadou-mail-attach']
      .map((r) => (r ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, ''))
      .filter(Boolean),
  ),
];

export interface ResolvedMailFile {
  /** Cheia relativă la uploads (formatul nou). Null dacă path-ul nu se poate mapa. */
  key: string | null;
  /** Fișierul de pe volumul vechi, dacă valoarea din DB e absolută. Se încearcă primul. */
  legacyAbs: string | null;
}

export interface MailFileStream {
  stream: Readable;
  mime: string;
  contentLength?: number;
  contentRange?: string;
}

/** Cheie sub prefixul de mail: `mail-attach/<parts...>`. */
export function mailKey(...parts: string[]): string {
  const tail = parts
    .map((p) => String(p ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return tail ? `${MAIL_ATTACH_PREFIX}/${tail}` : MAIL_ATTACH_PREFIX;
}

/** Numele pe disc/în bucket: fără separatoare de cale sau surprize de encoding. */
export function safeMailName(name: string): string {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file';
}

function normalizePath(p: string): string {
  return String(p ?? '').replace(/\\/g, '/').trim();
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:\//.test(p);
}

/** Restul căii dacă `p` e sub `root`, altfel null. */
function relativeTo(root: string, p: string): string | null {
  const r = normalizePath(root).replace(/\/+$/, '');
  if (!r) return null;
  return p.startsWith(`${r}/`) ? p.slice(r.length + 1) : null;
}

/**
 * Traduce ce e scris în DB (`mail_attachments.storagePath`, `MailAppendJob.mimePath`)
 * în cheia de storage + eventualul fișier de pe volumul vechi:
 *
 *  - cheie relativă (`mail-attach/...`)            → StorageService, direct
 *  - absolut sub rădăcina uploads (`/app/uploads/…`) → StorageService cu calea relativă
 *  - absolut sub directorul vechi (`/app/mail-attach/…`) → disc întâi, apoi R2 sub `mail-attach/<rest>`
 *  - orice alt absolut                              → doar disc (nu inventăm chei în bucket)
 */
export function resolveMailStoragePath(
  storagePath: string,
  uploadsRoot: string,
  legacyRoots: string[] = LEGACY_MAIL_ROOTS,
): ResolvedMailFile {
  const v = normalizePath(storagePath);
  if (!v) return { key: null, legacyAbs: null };

  if (!isAbsolutePath(v)) {
    // Formatul nou. Tolerăm și un `uploads/...` venit dintr-un URL.
    const rel = v.replace(/^uploads\//, '').replace(/^\/+/, '');
    return { key: rel || null, legacyAbs: null };
  }

  const inUploads = relativeTo(uploadsRoot, v);
  if (inUploads) return { key: inUploads, legacyAbs: v };

  // Path de URL (`/uploads/...`), nu de fișier.
  if (v.startsWith('/uploads/')) return { key: v.slice('/uploads/'.length), legacyAbs: null };

  for (const root of legacyRoots) {
    const rest = relativeTo(root, v);
    if (rest) return { key: mailKey(rest), legacyAbs: v };
  }

  return { key: null, legacyAbs: v };
}

/** `bytes=a-b` → intervalul efectiv, sau null dacă header-ul nu e utilizabil. */
function parseRange(range: string | undefined, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(normalizePath(range ?? ''));
  if (!m || size <= 0) return null;
  const [, rawStart, rawEnd] = m;
  let start: number;
  let end: number;
  if (rawStart === '') {
    const suffix = Number(rawEnd || 0);
    if (!suffix) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}

/** Deschide un fișier local, cu suport de Range. Null dacă nu există. */
async function openLocalFile(
  storage: StorageService,
  abs: string,
  range?: string,
): Promise<MailFileStream | null> {
  let size: number;
  try {
    const st = await stat(abs);
    if (!st.isFile()) return null;
    size = st.size;
  } catch {
    return null;
  }
  const mime = storage.guessMime(abs);
  const r = parseRange(range, size);
  if (!r) return { stream: createReadStream(abs), mime, contentLength: size };
  return {
    stream: createReadStream(abs, { start: r.start, end: r.end }),
    mime,
    contentLength: r.end - r.start + 1,
    contentRange: `bytes ${r.start}-${r.end}/${size}`,
  };
}

/** Candidații de pe disc, în ordinea în care merită încercați. */
function localCandidates(storage: StorageService, resolved: ResolvedMailFile): string[] {
  const out: string[] = [];
  if (resolved.legacyAbs) out.push(resolved.legacyAbs);
  if (resolved.key) {
    const abs = storage.localAbs(resolved.key);
    if (!out.includes(abs)) out.push(abs);
  }
  return out;
}

/**
 * Stream pentru servit prin API (cu Range), indiferent unde a apucat să ajungă
 * fișierul: volumul vechi, uploads local sau R2.
 */
export async function openMailFile(
  storage: StorageService,
  storagePath: string,
  range?: string,
): Promise<MailFileStream | null> {
  const resolved = resolveMailStoragePath(storagePath, storage.localRoot);
  for (const abs of localCandidates(storage, resolved)) {
    const local = await openLocalFile(storage, abs, range);
    if (local) return local;
  }
  // Pe driverul `disk` discul era singura sursă, iar `getObjectStream` ar întoarce
  // un stream peste un fișier inexistent (eroarea vine abia la citire).
  if (!resolved.key || !storage.usesR2) return null;
  return storage.getObjectStream(resolved.key, range);
}

/** Conținutul unui fișier de mail (forward, copie în `Sent`). Aruncă dacă nu există nicăieri. */
export async function readMailFile(storage: StorageService, storagePath: string): Promise<Buffer> {
  const resolved = resolveMailStoragePath(storagePath, storage.localRoot);
  for (const abs of localCandidates(storage, resolved)) {
    try {
      return await readFile(abs);
    } catch {
      /* încercăm următoarea sursă */
    }
  }
  if (resolved.key && storage.usesR2) return storage.readBuffer(resolved.key);
  throw new Error(`fișier de mail inexistent: ${storagePath}`);
}

/** Șterge din toate locurile posibile (volum vechi + uploads local + R2). Nu aruncă. */
export async function deleteMailFile(storage: StorageService, storagePath: string): Promise<void> {
  const resolved = resolveMailStoragePath(storagePath, storage.localRoot);
  if (resolved.legacyAbs) await unlink(resolved.legacyAbs).catch(() => undefined);
  if (resolved.key) await storage.delete(resolved.key).catch(() => undefined);
}

/**
 * Convertește MIME-ul unui atașament într-o variantă sigură.
 * Tipurile periculoase (HTML, SVG, scripturi) devin `application/octet-stream`:
 * browser-ul descarcă binar în loc să randeze. Se aplică ȘI la scriere (ContentType
 * în bucket) — dacă bucket-ul are domeniu public, un atașament HTML nu are voie să
 * fie servit ca pagină.
 */
export function sanitizeMailMime(mime: string): string {
  const m = (mime || '').toLowerCase().trim();
  const dangerous = [
    'text/html',
    'application/xhtml+xml',
    'image/svg+xml',
    'text/xml',
    'application/xml',
    'application/javascript',
    'text/javascript',
    'application/x-javascript',
    'application/x-shockwave-flash',
    'application/x-msdownload',
  ];
  if (dangerous.includes(m)) return 'application/octet-stream';
  if (!m || m === 'application/octet-stream') return 'application/octet-stream';
  if (/^(image|audio|video)\/(?!svg)[a-z0-9.+-]+$/.test(m)) return m;
  if (/^application\/(pdf|zip|x-zip-compressed|json|msword|vnd\.openxmlformats|vnd\.ms-)/.test(m)) return m;
  if (/^text\/(plain|csv)$/.test(m)) return m;
  return 'application/octet-stream';
}
