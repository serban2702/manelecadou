/**
 * Conexiunea Postgres pentru scripturile de operare.
 *
 * Există pentru că cele patru scripturi citeau doar `PG*`, în timp ce restul
 * stack-ului (compose, Dockerfile, `database.module.ts`) folosește `POSTGRES_*`.
 * Adică exact invocația scrisă în capul fiecărui script —
 * `docker compose exec api node scripts/<x>.mjs` — pica cu
 * „no PostgreSQL user name specified in startup packet", fiindcă în container
 * `PGUSER` nu există. Un eșec de conexiune în mijlocul unui cutover e ultimul
 * lucru de care ai nevoie, așa că acceptăm ambele convenții.
 *
 * Precedență: DATABASE_URL → PG* → POSTGRES_*.
 */
import pg from 'pg';

export function makePgClient() {
  if (process.env.DATABASE_URL) {
    return new pg.Client({ connectionString: process.env.DATABASE_URL });
  }
  return new pg.Client({
    host: process.env.PGHOST || process.env.POSTGRES_HOST || 'postgres',
    port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || 5432),
    user: process.env.PGUSER || process.env.POSTGRES_USER,
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
    database: process.env.PGDATABASE || process.env.POSTGRES_DB,
  });
}

/** Pentru mesaje de log: ce bază atingem, fără parolă. */
export function pgTarget() {
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      return `${u.pathname.replace(/^\//, '')} @ ${u.hostname}`;
    } catch {
      return 'DATABASE_URL';
    }
  }
  const db = process.env.PGDATABASE || process.env.POSTGRES_DB || '?';
  const host = process.env.PGHOST || process.env.POSTGRES_HOST || 'postgres';
  return `${db} @ ${host}`;
}
