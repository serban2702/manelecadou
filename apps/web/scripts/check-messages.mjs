#!/usr/bin/env node
/**
 * Verifică dacă vreo limbă a rămas în urmă față de `ro.json`.
 *
 *   cd apps/web && pnpm run check:messages
 *
 * `i18n/request.ts` completează cheile lipsă cu textul românesc, deci o
 * traducere care lipsește nu strică pagina — dar nici nu se vede. Scriptul ăsta
 * o face vizibilă. Iese cu 1 dacă lipsește ceva.
 */
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages');
const BASE = 'ro';

function flatten(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}${k}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, `${key}.`, out);
    else out.add(key);
  }
  return out;
}

const load = (locale) => JSON.parse(readFileSync(join(dir, `${locale}.json`), 'utf8'));
const base = flatten(load(BASE));
const locales = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => f.slice(0, -5))
  .filter((l) => l !== BASE)
  .sort();

let failed = false;
console.log(`${BASE}.json: ${base.size} chei\n`);
for (const locale of locales) {
  const cur = flatten(load(locale));
  const missing = [...base].filter((k) => !cur.has(k)).sort();
  const extra = [...cur].filter((k) => !base.has(k)).sort();
  const status = missing.length ? '✗' : '✓';
  console.log(`${status} ${locale}: ${cur.size} chei, lipsă ${missing.length}, în plus ${extra.length}`);
  for (const k of missing.slice(0, 15)) console.log(`      lipsă  ${k}`);
  if (missing.length > 15) console.log(`      … și încă ${missing.length - 15}`);
  for (const k of extra.slice(0, 5)) console.log(`      în plus ${k}`);
  if (missing.length) failed = true;
}

if (failed) {
  console.error('\nLipsesc traduceri. Completează-le în messages/<locale>.json.');
  process.exit(1);
}
console.log('\nToate limbile sunt complete.');
