---
name: ops-errors
description: Triaj și investigare erori din producție — top erori recente, corelare cu sesiuni OpenReplay, generări eșuate, loguri Suno. Folosește când userul cere "ce erori avem", "investighează erorile", "de ce pică generările", "ce s-a întâmplat azi-noapte pe site".
argument-hint: "[perioadă / pattern / generationId]"
---

# Triaj erori producție

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

Pentru loguri live: `deploy/prod.sh logs api 200`. Tot ce contează la triaj e
oricum în DB (`error_logs`, `suno_logs`), care supraviețuiește restartului
containerului — logurile nu.

## Pași

1. **Top erori pe perioadă** (default 24h — ajustează după cerere):
```sql
SELECT LEFT(message, 90) AS err, source, COUNT(*) AS n,
       MAX("createdAt") AS ultima, COUNT(DISTINCT "openReplaySessionId") AS sesiuni
FROM error_logs
WHERE "createdAt" > now() - interval '24 hours'
GROUP BY LEFT(message, 90), source ORDER BY n DESC LIMIT 20;
```

2. **Filtrează zgomotul cunoscut** înainte să tragi concluzii:
   - `ThrottlerException: Too Many Requests` — rate limiting, majoritar boți/scannere.
     Devine interesant doar dacă volumul explodează brusc sau lovește path-uri legitime.
   - `Cannot GET/POST /api/auth*`, `/api/users/me` fără sesiune — scannere/boți.
   - `Script error.` — erori JS cross-origin opace din browsere vechi.
   Restul (mai ales `Generation indisponibilă`, erori Suno, CORS pe domenii proprii,
   erori de plată) sunt SEMNAL — investighează.

3. **Detaliu pe o eroare** + context complet:
```sql
SELECT id, message, stack, source, url, "userAgent", "siteId",
       "openReplaySessionId", "createdAt"
FROM error_logs
WHERE message ILIKE '%<pattern>%'
ORDER BY "createdAt" DESC LIMIT 10;
```
   (Coloanele pot diferi — `\d error_logs` dacă ceva lipsește.)

4. **Replay vizual**: pentru fiecare eroare cu `openReplaySessionId`, dă link
   `https://openreplay.manelecadou.ro/sessions/<id>` — userul vede exact ce a făcut
   clientul (DOM + network + console).

5. **Generări eșuate + cauza Suno**:
```sql
SELECT id, status, "retryCount", "autoRetryCount", LEFT(error, 150) AS error,
       "nextRetryAt", "createdAt"
FROM generations
WHERE status IN ('failed','error') OR (status='pending' AND "createdAt" < now() - interval '30 min')
ORDER BY "createdAt" DESC LIMIT 20;
-- cauza brută de la furnizor:
SELECT * FROM suno_logs WHERE "generationId" = '<id>' ORDER BY "createdAt" DESC LIMIT 5;
```
   (`\d suno_logs` pentru coloanele exacte la prima rulare.)

6. **Marchează rezolvate** doar la cererea userului (UPDATE pe error_logs cu
   confirmare, conform regulilor din /ops-db).

## Raport final

Grupat pe: 🔴 acțiune necesară acum / 🟡 de urmărit / ⚪ zgomot. Pentru fiecare
problemă reală: ce e, câți clienți afectează, link replay, cauza probabilă din cod
(citește din /workspace dacă ajută) și fix-ul recomandat. Fix-urile de COD se fac
local + `make deploy-coolify`, nu pe server — propune-le doar.
