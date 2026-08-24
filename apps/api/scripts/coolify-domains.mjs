#!/usr/bin/env node
/**
 * Lista de domenii pentru câmpul „Domains" al serviciului `router` din Coolify.
 *
 * Ține locul lui `on_demand_tls` din Caddy: Traefik nu emite certificate pentru
 * domenii pe care nu le știe, deci fiecare domeniu activ trebuie să apară acolo.
 *
 *   docker compose -f docker-compose.coolify.yml exec api node scripts/coolify-domains.mjs
 *
 * Conexiunea: PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (sau DATABASE_URL).
 * Opțional:
 *   ADMIN_DOMAIN=admin.manelecadou.ro     îl adaugă la listă
 *   DEFAULT_SITE_DOMAIN=manelecadou.ro    (informativ; www se propune oricum)
 *   CURRENT_DOMAINS="a.ro,b.ro"           compară cu ce e deja în Coolify
 *   WWW_VARIANTS=0                        nu propune deloc variantele `www.`
 *   SKIP_DNS=1                            nu verifica DNS-ul (rulare offline)
 *
 * NU scrie nimic — nici în baza de date, nici în Coolify. Doar afișează lista,
 * ca s-o lipești în UI. E intenționat: o greșeală în câmpul ăla scoate site-uri
 * de pe internet, deci pasul rămâne al tău.
 */
import pg from 'pg';
import { resolve4, resolve6 } from 'dns/promises';

const adminDomain = (process.env.ADMIN_DOMAIN || '').trim().toLowerCase();
const defaultDomain = (process.env.DEFAULT_SITE_DOMAIN || '').trim().toLowerCase();
const wwwVariants = process.env.WWW_VARIANTS !== '0';
const skipDns = process.env.SKIP_DNS === '1';
const current = (process.env.CURRENT_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
  .filter(Boolean);

const client = process.env.DATABASE_URL
  ? new pg.Client({ connectionString: process.env.DATABASE_URL })
  : new pg.Client({
      host: process.env.PGHOST || 'postgres',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

await client.connect();
let rows;
try {
  // Aceleași condiții pe care le folosea endpoint-ul `/api/internal/caddy/ask`.
  ({ rows } = await client.query(
    `SELECT domain, active, "sslEnabled", "hiddenMode"
       FROM sites
      WHERE domain IS NOT NULL AND domain <> ''
      ORDER BY domain`,
  ));
} finally {
  await client.end();
}

const wanted = [];
const skipped = [];
for (const r of rows) {
  const d = String(r.domain).trim().toLowerCase();
  if (!d) continue;
  if (d.endsWith('.local')) {
    skipped.push([d, 'domeniu local de dev']);
    continue;
  }
  if (!r.active) {
    skipped.push([d, 'site inactiv']);
    continue;
  }
  if (!r.sslEnabled) {
    skipped.push([d, 'sslEnabled = false']);
    continue;
  }
  wanted.push(d);
  // `www.` pentru TOATE domeniile, nu doar pentru cel principal.
  // Verificat pe producție (24 aug 2026): www.chalgapodarok.bg și
  // www.doroparaggelia.gr răspund azi cu 200 — Caddy le lua automat prin
  // on_demand_tls. Traefik nu ghicește nimic: dacă nu sunt în listă, cele două
  // site-uri pică pe www după cutover. Verificarea DNS de mai jos taie
  // variantele care chiar nu există, ca să nu cerem certificate degeaba.
  if (wwwVariants && !d.startsWith('www.')) wanted.push(`www.${d}`);
}
if (adminDomain) wanted.push(adminDomain);

const candidates = [...new Set(wanted)].sort();

/** Are domeniul un A/AAAA? Fără DNS, Traefik cere un certificat care nu se poate emite. */
async function resolves(domain) {
  if (skipDns) return true;
  for (const fn of [resolve4, resolve6]) {
    try {
      const a = await fn(domain);
      if (a.length) return true;
    } catch {
      /* încercăm și celălalt tip */
    }
  }
  return false;
}

const checks = await Promise.all(candidates.map(async (d) => [d, await resolves(d)]));
const list = checks.filter(([, ok]) => ok).map(([d]) => d);
const noDns = checks.filter(([, ok]) => !ok).map(([d]) => d);

console.log(`\n${list.length} domenii pentru serviciul \`router\`:\n`);
console.log(list.map((d) => `https://${d}`).join(',\n'));

if (noDns.length) {
  console.log(
    `\nFără DNS acum (${noDns.length}) — LĂSATE PE DINAFARĂ, ca Traefik să nu ceară\n` +
      'certificate imposibile și să nu ne apropiem de limitele Let\'s Encrypt.\n' +
      'Adaugă-le după ce pui A record:',
  );
  for (const d of noDns) console.log(`  ${d}`);
}

if (skipped.length) {
  console.log('\nSărite:');
  for (const [d, why] of skipped) console.log(`  ${d.padEnd(30)} ${why}`);
}

if (current.length) {
  const missing = list.filter((d) => !current.includes(d));
  const extra = current.filter((d) => !list.includes(d));
  console.log('\nFață de ce e acum în Coolify:');
  console.log(`  de adăugat: ${missing.length ? missing.join(', ') : 'nimic'}`);
  console.log(`  în plus:    ${extra.length ? extra.join(', ') : 'nimic'}`);
  if (missing.length) {
    console.log(
      '\n  Domeniile lipsă nu au certificat, deci site-urile lor nu răspund pe HTTPS.',
    );
  }
}

console.log(
  '\nDe lipit în Coolify → resursa stack-ului → serviciul `router` → Domains.\n' +
    'Traefik cere certificate doar pentru domeniile cu A record deja mutat;\n' +
    'pe cele nemutate încă, emiterea eșuează și se reia singură după DNS.\n',
);
