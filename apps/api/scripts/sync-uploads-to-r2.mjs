#!/usr/bin/env node
/**
 * Urcă tot din UPLOADS_DIR pe Cloudflare R2, cu aceleași chei ca pe disc
 * (`audio/<id>/full.mp3` etc.), ca path-urile `/uploads/...` din DB să rămână
 * valide după cutover.
 *
 *   UPLOADS_DIR=/app/uploads \
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *   R2_BUCKET=manelecadou-uploads \
 *   node scripts/sync-uploads-to-r2.mjs
 *
 * Opțiuni (env):
 *   R2_SKIP_EXISTING=0   re-urcă tot (default: sare peste ce are deja aceeași mărime)
 *   R2_CONCURRENCY=12    fișiere în paralel
 *   R2_DRY_RUN=1         doar raportează, nu urcă
 *   R2_CONFIRM_BUCKET=   OBLIGATORIU la o rulare reală: trebuie să fie exact
 *                        R2_BUCKET. Avem două bucketuri (producție și dev) și
 *                        o rulare greșită înseamnă ori 7,5 GB urcați degeaba în
 *                        bucketul de dev, ori fișiere de test amestecate peste
 *                        producție. `R2_DRY_RUN=1` nu cere confirmarea.
 *
 * Idempotent: îl poți rula de câte ori vrei. Rulează-l a doua oară imediat
 * înainte de cutover ca să prindă fișierele apărute între timp.
 */
import { readdirSync, statSync, createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { join, relative, extname } from 'path';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';

const root = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
const account = process.env.R2_ACCOUNT_ID || '';
const bucket = process.env.R2_BUCKET || '';
const endpoint = process.env.R2_ENDPOINT || (account ? `https://${account}.r2.cloudflarestorage.com` : '');
const skipExisting = process.env.R2_SKIP_EXISTING !== '0';
const concurrency = Math.max(1, Number(process.env.R2_CONCURRENCY || 12));
const dryRun = process.env.R2_DRY_RUN === '1';

// Peste pragul ăsta urcăm în bucăți; sub el citim fișierul în memorie ca să
// putem trimite Content-Length (R2 refuză body-uri streaming fără lungime).
const MULTIPART_THRESHOLD = 128 * 1024 * 1024;
const PART_SIZE = 32 * 1024 * 1024;

if (!endpoint || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !bucket) {
  console.error('Lipsesc R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET');
  process.exit(1);
}

// Confirmare explicită a bucketului: cu două bucketuri (producție / dev), un
// export uitat în shell e tot ce trebuie ca să urci în cel greșit.
if (!dryRun && (process.env.R2_CONFIRM_BUCKET || '') !== bucket) {
  console.error(
    `Refuz să urc fără confirmare.\n` +
      `  R2_BUCKET         = ${bucket}\n` +
      `  R2_ENDPOINT       = ${endpoint}\n` +
      `  R2_CONFIRM_BUCKET = ${process.env.R2_CONFIRM_BUCKET || '(nesetat)'}\n` +
      `Verifică bucketul de mai sus și repetă comanda cu R2_CONFIRM_BUCKET=${bucket}\n` +
      `(sau rulează cu R2_DRY_RUN=1, care nu cere confirmare).`,
  );
  process.exit(1);
}

console.log(`bucket=${bucket} endpoint=${endpoint} root=${root}${dryRun ? ' (dry-run)' : ''}`);

const MIME = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const s3 = new S3Client({
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
    console.error(`skip dir ${dir}: ${e.message}`);
    return acc;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
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
      const body = createReadStream(abs, { start, end });
      const out = await s3.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: body,
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

const files = walk(root);
if (!files.length) {
  console.log(`Nimic de urcat — ${root} e gol sau nu există.`);
  process.exit(0);
}

const stats = { ok: 0, skipped: 0, fail: 0, bytes: 0 };
const failures = [];
let cursor = 0;

async function worker() {
  for (;;) {
    const i = cursor++;
    if (i >= files.length) return;
    const abs = files[i];
    const key = relative(root, abs).split(/[\\/]/).join('/');
    const contentType = MIME[extname(abs).toLowerCase()] || 'application/octet-stream';
    let size = 0;
    try {
      size = statSync(abs).size;
      if (skipExisting) {
        try {
          const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          // Aceeași mărime = deja urcat. Mărime diferită = fișier schimbat, re-urcă.
          if (Number(head.ContentLength) === size) {
            stats.skipped += 1;
            continue;
          }
        } catch {
          /* lipsește — urcăm */
        }
      }
      if (dryRun) {
        stats.ok += 1;
        stats.bytes += size;
        continue;
      }
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
      stats.ok += 1;
      stats.bytes += size;
      if ((stats.ok + stats.skipped) % 200 === 0) {
        console.log(`… ${stats.ok + stats.skipped}/${files.length} (urcate ${stats.ok}, sărite ${stats.skipped})`);
      }
    } catch (e) {
      stats.fail += 1;
      failures.push(`${key}: ${e.message}`);
      console.error(`FAIL ${key}: ${e.message}`);
    }
  }
}

console.log(
  `${dryRun ? '[dry-run] ' : ''}${files.length} fișiere în ${root} → r2://${bucket} (concurrency ${concurrency})`,
);
await Promise.all(Array.from({ length: concurrency }, () => worker()));

const mb = (stats.bytes / 1024 / 1024).toFixed(1);
console.log(`gata: urcate=${stats.ok} (${mb} MB) sărite=${stats.skipped} eșuate=${stats.fail} total=${files.length}`);
if (failures.length) {
  console.error('\nEșecuri:');
  for (const f of failures.slice(0, 50)) console.error(`  ${f}`);
  if (failures.length > 50) console.error(`  … și încă ${failures.length - 50}`);
  process.exit(1);
}
