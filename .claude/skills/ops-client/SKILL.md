---
name: ops-client
description: Dosar complet client (360°) după email/nume/ID — user/guest, plăți (inclusiv eșuate), generări cu status, conversații chat, erori corelate. Folosește când userul cere "caută clientul X", "ce s-a întâmplat cu comanda lui Y", "de ce nu a primit melodia", "i s-au luat banii", "ce a pățit clientul".
argument-hint: "<email / nume / generationId>"
---

# Dosar client 360°

Construiește imaginea completă a unui client pornind de la email, nume sau un ID (generation/payment/conversation). Scopul: să răspunzi în câteva secunde la „ce s-a întâmplat cu acest client?".

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

## Pași

1. **Găsește identitatea** (user sau guest). Caută larg — clienții greșesc des emailul:
```sql
SELECT id, email, name, role, "siteId", "createdAt" FROM users
WHERE email ILIKE '%<termen>%' OR name ILIKE '%<termen>%' ORDER BY "createdAt" DESC LIMIT 10;
-- și în guest_sessions (comenzile fără cont):
SELECT id, email, "siteId", "createdAt" FROM guest_sessions
WHERE email ILIKE '%<termen>%' ORDER BY "createdAt" DESC LIMIT 10;
```

2. **Plățile** — TOATE, inclusiv eșuate (atenție: multe plăți `failed` înseamnă clientul a încercat repetat — frustrare mare):
```sql
SELECT id, provider, status, amount, currency, "failureReason", "failureCode",
       "userId", "guestId", "createdAt"
FROM payments
WHERE "userId" = '<id>' OR "guestId" = '<id>'
ORDER BY "createdAt" DESC;
```

3. **Generările** — cu statusuri și erori:
```sql
SELECT id, status, type, "recipientName", style, occasion, "voiceArtist",
       "packageTier", "paidUnlocked", "retryCount", "autoRetryCount",
       LEFT(error, 80) AS error, "paymentId", "parentGenerationId",
       "freeRemakeUsedAt", "openReplaySessionId", "createdAt"
FROM generations
WHERE "ownerUserId" = '<id>' OR "ownerGuestId" = '<id>'
ORDER BY "createdAt" DESC;
```

4. **Conversațiile chat** (ce a zis clientul, ce a promis Irina):
```sql
SELECT c.id, c."aiMode", c."createdAt" FROM conversations c
WHERE c."userId" = '<id>' OR c."guestId" = '<id>';
-- apoi mesajele:
SELECT "authorRole", LEFT(COALESCE("bodyRo", body), 150) AS msg, "messageType", "createdAt"
FROM chat_messages WHERE "conversationId" = '<convId>' AND "deletedAt" IS NULL
ORDER BY "createdAt" ASC;
```

5. **Erori corelate** (după `openReplaySessionId` din payments/generations, sau pe email în mesaj):
```sql
SELECT LEFT(message, 100), source, "createdAt", "openReplaySessionId"
FROM error_logs
WHERE "openReplaySessionId" IN ('<sid1>', '<sid2>') ORDER BY "createdAt" DESC LIMIT 20;
```

## Raportul final

Prezintă cronologic și concis:
- **Cine**: email, site, user/guest, de când.
- **Banii**: ce a plătit (paid), ce a încercat și a eșuat (failed + failureReason) — sumă, monedă, dată.
- **Piesele**: fiecare generare cu status; dacă `status='failed'` sau `pending` vechi → semnalează explicit.
- **Conversația**: ce a cerut clientul, ce i s-a promis (mai ales de Irina — verifică promisiuni de refund/regenerare).
- **Replay**: linkuri `https://openreplay.manelecadou.ro/sessions/<openReplaySessionId>` pentru sesiunile relevante.
- **Diagnostic + acțiune recomandată** (ex.: „plata e paid dar generarea e failed cu eroare Suno → folosește /ops-regen" sau „3 plăți failed cu card_declined → clientul nu poate plăti, trimite-i payment link din chat").

NU modifica nimic din acest skill — e read-only. Pentru acțiuni, folosește /ops-regen sau /ops-db.
