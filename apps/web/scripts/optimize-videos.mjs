#!/usr/bin/env node
/**
 * Recomprimă clipurile scurte din `public/` (reacțiile din interfața cadou).
 *
 * Sursele veneau la 1650–3780 kb/s pentru 400×736 — de trei-patru ori peste ce
 * cere rezoluția asta. La CRF 24 (SSIM ~0,95 pe cadru) scad cu ~65%, fără
 * diferență vizibilă într-o ramă de telefon lată de ~300px.
 *
 * Două lucruri pe lângă bitrate:
 *  - **audio-ul se păstrează** (reîncodat la 96 kb/s). Clipurile n-au coloană
 *    sonoră separată — `audioUrl` lipsește din seed-uri — deci sunetul lor
 *    propriu chiar se aude când vizitatorul apasă pe telefon.
 *  - **`+faststart`** mută indexul (`moov`) la începutul fișierului. Fără el,
 *    `preload="metadata"` poate trage aproape tot fișierul ca să-l găsească.
 *
 * Idempotent: sare peste fișierele deja sub pragul de bitrate.
 *
 *   pnpm run videos
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

const CRF = 24;
const AUDIO_KBPS = 96;
/** Peste asta considerăm fișierul neprocesat. Sub, îl lăsăm în pace.
 *  Pragul e peste ce produce CRF 24 pe cel mai încărcat clip (~1300 kb/s), ca a
 *  doua rulare să nu reîncodeze — fiecare trecere ar mai pierde calitate. */
const MAX_KBPS = 1500;

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.mp4$/i.test(p)) yield p;
  }
}

async function bitrateKbps(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=bit_rate', '-of', 'default=nw=1:nk=1', file,
  ]);
  return Math.round(Number(stdout.trim()) / 1000) || 0;
}

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

async function main() {
  try { await run('which', ['ffmpeg']); } catch {
    console.error('Lipsește ffmpeg (brew install ffmpeg)');
    process.exit(1);
  }

  const files = [];
  for await (const p of walk(PUBLIC)) files.push(p);
  files.sort();

  let before = 0, after = 0, done = 0;

  for (const src of files) {
    const rel = path.relative(PUBLIC, src);
    const size0 = (await stat(src)).size;
    const kbps = await bitrateKbps(src);
    before += size0;

    if (kbps && kbps <= MAX_KBPS) {
      after += size0;
      continue;
    }

    const tmp = path.join(os.tmpdir(), `ov-${process.pid}-${path.basename(src)}`);
    await run('ffmpeg', [
      '-v', 'error', '-y', '-i', src,
      '-c:v', 'libx264', '-profile:v', 'high', '-crf', String(CRF), '-preset', 'slow',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`,
      '-movflags', '+faststart',
      tmp,
    ]);
    const size1 = (await stat(tmp)).size;
    if (size1 > 0 && size1 < size0) {
      await rename(tmp, src);
      after += size1;
      done++;
      console.log(`  ${rel.padEnd(34)} ${mb(size0).padStart(8)} → ${mb(size1).padStart(8)}  (${kbps} kb/s → ${await bitrateKbps(src)} kb/s)`);
    } else {
      await unlink(tmp).catch(() => {});
      after += size0;
    }
  }

  const saved = before ? Math.round(100 * (1 - after / before)) : 0;
  console.log(`\n${done} recomprimate · ${mb(before)} → ${mb(after)}  (−${saved}%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
