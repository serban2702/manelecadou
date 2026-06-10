---
name: ops-db
description: Interogări și modificări controlate pe baza de date de producție manelecadou — SELECT liber, UPDATE/DELETE doar cu confirmare și plasă de siguranță. Folosește când userul cere "dă un query pe DB", "modifică în baza de date", "corectează emailul clientului", "șterge rândul X", "câte comenzi avem pe site-ul Y".
argument-hint: "<ce vrei să afli sau să modifici>"
---

# DB producție — reguli de lucru

Rolul `claude_ops` are SELECT/INSERT/UPDATE/DELETE pe schema `public`, fără DDL.
Schema NU se modifică de aici niciodată (TypeORM synchronize o face din entități,
la deploy — vezi CLAUDE.md §6.2).

## Mediu de execuție

- **Container ops (VPS)**: `psql` e configurat din env (PGHOST/PGUSER/PGDATABASE) —
  rulează direct `psql -c "..."`.
- **Local (Mac)**: `ssh VPSIonos 'docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -c "..."'`
  (user-ul aplicației — și mai multă grijă).

## Citire (liberă)

- SELECT-uri fără restricții. Pentru explorare: `\dt` (tabele), `\d+ <tabel>` (coloane).
- Folosește mereu `LIMIT` la explorare și `COUNT(*)` înainte de listări mari.
- Coloanele camelCase cer ghilimele: `"createdAt"`, `"siteId"`, `"ownerUserId"`.
- Multi-tenant: aproape orice tabel are `"siteId"` — când userul vorbește de un site
  anume, filtrează (`SELECT id, domain FROM sites` pentru mapare).

## Scriere (procedură OBLIGATORIE, fără excepții)

1. **Arată întâi ce va fi afectat** — rulează SELECT-ul echivalent și prezintă rândurile.
2. **Anunță numărul de rânduri** și exact ce se schimbă (înainte → după).
3. **Cere confirmare explicită** („da" de la user). Nu te baza pe confirmări anterioare
   din aceeași conversație pentru alte rânduri.
4. **Execută în tranzacție cu RETURNING**:
```sql
BEGIN;
UPDATE users SET email = 'corect@example.com'
WHERE id = '...' RETURNING id, email;
-- verifici output-ul: exact rândurile așteptate? → COMMIT; altfel → ROLLBACK;
COMMIT;
```
5. **Arată starea finală** (SELECT după).

## Praguri suplimentare

- **> 20 de rânduri afectate** → avertizează explicit și cere a doua confirmare.
- **DELETE** → propune întâi alternativa soft (multe tabele au `deletedAt` /
  `active` / status) — ștergerea fizică e ultima opțiune.
- **Tabele sensibile** (`payments`, `app_settings`, `sites`, `users.role`) →
  explică impactul business înainte (ex.: modificarea unui payment falsifică
  raportarea financiară; preferă corectarea sursei, nu a efectului).
- **Niciodată** UPDATE/DELETE fără WHERE. Niciodată TRUNCATE/DROP/ALTER (rolul
  oricum nu are voie — dacă pare necesar, problema se rezolvă prin entități + deploy).
- Înainte de operații cu risc, există backup zilnic 03:00 UTC în `/backups` pe VPS;
  pentru operații mari poți cere un backup manual întâi
  (`ssh VPSIonos` → `docker exec manele-postgres-1 pg_dump ... | gzip > /backups/manual_<TS>.sql.gz`
  — din container ops nu ai acces la docker, cere userului sau fă-o din local).
