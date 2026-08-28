# Mutare pe Coolify + Cloudflare R2

> ## ✅ Executat pe 28 august 2026
>
> Cele 7 domenii publice (`manelecadou.ro`, `www`, `admin`, `chalgapodarok.bg`
> + `www`, `doroparaggelia.gr` + `www`) arată spre `37.187.159.41`. Dump-ul a
> fost luat la 14:06 UTC (247 MB → 32 MB) și restaurat cu 3 site-uri, 837 de
> generări, 925 de plăți și 14.405 mesaje de chat. Pe Ionos nu s-a mai scris
> niciun rând după dump — nu s-a pierdut nimic.
>
> Numele care erau substituenți au rămas cele reale: bucket `manelecadou-uploads`,
> domeniu public `files.manelecadou.ro`.
>
> Documentul rămâne ca **runbook**, util dacă mai faci o mutare sau dacă trebuie
> să reconstruiești stack-ul. Pentru starea curentă: `CLAUDE.md` §5–§7.
>
> **Ce a rămas deschis:** backup off-site (cere un bucket R2 dedicat + token —
> vezi §3.6) și intrarea „Claude Ops" din admin, care dă 502 (§3.2).

Ionos (Caddy + disc local) a rămas pornit ca plasă de siguranță. Nu s-a șters
nimic de pe el.

---

## 1. Ce se schimbă

| | Acum (Ionos) | După (Coolify) |
|---|---|---|
| TLS + domenii | Caddy, `on_demand_tls` | **Traefik**, gestionat de Coolify |
| Deploy | `make deploy` → SSH → `deploy.sh` | Coolify: **Actions → Deploy** (push-ul singur nu declanșează nimic — deploy key, fără webhook) |
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

## 2.1 Ce e deja verificat

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

**Topologia cu bază separată e verificată**, nu doar scrisă: un Postgres pe o
rețea proprie, cu hostname de forma unui UUID (cum îl dă Coolify), plus API-ul
pornit cu `POSTGRES_HOST` pe acel UUID. Rezultat: health OK și **49 de tabele
create în resursa separată**.

**Driverul R2 e verificat pe un S3 real.** Nu avem credențiale R2, dar R2 e
S3-compatibil, iar `apps/api/src/storage/storage-s3.spec.ts` rulează întreg
contractul pe un MinIO local: scriere, citire, listare, **Range** (de el depind
seek-ul din player și redarea pe iOS Safari) și ștergere. Testul se sare singur
când nu găsește un S3, deci nu leagă rularea normală de Docker; comanda de
pornire e în capul fișierului.

Comenzile de backup din §3.6 sunt și ele rulate, nu doar scrise: dump → tabel
șters → restore → date întoarse.

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

**Atenție la DNS** (la momentul scrierii; mutarea s-a făcut între timp):
producția era pe Ionos `212.227.184.215`. Mutarea pe
Coolify înseamnă A record nou → `37.187.159.41`, pentru fiecare domeniu.

1. **Project** → `+ New` → nume `manelecadou`. (Instanța e goală: doar
   „My first project" și „Mail".)

1b. **Baza de date, ÎNAINTE de aplicație.** `+ New Resource` → **PostgreSQL**,
   imaginea **`postgres:16-alpine`** — aceeași ca pe Ionos. O versiune mai nouă
   ar merge, dar un dump făcut pe 16 nu intră într-o versiune mai veche, deci nu
   coborî sub ea. Notează user / parolă / nume de bază: ele devin
   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` pe aplicație.

   Pe pagina resursei, la **Postgres URL (internal)**, vei vedea ceva de forma
   `postgres://user:pass@<uuid>:5432/db`. **`<uuid>`-ul de acolo e
   `POSTGRES_HOST`** — hostname-ul intern al bazei e chiar UUID-ul resursei.

   De ce separat, și nu în compose: doar așa capătă backupuri programate direct
   într-un bucket S3/R2, cu retenție și restore din interfață. În compose,
   dump-urile ar fi stat pe același disc cu baza — dacă pică serverul, pierzi și
   baza, și copiile. Baza e singurul lucru de neînlocuit; fișierele sunt oricum
   pe R2. În plus, supraviețuiește ștergerii sau recreării aplicației.
2. **+ New Resource** → **Private Repository (with deploy key)**, pentru
   `git@github.com:serban2702/manelecadou.git`.

   ⚠️ **NU** alege „Docker Compose" din lista de resurse. În ecranul acela,
   „Docker Compose" și „Private Repository (with deploy key)" sunt opțiuni
   FRAȚI, nu una în alta: prima e un editor în care lipești un compose și n-are
   repo, deci `build:` din surse (`./apps/api`, `./apps/web`, `./deploy/router`)
   n-ar avea de unde construi. Sursa se alege prima, tipul de build după.

   - **Cheia SSH, întâi.** Keys & Tokens → Private Keys → **săgeata din dreapta**
     butonului „+ New private key" → **Generate ED25519**. (Butonul propriu-zis
     duce la un formular care cere o cheie privată EXISTENTĂ, lipită manual —
     `Livewire/Security/PrivateKey/Create.php` doar extrage cheia publică din ce
     lipești. Generarea e ascunsă în meniul din săgeată:
     `generatePrivateKey('ed25519')` din `Index.php`.)

     Apoi deschizi cheia creată, copiezi câmpul read-only `public_key` și îl pui
     în GitHub → repo → Settings → Deploy keys. FĂRĂ „Allow write access" —
     Coolify doar clonează.
   - Branch: **`main`**. Versiunea nouă e deja acolo (27 aug 2026).

     ⚠️ **`main` e acum înaintea a ce rulează Ionosul.** Producția a rămas
     deliberat pe commit-ul vechi; `deploy.sh` face `git reset --hard
     origin/main`, deci **orice `make deploy` de acum încolo urcă versiunea nouă
     pe stack-ul vechi**. Nu e catastrofal — lărgirea de coloană e făcută
     (vezi mai jos), interfața clasică rămâne implicită și storage-ul rămâne pe
     disc cât timp `STORAGE_DRIVER` nu e setat — dar e o decizie, nu un accident.
     Deployează pe Ionos doar dacă chiar vrei asta.

     Pentru ca decizia să nu fie luată de altcineva, **auditul autonom a fost
     ELIMINAT** (28 aug 2026): job launchd, wrapper și skill, toate scoase.
     Rula la 5 ore și făcea `git add -A && git commit && make deploy-api` — iar
     `git add -A` rula în repo-ul principal, care are permanent modificări
     străine necommitate. Arhivă completă, dacă vreodată e nevoie:
     `~/.manele-auto-review-ARHIVA-2026-08-28/`.

     Lărgirea `video_collages.track` (§3.2/Pas 1) **e deja rulată pe producție**
     — 27 aug 2026, cu backup înainte (`/backups/pre_alter_*.sql.gz`),
     `varchar(8)` → `varchar(64)`, cele 26 `main` + 3 `bonus` intacte.
   - **Build pack: Docker Compose** — listboxul apare abia după ce ai ales
     repo-ul.
   - **Base directory**: `/`
   - **Compose file**: `/docker-compose.coolify.yml`. Eticheta din UI e „Compose
     file", nu „Docker Compose Location", și apare doar după ce alegi build
     pack-ul. Valoarea implicită e `/docker-compose.yaml` — alt nume, altă
     extensie; dacă o lași, Coolify nu găsește nimic.

   Ecranul are DOI pași (`current_step`): întâi alegi cheia privată, apoi apar
   Repository URL / Branch / Build pack.
3. **Load/Parse** compose-ul. Trebuie să apară exact 5 servicii:
   `redis`, `api`, `web`, `admin`, `router`. Postgres NU e printre ele — e o
   resursă separată (pasul 0 de mai jos).
4. **Advanced → secțiunea „Docker compose" → dropdownul „Predefined network"**,
   pe aplicație. NU e o bifă și nu se numește „Connect to Predefined Network":
   e un listbox (`isConnectToDockerNetworkEnabled`, `advanced.blade.php:116`) cu
   „Isolated network only" (implicit) și **„Connect to predefined network"** —
   alege-l pe al doilea. Fără el, containerele din compose nu văd resursa de
   bază de date și API-ul pornește fără DB.

   Lângă el e „Compose deployment": lasă-l pe **Managed by Coolify**; „Raw
   (deploy file as-is)" ar însemna să configurezi singur partea de proxy.

   ⚠️ Secțiunea apare **doar după ce aplicația există** și are build pack
   `dockercompose` — e condiționată pe exact asta
   (`@if ($application->build_pack === 'dockercompose')`). Dacă n-o vezi, ori
   ești încă înainte de pasul 2, ori te uiți la resursa de bază de date.
5. **Environment Variables** — vezi §3.3.
6. **Domains** — numai pe serviciul `router`, restul rămân fără. Vezi Pas 5 din §4.
7. **Deploy**.

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
`POSTGRES_HOST` (UUID-ul resursei de bază), `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET`, `SETTINGS_ENCRYPTION_KEY`,
`APP_URL`, `ADMIN_URL`, `API_URL`, `DEFAULT_SITE_DOMAIN`, `ADMIN_EMAILS`,
`MAIL_FROM`.

⚠️ **Nu căuta bifa „Build Variable"** — nu există în v4.3.10. `is_build_time` nu apare
nici în model, nici în interfață. Și nici nu e nevoie: pentru build pack-ul
Docker Compose, Coolify scrie un `.env` în directorul proiectului
(`$service['env_file'] = ['.env']`) și rulează `docker compose up --build` de
acolo, deci `args:` din compose — toate variabilele `NEXT_PUBLIC_*` — își iau
valorile automat.

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

### 3.5 Varianta cu risc mai mic: două mutări separate

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
refăcută, nu e opțională.

Fiindcă baza e resursă gestionată (§3.2, pasul 1b), se face din interfața ei, cu
destinația în afara serverului:

1. **Settings → Storages → S3 Storages** în Coolify: adaugă bucketul R2 ca
   destinație S3. Endpoint `https://<account>.r2.cloudflarestorage.com`, cheile
   de la §3.1.2. Poate fi bucketul de producție sau, mai curat, unul separat
   (ex. `manelecadou-backups`) — dump-urile n-au ce căuta lângă fișierele
   servite public.
2. **Resursa de bază de date → Backups → Add**: frecvență `0 3 * * *`,
   „Save to S3" pornit, storage-ul de mai sus, retenție după cât vrei să ții.
3. **Rulează unul manual acum** și verifică în bucket că fișierul chiar apare.
   Un backup neverificat nu e backup.

Restore: din aceeași pagină, butonul de restore pe un backup din listă.

Ce NU mai e nevoie: „Pre-deployment Command", volumul `pg_backups` și dump-urile
scrise pe același disc cu baza — toate au dispărut odată cu mutarea bazei în
resursă separată.

⚠️ Backup-ul programat acoperă ritmul zilnic, nu momentul dinaintea unui deploy
riscant. Înainte de un deploy cu schimbări de schemă, apasă manual un backup.

⚠️ Volumul `caddy_data` de pe Ionos (certificatele Let's Encrypt) **nu se
migrează** — pe stack-ul nou certificatele le emite Traefik de la zero.

---

## 4. Cutover

### Pas 1 — migrarea de schemă, PE IONOS ✅ FĂCUT

**Rulat pe producție la 27 aug 2026.** `video_collages.track` e acum
`varchar(64)`, default-ul repus, cele 26 `main` + 3 `bonus` intacte. Backup
înainte în `/backups/pre_alter_2026-08-27_210125.sql.gz`. Nu mai e nimic de
făcut aici; dump-ul de la Pas 2 ajunge pe Coolify deja corect.

De ce era obligatoriu: TypeORM cu `synchronize: true` nu face ALTER la
schimbarea de lungime — face DROP + ADD, iar colajele pe bonus s-ar fi ratat la
listare și la regenerare.

<details>
<summary>Comanda, dacă vreodată trebuie repetată pe altă bază</summary>

Imaginea api de pe Ionos nu conține `scripts/`, iar scriptul citește conexiunea
din `PG*`, nu din `POSTGRES_*` — de aceea se copiază în container și se rulează
din `/app`:

```bash
scp apps/api/scripts/migrate-prod-to-new-stack.mjs VPSIonos:/tmp/mig.mjs
ssh VPSIonos 'docker cp /tmp/mig.mjs manele-api-1:/app/mig.mjs && \
  docker exec -w /app \
    -e PGHOST=postgres -e PGUSER=manelecadou -e PGDATABASE=manelecadou \
    -e PGPASSWORD="$(grep "^POSTGRES_PASSWORD=" /home/manele/.env | cut -d= -f2-)" \
    manele-api-1 node mig.mjs --phase=pre'
```

`--phase=check` raportează fără să scrie; `--phase=pre --dry-run` arată SQL-ul.
</details>

### Pas 2 — dump + restore
```bash
# pe Ionos
ssh VPSIonos 'docker exec manele-postgres-1 pg_dump -U manelecadou manelecadou | gzip > /backups/cutover.sql.gz'
scp VPSIonos:/backups/cutover.sql.gz .

# pe serverul Coolify. Containerul bazei e numit după UUID-ul resursei —
# îl vezi cu `docker ps | grep postgres` sau în pagina resursei.
scp cutover.sql.gz ovh:/tmp/
ssh ovh 'gunzip -c /tmp/cutover.sql.gz | docker exec -i <uuid-resursei> psql -U <POSTGRES_USER> <POSTGRES_DB>'
```
Baza de producție are ~330 MB, deci transferul e de ordinul minutelor.

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
