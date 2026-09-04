# CLAUDE.md — manelecadou

Reference de lucru pentru Claude Code pe acest repo. Citește-l înainte de orice
modificare non-trivială: descrie stack-ul real, deploy-ul actual, convențiile
descoperite empiric și capcanele deja plătite o dată.

> ## Trei lucruri de știut înainte de orice
>
> 1. **Producția e pe Coolify (OVH `37.187.159.41`)** din 28 august 2026. Ionos
>    (`212.227.184.215`) mai rulează, dar **nu mai primește trafic** și baza lui e
>    înghețată în ziua mutării. Interogările pe el răspund frumos, cu date vechi.
>    Vezi §5. Stack-ul vechi e descris, ca istorie, în **anexa A**.
> 2. **`git push` NU deployează.** Repo-ul e legat prin deploy key, deci Coolify
>    n-are webhook în GitHub. Deploy-ul se pornește explicit:
>    `make deploy-coolify`. Vezi §6.
> 3. **Accesul la producție trece prin `deploy/prod.sh`** — DB, API de admin,
>    loguri, dump. Nu prin `ssh VPSIonos`. Vezi §7.

**Documentele istorice** (`docs/legacy/`) descriu infrastructura de dinainte de
cutover. Sunt utile ca arheologie, nu ca instrucțiuni.

---

## 1. Ce face aplicația

Platformă SaaS multi-tenant pentru generare de manele AI personalizate (cadou).
Un singur backend + o singură bază, partiționată prin `siteId`. Traefik termină
TLS și emite certificate Let's Encrypt pentru fiecare domeniu; un router nginx
intern împarte traficul între API, site și admin. Un site nou = A record DNS +
domeniul în Coolify + un site în admin (§14).

**Tenantul = un domeniu** (ex. `manelecadou.ro`, `doroparaggelia.gr`) cu propriul:
- locale, valută, preț
- branding (logo, culori, tagline, OG image)
- prompt-uri Suno + lyrics writer (OpenAI)
- email config (PowerMail/SMTP), date firmă, social, support
- mod de afișare: **normal | maintenanceMode | hiddenMode** (vezi §8)

---

## 2. Stack

| Strat         | Tech                                 | Local        | Producție                |
|---------------|--------------------------------------|--------------|--------------------------|
| Web public    | Next.js 15 app router + next-intl 4   | `:1500`      | container `web`          |
| Admin         | Next.js 15 app router + Radix UI      | `:1505`      | container `admin`        |
| API           | NestJS 10 + TypeORM 0.3 + BullMQ      | `:1501`      | container `api` (`:3000`)|
| DB            | Postgres 16                           | `:1502`      | resursă gestionată Coolify|
| Cache/coadă   | Redis 7                               | `:1503`      | container `redis`        |
| DB UI         | Adminer                               | `:1504`      | — (doar local)           |
| TLS + intrare | Traefik v3.6 (`coolify-proxy`)        | —            | `:80`, `:443`            |
| Router intern | nginx (`deploy/router/`)              | —            | container `router`       |
| Fișiere       | disc local / Cloudflare R2            | disc         | R2 + `files.manelecadou.ro`|

**Externals**: OpenAI (versuri + agentul de chat), sunoapi.org și Lyria (audio),
Stripe (un singur cont pentru toate site-urile), PowerMail peste Amazon SES (email),
Cloudflare (DNS **only**, fără proxy — vezi §12), Cloudflare R2 (fișiere).

**Repo-ul NU e pnpm workspace.** Fiecare app (`apps/api`, `apps/web`,
`apps/admin`) are propriul `package.json` și `pnpm-lock.yaml`. Nu există
`package.json` la root — comenzile `pnpm` se rulează din directorul appului.

---
## 3. Structura repo

```
manelecadou/
├── apps/
│   ├── api/                  NestJS — toate modulele backend
│   │   ├── src/modules/      auth, sites, payments, suno, lyria, lyrics, mail,
│   │   │                     chat, analytics, generations,
│   │   │                     promo, roulette, kb, errors, ai-assistant,
│   │   │                     guest-sessions, users, settings, suggestions,
│   │   │                     experiences, identity, collage, invoices,
│   │   │                     recovery, media, database-admin, admin, health
│   │   ├── src/storage/      disc local sau Cloudflare R2 (§5.3)
│   │   ├── scripts/          migrare R2 + date prod + domenii Coolify (§5.5)
│   │   ├── src/database/     TypeORM datasource + migrations runtime
│   │   ├── src/mailer/       templates (i18n) + PowerMail/SMTP providers
│   │   ├── src/openai/       lyrics writer/critic + translation
│   │   ├── src/common/       JwtAuthGuard, AdminGuard, decorators
│   │   ├── Dockerfile        prod multi-stage (nest build → node dist/main.js)
│   │   └── Dockerfile.dev    dev hot-reload (nest start --watch)
│   ├── web/                  Next.js — site-uri publice multi-tenant
│   │   ├── app/              app router (page.tsx server / client)
│   │   ├── experiences/      interfețe: classic + cadou, registry, assign (§10)
│   │   ├── components/       SiteShell, Generator, MaintenancePage, Tracker...
│   │   ├── lib/site-shared.ts  funcții pure (server-safe import)
│   │   ├── lib/site-config.ts  getSiteConfig() — server-only (next/headers)
│   │   ├── lib/site-context.tsx useSite() pentru client components
│   │   ├── middleware.ts     blochează request-ul cu 444 dacă hiddenMode
│   │   ├── messages/         8 locale (ro, bg, sr, tr, el, hr, sl, bs)
│   │   ├── i18n/             next-intl config (request.ts, locales.ts)
│   │   └── Dockerfile        prod build (Next.js standalone-NU folosim, pnpm start)
│   └── admin/                Next.js — dashboard (Radix UI, Tanstack Query)
│       ├── app/(dashboard)/  sites, users, payments, generations, suno, mail
│       │                     chat, promo, analytics, errors,
│       │                     guests, settings, database
│       ├── app/login/        magic link flow
│       └── lib/api/          client SDK către NestJS API
├── deploy/
│   ├── prod.sh               ACCES LA PRODUCȚIE: psql, api admin, loguri, dump (§7)
│   ├── coolify-deploy.sh     declanșează un deploy (push-ul NU deployează — §6.1)
│   └── router/               nginx-ul care împarte traficul pe path/host (§5.1)
│       ├── nginx.conf
│       └── Dockerfile        configul se COPIAZĂ în imagine, nu se montează (§5.1)
├── docker-compose.coolify.yml  ⭐ PRODUCȚIA — 5 servicii, fără Caddy, cu R2
├── docker-compose.yml        DEV (postgres + redis + adminer + api hot-reload)
├── docker-compose.prod.yml   Ionos, decomisionat (anexa A)
├── Caddyfile                 Ionos, decomisionat (anexa A)
├── Makefile                  make deploy-coolify · make coolify-domains
├── .env / .env.example       NU sunt commit-uite
├── .claude/skills/           start-app, add-site, ops-* (§18)
├── docs/
│   ├── COOLIFY_R2.md         runbook-ul mutării, pas cu pas
│   ├── ADMIN_STUDIO.md       ecranele de configurare per tenant
│   └── legacy/               documentație de dinainte de cutover (arheologie)
└── AGENTS.md                 punct de intrare pentru alți agenți → trimite aici
```

---

## 4. Local dev

Skill `/start-app` pornește totul. Manual:
```bash
docker compose up -d                         # postgres, redis, adminer, api
cd apps/web && pnpm dev &                    # :1500
cd apps/admin && pnpm dev &                  # :1505
```

URL-uri locale:
- Web: http://localhost:1500
- Admin: http://localhost:1505
- API: http://localhost:1501 (prefix `/api/*`, plus `/health`)
- Adminer: http://localhost:1504 (server: `postgres`, user: `manelecadou`, db: `manelecadou`)

**Multi-tenant local**: domenii `*.local` în `/etc/hosts` → `127.0.0.1`, plus un site în admin cu `domain=manele-x.local`. Nici Traefik, nici routerul nu rulează local — te conectezi direct la porturile appurilor, iar web app citește Host header-ul direct.

**Restart API after env change**: `docker compose restart api`.

---

## 5. Producție — Coolify + Cloudflare R2

Aici rulează site-urile reale. Runbook-ul complet al mutării, cu pașii și
verificările: **`docs/COOLIFY_R2.md`**.

### 5.0 Unde

| | |
|---|---|
| Coolify | <https://coolify.freevox.ro> (v4.3.14 — se auto-actualizează, vezi §12 pct. 29) |
| Server | OVH `37.187.159.41`, alias SSH `ovh` — 16 vCPU / 62 GB RAM / 387 GB liberi |
| Proxy | Traefik v3.6 (`coolify-proxy`), HTTP-01 pe resolver-ul `letsencrypt` |
| Vecini pe server | Wingo CRM + mailul Stalwart — nu se ating, tot ce publicăm trece prin Traefik |

**Cutover făcut în 28 august 2026.** Cele 7 domenii publice
(`manelecadou.ro`, `www`, `admin`, `chalgapodarok.bg` + `www`,
`doroparaggelia.gr` + `www`) arată spre `37.187.159.41`. `files`, `file`, `mail`
și `openreplay` au rămas neatinse, pe serverele lor.

O lecție din ziua aia: **Traefik cere certificatul în clipa în care vede
domeniul**, nu la primul request. Domeniile fuseseră adăugate înainte de DNS,
deci Let's Encrypt a validat spre Ionos și a eșuat pe toate șapte, iar Traefik a
intrat în backoff — după mutarea DNS-ului site-urile serveau tot
`TRAEFIK DEFAULT CERT`. Fixul e un `docker restart coolify-proxy`, care reia
ACME imediat: toate cele 7 certificate au fost emise în mai puțin de un minut.
Dacă mai muți domenii, ori le adaugi după DNS, ori repornești proxy-ul după.

### 5.1 Traficul

```
internet ─► Traefik (Coolify, TLS) ─► router:80 ─┬─ /api /socket.io /health /uploads ─► api:3000
                                                  ├─ admin.<domeniu>                 ─► admin:1505
                                                  └─ restul                          ─► web:1500
```

`router` = nginx în stack, config în `deploy/router/nginx.conf`. Există pentru
că ruta publică e împărțită pe path: în varianta nativă Coolify ar trebui patru
intrări de path pe serviciul `api` pentru **fiecare** domeniu de tenant, plus
grija la stripPrefix (care ar tăia `/api` din calea trimisă mai departe).

**În Coolify, domeniile se pun pe un SINGUR serviciu: `router`.** Toate
domeniile publice + `admin.<domeniu>`. `api`, `web`, `admin`, `postgres` și
`redis` rămân fără domeniu. Un site nou = încă un rând în același câmp.

Fișiere: `docker-compose.coolify.yml` (fără Caddy, cu paritate completă de env
față de `docker-compose.prod.yml`), `deploy/coolify-deploy.sh`, target
`make deploy-coolify`.

⚠️ **`git push` singur NU deployează.** Repo-ul e legat prin deploy key, iar
pentru sursele de tip deploy key Coolify nu poate crea singur webhook-ul în
GitHub — toate deploy-urile apar în istoric ca „Manual". Deploy-ul se pornește
fie din UI (**Actions → Redeploy**), fie din terminal cu
`make deploy-coolify` având `COOLIFY_URL` / `COOLIFY_TOKEN` / `COOLIFY_RESOURCE_UUID`
în env. Dacă vrei totuși push-to-deploy, ia URL-ul și secretul din resursă →
**Webhooks → Manual Git webhooks → GitHub** și adaugă-le ca webhook în GitHub;
înseamnă însă că orice push pe `main` ajunge direct pe producție.

Două lucruri pe care Coolify le face altfel decât te-ai aștepta, ambele
descoperite citindu-i sursa, nu documentația:

1. **Nu montăm `nginx.conf`, îl copiem în imagine** (`deploy/router/Dockerfile`).
   Pentru un volum scris ca string, Coolify nu poate ști dacă sursa e fișier sau
   director și presupune director (`bootstrap/helpers/shared.php`,
   `$isDirectory = true`). Bind mount-ul ar fi transformat configul într-un
   folder gol, iar tot traficul ar fi căzut pe pagina implicită nginx.
2. **`ops` nu e în compose-ul de Coolify.** Coolify ignoră `profiles:` — nu apare
   nici în parser, nici în jobul de deploy — deci l-ar construi și porni la
   fiecare deploy, degeaba. Rămâne în `docker-compose.prod.yml`; routerul îl
   tolerează lipsă (`/ops` dă 502, nu rupe nginx-ul).
3. **Postgres nu e în compose**, ci resursă gestionată de Coolify. Doar așa
   capătă backup-uri programate direct într-un bucket S3/R2
   (`ScheduledDatabaseBackup.save_s3`), cu retenție și restore din UI; în
   compose, dump-urile ar fi stat pe același disc cu baza. `POSTGRES_HOST` =
   **UUID-ul resursei de bază** (hostname-ul intern e chiar UUID-ul), iar pe
   aplicație trebuie bifat **„Connect to Predefined Network"**, altfel
   containerele nu văd baza. Redis rămâne în compose: coadă + cache, fără
   istoric de salvat.

Stack-ul de Coolify are deci **5 servicii**: `redis`, `api`, `web`, `admin`,
`router`.

⚠️ **Nu căuta bifa „Build Variable" în Coolify** — nu există (verificat pe v4.3.10)
(`is_build_time` nu apare nici în model, nici în interfață). Nici nu e nevoie:
pentru build pack-ul Docker Compose, Coolify scrie un `.env` în directorul
proiectului (`$service['env_file'] = ['.env']`) și rulează
`docker compose up --build` de acolo, deci `args:` — adică toate variabilele
`NEXT_PUBLIC_*`, pe care Next.js le fixează în bundle — își iau valorile automat.

Fluxul de creare a resursei, ca să nu-l cauți: **Keys & Tokens → Private Keys →
săgeata de lângă „+ New private key" → Generate ED25519** (butonul în sine cere
o cheie existentă, lipită manual), copiezi `public_key` în GitHub → Deploy keys,
apoi **+ New Resource → Private Repository (with deploy key)**. Ecranul are doi
pași: cheia, apoi Repository URL / Branch / **Build pack: Docker Compose** /
**Compose file** (implicit `/docker-compose.yaml`, de schimbat în
`/docker-compose.coolify.yml`). Rețeaua comună cu baza de date se alege din
**Advanced → „Docker compose" → dropdownul „Predefined network"** →
*Connect to predefined network* (nu e o bifă, iar secțiunea apare doar pentru
aplicații cu build pack `dockercompose`); domeniile per serviciu, în **General**.

### 5.2 Două hop-uri de proxy

`TRUST_PROXY_HOPS=2` (Traefik + router). Greșit, `req.ip` devine IP-ul
router-ului → throttler global (429 pentru toți) și IP eronat în
analytics/OpenReplay.

### 5.3 Fișiere pe R2

`STORAGE_DRIVER=r2`. DB-ul păstrează în continuare path-uri `/uploads/...`;
`GET /uploads/*` din API face:

1. fișierul e pe disc → îl servește `express.static` (cu Range — seek în player)
2. altfel, dacă `R2_PUBLIC_URL` e setat → 302 spre CDN
3. altfel → proxy stream din bucket (cu Range)

Deci **niciun URL vechi nu se rupe**, iar un fișier scăpat de sync nu devine
404. `R2_PUBLIC_URL` (custom domain pe bucket) e obligatoriu în producție: fără
el tot audio-ul trece prin API și iOS Safari refuză des redarea.

Tot ce scrie fișiere trece prin `StorageService` (`apps/api/src/storage/`):
`saveBuffer` (scrie local + urcă), `syncFile` (urcă ce a produs ffmpeg),
`ensureLocal` (aduce pe disc pentru ffmpeg), `list` (disc + bucket reunite),
`delete` (ambele locuri). Dacă adaugi un serviciu care scrie în `uploads/`,
folosește-l — altfel fișierul există doar pe containerul curent.

Configurarea R2 se poate face și din admin `/settings` → Chei (DB întâi, env ca
rezervă), cu reinițializare la salvare. Credențiale lipsă nu opresc API-ul: cade
pe disc și loghează eroarea.

**Două bucketuri: producție și dev.** Comutatorul e `STORAGE_CONFIG_SOURCE`:
`db` (producție — cheile din admin), `env` (dev — baza e ignorată complet),
`auto` (implicit: `env` în afara producției, `db` în producție).

Există pentru un scenariu foarte concret: pe dev lucrăm cu un dump al bazei de
producție, iar dump-ul aduce cheile R2 **reale** în `app_settings`. Citite
DB-first, un `storage.delete` dintr-un test local ar șterge melodia unui client
care a plătit-o. `docker-compose.yml` (dev) fixează `env`;
`docker-compose.coolify.yml` fixează `db`.

Bucketul activ apare în loguri la boot: `storage=r2 bucket=… (config=db, boot)`.
Scriptul de sync cere `R2_CONFIRM_BUCKET` egal cu `R2_BUCKET` la orice rulare
reală, exact ca să nu urci în bucketul greșit.

Calea de cod S3 e acoperită de `src/storage/storage-s3.spec.ts` — rulează pe un
MinIO local (R2 e S3-compatibil) și verifică scriere, citire, listare, **Range**
și ștergere. Se sare singur fără `S3_TEST_ENDPOINT`, deci nu leagă `npm test` de
Docker. Dacă atingi `StorageService`, rulează-l cu MinIO pornit.

### 5.4 Backup

Postgres e **resursă gestionată de Coolify**, tocmai ca backup-ul să nu stea pe
același disc cu baza. Programare: zilnic **03:00 UTC**, retenție 14 fișiere / 30
de zile, restaurabil din UI → *Databases → postgresql-manelecadou → Backups*.

```bash
deploy/prod.sh dump                 # dump gzip descărcat local, oricând
```

⚠️ **Backup-ul e deocamdată doar local pe server** (`/data/coolify/backups/`).
Off-site-ul cere un bucket R2 dedicat, care **nu există încă** — vezi lista de la
finalul §5.5. Nu-l pune în bucketul de uploads: acela e servit public prin
`files.manelecadou.ro`, deci dump-ul ar fi descărcabil de oricine ghicește calea.

---
### 5.5 Scripturi de operare (`apps/api/scripts/`)

| Script | Când |
|---|---|
| `sync-uploads-to-r2.mjs` | oricând înainte + delta la cutover. Idempotent, paralel, compară mărimile |
| `verify-r2-migration.mjs` | **poarta de cutover**: fiecare fișier referit din DB există în R2? Exit 0 = poți muta DNS-ul |
| `migrate-prod-to-new-stack.mjs` | `--phase=pre` **pe Ionos, înainte de dump**, `--phase=post` după pornirea codului nou, `--phase=rollout` pentru configurarea per tenant, `--phase=check` oricând |
| `coolify-domains.mjs` | lista de domenii pentru câmpul „Domains" al lui `router`. Read-only — o lipești tu |

`--phase=pre` face un singur lucru, dar esențial: lărgește
`video_collages.track` la `varchar(64)`. Vezi §12 pct. 10 pentru de ce.

Se rulează **pe Ionos, înainte de `pg_dump`**: pe Coolify API-ul pornește odată
cu restul stack-ului, deci n-ai o fereastră în care baza există dar codul nou
n-a pornit încă. Cu ALTER-ul făcut din timp, dump-ul ajunge deja corect.

Scripturile astea și-au făcut treaba la cutover. `coolify-domains.mjs` rămâne
util la fiecare site nou (§14); restul sunt istorie, dar merită citite dacă mai
faci vreodată o mutare.

**Ce a rămas deschis după cutover:**

| | |
|---|---|
| Backup off-site | cere un bucket R2 dedicat (ex. `manelecadou-backups`, **fără** domeniu public) + un token pentru el. Tokenul actual acoperă doar bucketurile de fișiere, iar bucketul de uploads e servit public prin `files.manelecadou.ro` — un dump acolo ar fi descărcabil de oricine. Apoi: Coolify → *S3 Storages* → adaugi bucketul; resursa de bază → *Backups → Manage* → bifezi „Save to S3". |
| „Claude Ops" dă 502 | containerul `ops` nu e în compose-ul de Coolify (§19.7, anexa A.10) |
| Ionos pornit | rămâne ca plasă de siguranță; se poate opri când ai încredere în stack-ul nou |
## 6. Deploy

### 6.1 Cum se dă drumul

```bash
make deploy-coolify        # sau: bash deploy/coolify-deploy.sh
```

**`git push` singur nu face nimic.** Repo-ul e conectat prin deploy key, iar
pentru sursele de tip deploy key Coolify nu poate crea singur webhook în GitHub —
în istoricul de deploy-uri totul apare ca „Manual". Codul urcat fără comanda de
mai sus rămâne, pur și simplu, nedeployat. (Dacă vrei totuși push-to-deploy: URL
și secret din resursă → *Webhooks → Manual Git webhooks → GitHub*. Înseamnă însă
că orice push pe `main` ajunge direct în producție.)

Scriptul are două căi: cu `COOLIFY_TOKEN` merge prin API și **așteaptă verdictul**;
fără token pornește deploy-ul prin SSH (`queue_application_deployment`, exact ce
apelează butonul din UI) și iese imediat, fără să aștepte.

**Nu există deploy pe serviciu.** Pe Coolify se construiește și repornește tot
stack-ul. Targeturile `make deploy-api` / `deploy-web` / `deploy-admin` există
încă, dar sunt pentru Ionos și cer `IONOS=1` explicit (`ionos-guard` în Makefile) —
tocmai ca să nu deployezi din obișnuință pe serverul care nu mai servește pe nimeni.

### 6.2 Verificare după deploy

```bash
curl -s https://manelecadou.ro/health
deploy/prod.sh ps                      # toate serviciile Up / healthy
deploy/prod.sh logs api 100            # dacă ceva scârțâie
```

Cele 7 domenii publice, dintr-o mișcare:

```bash
for d in manelecadou.ro www.manelecadou.ro admin.manelecadou.ro \
         chalgapodarok.bg www.chalgapodarok.bg \
         doroparaggelia.gr www.doroparaggelia.gr; do
  printf '%-28s %s\n' "$d" "$(curl -s -o /dev/null -w '%{http_code}' "https://$d")"
done
```

### 6.3 Rollback

- **Cod**: Coolify → resursă → *Deployments* → un deploy anterior → *Redeploy*.
  Imaginile sunt tag-uite cu commit-ul, deci întoarcerea e imediată.
- **Bază**: UI-ul Coolify → *Databases → Backups → Restore*. Ai și dump-ul propriu
  dinainte de operație, dacă ai luat unul cu `deploy/prod.sh dump`.

Codul și baza se rostogolesc **separat**. Dacă deploy-ul a adăugat coloane
(`synchronize`), un rollback de cod le lasă pe loc — de obicei inofensiv, fiindcă
sunt aditive. Invers nu e adevărat: vezi §6.4.
### 6.4 Schimbări de schemă (TypeORM `synchronize: true` în prod)

**Decizie 2026-05-11**: `synchronize` e ON pe prod. La fiecare boot al API-ului,
TypeORM aliniază schema cu entitățile (`CREATE TABLE`, `ADD COLUMN`, etc.).

⚠️ **Pe Coolify nu mai există backup automat pre-deploy.** Pe Ionos, `deploy.sh`
făcea un `pg_dump` înainte de fiecare build; scriptul acela era pe VPS și a rămas
acolo. Acum plasa de siguranță e backup-ul zilnic de la 03:00 UTC — care poate fi
vechi de 23 de ore. **Înainte de un deploy cu schimbare de schemă, ia-ți dump-ul
tău**, e o singură comandă:

```bash
deploy/prod.sh dump      # apoi dai deploy
```

Vezi `apps/api/src/database/database.module.ts`:
```typescript
synchronize: config.get<string>('DB_SYNCHRONIZE') !== 'false',  // default ON
```

**Workflow normal pentru schema change:**
1. Modifici `@Entity` (adaugi câmpuri / index-uri).
2. `deploy/prod.sh dump` — dump-ul tău, de dinainte.
3. `git commit && make deploy-coolify`.
4. La boot, TypeORM execută `ADD COLUMN` etc.
5. `curl -s https://manelecadou.ro/health` — API-ul răspunde.
6. Dacă a mers prost: restore din UI-ul Coolify (*Databases → Backups*) sau din
   dump-ul de la pasul 2.

**Setări pentru a opri temporar synchronize** (ex. fereastră de migrare manuală):
Coolify → resursă → *Environment Variables* → `DB_SYNCHRONIZE=false` → *Restart*.
Repornește doar containerul, fără rebuild.

#### ⚠️ Operații care DROP date (verifică INTOTDEAUNA înainte de deploy)

TypeORM `synchronize` poate șterge date dacă modifici entitățile în feluri care îi cer să recreeze. **Reguli stricte**:

| Operație în entity                              | Ce face synchronize         | Verdict                  |
|-------------------------------------------------|------------------------------|--------------------------|
| Adaugi `@Column` nou (cu default sau nullable)  | `ADD COLUMN`                 | ✅ Safe                  |
| Adaugi `@Index` nou                             | `CREATE INDEX`               | ✅ Safe                  |
| Adaugi `@Entity` nou                            | `CREATE TABLE`               | ✅ Safe                  |
| Ștergi `@Column` din entity                     | `DROP COLUMN` (pierzi date!) | ❌ Migrate manual        |
| Schimbi tipul `@Column` (varchar→int etc.)      | `DROP+ADD` (pierzi date!)    | ❌ Migrate manual        |
| Redenumești `@Column` (`name`→`fullName`)       | `DROP old + ADD new` (pierzi!)| ❌ Migrate manual       |
| Schimbi `nullable: true` → `false` cu null-uri  | `ALTER` care eșuează cu data | ⚠️ Backfill data întâi   |
| Schimbi `default` pe coloană                    | `ALTER DEFAULT`              | ⚠️ Nu afectează rândurile existente |
| Adaugi `unique: true` pe coloană cu duplicate   | `CREATE UNIQUE` eșuează      | ⚠️ Curăță duplicate întâi |

**Pentru orice ❌ sau ⚠️**: opresc synchronize temporar, fă migrarea manuală pe SQL, apoi pornește înapoi:
```bash
# 1. ALTER manual pe Postgres prod
deploy/prod.sh psql 'ALTER TABLE users RENAME COLUMN "name" TO "fullName"'
# 2. Modifică entity să reflecte starea nouă
# 3. Deploy normal — synchronize vede schema deja aliniată și nu face nimic
make deploy-coolify
```

**Înainte de un deploy cu schimbare de schemă**, compară ce e în bază cu ce vrei
să obții — e mai rapid decât să deduci din entități:

```bash
deploy/prod.sh psql '\d+ users'          # coloanele reale, cu tipuri
```

---

## 7. Acces la producție

Un singur punct de intrare: **`deploy/prod.sh`**. Merge de pe Mac (prin `ssh ovh`)
și de pe server, detectând singur unde rulează.

```bash
deploy/prod.sh psql     "SELECT count(*) FROM generations"   # tabelar, de citit
deploy/prod.sh psql-tsv "SELECT id, email FROM users LIMIT 5" # separat cu |, de parsat
deploy/prod.sh sql-file ./query.sql
deploy/prod.sh api GET  /api/admin/sites
deploy/prod.sh api POST /api/admin/generations/<id>/retry '{}'
deploy/prod.sh logs api 200        # follow
deploy/prod.sh shell api
deploy/prod.sh ps
deploy/prod.sh dump                # dump gzip, local
```

**De ce un script și nu comenzi în documentație.** Răspunsul la „cum ajung la baza
de producție" s-a schimbat la cutover, iar varianta veche era copiată, în forme
ușor diferite, în șapte skill-uri. Toate arătau spre Ionos — adică spre baza
înghețată în ziua mutării. Cel mai urât mod de a greși: interogările răspund
frumos, cu date vechi de luni de zile, iar o scriere „repară" o comandă pe care
n-o mai citește nimeni. Un singur loc e mai ușor de ținut corect.

Trei lucruri pe care le rezolvă, și pe care le-ai greși scriind comanda de mână:

1. **Numele containerelor conțin hash-ul deploy-ului**
   (`api-tzjg60mashnbuojrjdffa5e7-170548547913`) și se schimbă la fiecare deploy.
   Scriptul le caută după etichetele Compose (`com.docker.compose.service=api`,
   proiect = UUID-ul resursei Coolify), care sunt stabile.
2. **Postgres nu e în compose-ul aplicației** — e resursă gestionată de Coolify,
   cu alt container, găsit după `coolify.resourceName=postgresql-manelecadou`.
3. **SQL-ul și JSON-ul trec base64** până la destinație, deci ghilimelele,
   apostrofurile și diacriticele ajung intacte. Scrie-le normal:
   `deploy/prod.sh psql "SELECT * FROM x WHERE nume = 'Ștefan' AND tip = \"a\""`
   funcționează, în ciuda celor trei straturi de shell dintre tine și `psql`.

Pentru API: JWT-ul e semnat **înăuntru** containerului `api`, unde e `JWT_SECRET`,
cu `crypto` (imaginea nu are `curl` și nu poate face `require("jsonwebtoken")`);
requestul pleacă cu `fetch` nativ spre `127.0.0.1:3000`. `AdminGuard` cere doar
`role=admin` în token, fără lookup în DB.

> **Nu există rol read-only.** Pe Ionos exista `claude_ops`, fără DDL. Pe stack-ul
> nou conexiunea e cu utilizatorul aplicației, care poate `DROP TABLE`. Singura
> plasă rămasă e disciplina din `.claude/skills/ops-db/SKILL.md`: arată întâi ce
> afectezi, cere confirmare, scrie în tranzacție cu `RETURNING`.

**Ce NU face scriptul**: nu deployează (aia e `make deploy-coolify`) și nu
restaurează backup-uri (aia e UI-ul Coolify).
## 8. Multi-tenant model

Tabel `sites` are tot ce ține de tenant. `siteId` e index pe toate tabelele cu date (users, generations, payments, magic_links, promo_codes, conversations, chat_messages, analytics_*, suno_logs, errors, mail_*, app_settings, etc.).

**Rezolvare site per request**:
- `SiteContextMiddleware` (în API) rulează înaintea guards.
- Pentru `role='user'`: forțează `req.siteId = jwt.payload.siteId` (anti-abuz, ignoră headere).
- Pentru `role='admin'` cu header `x-site-id: all`: `req.siteId = undefined` (cross-tenant view în admin).
- Altfel: fallback header `x-site-id` → Host header → default site.

**Cache**: `SitesService` are cache in-memory 30s per `domain` + `id`. Update via admin invalidate-uiește automat.

**JWT**: include `siteId` și `role`. `JwtAuthGuard` populează `req.user`.

**Magic link host detection**: dacă request-ul `POST /api/auth/magic-link/request` vine pe Host = `admin.manelecadou.ro`, link-ul e construit cu `ADMIN_URL`. Altfel — cu `https://${site.domain}`. Fix în `auth.service.ts` `computeLoginBaseUrl()`.

---

## 9. Modurile site (per tenant)

Setabile din admin `/sites` per fiecare site:

| Mod                | Ce vede vizitatorul                                                | DB col            |
|--------------------|--------------------------------------------------------------------|-------------------|
| **normal**         | Site funcțional                                                    | (toate false)     |
| **maintenance**    | Pagină brandită (logo + spinner gold + mesaj custom multilocale)   | `maintenanceMode` |
| **hidden**         | `444 Empty Response` — browserul arată „site can't be reached"     | `hiddenMode`      |

**Precedența**: `hiddenMode` câștigă față de `maintenanceMode`. Implementare în `apps/web/middleware.ts` (444) + `apps/web/app/layout.tsx` (MaintenancePage).

**Mesaj mentenanță**: `Site.maintenanceMessage: Record<locale, string>`. Format text per locale: prima linie = titlu, restul = subtitlu. Fallback chain: locale curent → `site.locale` → `DEFAULT_MESSAGES[locale]` (9 limbi în `MaintenancePage.tsx`).

`robots.ts` blochează indexarea pentru `!active || maintenanceMode || hiddenMode`.

---

## 10. Interfețe (experiences) — classic vs. cadou

Un tenant poate rula **mai multe design-uri** peste aceleași date. Interfața nu e
un site nou: același `siteId`, aceleași comenzi, același chat.

### 10.1 Modelul

Registry-ul e în cod (`EXPERIENCE_CATALOG = ['classic', 'cadou']`), configurarea
per tenant e în `sites.experienceConfig` (jsonb):

```jsonc
{
  "defaultSlug": "classic",
  "items": {
    "cadou": {
      "enabled": true,
      "utmRules": [{ "source": "facebook" }],
      "musicEngine": "suno",        // opțional; altfel site.musicEngine
      "packages": { /* override de preț/livrabile pe tier */ },
      "catalog":  { /* stiluri/ocazii/voci proprii + prompturi */ }
    }
  }
}
```

`experienceConfig = NULL` ⇒ site-ul rulează `classic`, exact ca înainte. E
fallback-ul sigur, testat: toate site-urile de producție pornesc așa.

### 10.2 Cum se alege interfața la un request

Ordinea (identică în `apps/api/src/modules/experiences/assign.ts` și
`apps/web/experiences/assign.ts` — **ține-le sincronizate**):

`?ui=` → cookie `mc_ui` → person (fingerprint/device) → UTM → `defaultSlug` → `classic`

**Fiecare pas trece prin `isExperienceEnabled`** — `?ui=`, cookie, amprentă, UTM.
Un slug fără intrare în `items` NU e activat. Fără garda asta, un link
`?ui=cadou` scăpat pe social ar lipi interfața pe vizitatori 365 de zile prin
cookie, iar când API-ul pică și configul vine `null`, orice cookie vechi ar
prelua site-ul.

**Oprită înseamnă inaccesibilă** (decizie 29 aug 2026). A existat o excepție —
„sticky": pe cine intrase deja pe o interfață îl lăsam pe ea și după ce
operatorul o oprea, ca să nu-i schimbăm UI-ul în mijlocul comenzii. Consecința
era că „oprită" nu însemna nimic: oricine avea cookie-ul de la un test rămânea
pe ea încă un an. Acum comutatorul chiar închide, imediat și pe toate căile;
cine e în mijlocul unei comenzi trece pe classic (comanda e pe server, nu se
pierde). Sunt **patru** locuri care trebuie să dea același verdict:

| Loc | Rol |
|---|---|
| `apps/web/experiences/assign.ts` | randarea pe site |
| `apps/api/src/modules/experiences/assign.ts` | copia din API — **ține-le sincronizate** |
| `experiences/public-config.ts` (`toPublicExperienceConfig`) | ce vede clientul în configul public |
| `experiences/package-resolve.ts` (`effectiveExperienceSlug`) | **prețul** — vezi mai jos |

`defaultSlug` **nu** e o scutire: o interfață oprită cât timp e implicită rămâne
inaccesibilă, iar site-ul cade pe `classic`. Adminul mută singur implicitul
înapoi pe classic când o oprești, ca să nu existe starea contradictorie
„Implicită + Oprită".

**`classic` se poate opri, dar condiționat** (31 aug 2026). E plasa de siguranță
a site-ului: cu `experienceConfig` lipsă sau cu implicita oprită, trebuie să
existe ce randa. Deci comutatorul ei ascultă doar cât timp o **altă** interfață
e simultan activată **și** implicită — `classicCanBeOff` din ambele `assign.ts`.
Oprești și pe aceea, classic revine singură, chiar cu `enabled: false` rămas în
JSON. În admin comutatorul apare pe cardul Classic, blocat aprins cât timp nu se
poate, cu motivul în tooltip.

Există pentru un site cu o singură interfață (ex. `manele-top.ro`, doar `cadou`):
adminul afișează linkul `?ui=classic` cu buton de copiere, iar scăpat într-o
reclamă sau într-un mesaj către clienți lipea interfața greșită pe vizitator 365
de zile, prin cookie-ul `mc_ui`.

⚠️ **Prețul se validează separat.** `x-mc-experience` (și `?ui=`) sunt controlate
de client, iar `effectiveExperienceSlug` le lua la valoarea nominală: un pachet
cu preț propriu pe o interfață OPRITĂ putea fi cotat și cumpărat trimițând
antetul de mână, fără să treci vreodată pe ea. Acum se verifică activarea acolo.
Dacă adaugi un loc care alege interfața dintr-un input de client, treci-l prin
`isExperienceEnabled`.

Ca să testezi o interfață pe un site: `enabled: true`, dar **fără** s-o pui
`defaultSlug`. Atunci `?ui=` merge pentru tine, iar restul lumii vede classic.
Cookie-ul care arată spre o interfață devenită inaccesibilă e **șters** de
middleware, nu doar ignorat — altfel ar reînvia tăcut la o reactivare.

Middleware-ul pune header-ul `x-mc-experience`; `app/layout.tsx` retrece
cookie-ul prin `resolveExperienceSlug` (rutele excluse din `matcher` nu văd
middleware-ul).

### 10.3 Precedența datelor

| Ce | Ordine |
|---|---|
| Catalog (stiluri/ocazii/voci) | `items[slug].catalog.*` → `site.*` |
| Prompt de stil | `entry.sunoPrompt` → `site.suno.stylePromptMap[id]` |
| Preț pachet | `items[slug].packages[tier].priceCents` → `site.packagePricesCents[tier]` → default din cod |
| Motor audio | `items[slug].musicEngine` → `site.musicEngine` → `suno` |
| Livrabile | `generation.packageSnapshot` (înghețat la cumpărare) → `PACKAGE_FEATURES[tier]` |

`packageSnapshot` e mecanismul care garantează că **ce s-a vândut rămâne
livrat**: dacă schimbi definiția unui pachet, comenzile vechi păstrează ce li
s-a promis.

### 10.3.1 Fontul interfeței `cadou` pe scripturi non-latine

`cadou` folosește **Outfit**, care are pe Google Fonts doar subseturile `latin`
și `latin-ext` — verificabil în `font-data.json` din `next/font`. Acoperă româna
(ș, ț, ă, â, î) și limbile sud-slave cu alfabet latin, dar **nu are greacă și
nici chirilic**.

**Rezolvat (29 aug 2026).** Pe `bg` (chirilic) și `el` (grec), interfața comută
pe **Manrope**, care acoperă ambele scripturi, e din aceeași familie geometrică
și e deja fontul de corp al interfeței `classic`. Comutarea se face din CSS, pe
`lang` de pe `<html>`:

```css
:root { --font-cadou: var(--font-outfit); }
:root:lang(bg), :root:lang(el) { --font-cadou: var(--font-cadou-intl); }
```

Manrope e declarat ca **instanță separată** în `app/layout.tsx`, cu
`preload: false` — nu ca subseturi adăugate la instanța existentă, care e
preîncărcată pe toate site-urile și ar fi livrat greacă și chirilic și celor
care nu le folosesc niciodată.

Dacă adaugi un locale cu alt script, trece-l în selectorul de mai sus. Celelalte
locale livrate (sr, bs, hr, sl, tr) sunt în **alfabet latin** — verificat pe
conținutul din `messages/`, nu presupus: sârba de pe site e latină, nu
chirilică — iar `latin-ext` le acoperă diacriticele.

Interfața `classic` nu e afectată: Cinzel + Manrope, cu alte subseturi.

### 10.3.2 Identitatea vizitatorului — regulă de securitate, nu de UX

`POST /api/identity/identify` e **public și neautentificat**. Tot ce trimite
clientul e o afirmație, nu o dovadă. Singurul lucru pe baza căruia se poate
returna guest-ul cuiva este **același rând `identity_visitors`** (potrivire
exactă de `visitorId`), cu `deviceKey` doar ca semnal secundar de confirmare.

Ce NU are voie să adopte un guest, oricât de tentant ar fi pentru continuitate:

- **`deviceKey` + IP.** Pe iOS, `deviceMemory` și `hardwareConcurrency` sunt
  `undefined`, deci toate iPhone-urile de același model produc același
  `deviceKey`, iar un /24 de operator mobil e plin de ele. Ar fi însemnat
  „Manelele mele" cu comenzile altui om, `isOwner` pe piesele lui, refacerile
  lui gratuite consumate de un străin.
- **Emailul din payload.** Oricine trimitea `{visitorId: al lui, email: al
  victimei}` primea guest-ul victimei, fără nicio amprentă. Câmpul e ignorat;
  legarea de email se face doar din propria sesiune, prin `linkEmail`.
- **Un guest revendicat de un cont** (`userId != null`). Recuperarea se face
  prin magic link.

Frâna de urgență: setarea `IDENTITY_GUEST_ADOPTION` (Setări → Avansat) —
`visitor` (implicit) sau `off`, fără redeploy. Adopțiile acordate și refuzate se
loghează cu motiv.

Prețul acceptat conștient: pe un dispozitiv nou, același om pornește cu sesiune
nouă și își recuperează comenzile prin login. E preferabil alternativei.

### 10.3.3 Fără cont de client — login-ul există doar în admin

Site-urile publice nu mai au autentificare (28 aug 2026). Nu există buton „Intră",
nu există `/login`, `/login/verify` sau `/cont`, iar clientul SDK din web nu mai
are `requestMagicLink` / `consumeMagicLink` / `gdprRequest`.

Enforcement-ul e în API, nu în UI: `POST /api/auth/magic-link/request` și
`GET /api/auth/magic-link/consume` răspund **404** dacă request-ul nu vine de pe
un host de admin. Fără asta, ascunderea butonului n-ar fi însemnat nimic —
endpoint-ul e public, deci oricine putea cere un magic link pentru orice adresă,
de pe orice domeniu, și primea un JWT de user.

Regula de host stă în `apps/api/src/modules/auth/admin-host.ts` și e **identică**
cu cea după care routerul decide ce aplicație servește (`server_name ~^admin\.`
în `deploy/router/nginx.conf`, plus host-ul din `ADMIN_URL`). Ținute la fel,
„unde se servește admin-ul" și „unde se poate face login" nu pot să divergă.
Comparația e pe host complet, **cu port**: în dev site-ul e `localhost:1500` și
admin-ul `localhost:1505`, iar pe hostname ar fi ieșit egale — adică login-ul ar
fi rămas deschis pe site exact în mediul în care testăm că e închis.
Acoperit de `admin-host.spec.ts`.

Ce ține locul contului:
- **„Manelele mele"** — link în header, apare automat când vizitatorul are cel
  puțin o comandă (`MyGenerationsCounter`), pe baza identității de vizitator.
- **Linkul din emailul de livrare**, care duce direct la `/m/<id>`.

Consecință asumată: `/cont` era și calea de self-service GDPR (export/ștergere).
Rămâne adresa din politica de confidențialitate (`legal.privacy.sec1.p`), care e
deja publicată exact pentru asta. Dacă vreodată reintroducem self-service-ul,
trebuie gândit pentru guest — adică fără să poți cere ștergerea datelor altcuiva
scriindu-i adresa (vezi capcana din §10.3.2).

### 10.4 Cum compari două interfețe

Fără măsurare, rularea a două design-uri în paralel nu răspunde la nimic.

- **`/analytics` → Marketing → cardul „Interfețe (design)"**: sesiuni, comenzi
  începute, comenzi plătite, venit și conversie, per interfață.
- Aceeași defalcare e disponibilă și ca dimensiune în matricea de marketing
  (`GET /api/admin/analytics/marketing-breakdown?dimension=experience`).
- Listele de **generări** și **plăți** au coloană + filtru „Interfață".

Rândurile de dinainte de această versiune au `experienceSlug` NULL și se citesc
peste tot ca `classic` — inclusiv în filtre, deci nu dispar din liste.

Regula de atribuire e într-un singur loc:
`apps/api/src/modules/analytics/experience-sql.ts`.

### 10.5 Ce trebuie făcut la activarea unei interfețe pe un site

1. Admin `/site` → Interfețe → activezi design-ul.
2. Interfețe → design → Pachete (preț, refaceri, colaj) și Catalog (prompturi).
3. Admin `/rollout` → „Aplică lipsurile" umple doar câmpurile goale din seed.
   **Seed-ul e în română** — pe site-uri non-RO nu se aplică automat; acolo
   prompturile se scriu manual, în limba site-ului.

---

## 11. Convenții de cod (descoperite empiric)

### 11.1 Next.js 15 — useSearchParams cere Suspense

Orice pagină `'use client'` care folosește `useSearchParams()` la nivel top trebuie wrap-uită în `<Suspense fallback={null}>`. Pattern:
```tsx
'use client';
import { Suspense, ...} from 'react';

export default function Page() {
  return <Suspense fallback={null}><PageInner /></Suspense>;
}
function PageInner() { /* original logic cu useSearchParams */ }
```
Aplicabil deja la: `/m/[id]/view`, `Generator.tsx`, `Tracker.tsx` (în layout root).

### 11.2 Server-only vs client-safe

`apps/web/lib/site-config.ts` importă `next/headers` (server-only). Nu îl importa în client components — folosește `apps/web/lib/site-shared.ts` pentru funcții pure (`formatPrice`, `siteUrl`, `siteSupportEmail`) sau `useSite()` din `site-context.tsx` pentru date hidratate client-side.

### 11.3 API URL în frontend

**Niciodată** hardcoda `https://api.manelecadou.ro` — nu există. Use same-origin:
- Client: `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/...` → produce `/api/...` în prod
- Server (SSR, middleware): `apiInternalUrl()` din `apps/web/lib/api-internal.ts`

**Capcană gravă**: nu pune `API_INTERNAL_URL` în `next.config.ts › env`. Cheile de
acolo sunt substituite la BUILD (DefinePlugin), iar în imaginea Docker variabila nu
există atunci → se bake-uiește `""`, și valoarea de la runtime din compose
(`http://api:3000`) devine ignorată. Efectul e tăcut și total: `fetch("/api/...")`
relativ pe server → „Failed to parse URL" → middleware-ul cade pe fallback
(**hiddenMode nu mai blochează**, ipWhitelist ignorat, locale mereu `ro`) și
`getSiteConfig()` randează brandul RO pe toate domeniile. Citește variabila direct
din `process.env`, prin helperul din `lib/api-internal.ts`.

Tot acolo: folosește `||`, nu `??`. `NEXT_PUBLIC_API_URL` e string **gol** în
producție (same-origin), iar `??` nu tratează `''` ca lipsă.


### 11.4 Path API NestJS

Global prefix `api` cu exclude pentru `/health`. Toate rutele controllerelor sunt `/api/<route>`, **exceptând** `/health` (root-level). Routerul trimite spre `api:3000` atât `/api/*`, cât și `/health`, `/socket.io/*` și `/uploads/*` — pe orice domeniu (§5.1).

### 11.5 i18n

`next-intl` v4, fără routing pe locale (toate URL-urile sunt fără prefix `/ro/`). Detecție:
1. Cookie `NEXT_LOCALE` (setat de switcher prin `/api/auth/locale`)
2. `site.locale` din DB
3. `NEXT_PUBLIC_DEFAULT_LOCALE`
4. `'ro'`

8 limbi în `apps/web/messages/`: ro, bg, sr, tr, el, hr, sl, bs. Switcher e ascuns prin `NEXT_PUBLIC_SHOW_LANG_SWITCHER=false` în prod (un domeniu = o limbă).

`ro.json` e sursa de adevăr. `i18n/request.ts` completează cheile lipsă dintr-o
limbă cu textul românesc — o traducere care întârzie produce o propoziție în
altă limbă, nu o pagină cu `cadou.song.title` pe ecran. Ca golul să nu rămână
invizibil:

```bash
cd apps/web && pnpm run check:messages   # iese cu 1 dacă lipsește ceva
```

Rulează-l după orice cheie nouă.

### 11.6 Imagini și video statice

Media din `public/` **nu** trece prin `next/image`: o parte sunt `background-image`
în CSS, unde nu ajunge, iar optimizarea la runtime ar costa CPU pe container la
fiecare vizitator. În schimb, variantele sunt pregenerate și commit-uite.

```bash
cd apps/web
pnpm run images         # AVIF + WebP, și recomprimă JPEG-ul sursă
pnpm run images:check   # doar verifică (exit 1 dacă manifestul nu e la zi)
pnpm run videos         # recomprimă mp4-urile
```

**Adaugi o imagine în `public/`? Rulează `pnpm run images` și commit-uiește tot
ce produce** — sursa recomprimată, variantele și manifestul.

`scripts/optimize-images.mjs` face două lucruri, în ordinea asta:

1. **Variante AVIF + WebP**, pentru locurile unde browserul poate alege:
   `<picture>` (componenta `components/Picture.tsx`) și `image-set()` în CSS.
2. **Recomprimă JPEG-ul sursă pe loc** (progresiv, q80). Pasul ăsta există pentru
   locurile care **nu pot** negocia formatul: `<video poster>`, `og:image`,
   browsere fără AVIF. De-aia se face după pasul 1 — ca variantele să plece din
   sursa nealterată.

`lib/optimized-images.json` ține minte, per imagine, dimensiunile intrinseci și
mărimile. Nu e o optimizare, ci o necesitate: într-un `<picture>`, browserul
alege `<source>`-ul după `type`, **nu** după existența fișierului. Un AVIF
declarat dar lipsă nu cade elegant pe JPEG — lasă imaginea ruptă. `Picture` emite
`<source>` doar pentru ce e în manifest, iar sursele venite din baza de date
(`style.artUrl`, coperți din admin) devin automat un `<img>` simplu.
Dimensiunile din manifest completează `width`/`height`, ca layoutul să nu sară.

Mărimea JPEG-ului înregistrată în manifest e și marcajul de idempotență: dacă
fișierul de pe disc are exact mărimea aceea, e deja procesat. Fără asta, fiecare
rulare l-ar mai recomprima o dată și calitatea s-ar degrada în trepte.

---

---

## 12. Gotchas / Lecții

1. **Cloudflare proxy** trebuie OFF pentru toate domeniile site-urilor. Altfel `on_demand_tls` eșuează silently.
2. **TypeORM `synchronize: true` în prod** — schema se aliniază automat la deploy. **Pe Coolify nu mai există backup automat pre-deploy** (era în `deploy.sh`, pe Ionos): ia-ți unul cu `deploy/prod.sh dump`. **NU adăuga schimbări care DROP date** fără migrare manuală întâi (vezi §6.4, tabelul de operații).
3. **Certificatele nu se mai cer „la cerere".** Pe Caddy, un domeniu necunoscut declanșa TLS on-demand la primul request. Traefik le cere când vede domeniul în configurație — deci un site nou fără domeniul adăugat în Coolify nu capătă certificat niciodată, oricâte requesturi ar primi (§14).
4. **Build prod Next.js 15** — useSearchParams() fără Suspense rupe prerender-ul paginilor statice. Vezi §11.1.
5. **Magic link pe admin host** — verifică `auth.controller.ts` pasează `Host` header către service și `auth.service.ts` `computeLoginBaseUrl()` decide între `ADMIN_URL` și `site.domain`.
6. **Stripe = un singur cont** pentru toate site-urile. Webhook unic la `https://manelecadou.ro/api/payments/webhook`. `STRIPE_WEBHOOK_SECRET` global. Site-ul curent se ia din `metadata.siteId` în webhook.
6bis. **Patru canale de reclame, patru configurări per-site**: Meta (pixel +
    CAPI), TikTok (pixel + Events API), Google (GA4 + Google Ads prin același
    `gtag.js`) și ChatGPT/OpenAI (pixel + Conversions API, §16.11). Toate se
    setează în admin `/site` → Operațiuni, nu din env.
7. **Suno + OpenAI** sunt per-site prin `site.suno` (basePrompt, stylePromptMap, writerSystemPrompt, lyricsLocale, voiceMap, styleSamples, voiceSamples). Setabil din admin.
8. **Fișierele nu mai stau în volume Docker.** Uploadurile sunt pe R2 (§5.3), certificatele le ține Traefik, baza e resursă gestionată de Coolify cu backup propriu (§5.4). Un fișier scris direct pe disc, în afara `StorageService`, trăiește doar până la următorul deploy (§19.5).
9. **Tot ce ține de deploy și de acces e în repo**: `deploy/coolify-deploy.sh` și `deploy/prod.sh`. Pe Ionos, `deploy.sh` trăia doar pe server și nu se actualiza cu `git pull` — o sursă constantă de divergență.
10. **`synchronize` NU face ALTER la schimbarea de lungime a unui varchar** — face `DROP COLUMN` + `ADD COLUMN`, tăcut. Tabelul din §6.4 zice „schimbi tipul", dar și `varchar(8)` → `varchar(64)` intră aici. Lărgirea se face manual cu `ALTER TABLE ... TYPE`, apoi synchronize vede lungimea corectă și nu mai atinge coloana.
11. **Nu pre-crea manual index-uri** pentru coloane noi. `RdbmsSchemaBuilder.dropOldIndices` șterge la boot orice index de pe un tabel gestionat al cărui nume nu e în metadata TypeORM.
12. **`z.string().optional().default('')` + `??` = bug** — `''` nu e nullish, deci fallback-ul nu se declanșează. A lovit `UPLOADS_DIR` (path gol → fișierele scrise în afara volumului) și `NEXT_PUBLIC_API_URL`. Pentru env care poate fi gol, folosește `||` sau `.trim() ||`.

---
13. **Numele containerelor pe Coolify conțin hash-ul deploy-ului** și se schimbă la fiecare deploy (`api-tzjg60…-170548547913`). Nu le hardcoda nicăieri — selectează după etichetele Compose, ca în `deploy/prod.sh` (§7).
14. **`git push` nu deployează** (§6.1). Codul urcat fără `make deploy-coolify` rămâne nedeployat, tăcut.
15. **Traefik cere certificatul când vede domeniul**, nu la primul request. Domeniu adăugat înainte de DNS ⇒ validare eșuată ⇒ backoff ⇒ `TRAEFIK DEFAULT CERT` chiar și după ce DNS-ul devine corect. Fix: `ssh ovh 'docker restart coolify-proxy'` (§14).
16. **În nginx, `add_header` într-un `location` anulează tot ce moștenea** de deasupra. `deploy/router/nginx.conf` repetă intenționat anteturile în fiecare `location`; dacă adaugi unul nou, repetă-le și acolo, altfel pierzi tăcut CSP și `nosniff`.
17. **Pe Coolify nu mai există backup automat pre-deploy.** Era în `deploy.sh`, pe Ionos. Înainte de un deploy cu schimbare de schemă: `deploy/prod.sh dump` (§6.4).
18. **Adminul e un SPA cu o singură rută** — un `page.tsx` nou sub `(dashboard)` nu se vede niciodată. Se înregistrează în catch-all + meniu (§19.3).
19. **Când muți infrastructura, verifică skill-urile și comentariile din cod.** La cutover, toate cele 7 skill-uri de operare au rămas să interogheze serverul vechi — continuau să „funcționeze", pe date moarte.
20. **`background` (proprietatea scurtă) resetează `background-image`.** Dacă scrii `background: #1a1a1a center/cover` și pe urmă `background-image: …`, ordinea contează — iar la specificitate egală câștigă ultima declarație din fișier. Un `@supports` cu `image-set()` scris ÎNAINTE de regula de bază e suprascris tăcut: pagina arată perfect și servește JPEG-ul, deși variantele AVIF există. A fost cazul lui `.cadou-style`; de-aia blocul `@supports` vine acum după regula de bază, cu un comentariu care spune de ce.
21. **`preload="auto"` pe `<video>` descarcă fișierul întreg imediat.** Telefoanele din hero-ul cadou porneau așa: două clipuri, ~3,5 MB, înainte ca vizitatorul să fi derulat până la ele. Acum `preload` urmează `playing`; posterul se vede oricum. Perechea obligatorie e `+faststart` la encodare (indexul `moov` la început), altfel până și `preload="metadata"` poate trage aproape tot fișierul.
22. **Când reușești să negociezi formatul într-un loc dar nu în altul, verifică dacă nu descarci ambele.** Imaginile din ramele de telefon folosesc exact fișierul din `<video poster>`. Trecute pe `<picture>` cu AVIF, ar fi adus o a doua descărcare în loc de o economie, fiindcă `poster` rămâne JPEG. Acolo câștigul vine din recomprimarea sursei, nu din format.
23. **Pe `cadou`, TOATE paginile capătă shell-ul cadou, dar doar 6 au componente proprii.** `SiteShell` deleagă către `exp.Shell`, deci `/istoric`, `/top`, `/faq`, contact, articole și legalele randează markup `classic` — gândit pentru fundal închis — pe crem. Remaparea jetoanelor sub `.cadou-root` rezolvă majoritatea; culorile scrise direct în stiluri inline **nu pot fi suprascrise din CSS** și trebuie transformate în variabile (`--fg-muted`, `--fg-soft`, `--avatar-fill`). Dacă adaugi o pagină nouă, verific-o pe ambele interfețe.
24. **Elementele de grilă au implicit `min-width: auto`.** Un titlu lung cu `white-space: nowrap` lărgește pista până iese din container, în loc să se taie cu elipsă — pe `/istoric` ieșea toată coloana a treia din panou. `.demo-grid > * { min-width: 0 }`.
25. **WaveSurfer descarcă și decodează fișierul ÎNTREG ca să deseneze unda**, la montare, pentru fiecare instanță. 30 de carduri = 30 de MP3-uri înainte de orice click. Player-ul se montează acum la primul click; până atunci unda e decorativă. Iar `play()` trebuie apelat pe elementul de media **în interiorul gestului** — altfel iOS Safari îl refuză, și primul tap n-ar porni nimic.
26. **Prețul vine ÎNTOTDEAUNA din pachet.** Modelul dinaintea lor — preț de bază + supliment premium + procent din suma dedicației — a fost scos (29 aug 2026): toate cele 838 de comenzi din producție aveau `packageTier`, deci nu taxase niciodată pe nimeni. `sites.basePriceCents` și `standardPriceCents` **au rămas** și se mai citesc în locuri secundare (textul de preț din articolele SEO, valoarea trimisă la Meta) — pot să difere de prețul real, deci nu le folosi ca sursă de adevăr. Prețul corect: `resolveSitePackage(site, tier, experienceSlug).priceCents`.
27bis. **Un text în altă limbă decât cea a site-ului aproape niciodată nu e în
    `messages/`.** Auditul din 31 aug 2026 pe bg/el a găsit româna în cinci feluri,
    niciunul vizibil dintr-un `check:messages` verde: scrisă direct în JSX
    (`app/m/[id]/view.tsx`, `/unsubscribe`, playerele), în metadata SSR
    (`og:description`), în cod de backend (mesajele automate de chat, `recovery.ts`),
    într-un câmp care își spunea limba în nume (`PACKAGES[tier].featuresRo`, servit
    tuturor tenanților) și — cel mai insidios — ca **fallback de seed randat până
    vine răspunsul API-ului** (`TOP` din `lib/seed-data.ts`, în leaderboard și pe
    `/top`): API-ul răspundea corect în bulgară, dar HTML-ul SERVIT conținea
    umplutura românească, deci exact ce citesc crawlerele.
    Verificarea care le prinde pe toate nu e în cod, e pe producție:
    `curl` pe pagină, apoi caută caractere `ăâîșț` în HTML-ul primit. Un fallback
    de limbă necunoscută trebuie să cadă pe **engleză**, nu pe română — un text
    englezesc se citește ca o limitare asumată, unul românesc pe un site grecesc
    ca o eroare.

27. **PowerMail răspunde 202 și pentru mailul care n-a plecat.** Destinatarii de
    pe lista neagră sunt eliminați tăcut (`blocked`), iar când toți sunt
    eliminați statusul e `suppressed` — tot 202. Un cod care se uită doar la
    `res.ok` raportează „trimis" pentru un mail care n-a ajuns nicăieri. Vezi
    §16.9.2.
28. **Coolify se auto-actualizează și îți poate omorî deploy-ul la fix cel mai
    prost moment.** Pățit pe 31 august 2026: update 4.3.10 → 4.3.14 pornit
    singur în timpul unui deploy, exact după pasul „Removing old containers" și
    înainte de recreare. Build-ul reușise, toate imaginile erau gata, dar
    repornirea stack-ului Coolify a lăsat `router` în `Exited (137)` și **nimeni
    n-a recreat containerele**: toate domeniile au dat 404 (răspunsul lui Traefik
    fără backend), pe timp nedeterminat, iar în coadă deploy-ul apare doar ca
    `failed`. Nu e o eroare de build — de aceea logurile arată perfect până la
    ultima linie.

    Repunerea traficului e imediată, cu **containerul vechi**, fără să aștepți
    un rebuild:
    ```bash
    ssh ovh 'docker ps -a --filter "name=router-<UUID>" --format "{{.Names}}\t{{.Status}}"'
    ssh ovh 'docker start router-<UUID>-<hash>'
    ```
    Apoi verifici că Coolify e iar `healthy` (`docker ps --filter name=coolify`)
    **înainte** de a relua deploy-ul — altfel intri în aceeași groapă. Un deploy
    eșuat merită întotdeauna un `curl` pe domenii, nu doar o privire în loguri:
    starea „failed" nu spune dacă producția a rămas sus sau nu.
29. **O setare nouă se pune DUPĂ ce deployezi codul care o declară** — și
    `PATCH /api/admin/settings` nu-ți spune că n-a aplicat-o. `update()` face
    `const def = findDef(u.key); if (!def) continue` (ignoră cheile care nu sunt
    în `SETTINGS_SCHEMA`), dar răspunsul numără cheile **trimise**, nu pe cele
    scrise: primești `{"ok":true,"count":1}` pentru o setare care n-a ajuns
    niciodată în `app_settings`. Pățit la migrarea pe PowerMail: am setat
    `POWERMAIL_TRANSACTIONAL_GROUP` înainte de deploy, „a mers", și mailurile au
    continuat să plece pe categoria implicită. Verifică întotdeauna în bază după
    o setare nouă:
    ```bash
    deploy/prod.sh psql "SELECT key, value FROM app_settings WHERE key = 'CHEIA_TA'"
    ```
30. **În Postgres, `GROUP BY <alias>` pierde în fața unei coloane cu același
    nume.** `SELECT COALESCE(s.channel, <expresie>) AS channel … GROUP BY channel`
    NU grupează după alias, ci după coloana reală `analytics_sessions.channel` —
    iar expresia din SELECT rămâne negrupată și query-ul cade cu „column s.source
    must appear in the GROUP BY clause". Când numele aliasului există și ca
    coloană în tabel, grupează pe poziție (`GROUP BY 1`). Prins la auditul UTM
    (§16.10.2).
31. **O funcționalitate scoasă de pe site lasă urme în cinci locuri.** Codurile cadou aveau: modul de API cu rute publice, metode în SDK-ul web fără apelanți, un tabel gol în producție, o coloană de configurare în admin și — cel mai grav — o clauză în termeni, publicată în 8 limbi, despre o taxă inexistentă. Când scoți ceva, urmărește-l până la capăt: `apps/api/src/modules/`, `apps/web/lib/api.ts`, `apps/web/messages/*.json`, ecranele din admin, `app_settings` și schema.
---

## 13. Endpoint-uri utile

| URL                                           | Folosință                                |
|-----------------------------------------------|------------------------------------------|
| `https://manelecadou.ro`                      | site public                              |
| `https://admin.manelecadou.ro`                | admin dashboard                          |
| `https://manelecadou.ro/health`               | health check API (JSON)                  |
| `https://manelecadou.ro/api/public/site`      | configul site-ului (rezolvat din `Host`) |
| `https://manelecadou.ro/llms.txt`             | fișierul pentru asistenți AI, în limba site-ului |
| `https://manelecadou.ro/llms/<locale>.txt`    | același fișier, în oricare din cele 8 limbi |
| `https://manelecadou.ro/api/payments/webhook` | Stripe webhook (un singur cont)          |
| `https://manelecadou.ro/api/e/c/<token>`      | click pe un link din email → 302 (§16.10.3)|
| `https://manelecadou.ro/api/e/o/<token>`      | pixel de deschidere email (GIF 1×1)      |
| `POST /api/admin/openai-ads/test`             | validează pixelul + cheia ChatGPT Ads (§16.11) |
| `https://manelecadou.ro/uploads/<cale>`       | fișiere: disc → 302 spre R2 → proxy (§5.3)|
| `https://files.manelecadou.ro/<cale>`         | R2 public, servit direct                 |
| `https://openreplay.manelecadou.ro`           | session replay (alt server — §16)        |
| `https://coolify.freevox.ro`                  | panoul de deploy                         |

API-ul e expus **same-origin** pe orice domeniu de tenant: `/api/*`,
`/socket.io/*`, `/health`, `/uploads/*`. **Nu există `api.manelecadou.ro`** —
nu-l hardcoda nicăieri (§11.3).

`llms.txt` se compune la fiecare cerere din configul tenantului (`lib/llms-txt.ts`
+ `lib/llms-response.ts`), deci prețurile și pachetele din el sunt cele din
admin, fără deploy. Textul de cadru stă în `messages/<locale>.json` → cheia
`llms`. ⚠️ Rutele au punct în cale, deci **nu trec prin `middleware.ts`**
(matcher-ul exclude `.*\..*`): garda de `hiddenMode` / `maintenanceMode` e în
`llmsTxtResponse`, nu în middleware. Orice altă rută-fișier adăugată de acum
încolo are aceeași problemă.

Endpoint-ul `/api/internal/caddy/ask` a rămas în cod, dar **nu mai e folosit**:
era pentru TLS on-demand în Caddy. Pe Traefik certificatele se cer când domeniul
e adăugat în Coolify (§14).
---

## 14. Adăugare site nou (prod)

Ordinea contează. Traefik cere certificatul **în clipa în care vede domeniul**, nu
la primul request — inversează pașii 1 și 2 și site-ul rămâne pe
`TRAEFIK DEFAULT CERT` chiar și după ce DNS-ul devine corect (§5.0).

1. **DNS**: Cloudflare → A record `<domeniu> → 37.187.159.41`, **nor gri
   (DNS only)**. Cu norul portocaliu, HTTP-01 nu ajunge la Traefik și
   certificatul nu se emite niciodată. Confirmă: `dig +short <domeniu>`.
2. **Domeniul în Coolify**, pe serviciul **`router`** — nu pe `web`, nu pe `api`:
   ruta publică e împărțită pe path, iar routerul face împărțeala. Adaugi la
   lista existentă `https://<domeniu>:80,https://www.<domeniu>:80`. Lista gata de
   lipit: `make coolify-domains`.
3. **Site-ul în admin** (`/sites`): domain, slug, locale, currency, prețuri,
   brand, prompturi Suno.
4. **Identitatea de email în PowerMail** (<https://powermail.wingo.ro> → proiect
   → Identități): adaugi adresa sau domeniul de expediere și îi verifici DNS-ul
   (DKIM, din consola AWS). Fără pasul ăsta, prima trimitere întoarce
   `403 forbidden — expeditor neautorizat` și **niciun** mail nu pleacă de pe
   site-ul nou: nici magic link, nici confirmarea de plată. Vezi §16.9.
5. **Verifică**: `curl -sI https://<domeniu> | head -1`. Dacă certificatul nu
   vine în ~3 minute, Traefik e în backoff după o validare eșuată:
   `ssh ovh 'docker restart coolify-proxy'`.

Pentru un locale nou: trebuie să existe `apps/web/messages/<locale>.json`. Copiază
din `ro.json` și tradu — cheile lipsă cad pe română (§11.5), deci un gol se vede
ca o propoziție în altă limbă, nu ca eroare.

Skill-ul `/add-site` face pasul 3 și verificările; 1, 2 și 4 rămân manuale.

Procedura completă, pentru om, e și în admin: **`/site-nou`** (meniu → Platformă →
„Ghid: site nou") — aceiași pași, plus emailul, conținutul, capcanele și ce se
schimbă când limba nu e printre cele opt livrate. Sursa: `apps/admin/app/(dashboard)/site-nou/_content.tsx`.
## 15. Chat live + agentul AI (Irina)

Refactor masiv al chat-ului live (decizie 2026-05-25). Înlocuiește chat-ul simplu text-only cu un sistem realtime cu presence, rich messages, atașamente, plată din chat, AI agent cu tool calling. Vezi commit history pentru detalii incrementale (Faza 1 → Faza 5).

### 15.1 Funcționalități noi

**Faza 1 — Foundation**:
- Presence enriched: page change live, device (mobile/desktop/tablet + OS + browser + viewport), chat open/închis, timer "online de X", IP
- Delivered + Seen receipts WhatsApp-style (1 check / 2 gri / 2 albastre) pe ambele părți
- Force-open chat din admin (button Zap) — declanșează widget pe client prin WS
- AI mode switcher per conversație: `Manual` / `AI Suggest` / `AI Auto`
- Sound (WebAudio sintetic) + pulse + jiggle animation + tab title flash + favicon dot la mesaj nou pe client
- Sound (chime) + tab title flash pe admin la sugestie AI nouă

**Faza 2 — Web Push admin**:
- VAPID + Service Worker (`/sw.js`) la admin
- `WebPushService` cu auto-prune pe 410/404 + retry counter
- Buton `Activează notificări` în chat header — subscribe device la push notifications native
- ChatService trimite push la admin la fiecare mesaj nou user

**Faza 3 — Attachments + Rich messages**:
- Upload multipart imagini (PNG/JPEG/GIF/WEBP) + PDF, max 5MB, în `/app/uploads/chat/<convId>/`
- Render în chat: `<img>` thumbnail (max 220px client, 256px admin) sau PDF link
- Payment link via Stripe Checkout: modal admin cu sumă/valută/descriere → backend creează checkout session → ChatMessage cu `messageType='payment_link'` și payload (amount, currency, checkoutUrl) → card frumos pe client cu buton "Plătește acum →"

**Faza 4 — AI Agent (OpenAI function calling)**:
- `OpenAiClient.chatWithTools()` — agent loop cu max 6 iterații, tool dispatch paralel, audit pe fiecare apel
- `AIChatAgentService` triggered automat după ce userul trimite mesaj dacă `conv.aiMode != 'manual'`
- Tools: `send_message`, `search_memory`, `send_payment_link` (approval-gated), `force_open_chat`, `escalate_to_human`
- Mod `suggest`: persistă răspuns ca `messageType='ai_suggestion'` + emit doar către admin → card violet cu 3 butoane (Trimite / Editează / Respinge)
- Mod `auto`: trimite direct (cu rate limit 3 mesaje/turn, payment_link încă gated pe approval flag)
- Endpoints: `POST /admin/chat/suggestions/:id/approve` + `/reject`
- System prompt brand-aware: nume site, locale, preț din DB, tagline, support email

**Faza 5 — Production hardening**:
- `ai_memory` (kind, content, approved, usageCount, sourceConversationId) — fapte aprobate de admin care intră în system prompt
- `ai_tool_calls` audit (toolName, input, output, model, tokens) — cost tracking + debug + safety review
- `AILearnerService` cron nightly (03:30 UTC) — scanează conversațiile rezolvate din ultimele 24h, trimite la GPT cu prompt de extracție, salvează candidates cu `approved=false`
- Admin UI `/ai-memory`: review queue + approve/edit/reject + buton "Extrage acum"
- `AI_CHAT_MODE_DEFAULT` aplicat la `getOrCreateMine` (conversații noi)
- `AI_CHAT_REQUIRE_APPROVAL_FOR_PAYMENT` flag (default ON) — chiar și în mod auto, link-urile de plată cer aprobare admin

### 15.2 Schema additive (sigur pentru `synchronize: true`)

**Conversation** (extins):
- `aiMode: 'manual'|'suggest'|'auto'` (default 'manual')
- `chatOpenOnClient`, `lastClientPath`, `lastDevice` (jsonb), `connectedAt`, `disconnectedAt`

**ChatMessage** (extins):
- `messageType: 'text'|'image'|'file'|'payment_link'|'song_form_step'|'song_preview'|'system'|'ai_suggestion'`
- `payload` (jsonb), `deliveredAt`, `readAt`, `attachmentUrl/Mime/Size/Name`
- `aiGenerated`, `aiApprovedBy`, `aiSuggestionFor`

**Tabele noi**:
- `web_push_subscriptions` (userId, endpoint UNIQUE, p256dh, auth, failureCount, lastSuccessAt)
- `ai_memory` (siteId, kind, content, approved, usageCount, sourceConversationId, extractedFrom jsonb)
- `ai_tool_calls` (conversationId, toolName, input/output jsonb, model, tokens, requiredApproval, aiMode)

### 15.3 Setări obligatorii în prod (admin `/settings`)

| Setting | Default | Necesar pentru | Note |
|---|---|---|---|
| `OPENAI_API_KEY` | env | AI chat + lyrics + translation | sk-… (existing) |
| `AI_CHAT_MODEL` | `gpt-4o-mini` | AI chat agent | Pick: `gpt-5-mini` (~$0.001/conv), `gpt-4o-mini` (~$0.0005), `gpt-4o` (~$0.005) |
| `AI_CHAT_TEMPERATURE` | `0.4` | Tonul răspunsurilor | 0=factual, 1=creativ |
| `AI_CHAT_SYSTEM_PROMPT` | (gol) | Override prompt | Lasă gol pentru default brand-aware |
| `AI_CHAT_MODE_DEFAULT` | `manual` | Mode pentru conversații noi | `manual` (safe) / `suggest` / `auto` |
| `AI_CHAT_REQUIRE_APPROVAL_FOR_PAYMENT` | `true` | Gate plată în mod auto | **NU schimba pe false** în prod |
| `AI_CHAT_LEARN_NIGHTLY` | `false` | Cron extragere memory | Setează `true` după ~50 conversații reale |
| `VAPID_PUBLIC_KEY` | (gol) | Web Push admin | Generate: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | (gol, encrypted) | Web Push admin | După salvare → admin `Activează notificări` |
| `VAPID_SUBJECT` | (gol) | Web Push admin | `mailto:serban2702@gmail.com` |
| `AI_ALERT_EMAILS` | `serban2702@gmail.com,alexandru.tihon70@gmail.com` | Alerte urgente email de la Irina (escalări, generări blocate, cap mesaje) | CSV |
| `AI_FOLLOWUP_ENABLED` | ON (oprește cu `false`) | Follow-up automat în chat când userul tace 4+ min (max 2/fereastră, reset la mesaj user) | Cron pe minut |
| `RECOVERY_EMAIL_ENABLED` | ON (oprește cu `false`) | Emailuri recuperare comenzi abandonate: 1h/4h→10%, 24h→20%, 48h/72h/7z→30% | Cron 10 min, max 40/run |
| `RECOVERY_EXCLUDE_EMAILS` | `@manelecadou.ro` + emailuri interne | Excluderi recovery (CSV; `@domeniu` = sufix) | — |

**Update 2026-06-10 (AI v2 + recovery)**: cap mesaje 35→120 (doar mesaje text user+admin, fereastră resetată la plată/reactivare AI — `conversations.aiCapResetAt`); la cap/escalare/buclă: mesaj vizibil userului + web push + email alertă. Tools noi Irina: `start_new_order` (a 2-a comandă), `resend_payment_link` (reuse <25 min, altfel sesiune Stripe nouă), `generate_lyrics` (versuri în chat → `wizardState.data.customLyrics` → folosite literal la generare, max 3 drafturi), `request_modification` (gratuit 1× dacă e greșeala noastră — `generations.freeRemakeUsedAt`; altfel 14.99/29.99 lei prin payment_link cu `modificationForGenerationId` în payload; refacerea = `adminRegenerate overwrite` pornită automat în `markPaymentLinksAsPaid`), `inspect_customer_data` (diagnostic DB intern — NU se expune în chat), `alert_admins`. Delay uman 2-6s pe toate mesajele auto. Follow-up: `AiFollowupService` (cron 1 min). Recovery: modul `apps/api/src/modules/recovery/` + pagina web `/unsubscribe` (token unic + confirmare prin tastarea emailului; scope doar recovery).

### 15.4 Fluxul AI agent (production-grade)

```
User trimite mesaj
        │
        ▼
ChatService.sendAsUser → persist + emit WS + push admin
        │ (non-blocking)
        ▼
ChatService.maybeTriggerAi (verifică conv.aiMode != 'manual')
        │
        ▼
AIChatAgentService.runAgent
        │  Build system prompt (brand + KB hits + ai_memory approved)
        │  Load history (skip ai_suggestion + system msgs)
        ▼
OpenAiClient.chatWithTools (max 6 iter)
        │  Iter 1: AI → tool call (search_memory) → handler returns KB hits
        │  Iter 2: AI → tool call (send_message)
        │            ├─ mode=suggest: persist ai_suggestion, emit doar admin, STOP
        │            └─ mode=auto: persist admin msg cu aiGenerated=true, emit WS
        ▼
Persist toate tool calls în ai_tool_calls (audit)
Bump usageCount pe ai_memory facts folosite
```

### 15.5 Workflow de "training" AI

1. Lansezi cu `AI_CHAT_MODE_DEFAULT=suggest` pe câteva site-uri test (sau toate)
2. Răspunzi manual la sugestiile bune, editezi pe celelalte → AI învață din feedback (în Faza 6+)
3. După ~50 conversații rezolvate: activează `AI_CHAT_LEARN_NIGHTLY=true`
4. Dimineață: deschide `/ai-memory` → review candidates extrași automat → Approve / Edit / Reject
5. Faptele approved intră în system prompt la următorul AI run
6. După ~200 conversații cu mode=suggest, încearcă să muți selectiv conversații pe `auto` (per conv, nu global)
7. Monitorizează `/admin/ai-chat/audit/cost-summary` pentru tokens/cost (deocamdată read-only via API, dashboard UI = Faza 6)

### 15.6 Gotchas Faza 1-5

1. **`@nestjs/schedule` necesită rebuild Docker image** — anonymous volume `/app/node_modules` în compose dev nu picks up pachete noi. Workflow: `docker compose build --no-cache api && docker compose rm -fv api && docker compose up -d api`.
2. **AI sugestii NU se trimit la user** — sunt vizibile doar în admin. `listMyMessages` filtrează `ai_suggestion` + `system` + `authorRole='system'`.
3. **Tool call audit poate creste rapid** — fiecare apel = un rând. Pentru a controla: per session, max 6 iterations × 5 tools = max 30 rows. La 1000 conversații/zi → ~30k rows/zi. Adaugă cleanup cron la 30 zile dacă devine probleme. Pentru moment, neglijabil.
4. **AI poate halucina prețul** dacă nu ai memory facts. Soluție: adaugă manual în `/ai-memory` primele 5-10 fapte critice (preț, garanție, livrare, refund policy) la setup.
5. **Tab title flash + sound funcționează numai după prima interacțiune user pe pagină** (autoplay policy). Prima sugestie poate fi silent, restul fac noise.
6. **Magic link în dev** — bug-ul cu `https://manelecadou/login/verify?token=...` (lipsea TLD) e fixat: dacă `domain` nu are `.` și NODE_ENV != production, folosește `APP_URL`.
7. **Force-open chat funcționează doar dacă userul are tab vizibil** — dacă tab e în background, eventul WS ajunge dar widget-ul nu apare până userul revine. Combine cu push notification pentru efect garantat.

### 15.7 Endpoint-uri noi (sumar)

```
POST   /api/admin/chat/conversations/:id/ai-mode      # set Manual/Suggest/Auto
POST   /api/admin/chat/conversations/:id/force-open   # admin → client widget
POST   /api/admin/chat/conversations/:id/attachments  # multipart upload
POST   /api/admin/chat/conversations/:id/payment-link # creează Stripe checkout
POST   /api/admin/chat/suggestions/:msgId/approve     # AI suggestion → admin msg
POST   /api/admin/chat/suggestions/:msgId/reject      # delete suggestion

GET    /api/admin/web-push/public-key
POST   /api/admin/web-push/subscribe                  # SW endpoint + keys
DELETE /api/admin/web-push/subscribe
POST   /api/admin/web-push/test
POST   /api/admin/web-push/reload                     # după update VAPID în settings

GET    /api/admin/ai-chat/memory[?approved=true|false]
POST   /api/admin/ai-chat/memory                      # admin add manual (approved direct)
PUT    /api/admin/ai-chat/memory/:id
DELETE /api/admin/ai-chat/memory/:id
POST   /api/admin/ai-chat/memory/extract-now          # manual trigger learner
GET    /api/admin/ai-chat/memory/stats
GET    /api/admin/ai-chat/audit[?conversationId=&toolName=&limit=]
GET    /api/admin/ai-chat/audit/cost-summary
```

### 15.8 WS events (sumar)

```
Client → Server:
  presence:heartbeat    { path, title, viewport, chatOpen, device }
  presence:page_change  { from, to, title }
  presence:chat_toggle  { open }
  message:ack           { messageIds[], status: 'delivered'|'read' }

Server → Client (user):
  chat:message          { message, conversation }
  chat:force_open       {}
  chat:message:ack      { conversationId, messageIds[], status, by }

Server → Admin:
  chat:presence         { userId|guestId, online, lastSeenAt?, enriched? }
  chat:presence:snapshot { users[], guests[], enriched }
  chat:ai_suggestion    { conversationId, message }  ← nu emis la user
  chat:message:ack      (idem)
```

---

## 16. OpenReplay self-hosted (VPS separat — Hetzner)

Tracking de sesiuni full-fidelity (DOM + network + console + performance) self-hosted. Decizie 2026-05-25: tracking din prima secundă, **fără banner consent**, masking doar pe câmpuri auto-detectate (parole + iframe Stripe). Riscul GDPR/ePrivacy în EU e asumat.

### 16.1 Infrastructură

| Resursă | Valoare |
|---------|---------|
| VPS | **Hetzner** (server shared cu alte 2 apps — catalog, melodia-ta) |
| IP | `138.201.249.234` |
| SSH alias | `Hetzner` (`~/.ssh/config`, user `root`, key `~/.ssh/hetzner`, port `22`) |
| Path remote | `/home/apps/manele/openreplay` |
| Hostname | `Freevox-srl` |
| RAM | 62GB / 8 vCPU / 431GB SSD / 8GB swap |
| OS | Ubuntu 24.04.4 LTS |
| Domeniu | `openreplay.manelecadou.ro` |

**Important**: NU e VPS dedicat. Pe el rulează deja:
- **Nginx Proxy Manager** (`nginx-proxy-manager-npm-1`) care ocupă `:80/:443/:81` — termină TLS pentru toate domeniile
- 2 alte aplicații Docker (`catalog_virtual_*`, `melodia-ta_*`) — NU le atinge
- `notifications-app`, `redisinsight_client`

### 16.2 Arhitectură

```
Browser ── HTTPS ──► Cloudflare DNS ──► Hetzner :443
                                          │
                                          ▼ (NPM termină TLS cu LE)
                                       NPM nginx
                                          │
                                          ▼ (proxy HTTP intern)
                            nginx-openreplay:80 (docker DNS)
                                          │
                                          ▼
                              OpenReplay stack (~22 containere
                              docker-compose, Caddy DISABLED)
```

NPM container e atașat **permanent** la rețeaua Docker `docker-compose_openreplay-net` (vezi `/home/nginx-proxy-manager/docker-compose.yml` — am adăugat rețeaua ca `external: true`), deci poate vorbi cu serviciile OpenReplay prin DNS-ul intern.

### 16.3 Cum a fost instalat

OpenReplay nu are docker-compose oficial production-ready (recomandă Helm/k3s). Dar pe serverul shared cu NPM, helm/k3s ar fi intrat în conflict pe `:80/:443`. Am folosit `scripts/docker-compose/` din repo-ul OpenReplay cu **2 patch-uri obligatorii**:

1. `nginx-openreplay` capătă `ports: ["127.0.0.1:9000:80"]` (fallback debug; NPM nu folosește mapping-ul direct, ci DNS-ul Docker)
2. Serviciul `caddy` capătă `profiles: [disabled]` → nu pornește la `docker compose up`

⚠️ **Atenție la `install.sh`** — face `git checkout -- *.yaml` la rerun, **resetează patch-urile**. Dacă rulezi installer-ul iar, re-aplică patch-urile din `scripts/openreplay/install-notes.md` (script Python documentat).

Comenzi utile pe Hetzner:
```bash
ssh Hetzner
cd /home/apps/manele/openreplay/scripts/docker-compose

# Status:
docker ps --filter "network=docker-compose_openreplay-net"

# Restart toate serviciile:
COMPOSE_PROFILES=migration docker compose up -d

# Stop:
docker compose --profile migration down

# Logs un serviciu (ex frontend, api, sink, ender):
docker compose logs -f --tail=200 frontend

# Update OpenReplay (pull versiune nouă):
cd /home/apps/manele/openreplay && git pull
cd scripts/docker-compose && COMPOSE_PROFILES=migration docker compose up -d --pull always
# DUPĂ git pull verifică că patch-urile docker-compose.yaml (nginx ports + caddy profiles) sunt prezente, altfel re-aplică
```

### 16.4 Integrare cu manelecadou

**Frontend** (`apps/web`):
- `@openreplay/tracker@18` (v18+ include network capture, nu mai e nevoie de plugin)
- `components/OpenReplay.tsx` — init la mount, max-data config (`defaultInputMode: Plain`, no obscure emails/numbers, `captureIFrames`, network cu payload), identify user prin `/api/users/me` polling la 30s
- `lib/api.ts` — atașează `X-OpenReplay-SessionID` la fiecare fetch
- Build args propagate prin `docker-compose.coolify.yml`: `NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY` + `NEXT_PUBLIC_OPENREPLAY_INGEST_POINT`

**Backend** (`apps/api`):
- `common/openreplay-context.ts` — `AsyncLocalStorage` + extract header
- `common/openreplay.middleware.ts` — wraps fiecare request în context
- `common/openreplay.subscriber.ts` — TypeORM subscriber la `beforeInsert` pe `Payment | Generation | ErrorLog`, populează automat `openReplaySessionId` din storage
- Cele 3 entități au coloană dedicată `openReplaySessionId varchar(64) nullable index` (safe ✅ — adăugare coloană via `synchronize: true`)
- Înregistrat în `app.module.ts` ca middleware global + provider

**Admin** (`apps/admin`):
- Pagina `/errors` are link `▶ Watch replay` direct la `https://openreplay.manelecadou.ro/sessions/<id>` pentru fiecare error cu `openReplaySessionId`

### 16.5 NPM Proxy Host (pentru recreare după disaster)

Dacă NPM-ul pierde config-ul, recreează Proxy Host:

| Tab | Câmp | Valoare |
|-----|------|---------|
| Details | Domain Names | `openreplay.manelecadou.ro` |
| Details | Scheme | `http` |
| Details | Forward Hostname / IP | `nginx-openreplay` |
| Details | Forward Port | `80` |
| Details | Websockets Support | **ON** (critic) |
| Details | Block Common Exploits | ON |
| SSL | Certificate | Request a new SSL Certificate (LE) |
| SSL | Force SSL | ON |
| SSL | HTTP/2 | ON |
| Advanced | Custom Nginx Config | `client_max_body_size 200M; proxy_buffering off; proxy_request_buffering off; proxy_read_timeout 600s; proxy_send_timeout 600s;` |

NPM UI: tunel SSH `ssh -L 8081:127.0.0.1:81 Hetzner` → http://127.0.0.1:8081.

### 16.6 Project key

Project key OpenReplay e o variabilă de environment a aplicației din Coolify (NU pe Hetzner): `NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY=...`. Pentru a-l schimba: Coolify → resursă → Environment Variables + `make deploy-coolify`
(e build arg, deci cere rebuild, nu doar restart).

Dashboard OpenReplay: <https://openreplay.manelecadou.ro> — credentials owner: primul cont creat la signup.

### 16.7 Gotchas OpenReplay

1. **Caddy din OpenReplay must stay disabled** — încearcă să bind :80/:443 care sunt ale NPM. Patch-ul `profiles: [disabled]` în `docker-compose.yaml`.
2. **Cloudflare proxy off** pentru `openreplay.manelecadou.ro` (la fel ca pentru toate domeniile de site). Altfel WAF/rate limiting Cloudflare blochează ingest chunks.
3. **Websockets ON în NPM** — Assist live + ingest streaming nu merg fără.
4. **`client_max_body_size 200M`** în NPM custom config — fără asta, sourcemap upload și recording chunks mari sunt rejected cu 413.
5. **`install.sh` resetează docker-compose.yaml** via `git checkout` — vezi 15.3.
6. **NPM ↔ openreplay-net** trebuie persistat în compose-ul NPM (`external: true`), altfel `docker compose restart` NPM rupe legătura.
7. **`openReplaySessionId` populare automată** — nu trebuie să modifici call-site-urile `repo.create()`. Subscriber-ul din `common/openreplay.subscriber.ts` îl pune din AsyncLocalStorage. Funcționează doar pentru INSERT-uri în contextul unui HTTP request (nu pentru background jobs — acolo `getOpenReplaySessionId()` returnează `null` și e ok).
8. **`tracker.start()` așteaptă `document.visibilityState === 'visible'`** — by design în SDK v18+. În tab-uri background (sau headless Chrome / Chrome MCP cu vizibilitate hidden) promise-ul rămâne suspended până când documentul devine vizibil. Așa că pentru testing din Chrome MCP / agenți browser, fie aduci tab-ul în foreground, fie dispatch-uiești manual `visibilitychange` cu `document.visibilityState` patched la `'visible'`. Pe browsere reale (user real cu tab activ) pornește instant — confirmat 2026-05-25 cu 4 sesiuni capturate din traffic România.
9. **Build args Docker** — `NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY` e build-time (Next.js inline-uiește valoarea în chunks). Dacă schimbi cheia, **TREBUIE** un deploy întreg (`make deploy-coolify`), nu un restart: restartul repornește imaginea veche, cu cheia veche inline-uită. Coolify scrie variabilele într-un `.env` lângă compose și rulează `docker compose up --build`, deci `args:` își ia valorile automat.
10. **SDK tracker MUST match server major version** — `@openreplay/tracker` pe npm e mereu cea mai nouă (v18+). Server-ul self-hosted din `scripts/docker-compose` rulează v17 (fix at install time 2026-05-25). Mismatch → dashboard arată „Tracker version X ahead of current Y" și **replay vizual broken** (CSS/snapshot decoding fail). Pin tracker la versiunea major a serverului: `"@openreplay/tracker": "17.2.10"` (exact, fără `^`). Când upgrade-uiezi serverul Hetzner (`git pull` + `docker compose up -d --pull always`), verifică versiunea nouă cu `docker exec api env | grep -i version` sau curl la `/api/healthz` și update tracker SDK la matching major.
11. **Player iframe + CORS pe assets** — Player-ul OpenReplay (pe `openreplay.manelecadou.ro`) randează site-ul **într-un iframe**, dar **NU** face refetch CSS/JS de la originul real (manelecadou.ro). În schimb, OpenReplay are un service `assets` care la momentul recording face download la CSS/fonturi/imagini și le stochează în bucket-ul MinIO `sessions-assets`. Player-ul citește din acel bucket. Setările trăiesc acum în `deploy/router/nginx.conf` (înainte erau în Caddyfile):
    - `Content-Security-Policy: frame-ancestors 'self' https://openreplay.manelecadou.ro` (în loc de `X-Frame-Options: SAMEORIGIN`, deprecated). Aplicat la nivel de server.
    - CORS permisiv pe `/_next/static/*`, `/uploads/*`, favicons, web manifest — ca serviciul `assets` să poată descărca cu alt User-Agent.
    - ⚠️ În nginx, un `add_header` într-un `location` **anulează toate** `add_header`-urile moștenite de la nivelul de deasupra. De aceea configul le repetă în fiecare `location` — dacă adaugi unul nou, repetă-le și acolo, altfel pierzi tăcut `nosniff` și CSP.

    Dacă upgrade-uiezi Next.js sau routerul și se rupe replay-ul vizual, verifică:
    1. `curl -sI -H "Origin: https://openreplay.manelecadou.ro" https://manelecadou.ro/_next/static/css/<HASH>.css` returnează `access-control-allow-origin: *`.
    2. `docker logs assets --tail=30` pe Hetzner — nicio eroare `AccessDenied` la fetch.
    3. `docker run --rm --network=docker-compose_openreplay-net --entrypoint /bin/sh minio/mc -c 'mc alias set m http://minio:9000 KEY SECRET && mc ls -r m/sessions-assets/'` — bucket-ul are CSS-uri și fonturi capturate.
12ter. **Live sessions + Co-Browse** — plugin `@openreplay/tracker-assist@11.0.15` (pin major to match server v17). Activat în `OpenReplay.tsx` cu `tracker.use(trackerAssist({...}))` ÎNAINTE de `tracker.start()`. Activează:
   - Lista **/assist** (Co-Browse) — sesiuni active în timp real cu IP-uri și locații.
   - Live observation (WebSocket) — click ▶ pe orice sesiune live → vezi ce face userul ACUM.
   - Remote control (WebRTC) — owner cere control, user vede dialog brand-uit ("Echipa Manele Cadou cere să-ți vadă ecranul...") cu Accept/Refuz în culorile site-ului (gold #d4af37 pe negru #0a0606).
   - Containerul `assist` din OpenReplay stack pe Hetzner gestionează signaling-ul; clienții stabilesc P2P direct.

12bis. **IP attribution pentru anonymous users** — by default OpenReplay arată „Anonymous User" peste tot pentru visitatori ne-logați, imposibil de distins. Setup actual (final, 2026-05-25, după 2 iterații):
   - **IP-ul e injectat în HTML prin SSR**: `app/layout.tsx` (server component) citește `x-forwarded-for` din `headers()` și emite `<script>window.__CLIENT_IP__='X.X.X.X'</script>` în `<head>`, înainte de orice JS client.
   - **Tracker citește instant**: `components/OpenReplay.tsx` face `tracker.setUserID('ip:<IP>')` + `tracker.setMetadata('ip', <IP>)` ÎNAINTE de `await tracker.start()` — zero fetch, zero await, funcționează indiferent de visibility.
   - **De ce nu doar `/api/analytics/whoami`**: investigarea în DB Hetzner (2026-05-25) a arătat 95% null IP pe TikTok in-app browser. Cauza: TikTok preloads pagina în background (visibility hidden), userul închide rapid → tracker.start() suspendă, codul de după (whoami fetch) nu mai rulează. SSR injection rezolvă pentru că IP-ul e disponibil instant la mount client.
   - Endpoint `/api/analytics/whoami` rămâne ca fallback debug (nu mai e folosit de tracker, dar e util pentru verificări manuale).
   - În dashboard, **trebuie declarat `ip` ca metadata field**: Preferences → Projects → My First Project → Metadata → "+ Add Metadata" → Field Name: `ip`. (Făcut o singură dată; persistă în Postgres.)
   - În UI sesiunile arată `ip:X.X.X.X` în header (în loc de "Anonymous User") și un tag `ip | X.X.X.X` în lista de sesiuni. Filtrabil cu Filters → Add → Metadata: ip.
   - **Verificare rate de null**: `ssh Hetzner 'docker exec -e PGPASSWORD=<COMMON_PG_PASSWORD> postgres psql -U postgres -d postgres -c "SELECT user_browser, COUNT(*) FILTER (WHERE user_id IS NULL)*100/COUNT(*) AS null_pct FROM public.sessions WHERE project_id=1 GROUP BY user_browser"'`.

13. **RustFS beta refuză writes pe single-disk** (BUG MAJOR descoperit 2026-05-25) — OpenReplay `scripts/docker-compose` folosește `rustfs/rustfs:1.0.0-beta.1` ca storage S3-compatible default. Pe single-disk setup (cum e Hetzner cu un `miniodata` volume), RustFS răspunde la orice `MakeBucket` și `PutObject` cu **HTTP 500 "Storage resources are insufficient for the write operation"** (EC:0 erasure coding refuză writes). Rezultatul: TOATE recording-urile sunt pierdute silently (storage service primește AccessDenied de la S3 și log-uri `failed to upload mob file`, dar pipeline-ul continuă).

    **Fix**: înlocuit cu MinIO real (`quay.io/minio/minio:RELEASE.2024-12-18T13-15-44Z`) în `docker-compose.yaml` service `minio`. MinIO accept-ă single-disk fără probleme. Setări:
    ```yaml
    image: quay.io/minio/minio:RELEASE.2024-12-18T13-15-44Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: <COMMON_S3_KEY din common.env>
      MINIO_ROOT_PASSWORD: <COMMON_S3_SECRET din common.env>
    ```
    **Atenție**: volume `miniodata` trebuie șters complet după switch (RustFS și MinIO au formate de storage incompatibile). Dacă apare bug-ul după update, recreează volume + re-run `minio-migration`.

    **Verificare sănătate**: `docker run --rm --network=docker-compose_openreplay-net --entrypoint /bin/sh minio/mc -c "mc alias set m http://minio:9000 KEY SECRET && mc admin info m"` — vrem `1 drive online, 0 drives offline`, fără erori. Plus `mc ls m/` trebuie să arate 9 bucket-uri: `mobs`, `sessions-assets`, `static`, `sourcemaps`, `sessions-mobile-assets`, `quickwit`, `vault-data`, `records`, `spots`.

### 16.8 Verificare integrare

Smoke test rapid din browser real:
1. Vizitezi https://manelecadou.ro
2. F12 → Network → filter `openreplay` → ar trebui POST la `/ingest/v1/web/tags`, `/ingest/v1/web/i`
3. Dashboard https://openreplay.manelecadou.ro/1/sessions → sesiunea apare în max 60s
4. SQL după 1 click:
   ```bash
   deploy/prod.sh psql-tsv "SELECT id, \"openReplaySessionId\" FROM error_logs WHERE \"openReplaySessionId\" IS NOT NULL LIMIT 5"
   ```

---

---

## 16.9 Email — PowerMail (Amazon SES)

Din **31 august 2026** tot mailul care pleacă din platformă trece prin
**PowerMail** (`https://api.powermail.wingo.ro`), platforma proprie peste Amazon
SES. **Mailgun a fost scos definitiv** — contul e închis, providerul șters din
cod, cheile scoase din setări.

Inventarul complet al locurilor de unde pleacă mail (14 `kind`-uri, de la
`magic_link` la `inbox_forward`) e în `apps/api/src/mailer/` + tabelul de audit
`outbound_emails`; fiecare trimitere trece obligatoriu prin
`MailerService.send()`.

### 16.9.1 Ce e de știut

| | |
|---|---|
| Provider | `apps/api/src/mailer/providers/powermail.provider.ts` |
| Endpoint | `POST /v1/emails`, răspuns **202** |
| Cheie | **una singură pentru toate site-urile**, `POWERMAIL_API_KEY` (admin `/settings` → Chei; env doar ca rezervă) |
| Identitate | se alege prin `From` → `site.mailConfig.fromEmail` → `site.fromEmail` → `MAIL_FROM` |
| Panou | <https://powermail.wingo.ro> |
| Skill | `.claude/skills/powermail/SKILL.md` · docs live: `https://api.powermail.wingo.ro/api/docs/llm` |

**Un site nou trebuie să aibă identitatea verificată în PowerMail** (DKIM în
AWS) înainte de prima trimitere, altfel API-ul răspunde `403 forbidden —
expeditor neautorizat` și niciun mail nu pleacă. E pasul care lipsește cel mai
ușor la §14.

### 16.9.2 Capcane

1. **`blocked` NU e eroare.** Răspunsul 202 poate conține destinatari eliminați
   (listă neagră, dezabonare, adresă invalidă); restul mesajului a plecat
   normal. Se loghează ca avertisment. Doar când **toți** sunt eliminați
   statusul devine `suppressed` — tot 202. Fluxurile automate doar loghează;
   `MailSendService` (compose din Inbox, pornit de un om) aruncă, ca operatorul
   să nu creadă că a răspuns clientului.
2. **Fiecare mesaj pleacă cu o categorie de dezabonare explicită.** PowerMail
   pune `List-Unsubscribe` pe **toate** mesajele, iar unul trimis fără categorie
   cade în categoria implicită a proiectului — care e dezabonabilă. Un client
   care apasă „Unsubscribe" în Gmail pe un mail de recuperare și-ar tăia și
   magic link-ul, și livrarea melodiei plătite. Deci:

   | Mesaj | Categorie |
   |---|---|
   | `marketing_campaign`, `marketing_rule`, `recovery` | `POWERMAIL_UNSUBSCRIBE_GROUP` (= `marketing`) |
   | tot restul, inclusiv un `kind` necunoscut | `POWERMAIL_TRANSACTIONAL_GROUP` (= `tranzactionale`) |

   Categoria tranzacțională trebuie bifată **„tranzacțională"** în panou, ca
   nimeni să nu se poată dezabona de la ea. Categoriile se creează **doar din
   panou** — `POST /v1/unsubscribe-groups` nu există. Împărțirea e în
   `BULK_KINDS` din `powermail.provider.ts`; un `kind` nou nedeclarat acolo e
   tratat ca tranzacțional, adică nedezabonabil — greșeala mai puțin costisitoare.

   Ce e configurat în producție (31 aug 2026): `marketing` și `tranzactionale`.
   Verificarea că un mesaj a plecat pe categoria corectă se face pe răspunsul
   `GET /v1/emails/{id}`, în `metadata._unsubscribeGroupId` — nu există un câmp
   `unsubscribeGroup` în răspuns, deci un mesaj căzut pe categoria implicită
   arată identic cu unul corect dacă nu te uiți acolo.
3. **PowerMail nu acceptă MIME brut** (n-are endpoint de raw, spre deosebire de
   `messages.mime` al lui Mailgun). Primește câmpuri structurate, iar SES compune
   MIME-ul. MIME-ul construit de `buildMime` rămâne folosit pentru SMTP și
   pentru copia din `Sent` (IMAP APPEND). Consecința: `Message-ID`-ul mesajului
   livrat e al lui SES, deci **un răspuns al clientului nu se lipește automat de
   firul din Inbox Hub**. Dacă devine deranjant, soluția e un endpoint de raw
   MIME în PowerMail — e produsul nostru.
4. **`idempotencyKey` = Message-ID-ul nostru.** Stabil pe durata reîncercărilor
   (429/5xx, backoff 1-8s, max 5 încercări), diferit la fiecare apel nou — deci
   un retry nu dublează mailul, dar butonul „Retrimite mailul" chiar retrimite.
   Nu-l lega de `kind`+`relatedId`: fereastra de idempotență e de 24h și ar
   înghiți tăcut retrimiterile voite.
5. **Nu există fallback automat pe SMTP.** Dacă PowerMail e jos, mailul eșuează
   și rămâne `failed` în `outbound_emails` (recovery-ul reîncearcă singur la
   următorul tick). Comutarea manuală: admin `/settings` → Email sistem →
   Provider → `SMTP`, hot-reload, fără redeploy.
6. **Praguri de urmărit** (`GET /v1/stats`): bounce peste **5%** e problemă,
   peste **10%** AWS suspendă contul; complaint peste **0,1%** e îngrijorător,
   peste **0,5%** suspendare.

### 16.9.3 Config per tenant

`sites.mailConfig` păstrează **identitatea** (`fromEmail`, `fromName`,
`replyTo`) și, opțional, transportul (`provider: 'powermail' | 'smtp' | null`).
Identitatea se aplică **indiferent** de provider — inclusiv când `provider` e
null și site-ul folosește transportul global; înainte se citea doar pe ramura
per-site, deci un site fără provider își pierdea tăcut numele de expeditor.

PowerMail **nu are credențiale per-site**: o singură cheie de proiect, cu câte o
identitate verificată per domeniu. Ecranul din admin (`/site` → Operațiuni →
Mail) arată doar identitatea când e ales PowerMail.

**Numele de expeditor se pune într-un singur loc**, `resolveFromHeader`. Aproape
toate call-site-urile pasează `from: site.fromEmail`, adică o adresă simplă;
înainte era returnată ca atare, deci mailurile tranzacționale ajungeau la client
de la „contact@manelecadou.ro", fără brand — pe canalul cel mai citit. Acum
numele se atașează acolo, din `mailConfig.fromName` → `site.name`, iar un `from`
care are deja nume afișat (composeul din Inbox) e respectat ca atare. Un tenant
nou capătă automat numele lui, fără să depindă de cineva care completează
`fromName`.

---

## 16.10 UTM și urmărirea linkurilor din emailuri

**Sursa unică de adevăr: `apps/api/src/modules/analytics/utm-standard.ts`.** Acolo
stau lista parametrilor capturați, vocabularul canonic (`utm_source` /
`utm_medium`), maparea sursă → canal și șabloanele gata de lipit în Meta,
TikTok, Google, ChatGPT și email. Adminul le SERVEȘTE de acolo
(`GET /api/admin/analytics/utm-spec`) — nu le duplică. Motivul e cel obișnuit:
„ce UTM punem în reclamă" trebuie să aibă același răspuns în trei locuri
(browserul care capturează, SQL-ul care agregă, pagina din care copiezi omul),
iar o copie ar diverge de la prima schimbare.

Oglinda din browser e `apps/web/lib/utm.ts`. **Ține-le sincronizate**: un
parametru capturat pe server dar netrimis de client e o coloană goală care
arată exact ca „reclamă fără UTM".

### 16.10.1 Ce capturăm

| Grup | Câmpuri |
|---|---|
| UTM standard | `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id`, `utm_source_platform`, `utm_creative_format`, `utm_marketing_tactic` |
| Extensii proprii | `utm_adset`, `utm_adset_id`, `utm_ad`, `utm_ad_id`, `utm_placement` |
| Click-ID-uri | `fbclid`, `ttclid`, `gclid`, `gbraid`, `wbraid`, `msclkid`, `twclid`, `li_fat_id`, `epik`, `ScCid`, `irclickid`, `rdt_cid` |
| Al nostru | `mc_eid` — tokenul linkului din email |
| Derivat | `channel` (canal canonic), `firstSource/firstChannel/firstCampaign` (prima atingere, 90 zile) |

Toate ajung pe `analytics_sessions` (coloane noi, aditive) și, la checkout, în
snapshotul de pe `payments` (`attributionChannel`, `attributionAdset`,
`attributionPlacement`, `attributionUtmId`, `attributionClickId*`,
`attributionFirst*`, `attributionEmailToken`).

Trei decizii care contează:

1. **Click-ID-ul ține atribuirea singur.** `fbclid` fără `utm_source` e tot
   Meta. Fără cascada asta, o reclamă cu parametrii uitați ar fi apărut ca
   „direct" — indistinct de traficul organic.
2. **Macro-urile netraduse devin `null`, nu valori.** `{{campaign.name}}`,
   `__CAMPAIGN_NAME__`, `{campaignid}` ajung la noi ca text când sunt scrise
   greșit. Numărate ca valori, ar fi adunat toate reclamele prost configurate
   pe același rând de raport.
3. **`channel` e vocabular NOU, calculat la captare și stocat.** Diferă de
   `normalizeSource` din `attribution-sql.ts` (rămas neschimbat, ca să nu rupă
   rapoartele vechi): acolo Facebook și Instagram sunt două canale, în `channel`
   sunt unul singur (`meta`), fiindcă o campanie Meta livrează pe ambele și
   defalcarea corectă e `utm_placement`. Emailul se separă ÎNAINTEA lui Google —
   `com.google.android.gm` e clientul Gmail, nu Google Ads (§12 pct. 12).

### 16.10.2 Unde se vede

| Loc | Ce arată |
|---|---|
| Admin **`/utm`** | Șabloanele per platformă (copy), constructor de link, dicționar, verificare pe date reale, statistici email |
| `/analytics` → Marketing → **Reclame (UTM)** | Defalcare pe grup de anunțuri, creativ, plasare, `utm_id`, click-id, prima atingere |
| `/analytics` → Marketing → **Emailuri trimise de noi** | Deschideri, clicuri, venit per campanie / categorie / buton |
| `/payments` | Canal, grup și plasare în tooltip + sub campanie |
| `GET /api/admin/analytics/utm-health` | Câte reclame vin fără UTM, macro-uri netraduse, medium în afara vocabularului |

**Plățile vechi nu capătă retroactiv câmpurile noi**: snapshotul se scrie o
singură dată. Ca să-l recalculezi pe tot istoricul:
`POST /api/admin/analytics/attribution/backfill?force=1`.

### 16.10.3 Urmărirea linkurilor din emailuri

Fiecare link dintr-un email trimis de platformă e rescris în `MailerService.sendDetailed`
— punctul unic prin care trece TOT mailul. Linkurile noastre primesc UTM-uri
standard (`utm_source=email`, `utm_medium=email`, `utm_campaign=<campania>`,
`utm_content=<butonul>`) și, pentru categoriile urmărite, redirect prin
`/api/e/c/<token>` cu un token unic per (mail × link × destinatar). Pixelul de
deschidere e `/api/e/o/<token>`.

Din asta ies **cine a apăsat, când și de câte ori** (`email_links` +
`email_link_clicks`), plus venitul: `payments.attributionEmailToken` leagă plata
de tokenul EXACT al linkului apăsat, deci mesajul de recuperare la 24h își vede
banii separat de cel de la 72h.

Capcane deja plătite, plus decizii de proiectare:

1. **`magic_link` nu se atinge niciodată** — nici măcar cu UTM-uri. Tokenul de
   autentificare n-are ce căuta într-un tabel de clicuri, iar un redirect în
   plus pe calea de login e suprafață de atac degeaba. Excluderea e în cod
   (`NEVER_TRACK_KINDS`), nu într-o setare care se poate schimba din greșeală.
   Tot acolo sunt alertele interne (`ai_alert`, `suno_*`, `gdpr_admin_notify`,
   `admin_test`) — vin la noi, nu la clienți — și `inbox_*`, scrise de un
   operator care s-ar mira să-i vadă linkul rescris.
2. **Linkul de dezabonare nu se rescrie.** Un hop în plus între om și butonul
   „nu-mi mai trimite" e exact ce penalizează furnizorii de email, iar Gmail
   apelează `List-Unsubscribe` singur.
3. **Roboții de scanare sunt marcați, nu șterși** (`email_link_clicks.isBot`).
   Furnizorii de email apasă toate linkurile înainte ca omul să vadă mesajul;
   numărați, fiecare campanie ar fi raportat rată de click aproape 100%.
4. **Deschiderile sunt orientative, clicurile sunt dovada.** Gmail preîncarcă
   imaginile prin proxy-ul lui, deci „deschis" nu înseamnă „citit".
5. **Redirectul e fail-open.** Token necunoscut (mail vechi, tabel curățat) →
   302 spre pagina principală, nu eroare. Un client care a apăsat butonul din
   email n-are ce căuta pe o pagină de eroare. `@SkipThrottle()` din același
   motiv: o campanie produce un vârf de clicuri în primele minute.
6. **Campania e ETAPA, nu categoria.** `recovery-h24`, nu `recovery`; altfel
   toate cele șase mesaje s-ar aduna pe un rând și n-ai ști care aduce banii.
   Se pasează prin `SendMailExtra.campaign`.
7. **Rândul de audit păstrează HTML-ul REAL trimis** — `outbound_emails.html` e
   actualizat după decorare. Altfel, la o reclamație „n-a mers butonul", am fi
   citit alt mail decât cel primit.

Setări (Settings → Marketing → *Urmărire emailuri*), toate hot-reload:
`EMAIL_CLICK_TRACKING`, `EMAIL_OPEN_TRACKING`, `EMAIL_TRACKING_EXCLUDE_KINDS`.
Active implicit cât timp sunt goale.

Teste: `utm-standard.spec.ts` (normalizare canal, macro-uri, parsare, builder,
șabloane) și `email-tracking.spec.ts` (rescrierea linkurilor — cod cu regex
peste HTML scris de om, adică exact unde o greșeală nu dă eroare, ci un buton
mort într-un email deja plecat).

---

## 16.11 ChatGPT Ads (OpenAI) — pixel + Conversions API

Al patrulea canal de reclame, alături de Meta, TikTok și Google. Are DOUĂ
jumătăți, ambele necesare:

| | Unde |
|---|---|
| Measurement Pixel (browser) | `apps/web/app/layout.tsx` (`<head>`) + maparea din `apps/web/lib/tracking.ts` |
| Conversions API (server) | `apps/api/src/modules/openai-ads/` — apelat din webhook-ul Stripe |
| Configurare | admin `/site` → Operațiuni → Măsurare (pixeli): **Pixel ID** (public) + **cheie Conversions API** (secret) |
| Docs | <https://developers.openai.com/ads/> |

### 16.11.1 Ce e diferit față de ceilalți pixeli

1. **Pixelul se montează în `<head>`-ul randat pe server**, nu prin `<Script>`
   ca Meta/TikTok/GA4. Documentația OpenAI cere scriptul cât mai devreme, ca o
   conversie rapidă să nu se piardă cât se încarcă restul paginii. Tot de acolo
   SDK-ul citește `oppref` din URL-ul de aterizare.
2. **`amount` se trimite în unități MINORE și ÎNTREG** (12999 = 129,99 lei), și
   în browser, și pe server. Trimis ca `129.99`, OpenAI îl citește ca 1,29 lei
   și campania pare de o sută de ori mai slabă decât e. Ambele căi înmulțesc
   explicit; testele blochează regresia.
3. **Normalizarea identificatorilor diferă de Meta și TikTok.** La nume se
   PĂSTREAZĂ diacriticele (`José` → `josé`, nu `jose`), se scot doar spațiile și
   punctuația ASCII. Telefonul păstrează codul de țară, dar pierde `+` și
   zerourile din față (`0040 723…` → `40723…`). O normalizare greșită nu dă
   eroare — dă zero potriviri, tăcut. Regulile sunt în `openai-ads.service.ts`,
   acoperite de `openai-ads.spec.ts`.
4. **`oppref` e click-ID-ul canalului** și e tratat ca `fbclid`/`ttclid`: intră
   în `CLICK_ID_PARAMS` din `utm-standard.ts`, deci o reclamă ChatGPT rămâne
   atribuită canalului `chatgpt` chiar fără UTM-uri (campania și creativul tot
   lipsesc — pe alea doar UTM-urile le pot spune, §16.10).
5. **`AddPaymentInfo` nu are corespondent standard** la OpenAI și e sărit
   intenționat. Un eveniment custom inventat ar fi un rând în plus în rapoarte
   fără nimic de comparat; `checkout_started` acoperă același pas din pâlnie.

### 16.11.2 Maparea evenimentelor

| La noi (`lib/tracking.ts`) | OpenAI | Forma datelor |
|---|---|---|
| `PageView` | `page_viewed` | `contents` |
| `ViewContent` | `contents_viewed` | `contents` |
| `Lead` | `lead_created` | `customer_action` |
| `CompleteRegistration` | `registration_completed` | `customer_action` |
| `InitiateCheckout` | `checkout_started` | `contents` |
| `Purchase` | `order_created` | `contents` |
| `Subscribe` | `subscription_created` | `plan_enrollment` |

### 16.11.3 Deduplicarea browser ↔ server

Ambele căi trimit **același `event_id`**: `pay-<paymentId>` la achiziție, exact
convenția folosită și pentru Meta CAPI. OpenAI păstrează primul eveniment primit
și îl ignoră pe al doilea. Nu e o optimizare — fără id comun, fiecare plată ar fi
raportată de două ori.

Calea de server există pentru că webhook-ul Stripe vine 100%, chiar dacă omul a
închis tabul imediat după ce a apăsat „Plătește". Pe mobil, exact conversiile
care contează cel mai mult sunt cele care se pierd pe calea de browser.

### 16.11.4 Setup pe un site nou

1. Ads Manager → Conversions → creezi Pixel ID, îl pui în admin `/site` →
   Operațiuni → **Pixel ID ChatGPT Ads**.
2. Ads Manager → *Manage conversion keys* → creezi cheia, o pui în **Cheie
   ChatGPT Conversions API**. Salvezi.
3. Apeși **Testează ChatGPT Ads**. Testul rulează cu `validate_only: true`:
   OpenAI confirmă pixelul, cheia și forma payload-ului **fără** să înregistreze
   o conversie. Altfel fiecare apăsare pe buton ar fi umflat raportul cu comenzi
   inexistente.
4. Pixelul e build-independent (citit la runtime din configul site-ului), deci
   după pasul 1 e nevoie doar de un reload al paginii, nu de un deploy — spre
   deosebire de `NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY` (§16.7 pct. 9).

### 16.11.5 Cheltuiala + de ce nu apar conversiile pe campanie

**Conversiile nu se raportează pe o campanie decât dacă evenimentul e ATAȘAT la
ea.** Pățit pe 4 septembrie 2026: pixelul și Conversions API mergeau perfect —
în cont ajunseseră exact cele 2 `order_created` corespunzătoare celor 2 plăți
reale din canalul `chatgpt`, cu 100% acoperire de identificatori — dar coloana
„Conversii" din Ads Manager arăta `-`. Cauza e un pas de configurare, nu un bug:
în Ads Manager → Instrumente → Conversii, pasul 4 („Asociază evenimentul cu o
campanie") era nebifat, iar la nivel de cont exista avertismentul *„Nicio
campanie activă nu are atașat în prezent un eveniment de conversie activ"*.

Se rezolvă din **Campanii → Configurează (coloana Conversii) → Eveniment de
conversie**. Verificarea că a prins: în tab-ul *Evenimente de conversie*, coloana
**„Folosit de"** trece de la `-` la `N campanii`.

Două lucruri care NU se pot schimba după creare (documentate de OpenAI):
**obiectivul** campaniei (Clickuri/Afișări → conversion-optimized) și
**evenimentul de conversie** ales. Optimizarea pe conversii (oCPC,
`bidding_type: "conversions"`) cere o **campanie nouă**; atașarea de mai sus dă
doar raportarea.

Tot de acolo se ia și defalcarea pe campanie în analiticele NOASTRE: câmpul
**„Parametrii de interogare ai paginii de destinație"** din aceeași fereastră
acceptă macrourile `{campaign_id}`, `{ad_group_id}`, `{ad_id}`,
`{ad_account_id}`, `{oppref}`. Lăsat gol, traficul ajunge oricum pe canalul
`chatgpt` (prin `oppref`), dar fără campanie și fără creativ — vezi șablonul din
`utm-standard.ts`.

**Cheltuiala** se trage prin **Advertiser API — Insights**
(`apps/api/src/modules/analytics/ad-spend.service.ts`, `fetchOpenAi`), la fel ca
Meta și TikTok. Cheia se face în Ads Manager → **Setări → Chei API** și se pune
în admin `/site` → Operațiuni → Cheltuieli ads. E a **treia** cheie OpenAI din
platformă și se confundă ușor: `openaiAdsApiKey` citește cheltuiala,
`openaiConversionsApiKey` trimite conversii, `OPENAI_API_KEY` e pentru versuri și
chat. Fiind legată de un singur cont de ads, ea singură ajunge — nu se cere și
un id de cont.

Capcanele endpoint-ului, toate acoperite de `ad-spend-openai.spec.ts`:

1. **Ceri `fields[]=campaign.id`, primești `campaign_id`.** Răspunsul aplatizează
   numele canonice. Citite cu numele cerut, toate câmpurile ar fi `undefined` —
   adică zero rânduri, fără nicio eroare.
2. **`spend` vine în unități MAJORE** (`18.42`), spre deosebire de restul
   platformei, care ține bani în cenți.
3. **`until` din `date_range` e INCLUSIV** — nu se mărește cu o zi.
4. **Conversiile sunt în alt endpoint** (`POST /conversions/insights`), agregat pe
   interval și campanie, nu pe zi și ad — deci nu încap în rândul zilnic. Pentru
   ChatGPT, `ad_spend.conversions` rămâne 0 intenționat; comenzile și venitul din
   raport vin din plățile noastre atribuite canalului.

⚠️ **CSP**: routerul nostru pune doar `frame-ancestors` (`deploy/router/nginx.conf`),
fără `script-src` / `connect-src` / `img-src`, deci nimic nu blochează SDK-ul.
Dacă ADAUGI vreodată directivele alea, OpenAI cere: `script-src
https://bzrcdn.openai.com`, `connect-src https://bzr.openai.com
https://bzrcdn.openai.com`, `img-src https://bzr.openai.com`.

---

## 17. Stripe

Un singur cont Stripe pentru toate site-urile; site-ul curent se ia din
`metadata.siteId` în webhook. Endpoint-ul se configurează o singură dată:
1. https://dashboard.stripe.com/webhooks → Add endpoint
2. URL: `https://manelecadou.ro/api/payments/webhook`
3. Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copiază Signing secret (`whsec_...`) → admin `/settings` SAU `STRIPE_WEBHOOK_SECRET` în Coolify + `make deploy-coolify`.

---

---

## 18. Skills (Claude Code)

În `.claude/skills/`. Cele de operare folosesc `deploy/prod.sh` (§7).

| Skill | Ce face |
|---|---|
| `/start-app` | pornește stack-ul local + afișează URL-urile |
| `/add-site` | site nou (DB + `/etc/hosts` + traduceri + verificări) |
| `/ops-client` | dosar client 360° după email/nume/ID |
| `/ops-payment` | investigare plăți — „mi s-au luat banii", failed, plătit-nelivrat |
| `/ops-regen` | regenerare / modificare piese |
| `/ops-errors` | triaj erori + corelare cu OpenReplay |
| `/ops-db` | interogări și modificări pe baza de producție, cu procedură |
| `/rezolva-chat` | preia o conversație reală și rezolvă problema clientului |
| `/improve-ai-chat` | fix-uri în agentul AI din review-urile nerezolvate |
| `/add-email-template` | șablon nou de email de marketing |

Când modifici infrastructura, **verifică dacă skill-urile mai spun adevărul**.
La cutover, toate cele șapte skill-uri de operare au rămas să interogheze serverul
vechi: continuau să funcționeze, doar că pe date moarte.
---

## 19. Cum adaugi ceva nou

Harta „vreau să schimb X → mă duc la Y". Fiecare rând ascunde o capcană explicată
mai jos.

| Vreau să… | Mă duc la |
|---|---|
| endpoint / logică de backend | `apps/api/src/modules/<modul>/` |
| tabel nou sau câmp nou | `@Entity` în modulul lui (§19.2) |
| pagină nouă în admin | `apps/admin/app/(dashboard)/<nume>/_content.tsx` **+ 2 înregistrări** (§19.3) |
| setare configurabilă din admin | `apps/api/src/modules/settings/settings-schema.ts` |
| ceva per-tenant (preț, prompt, brand) | coloană pe `Site` + ecranul din `app/(dashboard)/site/screens/` |
| text pe site | `apps/web/messages/ro.json` + traduceri (§11.5) |
| pagină pe site public | `apps/web/app/` |
| design alternativ | `apps/web/experiences/` (§10) |
| să testez prompturi (versuri / Suno / Lyria) | admin `/site/playground` — trei laboratoare separate |
| standardul UTM (parametri, vocabular, șabloane) | `apps/api/src/modules/analytics/utm-standard.ts` + oglinda `apps/web/lib/utm.ts` (§16.10) |
| ceva ce scrie fișiere | `StorageService` — niciodată `fs` direct (§19.5) |

### 19.1 Modul nou de API

`apps/api/src/modules/<nume>/` cu `<nume>.module.ts`, `.controller.ts`,
`.service.ts`, apoi îl adaugi în `imports` din `apps/api/src/app.module.ts`.
Fără pasul din `app.module.ts` modulul se compilează și nu există.

Prefixul global e `api`, cu excepția lui `/health`. Un `@Controller('promo')`
răspunde la `/api/promo`.

### 19.2 Entitate nouă / câmp nou

`autoLoadEntities: true` e pornit, deci e suficient `TypeOrmModule.forFeature([X])`
în modul — lista explicită din `database.module.ts` e o rămășiță, nu o obligație.

La boot, `synchronize` aliniază schema. **Aditiv e sigur, restul nu**: tabelul din
§6.4 spune exact ce face fiecare tip de schimbare. Redenumirea unei coloane e
`DROP` + `ADD`, tăcut, cu tot cu date. Și lărgirea unui `varchar` intră aici
(§12 pct. 10).

Aproape orice tabel cu date are **`siteId` indexat**. Dacă entitatea ta ține date
de client și îl omiți, ai făcut un tabel cross-tenant fără să vrei — datele unui
site apar pe altul.

### 19.3 Pagină nouă în admin

Adminul **nu e un app Next.js obișnuit**: sub `(dashboard)` există o singură rută,
catch-all-ul `[[...slug]]/page.tsx`. Navigarea e `history.pushState` prin
`SpaLink`, fără router-ul Next — de aceea nu apar request-uri `?_rsc=` la fiecare
click. Practic: o aplicație React cu router propriu, găzduită într-un shell Next.

Deci un `page.tsx` nou **nu se vede niciodată**. Pași:

1. `app/(dashboard)/<nume>/_content.tsx` — `export default` componenta.
2. În `[[...slug]]/page.tsx`: un `dynamic(() => import('../<nume>/_content'))` și
   o intrare în `ROUTES` (cheia = path-ul).
3. În `layout.tsx`: intrarea de meniu.

Sari peste 2 și pagina dă „nu există"; sari peste 3 și există, dar nu se poate
ajunge la ea.

Datele se cer prin clientul din `apps/admin/lib/api/` (Tanstack Query). Pentru
citiri cross-tenant, header-ul `x-site-id: all` (§8).

### 19.4 Text pe site

`ro.json` e sursa de adevăr; cheile lipsă dintr-o limbă cad pe română (§11.5), deci
o traducere uitată se vede ca o frază în altă limbă, nu ca eroare. După orice
cheie nouă:

```bash
cd apps/web && pnpm run check:messages     # iese cu 1 dacă lipsește ceva
```

### 19.5 Orice scrie fișiere

Treci prin `StorageService` (`apps/api/src/storage/`): `saveBuffer`, `syncFile`,
`ensureLocal`, `list`, `delete`. Un `fs.writeFile` direct produce un fișier care
există **doar pe containerul curent** și dispare la primul redeploy. Detalii și
ordinea disc → R2 → proxy: §5.3.

### 19.6 Înainte de deploy

```bash
cd apps/api   && pnpm typecheck && pnpm test
cd apps/web   && pnpm typecheck && pnpm run check:messages
cd apps/admin && pnpm typecheck
```

Testele (`node --test`, 11 fișiere `*.spec.ts`) acoperă zonele unde o greșeală
tăcută costă scump: rezolvarea interfeței, identitatea vizitatorului, prețurile de
pachet, hostul de login, calea S3. Dacă atingi una, rulează-le. Cele de storage se
sar singure fără `S3_TEST_ENDPOINT` (au nevoie de un MinIO local).

Commit **doar fișierele pe care le-ai atins** — working tree-ul are frecvent
modificări străine, necommise. `git add -A` le-ar trimite în producție odată cu
ale tale.

### 19.7 Ce e cunoscut stricat

- **„Claude Ops" în meniul adminului dă 502.** Containerul `ops` nu e în
  compose-ul de Coolify (Coolify ignoră `profiles:`, deci l-ar construi la
  fiecare deploy degeaba). Intrarea de meniu e în `layout.tsx:126` și `:144`.
  De decis: scoatem intrarea sau adăugăm serviciul. Vezi anexa A.10.
- **Backup-ul bazei e doar local pe server** — off-site-ul cere un bucket R2
  dedicat, care nu există încă (§5.4).
---

## Anexa A. Stack-ul vechi (Ionos) — decomisionat

> Serverul Ionos `212.227.184.215` mai rulează ca plasă de siguranță, dar **nu
> mai primește trafic din 28 august 2026** și baza lui e înghețată în ziua
> mutării. Nu rula nimic pe el crezând că e producția: interogările răspund
> frumos, cu date vechi, iar scrierile se pierd.
>
> Păstrat aici pentru arheologie — de ce arată codul cum arată, ce înseamnă
> `Caddyfile` și `docker-compose.prod.yml`, ce se pierde dacă oprim serverul.
> Pentru producția reală: §5, §6, §7.

### A.1 Infrastructura Ionos

- **VPS**: IONOS Ubuntu 24.04 LTS, 232 GB SSD / 7.7 GB RAM / 4 vCPU
- **IP**: `212.227.184.215`
- **SSH alias**: `VPSIonos` (`~/.ssh/config`, port `49222`, key `~/.ssh/ionos_vps_tls`, user `root`)
- **Path remote**: `/home/manele` (NU `/srv/manelecadou` cum zice INITIAL_DEPLOY.md — legacy)
- **Backup dir**: `/backups`
- **Bootstrap secrets**: `/root/.manele-bootstrap.txt` (chmod 600) — `JWT_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `MAIL_CRED_KEY`. **NU sunt recuperabile**.
- **Firewall**: UFW (80, 443, 49222, OpenSSH) + fail2ban activ.

### A.2 Containere (docker-compose.prod.yml)

6 servicii, toate cu `restart: unless-stopped` și healthcheck:

| Service     | Image                | Volume persistent       | Expose extern |
|-------------|----------------------|-------------------------|---------------|
| `postgres`  | postgres:16-alpine   | `pg_data`               | nu            |
| `redis`     | redis:7-alpine       | `redis_data`            | nu            |
| `api`       | build apps/api       | `api_uploads`, `api_backups`, `api_mail_attach` | nu (network intern) |
| `web`       | build apps/web       | —                       | nu            |
| `admin`     | build apps/admin     | —                       | nu            |
| `caddy`     | caddy:2-alpine       | `caddy_data`, `caddy_config` | 80, 443  |

Doar Caddy expune porturi pe host. Restul comunică prin Docker network intern (hostname-uri: `api`, `web`, `admin`, `postgres`, `redis`).

### A.3 DNS + TLS (Caddy)

**Cloudflare = doar DNS**, nu proxy. Toate A records → `212.227.184.215` cu **norul gri** (DNS only). Dacă proxy-ul Cloudflare e pe portocaliu, Let's Encrypt eșuează la HTTP-01 challenge și `on_demand_tls` nu funcționează.

Caddy emite cert-uri:
- **Static** (la pornire): `manelecadou.ro`, `www.manelecadou.ro`, `admin.manelecadou.ro` — listate explicit în `Caddyfile`.
- **On-demand**: orice alt domeniu Host care vine pe `:443`. Caddy întreabă `http://api:3000/api/internal/caddy/ask?domain=X` → API răspunde `200 {ok:true}` dacă există un Site activ cu `domain=X` și `sslEnabled=true`, altfel `404`.

### A.4 Routing (Caddyfile)

API e expus **same-origin** pe `/api/*`, `/socket.io/*`, `/health` pe TOATE domeniile (snippet `(api_routes)` în Caddyfile). Nu există subdomeniu `api.manelecadou.ro`.

```
admin.manelecadou.ro  →  /api/* /socket.io/* /health → api:3000
                          /*                          → admin:1505

manelecadou.ro        →  /api/* /socket.io/* /health → api:3000
www.manelecadou.ro       /*                          → web:1500

:443 (on_demand)      →  /api/* /socket.io/* /health → api:3000
                          /*                          → web:1500

:80                   →  redir https permanent
```

### A.5 Variabile env

`.env` la `/home/manele/.env` (chmod 600). Constante hardcodate + bootstrap secrets generate + secrets externe transferate din local prin `scp` la primul deploy. Categorii:

- **Bootstrap (generate pe VPS)**: `JWT_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `MAIL_CRED_KEY`
- **URL-uri**: `APP_URL=https://manelecadou.ro`, `ADMIN_URL=https://admin.manelecadou.ro`, `API_URL=https://manelecadou.ro` (same-origin), `DEFAULT_SITE_DOMAIN=manelecadou.ro`
- **DB**: `POSTGRES_HOST=postgres`, `POSTGRES_USER=manelecadou`, `POSTGRES_DB=manelecadou`, etc.
- **External**: `STRIPE_*`, `OPENAI_*`, `SUNO_*`, `MAILGUN_*` (istoric — azi `POWERMAIL_*`), `SMTP_*`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID`
- **Runtime**: `NODE_ENV=production`, `ADMIN_EMAILS=serban2702@gmail.com` (comma-separated)

`docker-compose.prod.yml` are `NODE_ENV: ${NODE_ENV:-production}` (overridable din `.env`) și `DB_SYNCHRONIZE` controlabil similar. Vezi §6.4 pentru workflow schema changes.

`NEXT_PUBLIC_API_URL` e setat la `""` (gol) prin build args în Dockerfile → web/admin fac fetch relativ (`${NEXT_PUBLIC_API_URL}/api/...` → `/api/...` same-origin). `API_INTERNAL_URL=http://api:3000` e folosit doar pentru SSR/middleware/sitemap (intern Docker).

---


### A.6 Deploy (Ionos)

Local:
```bash
cd ~/Desktop/Manele/Manele\ cadou/manelecadou
git add -A && git commit -m "..."
make deploy         # full (api+web+admin)
# sau
make deploy-api     # rebuild + restart doar api
make deploy-web     # doar web
make deploy-admin   # doar admin
```

`make deploy` face: `git push origin main` → SSH la VPS → `/home/manele/deploy.sh <target>`. `deploy.sh` la rândul lui:
1. `pg_dump` backup în `/backups/predeploy_<timestamp>.sql.gz`
2. `git fetch && git reset --hard origin/main`
3. `docker compose -f docker-compose.prod.yml build <target>`
4. `docker compose -f docker-compose.prod.yml up -d --force-recreate <target>`
5. `sleep 8` + curl health pe cele 3 domenii

### A.7 Rollback DB (Ionos)

```bash
make rollback                    # listează backup-uri disponibile pe VPS
# apoi:
ssh VPSIonos 'gunzip -c /backups/<FILE>.sql.gz | docker exec -i manele-postgres-1 psql -U manelecadou manelecadou'
```

### A.8 Comenzi Makefile (Ionos — cer `IONOS=1`)

| Comandă               | Ce face                                    |
|-----------------------|--------------------------------------------|
| `make deploy`         | push + rebuild & restart all (cu backup)   |
| `make deploy-api`     | doar API                                    |
| `make deploy-web`     | doar web                                    |
| `make deploy-admin`   | doar admin                                  |
| `make logs`           | follow toate logurile remote                |
| `make logs-api`       | follow doar api                             |
| `make logs-web`       | follow web                                  |
| `make logs-admin`     | follow admin                                |
| `make logs-caddy`     | follow caddy (LE cert acquisition etc.)    |
| `make status`         | `docker compose ps` remote                  |
| `make backup`         | descarcă dump DB local                     |
| `make rollback`       | listează backup-uri prod                   |
| `make ssh`            | shell pe VPS                                |
| `make restart`        | `docker compose restart` (fără rebuild)    |

### A.9 Backup cron (Ionos)

`/etc/cron.d/manele-backup`:
- Zilnic 03:00 UTC: `pg_dump | gzip > /backups/db_<DATE>.sql.gz`
- Săptămânal duminică 04:00: șterge dump-uri mai vechi de 30 zile

---

### A.10 Terminal ops (`/terminal` în admin)

> **Terminalul nu rulează pe stack-ul nou.** Containerul `ops` nu e în
> `docker-compose.coolify.yml`, fiindcă Coolify ignoră `profiles:` și l-ar
> construi la fiecare deploy degeaba. Intrarea „Claude Ops" din meniul adminului
> există încă și dă **502**. Descrierea de mai jos e a stack-ului Ionos.


Decizie 2026-06-10: container `ops` în stack-ul prod cu **Claude Code pe abonamentul
Max al lui Șerban** (NU API key — zero cost suplimentar), accesibil ca terminal web
din admin la `https://admin.manelecadou.ro/terminal` (sau direct `/ops/`).

**Arhitectură**

```
admin.manelecadou.ro/terminal — pagină admin cu DOUĂ view-uri (switch persistat):
  「Terminal」 iframe ─► Caddy /ops/*       ─► ops:7681 (ttyd, Basic Auth propriu)
                                                └─ tmux „ops" (persistentă, mouse on)
  「Chat」    fetch SSE ─► Caddy /ops-chat/* ─► ops:7682 (bridge.js, auth JWT admin)
                                                └─ spawn `claude -p --resume <sid>`
ambele └─► același login Max (volum ops_home)
```

**Chat mode** (`ops/bridge.js`, node pur, restart-loop în entrypoint): primește
`{prompt, sessionId}` pe `POST /ops-chat/chat` cu `Authorization: Bearer <JWT admin>`
(exact token-ul dashboard-ului; verificat HS256 + role=admin), rulează
`claude -p --output-format stream-json --include-partial-messages
--dangerously-skip-permissions [--resume sid]` cu cwd `/workspace` și streamează
liniile ca SSE. UI-ul randează text live + tool chips; sesiunea (session_id) +
istoricul stau în localStorage; „Sesiune nouă" le resetează. Un turn = max 15 min
(timeout hard). Conversația continuă cross-mesaje prin `--resume`.

**Scroll în terminal**: `ops/tmux.conf` → `/etc/tmux.conf` cu `mouse on` +
`history-limit 50000` (rotița derulează istoricul; în TUI-uri tmux traduce
rotița în săgeți) + `-t scrollback=10000` la ttyd.

**Diacritice**: `ENV LANG=C.UTF-8 LC_ALL=C.UTF-8` în Dockerfile + `tmux -u` —
fără ele tmux randează ă/î/ș/ț/â ca `_`.

**Composer Terminal view**: input sub iframe → `POST /ops-chat/terminal-input`
(auth JWT admin) cu `{text}` (tmux `load-buffer` + `paste-buffer -p` bracketed
paste + Enter — multi-line safe, diacritice OK) sau `{key}` din whitelist
(enter/escape/up/down/tab/ctrl-c) pentru dialogurile de permisiuni. Bridge-ul
creează sesiunea `ops` detached dacă nu există încă.

- **`ops/Dockerfile`** — node:22-slim + @anthropic-ai/claude-code + ttyd + tmux +
  postgresql-client + git + ripgrep. User non-root `claude`.
- **Volume**: `/home/manele:/workspace` (repo VPS, root-owned ⇒ read-only efectiv) +
  `ops_home:/home/claude` (credențiale Claude persistente — login-ul supraviețuiește
  rebuild-urilor).
- **Auth terminal**: ttyd Basic Auth cu `OPS_TERMINAL_CREDENTIAL` (user:parolă, în
  `/home/manele/.env`). Caddy doar proxy-ează (inclusiv WebSocket).
- **Auth Claude**: login interactiv O DATĂ în terminal (`claude` → `/login` → device
  code flow — deschizi URL-ul pe telefon/laptop, lipești codul). Credențialele stau
  în `ops_home` cu refresh automat. **NU pune ANTHROPIC_API_KEY în env-ul ops** —
  ar avea precedență peste abonament și ar genera costuri API.
- **DB**: rol dedicat `claude_ops` (SELECT/INSERT/UPDATE/DELETE pe public, fără DDL;
  parola în `OPS_DB_PASSWORD`). psql preconfigurat din env (PGHOST/PGUSER/...).
- **API admin**: `ops-admin-token` (semnează JWT HS256 cu JWT_SECRET, role=admin —
  AdminGuard nu face lookup în DB) + `api-admin GET|POST /api/... [body]` (curl
  wrapper, `x-site-id: all`). `OPS_ADMIN_USER_ID` (opțional) = uuid de admin real
  pentru audit-uri.
- **Sesiuni**: tmux `new -A -s ops` — închizi browserul, taskul merge mai departe;
  redeschizi, te reatașezi exact unde ai rămas (de pe orice device).

**Skills ops**

`.claude/skills/ops-*` — pe stack-ul Ionos rulau din containerul `ops`
(`psql` / `api-admin` direct) sau de pe Mac prin `ssh VPSIonos`. **Acum trec toate
prin `deploy/prod.sh` (§7)**; lista lor e în §18.

**Env vars**

| Var | Ce e |
|---|---|
| `OPS_TERMINAL_CREDENTIAL` | `user:parolă` pentru Basic Auth ttyd (terminalul web) |
| `OPS_DB_PASSWORD` | parola rolului Postgres `claude_ops` |
| `OPS_ADMIN_USER_ID` | (opțional) uuid admin real pentru `sub` în JWT-ul de serviciu |

**Gotchas**

1. **Limita Max e partajată** — sesiunile din terminal consumă din aceeași găleată
   (5h rolling + weekly) ca sesiunile de pe Mac. Nu lăsa bucle infinite.
2. **Cont personal** — login-ul e pe contul lui Șerban; nu-l folosește altcineva și
   nu se leagă de fluxuri către clienți (Irina rămâne pe OpenAI API).
3. **Codul din /workspace e read-only by design** (root-owned pe host) și oricum
   suprascris de `git reset --hard` la deploy. Fix-uri de cod = local + `make deploy`.
4. **deploy.sh are target `ops`** (`./deploy.sh ops`) și `make deploy-ops` local.
   Update Claude Code = rebuild imagine (auto-updater oprit, non-root).
5. **Rebuild-ul NU șterge login-ul** (volumul `ops_home` rămâne). `docker volume rm
   manele_ops_home` = re-login necesar.


---

