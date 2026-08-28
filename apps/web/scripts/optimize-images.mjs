#!/usr/bin/env node
/**
 * Pregătește imaginile statice din `public/` pentru web.
 *
 * Problema pe care o rezolvă: sursele erau JPEG-uri codate risipitor — 0,3–0,46
 * bytes/pixel, de trei-patru ori peste ce cere conținutul. Dimensiunile în
 * pixeli erau deja potrivite, deci redimensionarea n-ar fi ajutat; recodarea
 * taie ~75% fără pierdere vizibilă.
 *
 * Face DOUĂ lucruri, în ordinea asta:
 *
 *  1. **Variante AVIF + WebP**, pentru locurile unde browserul poate alege
 *     formatul: `<picture>` și `image-set()` în CSS.
 *  2. **Recomprimă JPEG-ul sursă pe loc** (progresiv, q80 — SSIM ~0,98).
 *     Pasul ăsta contează pentru locurile unde NU se poate negocia formatul:
 *     `<video poster>`, `og:image`, browsere fără AVIF. Se face după pasul 1,
 *     ca variantele să plece din sursa nealterată.
 *
 * Manifestul `lib/optimized-images.json` ține minte, per imagine, dimensiunile
 * intrinseci și mărimile rezultate. Dimensiunile alimentează `width`/`height` în
 * `<Picture>`, ca layoutul să nu sară. Mărimea JPEG-ului e și marcajul de
 * idempotență: dacă fișierul de pe disc are exact mărimea înregistrată, e deja
 * procesat și nu-l mai recomprimăm (altfel fiecare rulare ar mai pierde
 * calitate).
 *
 * Manifestul e obligatoriu, nu o optimizare: într-un `<picture>`, browserul
 * alege `<source>`-ul după `type`, nu după existența fișierului. Un AVIF lipsă
 * nu cade elegant pe JPEG — lasă imaginea ruptă. Emitem `<source>` doar pentru
 * ce e înregistrat aici.
 *
 *   pnpm run images           # procesează ce lipsește
 *   pnpm run images:check     # doar verifică (CI); exit 1 dacă manifestul nu e la zi
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat, writeFile, readFile, rename, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const MANIFEST = path.join(ROOT, 'lib', 'optimized-images.json');

// Calibrate cu SSIM față de original: AVIF 58 → ~0,97; JPEG 80 → ~0,98.
// Sub pragurile astea apar artefacte pe degradeuri (fundalurile au multe).
const AVIF_Q = 58;
const WEBP_Q = 80;
const JPEG_Q = 80;

// Sub asta, un fișier în plus nu merită. Prinde automat faviconurile.
const MIN_BYTES = 24 * 1024;
// Nu rescriem sursa dacă abia câștigăm ceva — pierderea de calitate ar fi degeaba.
const MIN_GAIN = 0.12;

const CHECK = process.argv.includes('--check');

/** Nu le atingem, fiecare din alt motiv:
 *  - `og-default` e citit de crawlerele de social, care nu garantează AVIF;
 *  - `email-banner` ajunge în emailuri, iar clienții de mail nu suportă AVIF/WebP;
 *  - icoanele PWA/favicon sunt cerute pe nume din manifestul aplicației;
 *  - `*-source.*` sunt materiale din care se generează restul, nu se servesc;
 *  - `mascot.png` nu e referit nicăieri în web (verificat). */
const SKIP = new Set([
  'og-default.jpg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'favicon.png', 'email-banner.png', 'logo-source.jpg', 'favicon-source.jpg',
  'mascot.png',
]);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Dimensiunile din antet, fără să depindem de o unealtă externă. */
async function dimensions(file) {
  const buf = await readHead(file, 256 * 1024);
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; // PNG IHDR
  }
  // JPEG: caută primul marker SOF (0xC0..0xCF, mai puțin C4/C8/CC).
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function readHead(file, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    const s = createReadStream(file, { end: max });
    s.on('data', (c) => { chunks.push(c); n += c.length; });
    s.on('end', () => resolve(Buffer.concat(chunks, n)));
    s.on('error', reject);
  });
}

async function size(p) { try { return (await stat(p)).size; } catch { return -1; } }
async function have(bin) { try { await run('which', [bin]); return true; } catch { return false; } }
const kb = (n) => `${Math.round(n / 1024)}K`;

async function main() {
  const prev = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => '{}'));

  if (!CHECK) {
    const missing = [];
    for (const [bin, hint] of [['avifenc', 'brew install libavif'], ['cwebp', 'brew install webp'],
                               ['cjpeg', 'brew install jpeg-turbo'], ['djpeg', 'brew install jpeg-turbo']]) {
      if (!(await have(bin))) missing.push(`${bin} (${hint})`);
    }
    if (missing.length) {
      console.error('Lipsesc uneltele de compresie:\n  ' + missing.join('\n  '));
      process.exit(1);
    }
  }

  const sources = [];
  for await (const p of walk(PUBLIC)) {
    if (!/\.(jpe?g|png)$/i.test(p)) continue;
    if (SKIP.has(path.basename(p))) continue;
    if ((await size(p)) < MIN_BYTES) continue;
    sources.push(p);
  }
  sources.sort();

  const manifest = {};
  const stale = [];
  let before = 0, after = 0, touched = 0;

  const job = async (src) => {
    const key = '/' + path.relative(PUBLIC, src).split(path.sep).join('/');
    const avif = src.replace(/\.(jpe?g|png)$/i, '.avif');
    const webp = src.replace(/\.(jpe?g|png)$/i, '.webp');
    const cur = await size(src);
    const rec = prev[key];
    // Deja procesat dacă mărimea sursei e exact cea înregistrată ȘI variantele există.
    const done = rec && rec.bytes === cur && (await size(avif)) > 0 && (await size(webp)) > 0;

    if (CHECK) {
      if (!done) stale.push(key);
      else manifest[key] = rec;
      return;
    }

    if (done) { manifest[key] = rec; before += rec.source ?? cur; after += Math.min(rec.avif, rec.webp); return; }

    const dim = await dimensions(src);
    const original = cur;

    // 1. Variantele pleacă din sursa de acum, înainte de orice rescriere.
    await Promise.all([
      run('avifenc', ['-q', String(AVIF_Q), '-s', '4', '--jobs', '4', src, avif]),
      run('cwebp', ['-quiet', '-q', String(WEBP_Q), '-m', '6', src, '-o', webp]),
    ]);

    // 2. Recomprimă JPEG-ul pe loc, pentru consumatorii care nu pot negocia.
    if (/\.jpe?g$/i.test(src)) {
      const tmpP = path.join(os.tmpdir(), `oi-${process.pid}-${path.basename(src)}.ppm`);
      const tmpJ = path.join(os.tmpdir(), `oi-${process.pid}-${path.basename(src)}`);
      try {
        await run('djpeg', ['-outfile', tmpP, src]);
        await run('cjpeg', ['-quality', String(JPEG_Q), '-progressive', '-optimize', '-outfile', tmpJ, tmpP]);
        const got = await size(tmpJ);
        if (got > 0 && got < original * (1 - MIN_GAIN)) await rename(tmpJ, src);
        else await unlink(tmpJ).catch(() => {});
      } finally {
        await unlink(tmpP).catch(() => {});
      }
    }

    const [sj, sa, sw] = await Promise.all([size(src), size(avif), size(webp)]);
    manifest[key] = { w: dim?.w ?? null, h: dim?.h ?? null, bytes: sj, avif: sa, webp: sw, source: original };
    before += original;
    after += Math.min(sa, sw);
    touched++;
    console.log(
      `  ${key.replace(/^\//, '').padEnd(38)} ${kb(original).padStart(6)} → ` +
      `jpg ${kb(sj).padStart(5)}  webp ${kb(sw).padStart(5)}  avif ${kb(sa).padStart(5)}`,
    );
  };

  for (let i = 0; i < sources.length; i += 4) {
    await Promise.all(sources.slice(i, i + 4).map(job));
  }

  const ordered = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));

  if (CHECK) {
    if (stale.length || JSON.stringify(prev) !== JSON.stringify(ordered)) {
      console.error('Imagini neprocesate sau manifest învechit:');
      for (const s of stale) console.error('  ' + s);
      console.error('\nRulează: pnpm run images');
      process.exit(1);
    }
    console.log(`✓ ${Object.keys(ordered).length} imagini procesate, manifest la zi.`);
    return;
  }

  await writeFile(MANIFEST, JSON.stringify(ordered, null, 2) + '\n');
  const saved = before ? Math.round(100 * (1 - after / before)) : 0;
  console.log(
    `\n${touched} procesate · ${Object.keys(ordered).length} în manifest\n` +
    `original ${kb(before)} → cea mai bună variantă ${kb(after)}  (−${saved}%)`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
