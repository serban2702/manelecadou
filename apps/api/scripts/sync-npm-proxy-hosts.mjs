#!/usr/bin/env node
/**
 * Creează/actualizează Proxy Host-urile din Nginx Proxy Manager pentru fiecare
 * domeniu de site din DB. Ține locul lui `on_demand_tls` din Caddy: NPM nu
 * poate cere certificate la cerere, deci domeniile trebuie înregistrate.
 *
 * Toate ajung pe același upstream — containerul `router` — care face split-ul
 * pe path (/api, /socket.io, /health, /uploads → api; restul → web).
 *
 *   NPM_URL=http://127.0.0.1:81 \
 *   NPM_EMAIL=admin@example.com NPM_PASSWORD=... \
 *   PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=... \
 *   node scripts/sync-npm-proxy-hosts.mjs
 *
 * Opțiuni (env):
 *   NPM_FORWARD_HOST=router      numele containerului router în rețeaua NPM
 *   NPM_FORWARD_PORT=80
 *   NPM_ADMIN_DOMAIN=admin.manelecadou.ro   proxy host separat (același upstream)
 *   NPM_CERT_EMAIL=...           emailul pentru Let's Encrypt (default NPM_EMAIL)
 *   NPM_DRY_RUN=1                doar raportează
 *   NPM_DOMAINS=a.ro,b.ro        sări peste DB și folosește lista asta
 *
 * Idempotent. Un domeniu care are deja proxy host e lăsat în pace, doar i se
 * corectează upstream-ul dacă diferă. Certificatul se cere doar dacă lipsește
 * (dacă DNS-ul nu e încă mutat, Let's Encrypt eșuează — scriptul continuă cu
 * restul domeniilor și raportează la final).
 */
import pg from 'pg';

const NPM_URL = (process.env.NPM_URL || 'http://127.0.0.1:81').replace(/\/+$/, '');
const NPM_EMAIL = process.env.NPM_EMAIL || '';
const NPM_PASSWORD = process.env.NPM_PASSWORD || '';
const FORWARD_HOST = process.env.NPM_FORWARD_HOST || 'router';
const FORWARD_PORT = Number(process.env.NPM_FORWARD_PORT || 80);
const ADMIN_DOMAIN = process.env.NPM_ADMIN_DOMAIN || '';
const CERT_EMAIL = process.env.NPM_CERT_EMAIL || NPM_EMAIL;
const DRY_RUN = process.env.NPM_DRY_RUN === '1';

if (!NPM_EMAIL || !NPM_PASSWORD) {
  console.error('Lipsesc NPM_EMAIL / NPM_PASSWORD (userul de admin din Nginx Proxy Manager).');
  process.exit(1);
}

// Config custom per proxy host. Websocket-ul îl bifăm separat; astea sunt
// pentru upload-uri mari (mostre audio, poze de colaj) și pentru SSE.
const ADVANCED_CONFIG = [
  'client_max_body_size 200M;',
  'proxy_buffering off;',
  'proxy_request_buffering off;',
  'proxy_read_timeout 600s;',
  'proxy_send_timeout 600s;',
].join('\n');

async function npm(path, init = {}, token = '') {
  const res = await fetch(`${NPM_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = body?.error?.message || body?.message || text || res.statusText;
    throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${msg}`);
  }
  return body;
}

async function login() {
  const out = await npm('/tokens', {
    method: 'POST',
    body: JSON.stringify({ identity: NPM_EMAIL, secret: NPM_PASSWORD }),
  });
  if (!out?.token) throw new Error('login NPM eșuat — verifică NPM_EMAIL/NPM_PASSWORD');
  return out.token;
}

async function domainsFromDb() {
  if (process.env.NPM_DOMAINS) {
    return process.env.NPM_DOMAINS.split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  }
  const client = new pg.Client({
    host: process.env.PGHOST || 'postgres',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
  await client.connect();
  try {
    // Aceleași condiții ca endpoint-ul /api/internal/caddy/ask.
    const { rows } = await client.query(
      `SELECT domain FROM sites
        WHERE active = true AND "sslEnabled" = true AND domain IS NOT NULL AND domain <> ''
        ORDER BY domain`,
    );
    const out = [];
    for (const r of rows) {
      const d = String(r.domain).trim().toLowerCase();
      if (!d || d.includes('.local')) continue;
      out.push(d);
      // Site-ul principal are și www; pentru restul nu presupunem nimic.
      if (d === (process.env.DEFAULT_SITE_DOMAIN || '').toLowerCase()) out.push(`www.${d}`);
    }
    return [...new Set(out)];
  } finally {
    await client.end();
  }
}

function desiredHost(domains) {
  return {
    domain_names: domains,
    forward_scheme: 'http',
    forward_host: FORWARD_HOST,
    forward_port: FORWARD_PORT,
    allow_websocket_upgrade: true,
    block_exploits: true,
    caching_enabled: false,
    http2_support: true,
    hsts_enabled: true,
    hsts_subdomains: false,
    ssl_forced: true,
    advanced_config: ADVANCED_CONFIG,
    locations: [],
    meta: { letsencrypt_agree: true, dns_challenge: false },
  };
}

const token = await login();
const existing = await npm('/nginx/proxy-hosts', {}, token);
const byDomain = new Map();
for (const host of existing) for (const d of host.domain_names || []) byDomain.set(d.toLowerCase(), host);

const siteDomains = await domainsFromDb();
const all = ADMIN_DOMAIN ? [...siteDomains, ADMIN_DOMAIN.toLowerCase()] : siteDomains;
if (!all.length) {
  console.log('Niciun domeniu de sincronizat.');
  process.exit(0);
}

console.log(`${DRY_RUN ? '[dry-run] ' : ''}${all.length} domenii → ${FORWARD_HOST}:${FORWARD_PORT}`);

const created = [];
const updated = [];
const certFailed = [];
const skipped = [];

for (const domain of all) {
  const found = byDomain.get(domain);
  try {
    if (found) {
      const needsFix =
        found.forward_host !== FORWARD_HOST ||
        Number(found.forward_port) !== FORWARD_PORT ||
        !found.allow_websocket_upgrade;
      if (!needsFix) {
        skipped.push(domain);
        continue;
      }
      if (DRY_RUN) {
        updated.push(domain);
        continue;
      }
      await npm(
        `/nginx/proxy-hosts/${found.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...desiredHost(found.domain_names),
            certificate_id: found.certificate_id || 0,
            ssl_forced: !!found.certificate_id,
          }),
        },
        token,
      );
      updated.push(domain);
      continue;
    }

    if (DRY_RUN) {
      created.push(domain);
      continue;
    }

    // 1. proxy host fără TLS (ca să răspundă la HTTP-01 challenge)
    const host = await npm(
      '/nginx/proxy-hosts',
      {
        method: 'POST',
        body: JSON.stringify({
          ...desiredHost([domain]),
          certificate_id: 0,
          ssl_forced: false,
          hsts_enabled: false,
          http2_support: false,
        }),
      },
      token,
    );
    created.push(domain);

    // 2. certificat Let's Encrypt. Dacă DNS-ul nu e mutat încă, pică — proxy
    //    host-ul rămâne creat și reiei scriptul după ce muți A record-ul.
    try {
      const cert = await npm(
        '/nginx/certificates',
        {
          method: 'POST',
          body: JSON.stringify({
            provider: 'letsencrypt',
            nice_name: domain,
            domain_names: [domain],
            meta: { letsencrypt_email: CERT_EMAIL, letsencrypt_agree: true, dns_challenge: false },
          }),
        },
        token,
      );
      await npm(
        `/nginx/proxy-hosts/${host.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ ...desiredHost([domain]), certificate_id: cert.id, ssl_forced: true }),
        },
        token,
      );
    } catch (e) {
      certFailed.push(`${domain}: ${e.message}`);
    }
  } catch (e) {
    certFailed.push(`${domain}: ${e.message}`);
  }
}

console.log(`create=${created.length} actualizate=${updated.length} neschimbate=${skipped.length}`);
if (created.length) console.log(`  noi: ${created.join(', ')}`);
if (updated.length) console.log(`  fix upstream: ${updated.join(', ')}`);
if (certFailed.length) {
  console.error('\nCertificate/erori (reia scriptul după ce muți DNS-ul):');
  for (const f of certFailed) console.error(`  ${f}`);
  process.exit(1);
}
