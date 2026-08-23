# Mutare pe stack nou: Nginx Proxy Manager + Cloudflare R2

Runbook de cutover. Stare: **codul e pregătit; mutarea DNS-ului o faci tu.**

Ionos (Caddy + disc local) rămâne pornit până noul stack e verificat. Nu se
șterge nimic de pe el în ziua cutover-ului.

---

## 1. Ce se schimbă

| | Acum (Ionos) | După |
|---|---|---|
| TLS + domenii | Caddy, `on_demand_tls` | **Nginx Proxy Manager** (un Proxy Host per domeniu) |
| Rutare pe path | Caddyfile | `router` (nginx în stack, `deploy/router/nginx.conf`) |
| Fișiere | volum `api_uploads` | **Cloudflare R2**, cu volumul local ca sursă de cache |
| Compose | `docker-compose.prod.yml` | `docker-compose.coolify.yml` |
| Hop-uri de proxy | 1 | **2** → `TRUST_PROXY_HOPS=2` |

Neschimbat: un singur Postgres/Redis/API/Admin, un singur `web` pentru toate
domeniile publice (tenantul se ia din `Host`), webhook-ul Stripe rămâne
`https://manelecadou.ro/api/payments/webhook`.

Nu se mută acum: OpenReplay (Hetzner), microserviciul media (Hetzner),
containerul `ops` (pornește separat cu `--profile ops`).

---

## 2. De ce un `router` și nu configurație în NPM

NPM nu are echivalent pentru `on_demand_tls` și nici rutare pe path comodă din
UI. Fără `router`, fiecare domeniu ar avea nevoie de config custom identic
pentru `/api`, `/socket.io`, `/health`, `/uploads`.

Cu `router`, în NPM ai un singur tip de Proxy Host: **domeniu → `router:80`**.
Split-ul e în repo, versionat, identic pe toate domeniile.

```
internet ─► NPM (TLS, Let's Encrypt) ─► router:80 ─┬─ /api /socket.io /health /uploads ─► api:3000
                                                    ├─ admin.<domeniu>                 ─► admin:1505
                                                    └─ restul                          ─► web:1500
```

---

## 3. Pregătire (se poate face din timp, fără downtime)

### 3.1 Cloudflare R2
1. Bucket `manelecadou-uploads`.
2. Custom domain pe bucket: `files.manelecadou.ro` → asta devine `R2_PUBLIC_URL`.
   **Obligatoriu**: fără el, `/uploads` se servește prin API, cu seek limitat în
   player (iOS Safari refuză frecvent redarea).
3. S3 access key (Account ID, Access Key ID, Secret).
4. CORS pe bucket: `Access-Control-Allow-Origin: *` pe GET/HEAD — serviciul
   `assets` din OpenReplay descarcă asset-urile cu alt User-Agent
   (vezi CLAUDE.md §15.7 pct. 11).

### 3.2 Server nou
```bash
docker network create manele-edge          # rețeaua partajată cu NPM
```
Atașează containerul NPM la ea (în compose-ul NPM: `networks: [manele-edge]`,
declarată `external: true`). Fără asta NPM nu rezolvă `router` prin DNS-ul Docker.

### 3.3 `.env`
Copiază `.env`-ul de pe Ionos și adaugă:
```
TRUST_PROXY_HOPS=2
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=manelecadou-uploads
R2_PUBLIC_URL=https://files.manelecadou.ro
EDGE_NETWORK=manele-edge
```
`.env.example` are lista completă, comentată.

### 3.4 Primul sync de fișiere (poate rula cu zile înainte)

Imaginea api **de pe Ionos** e mai veche decât acest branch și nu are
`@aws-sdk/client-s3`, deci `docker exec manele-api-1 node scripts/…` NU merge
acolo. Se rulează într-un container temporar cu volumul montat:

```bash
# o singură dată: pui scripturile pe server
mkdir -p /root/r2-migrate
# (copiază apps/api/scripts/*.mjs în /root/r2-migrate/)

docker run --rm \
  -v manele_api_uploads:/uploads:ro \
  -v /root/r2-migrate:/work -w /work \
  -e UPLOADS_DIR=/uploads \
  -e R2_ACCOUNT_ID=… -e R2_ACCESS_KEY_ID=… -e R2_SECRET_ACCESS_KEY=… \
  -e R2_BUCKET=manelecadou-uploads \
  -e R2_DRY_RUN=1 \
  node:22-alpine sh -c 'npm init -y >/dev/null 2>&1; npm i --silent @aws-sdk/client-s3 pg >/dev/null 2>&1 && node sync-uploads-to-r2.mjs'
```

Verificat pe producție (23 aug 2026): **3055 fișiere, 7,67 GB**. Scoate
`R2_DRY_RUN=1` pentru urcarea propriu-zisă.

Idempotent, cu 12 fișiere în paralel; sare peste ce e deja urcat cu aceeași
mărime (deci a doua rulare prinde și fișierele **suprascrise** între timp, nu
doar pe cele noi).

Pe **stack-ul nou** imaginea conține scripturile (`COPY scripts ./scripts` în
`apps/api/Dockerfile`), deci acolo e simplu:
```bash
docker compose -f docker-compose.coolify.yml exec api node scripts/sync-uploads-to-r2.mjs
```

---

## 3.5 Varianta cu risc mai mic: două mutări separate

Nu ești obligat să faci totul într-o singură fereastră. Codul e scris ca să
funcționeze **neschimbat pe stack-ul actual de pe Ionos**:

- `STORAGE_DRIVER` lipsă sau `disk` ⇒ `/uploads` se servește exact ca azi
  (handler-ul nou iese imediat și lasă `express.static`), zero legătură cu R2.
- `TRUST_PROXY_HOPS` lipsă ⇒ 1 hop, adică Caddy, ca azi.
- `experienceConfig` NULL pe toate site-urile ⇒ toate rămân pe `classic`.

Deci poți face:

1. **Întâi funcționalitatea**, pe Ionos: `--phase=pre`, `make deploy`,
   `--phase=post`, `--phase=rollout`. Site-urile arată la fel; capeți
   interfața nouă testabilă cu `?ui=cadou`, motorul Google, admin-ul nou.
2. **Apoi infrastructura**, când ai timp: R2 + server nou + NPM, după runbook-ul
   de mai jos.

Avantajul: dacă apare o problemă, știi din care dintre cele două mutări vine.

---

## 4. Cutover

### Pas 1 — migrarea de schemă, ÎNAINTE de a porni codul nou
```bash
docker exec manele-api-1 node scripts/migrate-prod-to-new-stack.mjs --phase=pre
```
Lărgește `video_collages.track` de la `varchar(8)` la `varchar(64)`.
**Obligatoriu**: TypeORM cu `synchronize: true` nu face ALTER la schimbarea de
lungime — face DROP + ADD, iar toate colajele existente ar rămâne cu
`track = 'main'` (cele pe bonus s-ar rata la listare și la regenerare).

### Pas 2 — dump + restore
```bash
# pe Ionos
docker exec manele-postgres-1 pg_dump -U manelecadou manelecadou | gzip > /backups/cutover.sql.gz
# pe serverul nou
gunzip -c cutover.sql.gz | docker exec -i <postgres> psql -U manelecadou manelecadou
```

### Pas 3 — pornește stack-ul nou
```bash
docker compose -f docker-compose.coolify.yml up -d --build
docker compose -f docker-compose.coolify.yml logs -f api    # aștepți „storage=r2 bucket=…"
```

### Pas 4 — sync delta + verificare
Delta se rulează încă de pe **Ionos** (acolo sunt fișierele), cu același
container temporar ca la 3.4, fără `R2_DRY_RUN`.

Verificarea se rulează oriunde are acces la DB-ul nou:
```bash
docker compose -f docker-compose.coolify.yml exec api node scripts/verify-r2-migration.mjs
```
Parcurge toate referințele de fișiere din DB (audio, demo, instrumental, video,
poze social, colaje, facturi, atașamente de chat, mostre de site, brand) și
spune pentru fiecare dacă e în R2, doar pe disc, sau nicăieri. Iese cu 0 doar
dacă **nimic** nu lipsește. **Nu muta DNS-ul până nu iese 0.**

Atașamentele de email (`mail_attachments.storagePath`) sunt excluse intenționat:
stau pe volumul `api_mail_attach`, nu în uploads, și nu se migrează pe R2.

### Pas 5 — NPM
Manual, sau automat din DB:
```bash
NPM_URL=http://127.0.0.1:81 NPM_EMAIL=… NPM_PASSWORD=… \
NPM_ADMIN_DOMAIN=admin.manelecadou.ro DEFAULT_SITE_DOMAIN=manelecadou.ro \
PGHOST=… PGUSER=… PGPASSWORD=… PGDATABASE=… \
node apps/api/scripts/sync-npm-proxy-hosts.mjs
```
Creează un Proxy Host per domeniu activ cu `sslEnabled`, toate → `router:80`,
cu websocket ON și `client_max_body_size 200M`. Cere certificat Let's Encrypt
doar unde lipsește; domeniile al căror DNS nu e încă mutat eșuează la certificat
și se reiau rulând scriptul din nou. Rulează-l după fiecare site nou adăugat din
admin (ține locul lui `on_demand_tls`).

### Pas 6 — test pe un domeniu de probă
Mută întâi un singur A record (ex. `test.manelecadou.ro`) și verifică:
- homepage, `/studio`, o plată de test, `/m/<id>`, un colaj
- `curl -sI https://test.…/uploads/<un-audio>.mp3` → `302` spre `files.…`
- `curl -sI -H "Origin: https://openreplay.manelecadou.ro" https://test.…/_next/static/css/<hash>.css` → `access-control-allow-origin: *`
- admin: login prin magic link, chat live (websocket), upload de mostră

### Pas 7 — DNS live
A records → IP-ul nou, **DNS only (nor gri)** în Cloudflare. Cu proxy portocaliu,
Let's Encrypt eșuează la HTTP-01.

### Pas 8 — migrarea datelor, după ce API-ul nou a pornit
```bash
node scripts/migrate-prod-to-new-stack.mjs --phase=post
```
Completează `experienceSlug='classic'` pe rândurile vechi și îngheață cota de
refaceri gratuite a comenzilor de dinainte de deploy (codul nou dă cotă pe
pachet, nu 1 global — fără îngheț, comenzile Plus/Premium vechi ar primi
retroactiv refaceri în plus). Cu `--legacy-remakes=grant` faci invers.
`--phase=check` dă doar raportul, oricând.

### Pas 9 — configurarea per tenant
Admin → `/rollout` → pe fiecare site „Aplică lipsurile". Umple doar câmpuri
goale; nu suprascrie prompturi, prețuri sau interfețe deja setate de operator.

Echivalentul din linia de comandă, pentru toate site-urile deodată (rulează-l
din containerul api, ca să aibă `JWT_SECRET` și rețeaua internă):
```bash
docker exec <api> node scripts/migrate-prod-to-new-stack.mjs --phase=rollout
```

Nu comuta `musicEngine` pe Google decât după ce ai pus `GEMINI_API_KEY` și ai
verificat prompturile Google pe stiluri/ocazii — și doar pe o singură interfață
întâi, nu pe tot site-ul.

### Pas 10 — pornirea design-ului nou (separat de cutover)

Deploy-ul **nu** schimbă cum arată site-urile: `experienceConfig` e NULL peste
tot, deci toate rămân pe `classic`, exact ca azi. Asta e intenționat — mutarea
de infrastructură și schimbarea de design nu se fac în aceeași oră.

Ordinea de pornire a interfeței `cadou`, pe un site:

1. `--phase=rollout` (sau `/rollout` → „Aplică lipsurile") o **activează** fără
   s-o pună default. Din acel moment `https://<domeniu>/?ui=cadou` o arată doar
   ție, restul lumii vede în continuare classic.
2. Verifici pe `?ui=cadou`: homepage, wizard, o plată reală mică, pagina piesei,
   un colaj.
3. Când ești mulțumit: admin `/site` → Interfețe → pui `cadou` ca interfață
   default. Din clipa aia o văd toți vizitatorii noi.
4. Dacă ceva merge prost, muți default-ul înapoi pe `classic` — vizitatorii deja
   intrați pe cadou rămân pe ea până le expiră cookie-ul (intenționat: nu
   schimbăm UI-ul cuiva în mijlocul comenzii), restul revin imediat.

Comenzile vechi rămân accesibile pe aceleași linkuri `/m/<id>` indiferent de
interfața activă.

### Pas 11 — oprirea Ionos
Abia după 24–48h de trafic curat pe stack-ul nou. Păstrează volumul
`api_uploads` de pe Ionos până verifici încă o dată cu `verify-r2-migration.mjs`.

---

## 5. Ce rămâne disponibil clienților

Cutover-ul **nu** rupe nimic din trecut:
- Path-urile din DB rămân `/uploads/...`; API-ul le redirectează spre R2.
- Fișierele încă prezente pe disc sunt servite local (cu Range), R2 e fallback —
  deci un fișier scăpat de sync nu devine 404.
- Toate melodiile, colajele, facturile și conversațiile vechi rămân în DB și
  accesibile pe aceleași URL-uri.
- Interfața `classic` rămâne default; `cadou` se activează explicit per site.

---

## 6. Rollback

| Ce a mers prost | Ce faci |
|---|---|
| Stack-ul nou nu pornește | DNS-ul e încă pe Ionos → nu se vede nimic. Repari și reiei. |
| DNS mutat, probleme mari | Muți A records înapoi pe IP-ul Ionos (TTL mic în ziua cutover-ului). |
| Date stricate în DB-ul nou | `gunzip -c cutover.sql.gz \| psql` pe stack-ul nou. |
| R2 face figuri | `STORAGE_DRIVER=disk` + restart api: fișierele se servesc din volum. |

Ține TTL-ul DNS la 60s cu o zi înainte de cutover.
