#!/usr/bin/env node
/**
 * Migrarea datelor de producție către formatul noii versiuni (experiences,
 * identity, pachete cu snapshot, motor audio per design, storage R2).
 *
 * Rulează în DOUĂ faze, în jurul deploy-ului:
 *
 *   # 1. ÎNAINTE de a porni codul nou (obligatoriu)
 *   node scripts/migrate-prod-to-new-stack.mjs --phase=pre
 *
 *   # 2. DUPĂ ce API-ul nou a pornit și TypeORM a creat coloanele
 *   node scripts/migrate-prod-to-new-stack.mjs --phase=post
 *
 *   # 3. configurarea per tenant (echivalentul lui /rollout → „Aplică lipsurile")
 *   node scripts/migrate-prod-to-new-stack.mjs --phase=rollout
 *
 *   # oricând: doar raport, fără scrieri
 *   node scripts/migrate-prod-to-new-stack.mjs --phase=check
 *
 * Conexiunea: PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (sau DATABASE_URL).
 * Adaugă `--dry-run` ca să vezi SQL-ul fără să-l execuți.
 *
 * Totul e idempotent: îl poți rula de câte ori vrei.
 *
 * ---------------------------------------------------------------------------
 * DE CE faza „pre" e obligatorie
 *
 * `video_collages.track` crește de la varchar(8) la varchar(64). TypeORM cu
 * `synchronize: true` NU face ALTER la schimbarea de lungime — face
 * DROP COLUMN + ADD COLUMN (postgres/PostgresQueryRunner: „To avoid data
 * conversion, we just recreate column"). Toate colajele existente ar rămâne cu
 * `track = 'main'`, deci cele pe bonus s-ar rata la listare și la regenerare.
 * ALTER-ul manual de mai jos păstrează datele; după el TypeORM vede lungimea
 * deja corectă și nu mai atinge coloana.
 * ---------------------------------------------------------------------------
 */
import pg from 'pg';
import { createHmac } from 'crypto';

const args = new Set(process.argv.slice(2));
const argOf = (name, dflt) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const phase = argOf('phase', 'check');
const dryRun = args.has('--dry-run');
// Ce facem cu refacerile gratuite ale comenzilor vechi.
//
// Până acum refacerea gratuită NU era self-service: o dădea operatorul, prin
// Irina, când greșeala era a noastră. Codul nou pune pe pagina piesei un buton
// „Refă gratuit" cu cotă pe pachet (Standard 1 / Plus 2 / Premium 3), iar
// comenzile vechi au `packageSnapshot` NULL, deci cad pe cota implicită a
// tier-ului. Fără intervenție, TOT istoricul de comenzi plătite capătă brusc
// refaceri self-service — fiecare o generare Suno plătită.
//
// Cifre reale de pe producție (24 aug 2026): 490 comenzi plătite (387 basic,
// 72 plus, 31 premium), din care doar 23 au folosit vreodată refacerea. Deci
// `grant` înseamnă ~598 de generări gratuite deblocate dintr-un singur deploy.
//
//   freeze (default) — TOATE comenzile de dinainte de deploy rămân la
//                      condițiile în care au fost vândute (fără refacere
//                      self-service). Nimeni nu pierde ceva ce i s-a promis.
//   grant            — comenzile vechi primesc cota nouă pe pachet.
//                      Gest comercial, cu cost real în credite Suno.
const legacyRemakes = argOf('legacy-remakes', 'freeze');

if (!['pre', 'post', 'rollout', 'check'].includes(phase)) {
  console.error('--phase trebuie să fie pre | post | rollout | check');
  process.exit(1);
}
if (!['freeze', 'grant'].includes(legacyRemakes)) {
  console.error('--legacy-remakes trebuie să fie freeze | grant');
  process.exit(1);
}

const client = process.env.DATABASE_URL
  ? new pg.Client({ connectionString: process.env.DATABASE_URL })
  : new pg.Client({
      host: process.env.PGHOST || 'postgres',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

const log = (...a) => console.log(...a);
const applied = [];
const skipped = [];

async function q(sql, params = []) {
  return client.query(sql, params);
}

async function tableExists(name) {
  const { rows } = await q(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return rows.length > 0;
}

async function columnInfo(table, column) {
  const { rows } = await q(
    `SELECT data_type, character_maximum_length, column_default, is_nullable
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column],
  );
  return rows[0] || null;
}

async function run(label, sql, params = []) {
  if (dryRun) {
    log(`  [dry-run] ${label}\n            ${sql.replace(/\s+/g, ' ').trim()}`);
    applied.push(`${label} (dry-run)`);
    return { rowCount: 0 };
  }
  const res = await q(sql, params);
  log(`  ✓ ${label}${res.rowCount != null ? ` (${res.rowCount} rânduri)` : ''}`);
  applied.push(label);
  return res;
}

// ---------------------------------------------------------------------------
// FAZA PRE — rulează cu codul VECHI încă pornit
// ---------------------------------------------------------------------------
async function phasePre() {
  log('\n== Faza PRE (înainte de a porni codul nou) ==');

  if (!(await tableExists('video_collages'))) {
    log('  – tabelul video_collages nu există încă, nimic de făcut');
    skipped.push('video_collages.track');
    return;
  }

  const info = await columnInfo('video_collages', 'track');
  if (!info) {
    log('  – coloana video_collages.track nu există, nimic de făcut');
    skipped.push('video_collages.track');
    return;
  }

  const { rows: dist } = await q(
    `SELECT track, count(*)::int AS n FROM video_collages GROUP BY track ORDER BY n DESC`,
  );
  log(`  distribuție actuală: ${dist.map((r) => `${r.track}=${r.n}`).join(', ') || '(gol)'}`);

  if (Number(info.character_maximum_length) >= 64) {
    log('  – track e deja varchar(64) sau mai mare, sar peste');
    skipped.push('video_collages.track');
  } else {
    await run(
      `lărgesc video_collages.track: varchar(${info.character_maximum_length}) → varchar(64)`,
      `ALTER TABLE video_collages ALTER COLUMN "track" TYPE character varying(64)`,
    );
    await run(
      'repun default-ul pe video_collages.track',
      `ALTER TABLE video_collages ALTER COLUMN "track" SET DEFAULT 'main'`,
    );
  }

  log(
    '\n  NOTĂ: nu pre-crea manual index-uri pentru coloanele noi. TypeORM șterge\n' +
      '  la boot orice index de pe un tabel gestionat care nu e în metadata lui.',
  );
}

// ---------------------------------------------------------------------------
// FAZA POST — după ce API-ul nou a pornit și a creat coloanele
// ---------------------------------------------------------------------------
async function phasePost() {
  log('\n== Faza POST (după ce API-ul nou a pornit) ==');

  // 1. experienceSlug: rândurile vechi sunt toate din interfața „classic".
  //    Codul tratează NULL ca classic, dar cu valoarea scrisă rapoartele și
  //    filtrele pe interfață sunt corecte fără cazuri speciale.
  for (const table of ['generations', 'payments', 'analytics_sessions']) {
    if (!(await tableExists(table))) {
      skipped.push(`${table}.experienceSlug (tabel inexistent)`);
      continue;
    }
    if (!(await columnInfo(table, 'experienceSlug'))) {
      log(`  ! ${table}."experienceSlug" lipsește — a pornit API-ul nou? sar peste`);
      skipped.push(`${table}.experienceSlug (coloană inexistentă)`);
      continue;
    }
    await run(
      `${table}."experienceSlug" = 'classic' pe rândurile vechi`,
      `UPDATE ${table} SET "experienceSlug" = 'classic' WHERE "experienceSlug" IS NULL`,
    );
  }

  // 2. Refaceri gratuite. Vezi comentariul de la --legacy-remakes.
  if ((await tableExists('generations')) && (await columnInfo('generations', 'freeRemakeUsedCount'))) {
    if (legacyRemakes === 'freeze') {
      // Marcăm cota drept consumată (3 = maximul, Premium) pe TOATE comenzile
      // plătite de dinainte de deploy — nu doar pe cele care folosiseră deja o
      // refacere. Varianta care filtra pe `freeRemakeUsedAt IS NOT NULL` lăsa
      // descoperite tocmai comenzile fără refacere folosită, adică marea
      // majoritate, și nu îngheța nimic în practică.
      const { rows } = await q(
        `SELECT count(*)::int AS n FROM generations
          WHERE "paidUnlocked" = true AND COALESCE("freeRemakeUsedCount",0) < 3`,
      );
      log(`  comenzi plătite de dinainte de deploy, de înghețat: ${rows[0].n}`);
      await run(
        'îngheț cota de refaceri pe comenzile de dinainte de deploy',
        `UPDATE generations SET "freeRemakeUsedCount" = 3
          WHERE "paidUnlocked" = true AND COALESCE("freeRemakeUsedCount",0) < 3`,
      );
      log(
        '    (ca să le dai totuși cota nouă, pe un interval recent:\n' +
          '     UPDATE generations SET "freeRemakeUsedCount" = 0\n' +
          '     WHERE "paidUnlocked" = true AND "freeRemakeUsedAt" IS NULL\n' +
          '       AND "createdAt" > now() - interval \'30 days\';)',
      );
    } else {
      // Cine folosise deja o refacere pornește de la 1, ca să nu i se dea a doua
      // oară aceeași. Restul rămân pe 0 și primesc cota completă a pachetului.
      await run(
        'aliniez contorul la 1 pe comenzile care folosiseră deja o refacere',
        `UPDATE generations SET "freeRemakeUsedCount" = 1
          WHERE "freeRemakeUsedAt" IS NOT NULL AND COALESCE("freeRemakeUsedCount",0) = 0`,
      );
    }
  } else {
    skipped.push('generations.freeRemakeUsedCount (coloană inexistentă)');
  }

  // 3. musicEngine: toate site-urile rămân pe Suno. Comutarea pe Google e o
  //    decizie conștientă per site/design din admin, nu ceva ce migrăm automat.
  if (await columnInfo('sites', 'musicEngine')) {
    await run(
      "mă asigur că toate site-urile au musicEngine setat ('suno')",
      `UPDATE sites SET "musicEngine" = 'suno' WHERE "musicEngine" IS NULL OR "musicEngine" = ''`,
    );
  }
}


// ---------------------------------------------------------------------------
// ROLLOUT — umple golurile de configurare pe fiecare site (ca butonul din admin)
// ---------------------------------------------------------------------------
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** JWT de serviciu, semnat cu JWT_SECRET. AdminGuard cere doar `role=admin`. */
function adminToken() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET lipsește — nu pot semna un token de admin');
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Number(process.env.NOW_SECONDS || 0)) || Math.floor(Date.now() / 1000);
  const body = b64url(
    JSON.stringify({
      sub: process.env.OPS_ADMIN_USER_ID || '00000000-0000-0000-0000-000000000000',
      email: process.env.OPS_ADMIN_EMAIL || 'migrate-script@local',
      role: 'admin',
      iat: now,
      exp: now + 900,
    }),
  );
  const sig = b64url(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

async function phaseRollout() {
  log('\n== Faza ROLLOUT (umple golurile de configurare) ==');
  const base = (process.env.API_INTERNAL_URL || 'http://api:3000').replace(/\/+$/, '');
  const token = adminToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-site-id': 'all' };

  if (dryRun) {
    log(`  [dry-run] POST ${base}/api/admin/rollout/apply-all`);
    return;
  }

  const res = await fetch(`${base}/api/admin/rollout/apply-all`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (!res.ok) {
    log(`  ✗ ${res.status} ${text.slice(0, 400)}`);
    log('    (verifică API_INTERNAL_URL și JWT_SECRET; rulează scriptul din containerul api)');
    return;
  }
  let out = null;
  try {
    out = JSON.parse(text);
  } catch {
    /* răspuns neașteptat, îl arătăm ca text */
  }
  log(`  ✓ aplicat: ${out ? JSON.stringify(out).slice(0, 800) : text.slice(0, 800)}`);
  applied.push('rollout apply-all');
  log(
    '\n  NOTĂ: „Aplică lipsurile" umple doar câmpuri goale. Nu comută motorul pe\n' +
      '  Google și nu schimbă prețurile — alea rămân decizii conștiente per site.',
  );
}

// ---------------------------------------------------------------------------
// CHECK — raport, fără scrieri
// ---------------------------------------------------------------------------
async function phaseCheck() {
  log('\n== Raport ==');

  const trackInfo = await columnInfo('video_collages', 'track');
  if (trackInfo) {
    const len = Number(trackInfo.character_maximum_length);
    log(
      `  video_collages.track : varchar(${len}) ${
        len >= 64 ? '✓ pregătit' : '✗ RULEAZĂ --phase=pre ÎNAINTE de deploy'
      }`,
    );
  }

  for (const [table, col] of [
    ['generations', 'experienceSlug'],
    ['payments', 'experienceSlug'],
    ['analytics_sessions', 'experienceSlug'],
    ['generations', 'personId'],
    ['generations', 'packageSnapshot'],
    ['generations', 'freeRemakeUsedCount'],
    ['payments', 'personId'],
    ['payments', 'remakeForGenerationId'],
    ['guest_sessions', 'personId'],
    ['conversations', 'personId'],
    ['conversations', 'mergedIntoConversationId'],
    ['sites', 'experienceConfig'],
    ['sites', 'musicEngine'],
  ]) {
    if (!(await tableExists(table))) continue;
    const info = await columnInfo(table, col);
    if (!info) {
      log(`  ${table}.${col} : ✗ lipsește (API-ul nou nu a pornit încă)`);
      continue;
    }
    const { rows } = await q(`SELECT count(*)::int AS n FROM ${table} WHERE "${col}" IS NULL`);
    log(`  ${table}.${col} : ✓ există, ${rows[0].n} rânduri NULL`);
  }

  for (const t of ['identity_persons', 'identity_visitors']) {
    log(`  tabel ${t} : ${(await tableExists(t)) ? '✓ există' : '✗ lipsește (pornește API-ul nou)'}`);
  }

  // Configurarea per tenant — se face din admin /rollout, nu prin SQL.
  if (await columnInfo('sites', 'experienceConfig')) {
    const { rows } = await q(
      `SELECT domain, active,
              ("experienceConfig" IS NULL) AS no_config,
              COALESCE("musicEngine",'suno') AS engine
         FROM sites ORDER BY domain`,
    );
    log('\n  Site-uri:');
    for (const r of rows) {
      log(
        `    ${r.domain.padEnd(28)} ${r.active ? 'activ  ' : 'inactiv'} ` +
          `motor=${r.engine.padEnd(7)} ${r.no_config ? 'FĂRĂ experienceConfig → admin /rollout → „Aplică lipsurile"' : 'configurat'}`,
      );
    }
  }
}

await client.connect();
try {
  log(`Bază: ${client.database || process.env.PGDATABASE} @ ${client.host || process.env.PGHOST}`);
  if (dryRun) log('MOD DRY-RUN — nu se scrie nimic.');

  if (phase === 'pre') await phasePre();
  else if (phase === 'post') await phasePost();
  else if (phase === 'rollout') await phaseRollout();
  await phaseCheck();

  if (applied.length) log(`\nAplicate: ${applied.length}`);
  if (skipped.length) log(`Sărite: ${skipped.join(', ')}`);
  log('\nGata.');
} finally {
  await client.end();
}
