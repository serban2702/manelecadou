#!/usr/bin/env node
/**
 * Verifică fiecare fișier la care face referire baza de date și spune dacă
 * există în bucket-ul R2. E plasa de siguranță de dinainte de cutover:
 * dacă raportul iese curat, nimeni nu pierde o melodie, o factură sau un colaj.
 *
 *   PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=... \
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *   R2_BUCKET=manelecadou-uploads \
 *   node scripts/verify-r2-migration.mjs
 *
 * Opțiuni (env):
 *   UPLOADS_DIR=/app/uploads   verifică și discul local (spune ce mai e doar acolo)
 *   MAIL_ATTACH_DIR=/app/mail-attach   volumul vechi de mail, pentru rândurile nemigrate
 *   VERIFY_CONCURRENCY=16
 *   VERIFY_LIMIT=0             0 = tot; altfel doar primele N referințe (probă rapidă)
 *
 * Ieșire 1 dacă lipsește ceva din R2 → nu da cutover până nu iese 0.
 */
import { makePgClient } from './lib/pg-env.mjs';
import { statSync } from 'fs';
import { join } from 'path';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const bucket = process.env.R2_BUCKET || '';
const account = process.env.R2_ACCOUNT_ID || '';
const endpoint = process.env.R2_ENDPOINT || (account ? `https://${account}.r2.cloudflarestorage.com` : '');
const uploadsDir = process.env.UPLOADS_DIR || '';
/** Volumul vechi de mail. Rândurile nemigrate au aici fișierul, cu cale absolută în DB. */
const mailDir = (process.env.MAIL_ATTACH_DIR || '/app/mail-attach').replace(/\/+$/, '');
const MAIL_PREFIX = 'mail-attach';
const concurrency = Math.max(1, Number(process.env.VERIFY_CONCURRENCY || 16));
const limit = Number(process.env.VERIFY_LIMIT || 0);

if (!endpoint || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !bucket) {
  console.error('Lipsesc R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/** URL absolut sau relativ → cheia din bucket. Aceeași normalizare ca StorageService.toRel. */
function toKey(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let v = raw.trim();
  if (!v) return null;
  v = v.split('?')[0].split('#')[0];
  const at = v.indexOf('/uploads/');
  if (at >= 0) return v.slice(at + '/uploads/'.length);
  if (/^https?:\/\//.test(v)) return null; // asset extern, nu ne privește
  // Path absolut care NU e sub /uploads → alt magazin. Singurul caz real e
  // `mail_attachments.storagePath` de dinainte de migrare, tratat separat mai jos.
  if (v.startsWith('/')) return null;
  return v;
}

/** Scoate recursiv stringurile care arată a fișier dintr-un jsonb. */
function keysFromJson(value, out) {
  if (!value) return;
  if (typeof value === 'string') {
    if (value.includes('/uploads/')) {
      const k = toKey(value);
      if (k) out.add(k);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) keysFromJson(v, out);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) keysFromJson(v, out);
  }
}

const client = makePgClient();

async function tableExists(name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return rows.length > 0;
}
async function columnExists(table, col) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, col],
  );
  return rows.length > 0;
}

/** Coloane text cu path-uri directe. */
const TEXT_REFS = [
  ['generations', ['audioUrl', 'demoAudioUrl', 'instrumentalUrl', 'videoUrl', 'videoUrlBonus', 'socialImageSelected', 'socialImageUploaded', 'coverUrl']],
  ['video_collages', ['videoUrl', 'sourceImageUrl']],
  ['invoices', ['pdfPath']],
  ['chat_messages', ['attachmentUrl']],
  ['site_demos', ['audioUrl', 'coverUrl']],
  // `mail_attachments.storagePath` are pas propriu (mai jos): valorile vechi sunt
  // căi absolute pe volumul `api_mail_attach`, nu chei de uploads.
];
/** Coloane jsonb din care extragem orice string cu /uploads/. */
const JSON_REFS = [
  ['generations', ['socialImages']],
  ['sites', ['brand', 'suno', 'experienceConfig']],
];

await client.connect();
const refs = new Map(); // key -> [sursă]
/** cheie de mail → fișierul de pe volumul vechi (dacă rândul e încă nemigrat) */
const mailLegacyAbs = new Map();
/** chei de mail al căror rând din DB are încă calea absolută veche */
const mailLegacyRows = new Set();

/** `mail_attachments.storagePath` → cheia din bucket. Aceeași mapare ca `resolveMailStoragePath`. */
function mailKeyFor(raw) {
  const v = String(raw ?? '').replace(/\\/g, '/').trim();
  if (!v) return null;
  if (!v.startsWith('/')) return v.replace(/^uploads\//, '');
  if (uploadsDir && v.startsWith(`${uploadsDir}/`)) return v.slice(uploadsDir.length + 1);
  if (v.startsWith('/uploads/')) return v.slice('/uploads/'.length);
  for (const root of [mailDir, '/app/mail-attach', '/tmp/manelecadou-mail-attach']) {
    if (root && v.startsWith(`${root}/`)) return `${MAIL_PREFIX}/${v.slice(root.length + 1)}`;
  }
  return null;
}

try {
  for (const [table, cols] of TEXT_REFS) {
    if (!(await tableExists(table))) continue;
    const present = [];
    for (const c of cols) if (await columnExists(table, c)) present.push(c);
    if (!present.length) continue;
    const select = present.map((c) => `"${c}"`).join(', ');
    const where = present.map((c) => `"${c}" IS NOT NULL`).join(' OR ');
    const { rows } = await client.query(`SELECT ${select} FROM ${table} WHERE ${where}`);
    for (const row of rows) {
      for (const c of present) {
        const k = toKey(row[c]);
        if (k) {
          if (!refs.has(k)) refs.set(k, []);
          refs.get(k).push(`${table}.${c}`);
        }
      }
    }
  }

  for (const [table, cols] of JSON_REFS) {
    if (!(await tableExists(table))) continue;
    const present = [];
    for (const c of cols) if (await columnExists(table, c)) present.push(c);
    if (!present.length) continue;
    const { rows } = await client.query(
      `SELECT ${present.map((c) => `"${c}"`).join(', ')} FROM ${table}`,
    );
    for (const row of rows) {
      for (const c of present) {
        const found = new Set();
        keysFromJson(row[c], found);
        for (const k of found) {
          if (!refs.has(k)) refs.set(k, []);
          refs.get(k).push(`${table}.${c}`);
        }
      }
    }
  }
  // Atașamentele de email: rândurile noi au cheie relativă, cele vechi calea
  // absolută de pe volumul `api_mail_attach`. Ambele se verifică în R2, dar cele
  // vechi se raportează separat — sunt „de migrat", nu „pierdute".
  if (await tableExists('mail_attachments')) {
    const { rows } = await client.query(
      `SELECT "storagePath" FROM mail_attachments WHERE "storagePath" IS NOT NULL`,
    );
    for (const row of rows) {
      const raw = row.storagePath ?? '';
      const k = mailKeyFor(raw);
      if (!k) continue;
      if (!refs.has(k)) refs.set(k, []);
      refs.get(k).push('mail_attachments.storagePath');
      if (raw.startsWith('/')) {
        mailLegacyRows.add(k);
        mailLegacyAbs.set(k, raw);
      }
    }
  }
} finally {
  await client.end();
}

let all = [...refs.keys()].sort();
if (limit > 0) all = all.slice(0, limit);
console.log(`${all.length} fișiere distincte referite din DB → verific în r2://${bucket}`);

const missing = [];
const onlyLocal = [];
/** rânduri de mail cu fișierul încă doar pe volumul vechi — rulează migrarea */
const mailPending = [];
/** fișier deja în R2, dar DB-ul ține încă calea veche (codul îl găsește oricum) */
const mailNeedsRewrite = [];
let ok = 0;
let cursor = 0;

/** Toate locurile de pe disc unde poate sta cheia asta. */
function localPaths(key) {
  const out = [];
  if (uploadsDir) out.push(join(uploadsDir, key));
  const legacy = mailLegacyAbs.get(key);
  if (legacy) out.push(legacy);
  return out;
}

async function worker() {
  for (;;) {
    const i = cursor++;
    if (i >= all.length) return;
    const key = all[i];
    let inR2 = false;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      inR2 = true;
    } catch {
      inR2 = false;
    }
    if (inR2) {
      ok += 1;
      if (mailLegacyRows.has(key)) mailNeedsRewrite.push(key);
    } else {
      let local = false;
      for (const p of localPaths(key)) {
        try {
          if (statSync(p).isFile()) {
            local = true;
            break;
          }
        } catch {
          /* încercăm următorul */
        }
      }
      if (local && mailLegacyRows.has(key)) mailPending.push(key);
      else if (local) onlyLocal.push(key);
      else missing.push(key);
    }
    const done = ok + missing.length + onlyLocal.length + mailPending.length;
    if (done % 500 === 0) console.log(`… ${done}/${all.length}`);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

console.log(`\nîn R2: ${ok}`);
console.log(`doar pe disc (rulează sync-uploads-to-r2.mjs): ${onlyLocal.length}`);
console.log(`atașamente de mail nemigrate (rulează migrate-mail-attachments-to-r2.mjs): ${mailPending.length}`);
console.log(`nicăieri (referință moartă în DB): ${missing.length}`);
if (mailNeedsRewrite.length) {
  console.log(
    `atașamente de mail în R2, dar cu calea veche în DB: ${mailNeedsRewrite.length} ` +
      '(descărcarea merge — codul mapează singur calea veche; rulează migrarea ca să curețe)',
  );
}

const show = (label, list) => {
  if (!list.length) return;
  console.log(`\n${label}:`);
  for (const k of list.slice(0, 40)) console.log(`  ${k}   ← ${[...new Set(refs.get(k))].join(', ')}`);
  if (list.length > 40) console.log(`  … și încă ${list.length - 40}`);
};
show('Doar pe disc', onlyLocal);
show('Mail, doar pe volumul vechi', mailPending);
show('Lipsă complet', missing);

if (missing.length) {
  console.error(
    '\nATENȚIE: referințele „lipsă complet" nu există nici pe disc, nici în R2.\n' +
      'Verifică dacă erau deja rupte înainte de migrare (compară cu producția actuală)\n' +
      'înainte să tragi concluzia că le-a pierdut sync-ul.',
  );
}
process.exit(onlyLocal.length || missing.length || mailPending.length ? 1 : 0);
