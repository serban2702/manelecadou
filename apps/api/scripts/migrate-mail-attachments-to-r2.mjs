#!/usr/bin/env node
/**
 * Mută fișierele de mail de pe volumul vechi (`api_mail_attach`, montat la
 * `/app/mail-attach`) în Cloudflare R2, sub prefixul `mail-attach/...`, și rescrie
 * `mail_attachments.storagePath` la cheia RELATIVĂ nouă.
 *
 * De ce separat de `sync-uploads-to-r2.mjs`: acela urcă `UPLOADS_DIR` cu cheile
 * identice și e deja testat pe producție. Mailul e alt volum, cu altă mapare de
 * chei, și în plus cere scrieri în DB — n-are ce căuta în el.
 *
 *   MAIL_ATTACH_DIR=/mail-attach UPLOADS_DIR=/uploads \
 *   PGHOST=… PGUSER=… PGPASSWORD=… PGDATABASE=… \
 *   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
 *   node scripts/migrate-mail-attachments-to-r2.mjs --dry-run
 *
 * Opțiuni:
 *   --dry-run      doar raportează: nu urcă, nu copiază, nu scrie în DB
 *   --copy-local   pune o copie și în UPLOADS_DIR/mail-attach/… (cache local, ca la restul)
 *   --local-only   fără R2: doar copiază în UPLOADS_DIR și rescrie DB-ul
 *                  (util pe dev / pe un stack cu STORAGE_DRIVER=disk)
 *
 * Env: MAIL_MIGRATE_CONCURRENCY=8
 *
 * Idempotent: a doua rulare sare peste ce e deja în bucket cu aceeași mărime și
 * peste rândurile deja rescrise. NU șterge nimic de pe volumul vechi — după
 * migrare fișierele rămân acolo, ca plasă de siguranță.
 */
import pg from 'pg';
import { createReadStream, readdirSync, statSync } from 'fs';
import { copyFile, mkdir, readFile, stat } from 'fs/promises';
import { dirname, extname, join } from 'path';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const localOnly = args.has('--local-only');
const copyLocal = args.has('--copy-local') || localOnly;

/** Prefixul din rădăcina uploads. Trebuie să fie identic cu MAIL_ATTACH_PREFIX din cod. */
const PREFIX = 'mail-attach';

const mailDir = (process.env.MAIL_ATTACH_DIR || '/app/mail-attach').replace(/\/+$/, '');
const uploadsDir = (process.env.UPLOADS_DIR || '/app/uploads').replace(/\/+$/, '');
const bucket = process.env.R2_BUCKET || '';
const account = process.env.R2_ACCOUNT_ID || '';
const endpoint = process.env.R2_ENDPOINT || (account ? `https://${account}.r2.cloudflarestorage.com` : '');
const concurrency = Math.max(1, Number(process.env.MAIL_MIGRATE_CONCURRENCY || 8));

/** Rădăcinile vechi acceptate — aceleași ca LEGACY_MAIL_ROOTS din `mailer/mail-storage.ts`. */
const legacyRoots = [...new Set([mailDir, '/app/mail-attach', '/tmp/manelecadou-mail-attach'])].filter(Boolean);

if (!localOnly && (!endpoint || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !bucket)) {
  console.error(
    'Lipsesc R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET\n' +
      '(sau rulează cu --local-only dacă vrei doar mutarea în UPLOADS_DIR).',
  );
  process.exit(1);
}
if (copyLocal && !uploadsDir) {
  console.error('UPLOADS_DIR e obligatoriu cu --copy-local / --local-only');
  process.exit(1);
}

const MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.eml': 'message/rfc822',
};
/** Ce se poate randa în browser nu primește ContentType „viu" în bucket. */
function contentTypeFor(abs) {
  return MIME[extname(abs).toLowerCase()] || 'application/octet-stream';
}

const MULTIPART_THRESHOLD = 128 * 1024 * 1024;
const PART_SIZE = 32 * 1024 * 1024;

const s3 = localOnly
  ? null
  : new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`skip dir ${dir}: ${e.message}`);
    return acc;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.isFile()) acc.push(p);
  }
  return acc;
}

async function uploadMultipart(key, abs, size, contentType) {
  const created = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
  );
  const uploadId = created.UploadId;
  try {
    const parts = [];
    let partNumber = 1;
    for (let start = 0; start < size; start += PART_SIZE) {
      const end = Math.min(start + PART_SIZE, size) - 1;
      const out = await s3.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: createReadStream(abs, { start, end }),
          ContentLength: end - start + 1,
        }),
      );
      parts.push({ ETag: out.ETag, PartNumber: partNumber });
      partNumber += 1;
    }
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  } catch (e) {
    await s3
      .send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }))
      .catch(() => undefined);
    throw e;
  }
}

/** Mărimea obiectului din bucket, sau null dacă nu există. */
async function headSize(key) {
  if (!s3) return null;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return Number(head.ContentLength);
  } catch {
    return null;
  }
}

/** Mărimea fișierului local, sau null. */
async function localSize(abs) {
  try {
    const st = await stat(abs);
    return st.isFile() ? st.size : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pasul 1 — fișierele de pe volumul vechi → R2 (+ opțional copie în uploads)
// ---------------------------------------------------------------------------
const files = walk(mailDir);
const fileStats = { uploaded: 0, skipped: 0, copied: 0, failed: 0, bytes: 0 };
const failures = [];
/** cheile confirmate ca existente după acest pas (R2 sau local, în funcție de mod) */
const present = new Set();

let cursor = 0;
async function fileWorker() {
  for (;;) {
    const i = cursor++;
    if (i >= files.length) return;
    const abs = files[i];
    const rel = abs.slice(mailDir.length + 1).split(/[\\/]/).join('/');
    const key = `${PREFIX}/${rel}`;
    try {
      const size = statSync(abs).size;
      const contentType = contentTypeFor(abs);
      // La dry-run marcăm cheia ca „ar exista după rulare", ca raportul pentru DB
      // să arate ce s-ar rescrie, nu o listă de fișiere „lipsă".
      if (dryRun) present.add(key);

      if (!localOnly) {
        const remote = await headSize(key);
        if (remote === size) {
          fileStats.skipped += 1;
          present.add(key);
        } else if (dryRun) {
          fileStats.uploaded += 1;
          fileStats.bytes += size;
        } else {
          if (size > MULTIPART_THRESHOLD) {
            await uploadMultipart(key, abs, size, contentType);
          } else {
            await s3.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: await readFile(abs),
                ContentLength: size,
                ContentType: contentType,
                CacheControl: 'public, max-age=31536000, immutable',
              }),
            );
          }
          fileStats.uploaded += 1;
          fileStats.bytes += size;
          present.add(key);
        }
      }

      if (copyLocal) {
        const dest = join(uploadsDir, key);
        const have = await localSize(dest);
        if (have === size) {
          if (localOnly) present.add(key);
        } else if (!dryRun) {
          await mkdir(dirname(dest), { recursive: true });
          await copyFile(abs, dest);
          fileStats.copied += 1;
          present.add(key);
        } else {
          fileStats.copied += 1;
        }
      }
    } catch (e) {
      fileStats.failed += 1;
      failures.push(`${key}: ${e.message}`);
      console.error(`FAIL ${key}: ${e.message}`);
    }
  }
}

console.log(
  `${dryRun ? '[dry-run] ' : ''}${files.length} fișiere în ${mailDir} → ` +
    `${localOnly ? `${uploadsDir}/${PREFIX}` : `r2://${bucket}/${PREFIX}`}` +
    `${copyLocal && !localOnly ? ` (+ copie în ${uploadsDir})` : ''}`,
);
await Promise.all(Array.from({ length: concurrency }, () => fileWorker()));
console.log(
  `fișiere: urcate=${fileStats.uploaded} sărite=${fileStats.skipped} ` +
    `copiate-local=${fileStats.copied} eșuate=${fileStats.failed} ` +
    `(${(fileStats.bytes / 1024 / 1024).toFixed(1)} MB)`,
);

// ---------------------------------------------------------------------------
// Pasul 2 — mail_attachments.storagePath → cheia relativă nouă
// ---------------------------------------------------------------------------
const client = process.env.DATABASE_URL
  ? new pg.Client({ connectionString: process.env.DATABASE_URL })
  : new pg.Client({
      host: process.env.PGHOST || 'postgres',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

/** Aceeași mapare ca `resolveMailStoragePath` din `mailer/mail-storage.ts`. */
function keyFor(storagePath) {
  const v = String(storagePath ?? '').replace(/\\/g, '/').trim();
  if (!v) return null;
  if (!v.startsWith('/')) return v.replace(/^uploads\//, '');
  if (v.startsWith(`${uploadsDir}/`)) return v.slice(uploadsDir.length + 1);
  if (v.startsWith('/uploads/')) return v.slice('/uploads/'.length);
  for (const root of legacyRoots) {
    if (v.startsWith(`${root}/`)) return `${PREFIX}/${v.slice(root.length + 1)}`;
  }
  return null;
}

const db = { already: 0, rewritten: 0, missing: 0, unknown: 0, failed: 0 };
const missingRows = [];
const unknownRows = [];

await client.connect();
try {
  const { rows: tbl } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mail_attachments'`,
  );
  if (!tbl.length) {
    console.log('\nmail_attachments nu există în baza asta — nimic de rescris.');
  } else {
    const { rows } = await client.query(
      `SELECT id, "storagePath" FROM mail_attachments ORDER BY "createdAt" ASC`,
    );
    console.log(`\n${rows.length} rânduri în mail_attachments`);
    for (const row of rows) {
      const path = row.storagePath ?? '';
      const key = keyFor(path);
      if (!key) {
        db.unknown += 1;
        unknownRows.push(`${row.id}: ${path}`);
        continue;
      }
      if (!path.startsWith('/')) {
        db.already += 1; // deja cheie relativă
        continue;
      }
      // Rescriem doar dacă fișierul chiar există la destinație — altfel am rupe
      // o referință care măcar teoretic mai e bună pe volumul vechi.
      let ok = present.has(key);
      if (!ok) ok = (await localSize(join(uploadsDir, key))) != null;
      if (!ok && !localOnly) ok = (await headSize(key)) != null;
      if (!ok) {
        db.missing += 1;
        missingRows.push(`${row.id}: ${path}`);
        continue;
      }
      if (dryRun) {
        db.rewritten += 1;
        continue;
      }
      try {
        // Guard pe valoarea veche: dacă altcineva a rescris între timp, nu suprascriem.
        const res = await client.query(
          `UPDATE mail_attachments SET "storagePath" = $1 WHERE id = $2 AND "storagePath" = $3`,
          [key, row.id, path],
        );
        if (res.rowCount) db.rewritten += 1;
        else db.already += 1;
      } catch (e) {
        db.failed += 1;
        failures.push(`db ${row.id}: ${e.message}`);
        console.error(`FAIL db ${row.id}: ${e.message}`);
      }
    }
  }
} finally {
  await client.end();
}

console.log(
  `\nDB: rescrise=${db.rewritten} deja-migrate=${db.already} ` +
    `fără-fișier=${db.missing} necunoscute=${db.unknown} eșuate=${db.failed}`,
);
const show = (label, list) => {
  if (!list.length) return;
  console.log(`\n${label}:`);
  for (const l of list.slice(0, 30)) console.log(`  ${l}`);
  if (list.length > 30) console.log(`  … și încă ${list.length - 30}`);
};
show('Rânduri fără fișier (nici pe disc, nici în R2) — lăsate neatinse', missingRows);
show('Rânduri cu path în afara oricărui magazin cunoscut — lăsate neatinse', unknownRows);

if (dryRun) console.log('\n[dry-run] nimic nu a fost scris. Rulează fără --dry-run.');
else console.log('\nVolumul vechi rămâne neatins — nu s-a șters niciun fișier.');

if (failures.length) {
  console.error('\nEșecuri:');
  for (const f of failures.slice(0, 50)) console.error(`  ${f}`);
  if (failures.length > 50) console.error(`  … și încă ${failures.length - 50}`);
  process.exit(1);
}
