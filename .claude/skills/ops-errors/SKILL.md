---
name: ops-errors
description: Triaj și investigare erori din producție — top erori recente, corelare cu sesiuni OpenReplay, generări eșuate, loguri Suno. Folosește când userul cere "ce erori avem", "investighează erorile", "de ce pică generările", "ce s-a întâmplat azi-noapte pe site".
argument-hint: "[perioadă / pattern / generationId]"
---

# Triaj erori producție

## Mediu de execuție

- **Container ops (VPS)**: `psql` direct; loguri API în `/workspace`-adjacent nu sunt
  accesibile — folosește tabelele DB (error_logs, suno_logs) care au tot.
- **Local (Mac)**: `ssh VPSIonos 'docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -c "..."'`
  plus `make logs-api` pentru loguri live.

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
local + `make deploy`, nu pe VPS — propune-le doar.
