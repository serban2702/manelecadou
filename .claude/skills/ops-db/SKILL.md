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

Producția e pe **Coolify (OVH)** din 28 august 2026. Accesul trece prin
`deploy/prod.sh` din repo. **Nu folosi `ssh VPSIonos`**: duce la baza înghețată în
ziua mutării — interogările răspund frumos, cu date vechi de luni de zile, iar o
scriere „repară" o comandă pe care n-o mai citește nimeni.

```bash
deploy/prod.sh psql     "SELECT ..."   # output tabelar, pentru citit
deploy/prod.sh psql-tsv "SELECT ..."   # separat cu | — pentru parsat
deploy/prod.sh api GET  /api/admin/...
deploy/prod.sh api POST /api/admin/... '{"json":true}'
```

SQL-ul și JSON-ul sunt transmise base64 până la destinație, deci ghilimelele,
apostrofurile și diacriticele ajung intacte. Scrie-le normal, fără escape-uri.

> **Rolul read-only `claude_ops` nu mai există.** Pe Ionos exista un rol fără DDL,
> ca plasă de siguranță. Pe stack-ul nou `deploy/prod.sh` se conectează cu
> utilizatorul aplicației, care poate face **orice**, inclusiv `DROP TABLE`.
> Singura plasă rămasă e procedura de mai jos. Respect-o literal.

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
- **Niciodată** UPDATE/DELETE fără WHERE. Niciodată TRUNCATE/DROP/ALTER — de data
  asta chiar ai voie tehnic (vezi avertismentul de sus), deci regula te ține doar pe
  tine. Schimbările de schemă se fac prin entități + deploy, nu de aici.
- Backup: Coolify rulează unul zilnic la 03:00 UTC pe resursa de bază (retenție 14
  fișiere / 30 de zile), restaurabil din UI → Databases → Backups. Înainte de o
  operație mare, ia-ți unul proaspăt al tău: `deploy/prod.sh dump` îl descarcă local.
  Restaurarea se face din UI-ul Coolify, nu de aici.
