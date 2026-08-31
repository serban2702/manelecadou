---
name: powermail
description: >-
  Trimite și monitorizează emailuri prin PowerMail (platformă self-hosted peste
  Amazon SES). Folosește acest skill când utilizatorul cere trimiterea de
  emailuri tranzacționale sau de campanie, integrarea trimiterii de email
  într-o aplicație, verificarea livrării, investigarea unor bounce-uri sau
  plângeri de spam, gestionarea listei negre și a dezabonărilor, sau când
  întreabă de ce nu ajung emailurile. Declanșează și la mențiuni de tipul
  „trimite un email", „de ce a dat bounce", „adaugă pe lista neagră",
  „integrează PowerMail", „înlocuiește Mailgun/Resend/SendGrid".
---

# PowerMail

Platformă self-hosted de trimitere email peste Amazon SES, cu protecție automată
a reputației contului AWS.

**Instanța curentă:** `https://api.powermail.wingo.ro`
**Panou:** `https://powermail.wingo.ro`

---

## Înainte de orice

Cheia de API se ia din variabila de mediu `POWERMAIL_API_KEY`. Nu o cere
utilizatorului în clar și nu o scrie niciodată în cod, în loguri sau în
fișiere comise în git. Dacă lipsește, spune-i utilizatorului să o genereze din
panou → proiect → fila **Chei API**.

Formatul cheii: `pm_live_…`, legată de un singur proiect.

---

## Trimiterea unui email

```bash
curl -X POST https://api.powermail.wingo.ro/v1/emails \\
  -H "Authorization: Bearer $POWERMAIL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "client@exemplu.ro",
    "subject": "Bun venit!",
    "html": "<h1>Salut!</h1>",
    "idempotencyKey": "bun-venit-4821"
  }'
```

Răspunsul este **202** cu:

```json
{
  "id": "9f4c2b18-…",
  "status": "queued",
  "to": ["client@exemplu.ro"],
  "blocked": []
}
```

### Regula cea mai importantă de interpretare

Câmpul `blocked` **nu este o eroare**. Conține destinatarii eliminați pentru
că sunt pe lista neagră, dezabonați sau invalizi. Restul mesajului pleacă normal.

Când **toți** destinatarii sunt blocați, statusul devine `suppressed`, tot cu
răspuns 202. Nu trata asta ca eșec de integrare — sistemul tocmai a împiedicat
un bounce care ar fi afectat reputația contului AWS.

Când scrii cod de integrare, tratează `blocked` ca avertisment de logat, nu ca
excepție de aruncat.

---

## Câmpurile cererii

Obligatorii: `to`, `subject`, și unul dintre `html` / `text` / `template`.

Opționale des folosite:

- `from` — `"Nume <adresa@domeniu.ro>"`; implicit identitatea proiectului
- `cc`, `bcc`, `replyTo` — liste de adrese
- `tags` — `{"tip": "factura"}`, pentru filtrare în loguri
- `metadata` — date proprii, returnate în webhook-uri, nu ajung în email
- `attachments` — vezi mai jos
- `template` + `variables` — șablon Handlebars salvat în panou
- `scheduledAt` — ISO 8601, trimitere programată
- `idempotencyKey` — previne duplicatele 24 de ore
- `unsubscribeGroup` — categoria de dezabonare
- `ignoreSuppressions` — **doar** pentru mesaje critice de securitate

Limite: 50 destinatari per mesaj, 20 atașamente, 25 MB total.

---

## Atașamente

```json
{
  "attachments": [
    { "filename": "factura.pdf", "content": "<base64>", "contentType": "application/pdf" },
    { "filename": "logo.png", "url": "https://cdn.exemplu.ro/logo.png", "cid": "logo" }
  ]
}
```

Cu `cid`, imaginea devine inline și o referi în HTML cu `src="cid:logo"`.

---

## Validarea adreselor

Înainte de a salva o adresă în baza de date a aplicației, verific-o:

```bash
curl -X POST https://api.powermail.wingo.ro/v1/validate \\
  -H "Authorization: Bearer $POWERMAIL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "client@gmial.com"}'
```

```json
{
  "email": "client@gmial.com",
  "valid": false,
  "permanent": true,
  "code": "typo",
  "reason": "Domeniul „gmial.com” pare scris greșit.",
  "suggestion": "client@gmail.com"
}
```

Coduri: `ok`, `syntax`, `no_domain`, `no_mx`, `null_mx`, `reserved`, `typo`,
`disposable`, `role`, `unknown`.

**Nu bloca niciodată pe `unknown`** — înseamnă că DNS-ul nu a răspuns, nu că
adresa e greșită.

Când propui o corectură utilizatorului, folosește `suggestion`, dar cere-i
confirmarea; nu schimba adresa automat.

---

## Investigarea problemelor de livrare

Când utilizatorul întreabă „de ce nu a ajuns emailul", urmează ordinea asta:

**1. Caută mesajul**

```bash
curl "https://api.powermail.wingo.ro/v1/emails?recipient=client@exemplu.ro&limit=10" \\
  -H "Authorization: Bearer $POWERMAIL_API_KEY"
```

**2. Citește starea și firul de evenimente**

```bash
curl "https://api.powermail.wingo.ro/v1/emails/{id}" -H "Authorization: Bearer $POWERMAIL_API_KEY"
```

**3. Interpretează starea**

| Stare | Ce înseamnă și ce faci |
|---|---|
| `suppressed` | Adresa e pe lista neagră. Verifică motivul din `/v1/suppressions`. Dacă e `hard_bounce` sau `complaint`, **nu o scoate** — adresa chiar nu funcționează sau destinatarul a raportat spam. |
| `bounced` | Respins. Citește `diagnosticCode` din evenimente: e mesajul exact al serverului destinatar. |
| `complained` | Destinatarul a marcat mesajul ca spam. Nu retrimite. |
| `failed` | Eroare la trimitere. Verifică `error.message`. |
| `rejected` | Amazon a refuzat mesajul, de obicei pentru conținut. |
| `sent` fără `delivered` | Probabil nu sunt configurate evenimentele SES. Verifică panoul → Servicii → Amazon SES. |
| `queued` de mult timp | Worker-ul nu procesează sau proiectul e pe pauză. |

**4. Dacă nimic nu apare în loguri**, mesajul nu a fost niciodată acceptat:
verifică cheia de API, proiectul și identitatea de expediere.

---

## Lista neagră

```bash
# vezi ce e blocat
curl "https://api.powermail.wingo.ro/v1/suppressions?q=exemplu.ro" -H "Authorization: Bearer $POWERMAIL_API_KEY"

# blochează
curl -X POST https://api.powermail.wingo.ro/v1/suppressions \\
  -H "Authorization: Bearer $POWERMAIL_API_KEY" -H "Content-Type: application/json" \\
  -d '{"email": "adresa@exemplu.ro", "reason": "manual", "notes": "cerere GDPR"}'

# deblochează
curl -X DELETE "https://api.powermail.wingo.ro/v1/suppressions/adresa@exemplu.ro" \\
  -H "Authorization: Bearer $POWERMAIL_API_KEY"
```

**Avertizează utilizatorul înainte de deblocare** dacă motivul este
`hard_bounce` (adresa nu există) sau `complaint` (a raportat spam).
Retrimiterea în aceste cazuri crește direct riscul de suspendare a contului AWS.

### Domenii blocate

Separat de adrese, fiecare proiect are o listă de domenii interzise, pusă de om
din panou (*Proiect → Listă neagră → Domenii*). Nu se administrează din API.

Dacă vezi în `blocked` un element cu `reason: "blocked_domain"`, adresa a fost
oprită de o astfel de regulă — nu de un bounce. **Nu propune deblocarea**:
domeniul e acolo pentru că cineva a decis asta. Spune doar ce s-a întâmplat și
lasă decizia la om. Câmpul `detail` conține domeniul care a oprit trimiterea.

Regulile acoperă implicit și subdomeniile.

---

## Dezabonări

Antetele `List-Unsubscribe` și `List-Unsubscribe-Post` se adaugă automat.
Pentru sincronizare cu preferințele din aplicația utilizatorului:

```bash
curl -X POST https://api.powermail.wingo.ro/v1/unsubscribes \\
  -H "Authorization: Bearer $POWERMAIL_API_KEY" -H "Content-Type: application/json" \\
  -d '{"email": "client@exemplu.ro", "status": "unsubscribed", "group": "newsletter"}'
```

---

## Statistici

```bash
curl "https://api.powermail.wingo.ro/v1/stats?days=30" -H "Authorization: Bearer $POWERMAIL_API_KEY"
curl "https://api.powermail.wingo.ro/v1/stats/bounces?days=30" -H "Authorization: Bearer $POWERMAIL_API_KEY"
```

**Praguri de interpretare pe care trebuie să le semnalezi utilizatorului:**

- `bounceRate` peste **5%** — problemă serioasă; peste **10%** AWS poate suspenda contul
- `complaintRate` peste **0,1%** — îngrijorător; peste **0,5%** AWS suspendă contul
- `deliveryRate` sub **95%** — merită investigat

Când vezi rate mari, folosește `/v1/stats/bounces` ca să afli pe ce domenii
apar problemele. Un domeniu dominant indică de obicei o listă veche sau
cumpărată.

---

## Webhook-uri

Verificarea semnăturii, pe corpul **brut**:

```js
import crypto from 'node:crypto';

app.post('/webhooks/email',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const [t, v1] = req.headers['x-powermail-signature']
      .split(',').map((p) => p.split('=')[1]);

    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return res.status(401).end();

    const asteptat = crypto
      .createHmac('sha256', process.env.POWERMAIL_WEBHOOK_SECRET)
      .update(\`\${t}.\${req.body.toString()}\`)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(asteptat))) {
      return res.status(401).end();
    }

    const eveniment = JSON.parse(req.body.toString());
    // pune în coadă și răspunde imediat — ai 10 secunde
    res.sendStatus(200);
  });
```

Evenimente: `message.queued`, `message.sent`, `message.delivered`,
`message.delayed`, `message.bounced`, `message.complained`,
`message.rejected`, `message.failed`, `message.suppressed`,
`message.opened`, `message.clicked`, `contact.unsubscribed`.

---

## Când scrii cod de integrare

Aplică următoarele, fără să le mai ceri confirmare:

1. Cheia din variabilă de mediu, niciodată în sursă
2. `idempotencyKey` pentru orice email legat de o acțiune de business
3. `blocked` logat ca avertisment, nu aruncat ca excepție
4. Reîncercare doar pe 429 și 5xx, cu backoff exponențial
5. Timeout de 15 secunde pe cererea HTTP
6. Etichete (`tags`) pe fiecare tip de email, ca să poată fi filtrat mai târziu

Nu inventa câmpuri care nu sunt în acest document. Dacă utilizatorul cere ceva
ce API-ul nu oferă, spune-i clar și propune alternativa cea mai apropiată.

---

## Erori

| Cod | Ce faci |
|---|---|
| 400 | citește `message` — spune exact ce câmp e greșit |
| 401 | cheie lipsă, invalidă sau revocată |
| 403 | expeditor neautorizat, proiect pe pauză sau cotă atinsă |
| 413 | mesaj prea mare — redu atașamentele |
| 429 | prea multe cereri — backoff exponențial |
| 5xx | reîncearcă; dacă persistă, verifică `/health` |

Toate erorile au forma:

```json
{ "statusCode": 403, "error": "forbidden", "message": "…", "requestId": "req_…" }
```

Când raportezi o eroare utilizatorului, include `requestId` — cu el se poate
găsi cererea în logurile serverului.

---

## Ce să nu faci

- Nu folosi `ignoreSuppressions` decât pentru resetare parolă sau alerte de securitate
- Nu debloca adrese cu `hard_bounce` sau `complaint` fără avertisment explicit
- Nu sugera trimiterea către liste cumpărate sau colectate fără consimțământ
- Nu pune cheia de API în cod client (browser, aplicație mobilă)
- Nu trata `suppressed` ca eroare de integrare
