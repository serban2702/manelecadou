# Adăugare site nou (domeniu)

Acest tutorial descrie cum adaugi un site nou în platforma multi-tenant — local pentru testare și pe producție.

## Ce înseamnă „un site"

Un site = un domeniu separat (ex. `manele-bg.com`) cu propriile setări:
- limbă (`locale`)
- valută + preț (`currency`, `basePriceCents`, `giftPriceCents`)
- branding (logo, culori, tagline)
- prompt Suno specific (chalga BG, turbofolk RS, arabesk TR, etc.)
- traduceri UI separate (`apps/web/messages/<locale>.json`)
- SEO (sitemap, robots, og:locale) generat automat

Toate site-urile rulează din **același backend + DB**, partiționate prin `siteId`.

---

## Pași — LOCAL (testare cu domeniu fictiv `*.local`)

### 1. Pornește stack-ul (dacă nu rulează)
```bash
cd ~/Desktop/Manele/Manele\ cadou/manelecadou
docker compose up -d
cd apps/web && pnpm dev &
cd apps/admin && pnpm dev &
```

### 2. Mapează domeniul în `/etc/hosts`
Editează `/etc/hosts` (necesită sudo):
```bash
sudo sh -c 'echo "127.0.0.1 manele-NEW.local" >> /etc/hosts'
```
Înlocuiește `manele-NEW.local` cu domeniul tău (ex. `manele-gr.local`).

### 3. Creează fișierul de traduceri (dacă locale-ul nu există)
Verifică `apps/web/messages/`. Dacă nu există fișier pentru locale-ul tău (ex. `el.json` pentru greacă), copiază din `ro.json` și tradu:
```bash
cp apps/web/messages/ro.json apps/web/messages/el.json
# Editează apps/web/messages/el.json — tradu toate stringurile
```

### 4. Creează site-ul în admin
- Loghează-te în admin: http://localhost:1505/login
- Mergi la **/sites** → **„Adaugă site"**
- Completează:
  - **Slug**: identificator unic (ex. `gr`)
  - **Domain**: `manele-gr.local` (fără protocol)
  - **Name**: nume afișat (ex. `Manele Greece`)
  - **Locale**: cod limbă ISO (`el`, `bg`, `sr`, `tr`, `hr`, `sl`, `bs`, `sq`, `mk`)
  - **Currency**: cod ISO (`EUR`, `RON`, `BGN`, `RSD`, `TRY`)
  - **Base price** (cents) și **Gift price** (cents)
  - **Brand** — culori, logo URL, tagline (opțional)
  - **Suno**:
    - `basePrompt` — descriere genul muzical local (ex. pentru EL: laiko/skyladiko)
    - `stylePromptMap` — JSON cu override per stil (`clasic`, `modern`, etc.) dacă vrei
    - `lyricsLocale` — codul de limbă pentru lyrics (default = `locale`)
    - `writerSystemPrompt` — system prompt pentru OpenAI (cum scrie versurile)
- Salvează. Site-ul apare imediat ca activ.

### 5. Testează
```bash
# Site config răspunde cu noua intrare
curl http://localhost:1501/api/public/site -H 'Host: manele-gr.local'

# Frontend pe domeniul nou
open http://manele-gr.local:1500
```
Schimbă selectorul din admin pe noul site → toate paginile filtrează datele lui.

---

## Pași — PRODUCȚIE (domeniu real cu TLS automat)

Premise:
- VPS-ul rulează deja stack-ul (`docker compose up -d` în `/srv/manelecadou`).
- Caddy rulează cu `on_demand_tls` (vezi `Caddyfile` și `MULTISITE_DEPLOY.md`).

### 1. Setează A record la registrar
Du-te la registrar-ul DNS și creează:
```
A    manele-NEW.com    →    <IP_VPS>
A    www.manele-NEW.com →   <IP_VPS>
```
(Sau CNAME `www` → `manele-NEW.com` dacă preferi.)

Așteaptă 1-15 minute pentru propagare:
```bash
dig +short manele-NEW.com
```

### 2. Creează site-ul în admin
Accesează `https://admin.manelecadou.com/sites` (sau `https://<oricare-domeniu>/admin` dacă admin-ul rulează pe același host) și adaugă site-ul ca la pasul 4 din secțiunea LOCAL — dar cu domain-ul real fără `.local`:
- **Domain**: `manele-NEW.com`
- **Active**: ✅
- restul câmpurilor identice

### 3. Caddy emite certul automat
Imediat ce primul HTTPS request lovește `manele-NEW.com`, Caddy:
1. Întreabă API-ul prin `/api/internal/caddy/ask?domain=manele-NEW.com`.
2. API-ul răspunde 200 dacă domain-ul e în DB ca site activ → Caddy cere certul Let's Encrypt.
3. Certul e cached, request-ul e servit cu TLS valid.

Verifică:
```bash
curl -I https://manele-NEW.com
# expected: HTTP/2 200 + headers normale (server: Caddy)
```

### 4. (Opțional) Webhook Stripe
Stripe e configurat global — un singur webhook endpoint `https://api.manelecadou.com/api/payments/webhook`. Site-ul nou primește automat plăți (metadata.siteId e injectat în Checkout Session).

### 5. SEO
Sitemap, robots, og:locale, canonical → toate per-site automat:
- `https://manele-NEW.com/sitemap.xml`
- `https://manele-NEW.com/robots.txt`
- Layout-ul citește locale-ul site-ului din DB

Trimite sitemap-ul la Google Search Console pentru indexare.

---

## Tabel sintetic — câmpuri obligatorii la creare

| Câmp | Local | Prod | Exemplu |
|---|---|---|---|
| `slug` | ✅ | ✅ | `gr` |
| `domain` | ✅ (`.local`) | ✅ (real) | `manele-gr.com` |
| `name` | ✅ | ✅ | `Manele Greece` |
| `locale` | ✅ | ✅ | `el` |
| `currency` | ✅ | ✅ | `EUR` |
| `basePriceCents` | ✅ | ✅ | `1900` (= 19 EUR) |
| `giftPriceCents` | ✅ | ✅ | `4900` |
| `suno.basePrompt` | ⚠️ recomandat | ✅ | `laiko greek pop with bouzouki...` |
| `suno.lyricsLocale` | optional | optional | `el` |
| `suno.writerSystemPrompt` | optional | recomandat | system prompt pentru OpenAI |
| `brand.primaryColor` | optional | optional | `#FF6B6B` |
| `seo.title` | optional | recomandat | `Manele Cadou Greece` |
| `active` | ✅ true | ✅ true | |

---

## Troubleshooting

### Local: „CORS blocked"
CORS-ul acceptă automat `*.local` — dacă vezi totuși eroare, restart API:
```bash
docker compose restart api
```

### Local: pagina arată tot RO
- `getRequestConfig` deduplică prin `cache()`. Hard refresh (Cmd+Shift+R).
- Verifică că `apps/web/messages/<locale>.json` există.

### Prod: certul nu se emite
- Verifică DNS: `dig +short manele-NEW.com` returnează IP-ul VPS-ului.
- Verifică Caddy: `docker compose logs caddy | tail -50`.
- Verifică `/api/internal/caddy/ask?domain=manele-NEW.com` returnează 200 (nu 403/404).

### Prod: webhook Stripe nu lovește site-ul nou
- Webhook-ul folosește `metadata.siteId` din Checkout Session, NU Host header. Verifică în Stripe Dashboard că plata are metadata corectă.

---

## Ștergere site

Din admin → `/sites` → click pe site → **„Șterge"**.

⚠️ Ștergerea șterge **doar rândul din `sites`**. Datele asociate (generations, payments, users etc.) rămân în DB cu `siteId` orfan. Pentru cleanup complet:
```sql
-- Soft-delete: marchează ca inactiv
UPDATE sites SET active = false WHERE slug = 'gr';

-- Hard-delete: elimină datele (DESTRUCTIV — fă backup întâi)
DELETE FROM generations WHERE "siteId" = '<id>';
-- ... etc pentru fiecare tabel
```

Recomand soft-delete (active = false) pentru istorie financiară.
