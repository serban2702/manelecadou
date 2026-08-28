---
name: ops-payment
description: Investighează o plată — "mi s-au luat banii", plăți failed, plată reușită fără melodie livrată, reconciliere Stripe vs DB. Folosește când userul cere "verifică plata lui X", "clientul zice că a plătit", "de ce a eșuat plata", "banii s-au luat dar nu a primit nimic".
argument-hint: "<email / paymentId / providerSessionId>"
---

# Investigare plată

Cazul cel mai frecvent din chat (tema #1 în istoricul conversațiilor): clientul spune
„mi s-au luat banii" / „am plătit și nu am primit melodia". Cauzele tipice, în ordinea
frecvenței: (1) plata e `failed` dar banca a făcut pre-autorizare (banii apar „luați"
dar revin singuri), (2) plata e `paid` dar generarea a eșuat după, (3) emailul de
livrare nu a ajuns, (4) clientul a plătit cu alt email decât cel din chat.

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

1. **Găsește plata** (caută și după guest, și după user — vezi /ops-client pasul 1):
```sql
SELECT p.id, p.provider, p."providerSessionId", p.status, p.amount, p.currency,
       p."amountRonCents", p."failureReason", p."failureCode",
       p."userId", p."guestId", p."openReplaySessionId", p."createdAt"
FROM payments p
LEFT JOIN users u ON u.id = p."userId"
LEFT JOIN guest_sessions g ON g.id = p."guestId"
WHERE u.email ILIKE '%<email>%' OR g.email ILIKE '%<email>%'
   OR p.id::text = '<termen>' OR p."providerSessionId" = '<termen>'
ORDER BY p."createdAt" DESC;
```

2. **Interpretează statusul**:
   - `failed` + `failureCode` (ex. `card_declined`, `insufficient_funds`): banii NU au fost încasați. Pre-autorizarea dispare singură în 1-7 zile. Răspuns pentru client: banii revin automat, poate reîncerca cu alt card sau cere payment link în chat.
   - `paid`: banii sunt încasați → verifică livrarea (pasul 3).
   - `pending` mai vechi de 1h: sesiune Stripe abandonată — clientul nu a finalizat.

3. **Pentru `paid`: verifică lanțul de livrare**:
```sql
-- generarea legată de plată
SELECT id, status, "paidUnlocked", "audioUrl" IS NOT NULL AS are_audio,
       LEFT(error, 100) AS error, "retryCount", "autoRetryCount", "createdAt"
FROM generations WHERE "paymentId" = '<paymentId>' OR id::text = '<idDinPayload>';
-- emailul de livrare a plecat?
SELECT subject, "to", status, "createdAt" FROM mail_messages
WHERE "to" ILIKE '%<email>%' ORDER BY "createdAt" DESC LIMIT 10;
```
   (Dacă tabela de mail are alt nume, descoperă cu `\dt mail*`.)

4. **Verifică în Stripe** dacă e nevoie de adevărul absolut (webhook pierdut etc.):
   nu ai acces direct la Stripe API din ops — raportează `providerSessionId` și
   recomandă verificare în dashboard.stripe.com, SAU verifică ce a primit webhook-ul
   în loguri: `grep <providerSessionId> /workspace/../...` nu e disponibil — folosește
   tabela `payments` + `error_logs` din jurul timestamp-ului.

5. **Acțiuni de remediere** (cere confirmare înainte de oricare):
   - Generare failed după plată → `/ops-regen` cu target `overwrite` (re-rulează comanda).
   - Generare blocată în `pending`/`processing` → `deploy/prod.sh api POST /api/admin/generations/<id>/retry`.
   - Email de livrare lipsă dar piesa există → caută endpoint-ul de resend în admin API (`deploy/prod.sh api GET /api/admin/...`) sau marchează pentru trimitere manuală din admin UI.
   - **Refund: NICIODATĂ automat.** Doar raportezi situația + recomanzi; refund-ul se face manual din Stripe dashboard de către om.

## Raport final

Verdict într-o propoziție („banii NU au fost încasați — card declined de 3 ori") +
cronologie + acțiunea recomandată + ce să-i răspundă clientului în chat (formulare
gata de copiat, ton prietenos, fără promisiuni de refund).
