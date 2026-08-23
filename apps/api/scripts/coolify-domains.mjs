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
 *   DEFAULT_SITE_DOMAIN=manelecadou.ro    adaugă și varianta `www.`
 *   CURRENT_DOMAINS="a.ro,b.ro"           compară cu ce e deja în Coolify
 *
 * NU scrie nimic — nici în baza de date, nici în Coolify. Doar afișează lista,
 * ca s-o lipești în UI. E intenționat: o greșeală în câmpul ăla scoate site-uri
 * de pe internet, deci pasul rămâne al tău.
 */
import pg from 'pg';

const adminDomain = (process.env.ADMIN_DOMAIN || '').trim().toLowerCase();
const defaultDomain = (process.env.DEFAULT_SITE_DOMAIN || '').trim().toLowerCase();
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
  // Site-ul principal are și www. Pentru restul nu presupunem nimic.
  if (defaultDomain && d === defaultDomain) wanted.push(`www.${d}`);
}
if (adminDomain) wanted.push(adminDomain);

const list = [...new Set(wanted)].sort();

console.log(`\n${list.length} domenii pentru serviciul \`router\`:\n`);
console.log(list.map((d) => `https://${d}`).join(',\n'));

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
