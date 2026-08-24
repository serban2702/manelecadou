# Mutare pe Coolify + Cloudflare R2

Runbook de cutover. Stare: **codul e pregătit; contul R2 și serverul Coolify le
faci tu.**

Ionos (Caddy + disc local) rămâne pornit până noul stack e verificat. Nu se
șterge nimic de pe el în ziua cutover-ului.

> **Numele de mai jos sunt substituenți.** `manelecadou-uploads` și
> `files.manelecadou.ro` vin din planul inițial, nu dintr-un cont R2 existent —
> nu e configurat niciun bucket. Înlocuiește-le cu ce creezi tu. Codul le
> citește din variabile de mediu, deci nu e nimic de modificat în cod.

---

## 1. Ce se schimbă

| | Acum (Ionos) | După (Coolify) |
|---|---|---|
| TLS + domenii | Caddy, `on_demand_tls` | **Traefik**, gestionat de Coolify |
| Deploy | `make deploy` → SSH → `deploy.sh` | Coolify (push pe git sau butonul Deploy) |
| Rutare pe path | Caddyfile | `router` (nginx în stack, `deploy/router/nginx.conf`) |
| Fișiere | volume `api_uploads` + `api_mail_attach` | **Cloudflare R2** — bucket separat pentru producție și pentru dev (mailul sub `mail-attach/`), cu volumul local ca sursă de cache |
| Compose | `docker-compose.prod.yml` | `docker-compose.coolify.yml` |
| Hop-uri de proxy | 1 | **2** → `TRUST_PROXY_HOPS=2` |

Neschimbat: un singur Postgres/Redis/API/Admin, un singur `web` pentru toate
domeniile publice (tenantul se ia din `Host`), webhook-ul Stripe rămâne
`https://manelecadou.ro/api/payments/webhook`.

Nu se mută acum: OpenReplay (Hetzner), microserviciul media (Hetzner),
containerul `ops` (rămâne pe stack-ul Ionos — vezi §3.2 pentru de ce nu intră în
compose-ul de Coolify).

Backup-ul automat dinaintea fiecărui deploy dispare odată cu `deploy.sh` și
**trebuie refăcut din UI-ul Coolify** — vezi §3.6. Nu e opțional cât timp
`synchronize: true` execută DDL la fiecare boot.

---

## 2. De ce un `router` și nu domenii per serviciu

Ruta publică e împărțită pe path: `/api`, `/socket.io`, `/health` și `/uploads`
merg la API, restul la web. În varianta nativă Coolify ar însemna **patru
intrări de path pe serviciul `api`, pentru fiecare domeniu de tenant** — plus
grija la stripPrefix, care ar tăia `/api` din calea trimisă mai departe și ar
strica toate rutele.

Cu `router`, în Coolify pui domeniile **într-un singur loc**:

```
internet ─► Traefik (Coolify, TLS) ─► router:80 ─┬─ /api /socket.io /health /uploads ─► api:3000
                                                  ├─ admin.<domeniu>                 ─► admin:1505
                                                  └─ restul                          ─► web:1500
```

Serviciul `router` primește toate domeniile. `api`, `web`, `admin`, `postgres`
și `redis` rămân **fără niciun domeniu**. Un site nou = încă un rând în același
câmp, nimic altceva.

Lista, generată din baza de date:

```bash
docker compose -f docker-compose.coolify.yml exec api node scripts/coolify-domains.mjs
```

Nu scrie nimic în Coolify — doar afișează lista, ca s-o lipești. Pasul rămâne al
tău pentru că o greșeală în acel câmp scoate site-uri de pe internet.

---

### Ce e deja verificat

Routerul a fost rulat pe bune (imaginea din `deploy/router/`, cu upstream-uri
false care spun cine sunt), iar matricea de rutare iese corect:

| Host | Cale | Ajunge la |
|---|---|---|
| `manelecadou.ro` | `/` | web |
| `manelecadou.ro` | `/api/health`, `/health`, `/uploads/…`, `/socket.io/` | api |
| `chalgapodarok.bg`, `www.doroparaggelia.gr` | `/`, `/studio` | web |
| `admin.manelecadou.ro` | `/` | admin |
| `admin.manelecadou.ro` | `/api/…`, `/uploads/…` | api |
| `admin.manelecadou.ro` | `/ops/` | 502 (serviciul nu e în stack — degradare intenționată) |

Headerul `Host` ajunge nemodificat la api (de el depinde rezolvarea de tenant),
iar `X-Forwarded-Proto: https` se propagă corect.

Build-ul complet al stack-ului (`docker compose -f docker-compose.coolify.yml
build`) trece — api, web, admin și router.

---

## 3. Pregătire (se poate face din timp, fără downtime)

### 3.1 Cloudflare R2 — DOUĂ bucketuri

Unul de producție, unul de dev. Nu se amestecă: ștergerea unei generări cheamă
`storage.delete`, care șterge și din bucket.

| | producție | dev |
|---|---|---|
| bucket | (de ales, ex. `manelecadou-uploads`) | (de ales, ex. `manelecadou-dev`) |
| domeniu public | ex. `files.manelecadou.ro` | poate lipsi |
| config din | admin → Setări → Chei → Cloudflare R2 | `.env`-ul local |
| `STORAGE_CONFIG_SOURCE` | `db` | `env` (implicit în `docker-compose.yml`) |

⚠️ **Capcana pe care o rezolvă `STORAGE_CONFIG_SOURCE`**: configul de storage se
citește DB-first, iar baza de dev e de obicei un dump al producției — care
aduce cu el cheile R2 **reale** în `app_settings`. Fără comutatorul ăsta, un
`docker compose up` pe laptop s-ar lega singur la bucketul de producție, iar o
ștergere de test ar arunca melodia unui client care a plătit-o. Implicit
(`auto`) înseamnă „env în afara producției, admin în producție"; `docker-compose.yml`
o fixează oricum pe `env`.

Bucketul activ se vede în logurile API-ului la boot:
`storage=r2 bucket=… public=… (config=db, boot)`. Verifică-l după primul deploy.

Pentru fiecare bucket:
1. Custom domain pe bucket → devine `R2_PUBLIC_URL`. **Obligatoriu în producție**:
   fără el, `/uploads` se servește prin API, cu seek limitat în player (iOS
   Safari refuză frecvent redarea).
2. S3 access key (Account ID, Access Key ID, Secret).
3. CORS: `Access-Control-Allow-Origin: *` pe GET/HEAD — serviciul `assets` din
   OpenReplay descarcă asset-urile cu alt User-Agent (CLAUDE.md §15.7 pct. 11).

### 3.2 Resursa în Coolify — pas cu pas

Instanța: **<https://coolify.freevox.ro>** (Coolify 4.3.10). Serverul înregistrat
în ea e **OVH `37.187.159.41`** — 16 vCPU, 62 GB RAM, 387 GB liberi, cu Traefik
pe 80/443. Pe el mai rulează Wingo CRM și mailul; nu au porturi în conflict,
pentru că tot ce publicăm trece prin Traefik.

**Atenție la DNS**: producția e azi pe Ionos `212.227.184.215`. Mutarea pe
Coolify înseamnă A record nou → `37.187.159.41`, pentru fiecare domeniu.

1. **Project** → `+ New` → nume `manelecadou`. (Instanța e goală: doar
   „My first project" și „Mail".)
2. **+ New Resource** → **Docker Compose** → **Private Repository (with deploy key)**
   pentru `git@github.com:serban2702/manelecadou.git`.
   - Coolify generează o cheie publică; o adaugi în GitHub la repo → Settings →
     Deploy keys (read-only e suficient).
   - Branch: `main` (după ce merge-ui `feat/experience-variants`).
   - **Docker Compose Location**: `/docker-compose.coolify.yml`.
3. **Load/Parse** compose-ul. Trebuie să apară exact 6 servicii:
   `postgres`, `redis`, `api`, `web`, `admin`, `router`.
4. **Environment Variables** — vezi §3.3.
5. **Domains** — numai pe serviciul `router`, restul rămân fără. Vezi Pas 5 din §4.
6. **Deploy**.

Ce trebuie să știi despre cum se poartă Coolify cu acest compose:

- **Configul nginx e COPIAT în imagine**, nu montat (`deploy/router/Dockerfile`).
  Coolify nu poate ști dacă sursa unui bind mount scris ca string e fișier sau
  director, așa că presupune director (`bootstrap/helpers/shared.php`,
  `$isDirectory = true`). Un `./nginx.conf:/etc/nginx/conf.d/default.conf` ar fi
  devenit un **folder**, iar tot traficul ar fi căzut pe pagina implicită nginx.
- **Serviciul `ops` nu e în acest compose.** Coolify nu citește `profiles:` —
  nu apare nicăieri nici în parser, nici în jobul de deploy — deci l-ar construi
  și porni la fiecare deploy, degeaba (imaginea are node + claude-code + ttyd, iar
  containerul e inutil fără login interactiv). Definiția rămâne în
  `docker-compose.prod.yml`. Routerul îl tolerează lipsă: `/ops` și `/ops-chat`
  dau 502, nu rup nginx-ul.
- Coolify rulează `docker compose up --pull always --build -d`, deci `build:`
  merge normal, iar `${VAR}` din compose se rezolvă din `.env`-ul pe care îl
  scrie el în directorul proiectului.
- Volumele numite din compose le gestionează Coolify (le prefixează cu UUID-ul
  resursei). Nu șterge `api_uploads` înainte de a confirma sync-ul pe R2.

Alternativ, Postgres și Redis pot fi resurse gestionate de Coolify (cu backup-uri
programate din UI) — atunci le scoți din compose și pui `POSTGRES_HOST` /
`REDIS_HOST` pe hostname-urile date de Coolify.

### 3.3 Variabile de mediu

Pleci de la `.env`-ul de pe Ionos (`/home/manele/.env`) și adaugi:
```
TRUST_PROXY_HOPS=2
STORAGE_DRIVER=r2
STORAGE_CONFIG_SOURCE=db
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=…
R2_PUBLIC_URL=https://…
```

**Obligatorii** (compose-ul nu are default pentru ele — dacă lipsesc, stack-ul
pornește stricat, nu dă eroare la parse):
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET`,
`SETTINGS_ENCRYPTION_KEY`, `APP_URL`, `ADMIN_URL`, `API_URL`,
`DEFAULT_SITE_DOMAIN`, `ADMIN_EMAILS`, `MAIL_FROM`.

⚠️ **De marcat „Build Variable"** în Coolify — altfel rămân goale în pagina
livrată, pentru că Next.js le fixează în bundle la build:
`NEXT_PUBLIC_API_URL` (rămâne gol, intenționat — same-origin),
`NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_TIKTOK_PIXEL_ID`,
`NEXT_PUBLIC_DEFAULT_LOCALE`, `NEXT_PUBLIC_SHOW_LANG_SWITCHER`,
`NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY`, `NEXT_PUBLIC_OPENREPLAY_INGEST_POINT`.
Aceeași clasă de capcană ca `API_INTERNAL_URL` (CLAUDE.md §9.3), în cealaltă
direcție.

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
  -e R2_BUCKET=… \
  -e R2_DRY_RUN=1 \
  node:22-alpine sh -c 'npm init -y >/dev/null 2>&1; npm i --silent @aws-sdk/client-s3 pg >/dev/null 2>&1 && node sync-uploads-to-r2.mjs'
```

Verificat pe producție (23 aug 2026): **3055 fișiere, 7,67 GB**.

Pentru urcarea propriu-zisă scoți `R2_DRY_RUN=1` și adaugi
`-e R2_CONFIRM_BUCKET=<exact numele bucketului>`. Confirmarea e obligatorie
tocmai pentru că avem două bucketuri: un `export` uitat în shell e tot ce
trebuie ca să urci 7,5 GB în cel de dev, sau fișiere de test peste producție.
Rularea cu `R2_DRY_RUN=1` nu cere confirmare.

Idempotent, cu 12 fișiere în paralel; sare peste ce e deja urcat cu aceeași
mărime (deci a doua rulare prinde și fișierele **suprascrise** între timp, nu
doar pe cele noi).

Pe stack-ul Coolify imaginea conține scripturile (`COPY scripts ./scripts` în
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
2. **Apoi infrastructura**, când ai timp: R2 + Coolify, după runbook-ul de mai jos.

Avantajul: dacă apare o problemă, știi din care dintre cele două mutări vine.

---

### 3.6 Backup-uri — plasa pierdută odată cu `deploy.sh`

Pe Ionos, `deploy.sh` făcea `pg_dump` **înainte de fiecare deploy**. Pe Coolify
deploy-ul îl face Coolify, deci pasul acela dispare — exact plasa care ne apără
de `synchronize: true`, care execută DDL la fiecare boot al API-ului. Trebuie
refăcută din UI, nu e opțională.

**Pre-deployment Command** (resursa stack-ului → Advanced):
- Container: `postgres`
- Command:
  ```sh
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > /backups/predeploy_$(date +%F_%H%M%S).sql.gz && find /backups -name "*.sql.gz" -mtime +30 -delete'
  ```
Scrie în volumul `pg_backups`, adăugat în compose exact pentru asta.

**Scheduled Task** pentru dump-ul zilnic (resursa → Scheduled Tasks):
- Container: `postgres`, Frequency: `0 3 * * *`
- Aceeași comandă, cu prefixul `db_` în loc de `predeploy_`.

**Restore:**
```bash
gunzip -c /backups/<FIȘIER>.sql.gz | psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

**Alternativa mai bună, dacă vrei backup-uri în afara serverului**: scoate
`postgres` din compose și fă-l resursă **Postgres gestionată de Coolify**. Atunci
capeți din UI backup-uri programate direct într-un bucket S3 (deci și R2), cu
retenție și restore din interfață — strict mai bine decât un dump pe același
disc cu baza. Costul: încă o resursă de administrat și `POSTGRES_HOST` mutat pe
hostname-ul dat de Coolify. Compose-ul e pregătit pentru ambele variante.

⚠️ Volumul `caddy_data` de pe Ionos (certificatele Let's Encrypt) **nu se
migrează** — pe stack-ul nou certificatele le emite Traefik de la zero.

---

## 4. Cutover

### Pas 1 — migrarea de schemă, PE IONOS, înainte de dump
```bash
docker exec manele-api-1 node scripts/migrate-prod-to-new-stack.mjs --phase=pre
```
Lărgește `video_collages.track` de la `varchar(8)` la `varchar(64)`.
**Obligatoriu**: TypeORM cu `synchronize: true` nu face ALTER la schimbarea de
lungime — face DROP + ADD, iar toate colajele existente ar rămâne cu
`track = 'main'` (cele pe bonus s-ar rata la listare și la regenerare).

Se rulează pe Ionos, **înainte** de dump, tocmai ca să nu ai problema pe
Coolify: acolo API-ul pornește odată cu restul stack-ului, deci n-ai o fereastră
în care baza există dar codul nou n-a pornit încă. Cu ALTER-ul făcut din timp,
dump-ul ajunge pe Coolify deja corect, iar la primul boot TypeORM nu mai are ce
atinge.

Codul vechi de pe Ionos nu e afectat: e doar o lărgire de coloană.

*(Dacă din orice motiv ajungi cu dump-ul nemigrat pe Coolify: pornește stack-ul
o dată cu `DB_SYNCHRONIZE=false`, restaurează, rulează `--phase=pre`, apoi scoate
variabila și redeployează.)*

### Pas 2 — dump + restore
```bash
# pe Ionos
docker exec manele-postgres-1 pg_dump -U manelecadou manelecadou | gzip > /backups/cutover.sql.gz
# pe Coolify
gunzip -c cutover.sql.gz | docker exec -i <postgres> psql -U manelecadou manelecadou
```

### Pas 3 — deploy în Coolify
Push pe branch, sau butonul Deploy. Urmărește logurile serviciului `api` până
apare `storage=r2 bucket=…`.

Din terminal, opțional:
```bash
COOLIFY_URL=… COOLIFY_TOKEN=… COOLIFY_RESOURCE_UUID=… make deploy-coolify
```

### Pas 4 — sync delta + verificare
Delta se rulează încă de pe **Ionos** (acolo sunt fișierele), cu același
container temporar ca la 3.4, fără `R2_DRY_RUN`.

Verificarea se rulează pe stack-ul nou:
```bash
docker compose -f docker-compose.coolify.yml exec api node scripts/verify-r2-migration.mjs
```
Parcurge toate referințele de fișiere din DB (audio, demo, instrumental, video,
poze social, colaje, facturi, atașamente de chat, mostre de site, brand) și
spune pentru fiecare dacă e în R2, doar pe disc, sau nicăieri. Iese cu 0 doar
dacă **nimic** nu lipsește. **Nu muta DNS-ul până nu iese 0.**

Atașamentele de email intră și ele în verificare. Rândurile scrise de codul nou
au cheie relativă (`mail-attach/...`); cele vechi au calea absolută de pe volumul
`api_mail_attach` și apar separat, ca „Mail, doar pe volumul vechi" — rulează
migrarea de la pasul 4.1. Dacă fișierul e deja în R2 dar DB-ul ține încă vechea
cale, raportul o spune ca informație: descărcarea merge oricum, codul mapează
singur calea veche.

### Pas 4.1 — atașamentele de email
Fișierele de mail (atașamente primite, staging de compunere, copiile `.eml` pentru
`Sent`) se scriu de acum prin `StorageService`, sub `mail-attach/...` în uploads,
deci ajung pe R2 ca tot restul. Fișierele deja existente se mută cu:

```bash
docker compose -f docker-compose.coolify.yml exec api \
  node scripts/migrate-mail-attachments-to-r2.mjs --dry-run
# apoi, fără --dry-run
```

Ce face: urcă tot din `MAIL_ATTACH_DIR` în bucket sub `mail-attach/<rest>` și
rescrie `mail_attachments.storagePath` la cheia relativă. Idempotent, nu șterge
nimic de pe volumul vechi, iar rândurile fără fișier (referințe deja moarte)
rămân neatinse și sunt listate în raport. Cu `--local-only` face doar mutarea în
`UPLOADS_DIR` (util pe un stack cu `STORAGE_DRIVER=disk`).

Pe **Ionos** (imaginea veche, fără `@aws-sdk/client-s3`) se rulează în același
container temporar ca la 3.4, cu ambele volume montate:

```bash
docker run --rm \
  -v manele_api_mail_attach:/mail-attach:ro \
  -v /root/r2-migrate:/work -w /work \
  --network manele_default \
  -e MAIL_ATTACH_DIR=/mail-attach \
  -e PGHOST=postgres -e PGUSER=manelecadou -e PGPASSWORD=… -e PGDATABASE=manelecadou \
  -e R2_ACCOUNT_ID=… -e R2_ACCESS_KEY_ID=… -e R2_SECRET_ACCESS_KEY=… -e R2_BUCKET=… \
  node:22-alpine sh -c 'npm init -y >/dev/null 2>&1; npm i --silent @aws-sdk/client-s3 pg >/dev/null 2>&1 && node migrate-mail-attachments-to-r2.mjs --dry-run'
```

Verificat pe producție (23 aug 2026): **198 de rânduri, 6,4 MB** — se mută în
câteva secunde. Volumul `api_mail_attach` rămâne montat până când raportul de
verificare nu mai listează nimic pe el; abia apoi îl poți scoate din compose.

Atașamentele NU se servesc public: `/uploads/mail-attach/...` întoarce 404, exact
ca înainte de migrare. Singura cale spre ele rămâne
`/api/admin/mail/attachments/:id`, în spatele `AdminGuard`.

### Pas 5 — domeniile în Coolify
```bash
docker compose -f docker-compose.coolify.yml exec api node scripts/coolify-domains.mjs
```
Lipești lista în serviciul `router` → Domains. Scriptul nu scrie nimic în
Coolify — o greșeală în câmpul ăla scoate site-uri de pe internet, deci pasul
rămâne manual, cu ochii pe listă.

Ce face în plus față de o simplă interogare:
- propune **și varianta `www.`** pentru fiecare domeniu, nu doar pentru cel
  principal. Verificat pe producție (24 aug 2026): `www.chalgapodarok.bg` și
  `www.doroparaggelia.gr` răspund azi cu 200 — Caddy le lua automat prin
  `on_demand_tls`. Traefik nu ghicește nimic: dacă lipsesc din listă, cele două
  site-uri pică pe www după cutover;
- verifică DNS-ul fiecărui candidat și le lasă pe cele fără A record într-o
  secțiune separată, ca Traefik să nu ceară certificate imposibile și să nu ne
  apropiem de limitele Let's Encrypt.

Starea de azi (3 site-uri active) → **7 domenii**:
```
https://admin.manelecadou.ro, https://chalgapodarok.bg,
https://doroparaggelia.gr,    https://manelecadou.ro,
https://www.chalgapodarok.bg, https://www.doroparaggelia.gr,
https://www.manelecadou.ro
```

Rulează scriptul din nou după fiecare site nou adăugat din admin — ține locul
lui `on_demand_tls` din Caddy. `CURRENT_DOMAINS="a.ro,b.ro"` îți arată diferența
față de ce e deja în Coolify.

### Pas 6 — test pe un domeniu de probă
Mută întâi un singur A record (ex. `test.manelecadou.ro`) și verifică:
- homepage, `/studio`, o plată de test, `/m/<id>`, un colaj
- `curl -sI https://test.…/uploads/<un-audio>.mp3` → `302` spre `files.…`
- `curl -sI -H "Origin: https://openreplay.manelecadou.ro" https://test.…/_next/static/css/<hash>.css` → `access-control-allow-origin: *`
- admin: login prin magic link, chat live (websocket), upload de mostră

### Pas 7 — DNS live
A records → **`37.187.159.41`** (serverul Coolify), în loc de `212.227.184.215`
(Ionos). **DNS only, nor gri** în Cloudflare: cu proxy portocaliu, Let's Encrypt
eșuează la HTTP-01, iar Traefik-ul Coolify pe HTTP-01 e configurat.

### Pas 8 — migrarea datelor, după ce API-ul nou a pornit
```bash
docker compose -f docker-compose.coolify.yml exec api node scripts/migrate-prod-to-new-stack.mjs --phase=post
```
Completează `experienceSlug='classic'` pe rândurile vechi și îngheață cota de
refaceri gratuite a comenzilor de dinainte de deploy. `--phase=check` dă doar
raportul, oricând.

**De ce contează înghețul — o decizie de cost, nu una tehnică.** Până acum
refacerea gratuită nu era self-service: o dădea operatorul prin Irina, când
greșeala era a noastră. Codul nou pune pe pagina piesei un buton „Refă gratuit",
cu cotă pe pachet (1 / 2 / 3), iar comenzile vechi n-au `packageSnapshot`, deci
cad pe cota implicită a tier-ului.

Cifre reale de pe producție (24 aug 2026): **490 de comenzi plătite** (387 basic,
72 plus, 31 premium), din care doar **23** au folosit vreodată refacerea. Fără
îngheț, un singur deploy deblochează retroactiv **~598 de generări gratuite**,
fiecare cu cost în credite Suno.

- `--legacy-remakes=freeze` (implicit) — tot istoricul rămâne la condițiile în
  care a fost vândut. Nimeni nu pierde ceva ce i s-a promis.
- `--legacy-remakes=grant` — gest comercial, cu costul de mai sus asumat.

Varianta intermediară (doar comenzile din ultimele 30 de zile) e tipărită de
script la rulare.

### Pas 9 — configurarea per tenant
Admin → `/rollout` → pe fiecare site „Aplică lipsurile". Umple doar câmpuri
goale; nu suprascrie prompturi, prețuri sau interfețe deja setate de operator.

Echivalentul din linia de comandă, pentru toate site-urile deodată:
```bash
docker compose -f docker-compose.coolify.yml exec api node scripts/migrate-prod-to-new-stack.mjs --phase=rollout
```

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
| R2 face figuri | `STORAGE_DRIVER=disk` + redeploy: fișierele se servesc din volum. |
| Un deploy Coolify a stricat ceva | Coolify păstrează deployment-urile anterioare — Rollback din UI. |

Ține TTL-ul DNS la 60s cu o zi înainte de cutover.
