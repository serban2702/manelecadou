# CLAUDE.md — manelecadou

Reference de lucru pentru Claude Code pe acest repo. Citește acest fișier înainte să faci modificări non-triviale: descrie stack-ul real, deploy-ul actual, conveniile descoperite empiric și gotchas-urile pe care le-am rezolvat deja.

> **Documentele legacy** (`INITIAL_DEPLOY.md`, `MULTISITE_DEPLOY.md`, `ADD_NEW_SITE.md`, `MULTI_SITE_TODO.md`) sunt utile ca istorie / context, dar conțin detalii depășite (path `/srv/manelecadou`, user `deploy`, subdomeniu `api.manelecadou.ro`, exemple cu `manele.bg`). Tot ce contează acum e în acest fișier.

---

## 1. Ce face aplicația

Platformă SaaS multi-tenant pentru generare de manele AI personalizate (cadou). Stack-ul rulează un singur backend + DB partiționat prin `siteId`, iar Caddy emite TLS on-demand pentru orice domeniu adăugat din admin (Let's Encrypt). Adăugarea unui site nou = A record DNS + un click în `/sites`.

**Tenantul = un domeniu** (ex. `manelecadou.ro`, `doroparaggelia.gr`) cu propriul:
- locale, valută, preț
- branding (logo, culori, tagline, OG image)
- prompt-uri Suno + lyrics writer (OpenAI)
- email config (Mailgun/SMTP), date firmă, social, support
- mod de afișare: **normal | maintenanceMode | hiddenMode** (vezi §8)

---

## 2. Stack

| Strat        | Tech                                | Port (local)         |
|--------------|-------------------------------------|----------------------|
| Web public   | Next.js 15 app router + next-intl 4 | `:1500`              |
| Admin app    | Next.js 15 app router + Radix UI    | `:1505`              |
| API          | NestJS 10 + TypeORM 0.3 + BullMQ    | `:1501` (host=`3000`)|
| DB           | Postgres 16                         | `:1502` (host=`5432`)|
| Cache/queue  | Redis 7                             | `:1503` (host=`6379`)|
| DB UI        | Adminer (doar local)                | `:1504`              |
| Reverse proxy| Caddy 2 (prod only)                 | `:80`, `:443`        |

**Externals**: OpenAI (lyrics + AI assistant), sunoapi.org (audio), Stripe (payments, un singur cont pentru toate site-urile), Mailgun (transactional email), Cloudflare (DNS only — fără proxy).

**Important**: repo-ul **NU folosește pnpm workspace**. Fiecare app (`apps/api`, `apps/web`, `apps/admin`) are propriul `package.json` și `pnpm-lock.yaml`. Nu există `package.json` la root.

---

## 3. Structura repo

```
manelecadou/
├── apps/
│   ├── api/                  NestJS — toate modulele backend
│   │   ├── src/modules/      auth, sites, payments, suno, lyrics, mail,
│   │   │                     chat, analytics, generations, gift-codes,
│   │   │                     promo, roulette, kb, errors, ai-assistant,
│   │   │                     guest-sessions, users, settings, suggestions,
│   │   │                     database-admin, admin (KPIs), health
│   │   ├── src/database/     TypeORM datasource + migrations runtime
│   │   ├── src/mailer/       templates (i18n) + Mailgun/SMTP providers
│   │   ├── src/openai/       lyrics writer/critic + translation
│   │   ├── src/common/       JwtAuthGuard, AdminGuard, decorators
│   │   ├── Dockerfile        prod multi-stage (nest build → node dist/main.js)
│   │   └── Dockerfile.dev    dev hot-reload (nest start --watch)
│   ├── web/                  Next.js — site-uri publice multi-tenant
│   │   ├── app/              app router (page.tsx server / client)
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
│       │                     chat, gift-codes, promo, analytics, errors,
│       │                     guests, settings, database
│       ├── app/login/        magic link flow
│       └── lib/api/          client SDK către NestJS API
├── Caddyfile                 reverse proxy + on-demand TLS
├── docker-compose.yml        DEV (postgres + redis + adminer + api hot-reload)
├── docker-compose.prod.yml   PROD (toate 6 servicii + caddy)
├── Makefile                  comenzi de zi cu zi (deploy, logs, backup...)
├── .env / .env.example       NU sunt commit-uite
├── .claude/skills/           start-app, add-site (skills locale)
└── docs/ (root)              README, I18N_PLAN, GROK_BRAND_PROMPT, etc.
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

**Multi-tenant local**: domenii `*.local` în `/etc/hosts` → `127.0.0.1`, plus add site în admin cu `domain=manele-x.local`. Caddy NU rulează local. Web app citește Host header direct.

**Restart API after env change**: `docker compose restart api`.

---

## 5. Producție

### 5.1 Infrastructură

- **VPS**: IONOS Ubuntu 24.04 LTS, 232 GB SSD / 7.7 GB RAM / 4 vCPU
- **IP**: `212.227.184.215`
- **SSH alias**: `VPSIonos` (`~/.ssh/config`, port `49222`, key `~/.ssh/ionos_vps_tls`, user `root`)
- **Path remote**: `/home/manele` (NU `/srv/manelecadou` cum zice INITIAL_DEPLOY.md — legacy)
- **Backup dir**: `/backups`
- **Bootstrap secrets**: `/root/.manele-bootstrap.txt` (chmod 600) — `JWT_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `MAIL_CRED_KEY`. **NU sunt recuperabile**.
- **Firewall**: UFW (80, 443, 49222, OpenSSH) + fail2ban activ.

### 5.2 Containere (docker-compose.prod.yml)

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

### 5.3 DNS + TLS

**Cloudflare = doar DNS**, nu proxy. Toate A records → `212.227.184.215` cu **norul gri** (DNS only). Dacă proxy-ul Cloudflare e pe portocaliu, Let's Encrypt eșuează la HTTP-01 challenge și `on_demand_tls` nu funcționează.

Caddy emite cert-uri:
- **Static** (la pornire): `manelecadou.ro`, `www.manelecadou.ro`, `admin.manelecadou.ro` — listate explicit în `Caddyfile`.
- **On-demand**: orice alt domeniu Host care vine pe `:443`. Caddy întreabă `http://api:3000/api/internal/caddy/ask?domain=X` → API răspunde `200 {ok:true}` dacă există un Site activ cu `domain=X` și `sslEnabled=true`, altfel `404`.

### 5.4 Routing (Caddyfile)

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

### 5.5 Variabile env (prod)

`.env` la `/home/manele/.env` (chmod 600). Constante hardcodate + bootstrap secrets generate + secrets externe transferate din local prin `scp` la primul deploy. Categorii:

- **Bootstrap (generate pe VPS)**: `JWT_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `MAIL_CRED_KEY`
- **URL-uri**: `APP_URL=https://manelecadou.ro`, `ADMIN_URL=https://admin.manelecadou.ro`, `API_URL=https://manelecadou.ro` (same-origin), `DEFAULT_SITE_DOMAIN=manelecadou.ro`
- **DB**: `POSTGRES_HOST=postgres`, `POSTGRES_USER=manelecadou`, `POSTGRES_DB=manelecadou`, etc.
- **External**: `STRIPE_*`, `OPENAI_*`, `SUNO_*`, `MAILGUN_*`, `SMTP_*`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID`
- **Runtime**: `NODE_ENV=production`, `ADMIN_EMAILS=serban2702@gmail.com` (comma-separated)

`docker-compose.prod.yml` are `NODE_ENV: ${NODE_ENV:-production}` (overridable din `.env`) și `DB_SYNCHRONIZE` controlabil similar. Vezi §6.2 pentru workflow schema changes.

`NEXT_PUBLIC_API_URL` e setat la `""` (gol) prin build args în Dockerfile → web/admin fac fetch relativ (`${NEXT_PUBLIC_API_URL}/api/...` → `/api/...` same-origin). `API_INTERNAL_URL=http://api:3000` e folosit doar pentru SSR/middleware/sitemap (intern Docker).

---

## 6. Deploy workflow

### 6.1 Path normal (cod-only changes)

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

### 6.2 Schema DB changes (TypeORM `synchronize: true` în prod)

**Decizie 2026-05-11**: `synchronize` e ON pe prod. La fiecare boot al API-ului, TypeORM aliniază schema cu entitățile (`CREATE TABLE`, `ADD COLUMN`, etc.). Plasa de siguranță e backup-ul automat pre-deploy din `deploy.sh` (`/backups/predeploy_<TS>.sql.gz`).

Vezi `apps/api/src/database/database.module.ts`:
```typescript
synchronize: config.get<string>('DB_SYNCHRONIZE') !== 'false',  // default ON
```

**Workflow normal pentru schema change:**
1. Modifici `@Entity` (adaugi câmpuri / index-uri).
2. `git commit && make deploy-api`.
3. `deploy.sh` face automat `pg_dump | gzip > /backups/predeploy_*.sql.gz` ÎNAINTE de build.
4. La boot api, TypeORM execută `ADD COLUMN` etc.
5. Health check verifică că api răspunde.
6. Dacă ceva merge prost: `gunzip -c /backups/predeploy_<TS>.sql.gz | docker exec -i manele-postgres-1 psql -U manelecadou manelecadou`.

**Setări pentru a opri temporar synchronize** (ex. fereastră de migrare manuală):
```bash
ssh VPSIonos 'echo "DB_SYNCHRONIZE=false" >> /home/manele/.env && docker compose -f /home/manele/docker-compose.prod.yml restart api'
```

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
ssh VPSIonos 'docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -c "
  ALTER TABLE users RENAME COLUMN \"name\" TO \"fullName\";
"'
# 2. Modifică entity să reflecte starea nouă
# 3. Deploy normal — synchronize vede schema deja aliniată și nu face nimic
make deploy-api
```

**Înainte de fiecare `make deploy-api` cu schema change**, run dry-run:
```bash
# vezi ce SQL ar genera typeorm fără să-l execute
ssh VPSIonos 'cd /home/manele && DB_SYNCHRONIZE=false docker compose -f docker-compose.prod.yml exec api node -e "
  const { DataSource } = require(\"typeorm\");
  // ...
"'
```
(Pattern detaliat — adăugăm helper script când va fi necesar.)

### 6.3 Rollback DB

```bash
make rollback                    # listează backup-uri disponibile pe VPS
# apoi:
ssh VPSIonos 'gunzip -c /backups/<FILE>.sql.gz | docker exec -i manele-postgres-1 psql -U manelecadou manelecadou'
```

### 6.4 Comenzi utile Makefile

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

### 6.5 Backup cron

`/etc/cron.d/manele-backup`:
- Zilnic 03:00 UTC: `pg_dump | gzip > /backups/db_<DATE>.sql.gz`
- Săptămânal duminică 04:00: șterge dump-uri mai vechi de 30 zile

---

## 7. Multi-tenant model

Tabel `sites` are tot ce ține de tenant. `siteId` e index pe toate tabelele cu date (users, generations, payments, magic_links, gift_codes, promo_codes, conversations, chat_messages, analytics_*, suno_logs, errors, mail_*, app_settings, etc.).

**Rezolvare site per request**:
- `SiteContextMiddleware` (în API) rulează înaintea guards.
- Pentru `role='user'`: forțează `req.siteId = jwt.payload.siteId` (anti-abuz, ignoră headere).
- Pentru `role='admin'` cu header `x-site-id: all`: `req.siteId = undefined` (cross-tenant view în admin).
- Altfel: fallback header `x-site-id` → Host header → default site.

**Cache**: `SitesService` are cache in-memory 30s per `domain` + `id`. Update via admin invalidate-uiește automat.

**JWT**: include `siteId` și `role`. `JwtAuthGuard` populează `req.user`.

**Magic link host detection**: dacă request-ul `POST /api/auth/magic-link/request` vine pe Host = `admin.manelecadou.ro`, link-ul e construit cu `ADMIN_URL`. Altfel — cu `https://${site.domain}`. Fix în `auth.service.ts` `computeLoginBaseUrl()`.

---

## 8. Modurile site (per tenant)

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

## 9. Conventii de cod (descoperite empiric)

### 9.1 Next.js 15 — useSearchParams cere Suspense

Orice pagină `'use client'` care folosește `useSearchParams()` la nivel top trebuie wrap-uită în `<Suspense fallback={null}>`. Pattern:
```tsx
'use client';
import { Suspense, ...} from 'react';

export default function Page() {
  return <Suspense fallback={null}><PageInner /></Suspense>;
}
function PageInner() { /* original logic cu useSearchParams */ }
```
Aplicabil deja la: `/cadou/redeem`, `/cadou/success`, `/login/verify`, `/m/[id]/view`, `Generator.tsx`, `Tracker.tsx` (în layout root).

### 9.2 Server-only vs client-safe

`apps/web/lib/site-config.ts` importă `next/headers` (server-only). Nu îl importa în client components — folosește `apps/web/lib/site-shared.ts` pentru funcții pure (`formatPrice`, `siteUrl`, `siteSupportEmail`) sau `useSite()` din `site-context.tsx` pentru date hidratate client-side.

### 9.3 API URL în frontend

**Niciodată** hardcoda `https://api.manelecadou.ro` — nu există. Use same-origin:
- Client: `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/...` → produce `/api/...` în prod
- Server (SSR, middleware): `${process.env.API_INTERNAL_URL}/api/...` → `http://api:3000/api/...` (Docker DNS)

### 9.4 Path API NestJS

Global prefix `api` cu exclude pentru `/health`. Toate rutele controllerelor sunt `/api/<route>`, **exceptând** `/health` (root-level). Caddy proxy-ează atât `/api/*` cât și `/health` la `api:3000`.

### 9.5 i18n

`next-intl` v4, fără routing pe locale (toate URL-urile sunt fără prefix `/ro/`). Detecție:
1. Cookie `NEXT_LOCALE` (setat de switcher prin `/api/auth/locale`)
2. `site.locale` din DB
3. `NEXT_PUBLIC_DEFAULT_LOCALE`
4. `'ro'`

8 limbi în `apps/web/messages/`: ro, bg, sr, tr, el, hr, sl, bs. Switcher e ascuns prin `NEXT_PUBLIC_SHOW_LANG_SWITCHER=false` în prod (un domeniu = o limbă).

---

## 10. Gotchas / Lecții

1. **Cloudflare proxy** trebuie OFF pentru toate domeniile site-urilor. Altfel `on_demand_tls` eșuează silently.
2. **TypeORM `synchronize: true` în prod** — schema se aliniază automat la deploy. Backup automat înainte. **NU adăuga schimbări care DROP date** fără migrare manuală întâi (vezi §6.2, tabelul de operații).
3. **Caddy 2.10+** — `on_demand_tls.interval` și `burst` au fost eliminate. Folosește doar `ask` endpoint.
4. **Build prod Next.js 15** — useSearchParams() fără Suspense rupe prerender-ul pe `/404`, `/login/verify`, etc. Vezi §9.1.
5. **Magic link pe admin host** — verifică `auth.controller.ts` pasează `Host` header către service și `auth.service.ts` `computeLoginBaseUrl()` decide între `ADMIN_URL` și `site.domain`.
6. **Stripe = un singur cont** pentru toate site-urile. Webhook unic la `https://manelecadou.ro/api/payments/webhook`. `STRIPE_WEBHOOK_SECRET` global. Site-ul curent se ia din `metadata.siteId` în webhook.
7. **Suno + OpenAI** sunt per-site prin `site.suno` (basePrompt, stylePromptMap, writerSystemPrompt, lyricsLocale, voiceMap, styleSamples, voiceSamples). Setabil din admin.
8. **Volume Docker** — `caddy_data` conține TLS certs Let's Encrypt. Backup-uiește-l periodic. `pg_data` are toate datele. `api_uploads` are fișierele upload-uite (logo-uri, samples audio).
9. **`deploy.sh` e pe VPS, nu în repo** — `/home/manele/deploy.sh` (chmod +x). Nu se update-uiește prin `git pull`. Pentru modificări, edit-uiește-l direct via SSH.

---

## 11. Endpoint-uri utile

| URL                                              | Folosință                          |
|--------------------------------------------------|------------------------------------|
| `https://manelecadou.ro`                         | site public                        |
| `https://admin.manelecadou.ro`                   | admin dashboard                    |
| `https://manelecadou.ro/health`                  | health check API (JSON)            |
| `https://manelecadou.ro/api/public/site`         | configul site-ului (din Host)      |
| `https://manelecadou.ro/api/payments/webhook`    | Stripe webhook (un singur cont)    |
| `http://api:3000/api/internal/caddy/ask?domain=X`| intern, doar Caddy (rezolvă on-demand TLS) |

---

## 12. Adăugare site nou (prod)

1. **DNS**: Cloudflare → A record `<domain> → 212.227.184.215`, DNS only (gri).
2. **Admin** (`https://admin.manelecadou.ro/sites`) → Adaugă site cu domain, slug, locale, currency, prețuri, brand, prompt-uri Suno.
3. La primul request HTTPS pe `<domain>`, Caddy întreabă API → primește 200 → obține cert Let's Encrypt → site live.

Pentru locale nou (gen `el` care e deja livrat): asigură-te că există `apps/web/messages/<locale>.json`. Pentru locale care nu există, copiază din `ro.json` și tradu.

---

## 13. Skills locale (Claude Code)

- `/start-app` — pornește stack-ul local (postgres, redis, adminer, api, web, admin) + afișează URL-urile.
- `/add-site` — adaugă site nou local (DB + `/etc/hosts` + traduceri).

Vezi `.claude/skills/` pentru implementare.

---

## 14. TODO recurent / Stripe webhook

Stripe webhook trebuie configurat o singură dată după primul deploy:
1. https://dashboard.stripe.com/webhooks → Add endpoint
2. URL: `https://manelecadou.ro/api/payments/webhook`
3. Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copiază Signing secret (`whsec_...`) → admin `/settings` SAU `.env` `STRIPE_WEBHOOK_SECRET=...` + `make deploy-api`.

---

## 15. OpenReplay self-hosted (al doilea VPS — Hetzner)

Tracking de sesiuni full-fidelity (DOM + network + console + performance) self-hosted. Decizie 2026-05-25: tracking din prima secundă, **fără banner consent**, masking doar pe câmpuri auto-detectate (parole + iframe Stripe). Riscul GDPR/ePrivacy în EU e asumat.

### 15.1 Infrastructură

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

### 15.2 Arhitectură

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

### 15.3 Cum a fost instalat

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

### 15.4 Integrare cu manelecadou (Ionos)

**Frontend** (`apps/web`):
- `@openreplay/tracker@18` (v18+ include network capture, nu mai e nevoie de plugin)
- `components/OpenReplay.tsx` — init la mount, max-data config (`defaultInputMode: Plain`, no obscure emails/numbers, `captureIFrames`, network cu payload), identify user prin `/api/users/me` polling la 30s
- `lib/api.ts` — atașează `X-OpenReplay-SessionID` la fiecare fetch
- Build args propagate prin `docker-compose.prod.yml`: `NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY` + `NEXT_PUBLIC_OPENREPLAY_INGEST_POINT`

**Backend** (`apps/api`):
- `common/openreplay-context.ts` — `AsyncLocalStorage` + extract header
- `common/openreplay.middleware.ts` — wraps fiecare request în context
- `common/openreplay.subscriber.ts` — TypeORM subscriber la `beforeInsert` pe `Payment | Generation | ErrorLog`, populează automat `openReplaySessionId` din storage
- Cele 3 entități au coloană dedicată `openReplaySessionId varchar(64) nullable index` (safe ✅ — adăugare coloană via `synchronize: true`)
- Înregistrat în `app.module.ts` ca middleware global + provider

**Admin** (`apps/admin`):
- Pagina `/errors` are link `▶ Watch replay` direct la `https://openreplay.manelecadou.ro/sessions/<id>` pentru fiecare error cu `openReplaySessionId`

### 15.5 NPM Proxy Host (pentru recreare după disaster)

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

### 15.6 Project key

Project key OpenReplay e în `/home/manele/.env` pe **Ionos** (NU Hetzner): `NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY=...`. Pentru a-l schimba: edit `.env` + `make deploy-web` (e build arg, deci necesită rebuild web).

Dashboard OpenReplay: <https://openreplay.manelecadou.ro> — credentials owner: primul cont creat la signup.

### 15.7 Gotchas OpenReplay

1. **Caddy din OpenReplay must stay disabled** — încearcă să bind :80/:443 care sunt ale NPM. Patch-ul `profiles: [disabled]` în `docker-compose.yaml`.
2. **Cloudflare proxy off** pentru `openreplay.manelecadou.ro` (la fel ca pentru toate domeniile de site). Altfel WAF/rate limiting Cloudflare blochează ingest chunks.
3. **Websockets ON în NPM** — Assist live + ingest streaming nu merg fără.
4. **`client_max_body_size 200M`** în NPM custom config — fără asta, sourcemap upload și recording chunks mari sunt rejected cu 413.
5. **`install.sh` resetează docker-compose.yaml** via `git checkout` — vezi 15.3.
6. **NPM ↔ openreplay-net** trebuie persistat în compose-ul NPM (`external: true`), altfel `docker compose restart` NPM rupe legătura.
7. **`openReplaySessionId` populare automată** — nu trebuie să modifici call-site-urile `repo.create()`. Subscriber-ul din `common/openreplay.subscriber.ts` îl pune din AsyncLocalStorage. Funcționează doar pentru INSERT-uri în contextul unui HTTP request (nu pentru background jobs — acolo `getOpenReplaySessionId()` returnează `null` și e ok).
8. **`tracker.start()` așteaptă `document.visibilityState === 'visible'`** — by design în SDK v18+. În tab-uri background (sau headless Chrome / Chrome MCP cu vizibilitate hidden) promise-ul rămâne suspended până când documentul devine vizibil. Așa că pentru testing din Chrome MCP / agenți browser, fie aduci tab-ul în foreground, fie dispatch-uiești manual `visibilitychange` cu `document.visibilityState` patched la `'visible'`. Pe browsere reale (user real cu tab activ) pornește instant — confirmat 2026-05-25 cu 4 sesiuni capturate din traffic România.
9. **Build args Docker** — `NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY` e build-time (Next.js inline-uiește valoarea în chunks). Dacă schimbi cheia în `.env`, **TREBUIE** `make deploy-web` (NU doar restart) ca să rebuild imaginea. Plus, dacă build cache păstrează layer-ul vechi de `pnpm run build`, forțează `docker compose build --no-cache web`.
10. **SDK tracker MUST match server major version** — `@openreplay/tracker` pe npm e mereu cea mai nouă (v18+). Server-ul self-hosted din `scripts/docker-compose` rulează v17 (fix at install time 2026-05-25). Mismatch → dashboard arată „Tracker version X ahead of current Y" și **replay vizual broken** (CSS/snapshot decoding fail). Pin tracker la versiunea major a serverului: `"@openreplay/tracker": "17.2.10"` (exact, fără `^`). Când upgrade-uiezi serverul Hetzner (`git pull` + `docker compose up -d --pull always`), verifică versiunea nouă cu `docker exec api env | grep -i version` sau curl la `/api/healthz` și update tracker SDK la matching major.
11. **Player iframe + CORS pe assets** — Player-ul OpenReplay (pe `openreplay.manelecadou.ro`) randează site-ul **într-un iframe**, dar **NU** face refetch CSS/JS de la originul real (manelecadou.ro). În schimb, OpenReplay are un service `assets` care la momentul recording face download la CSS/fonturi/imagini și le stochează în bucket-ul MinIO `sessions-assets`. Player-ul citește din acel bucket. Setări necesare pe Caddy:
    - `Content-Security-Policy: frame-ancestors 'self' https://openreplay.manelecadou.ro` (în loc de `X-Frame-Options: SAMEORIGIN` care e deprecated). Aplicat global în `security_headers`.
    - CORS permisiv pe `/_next/static/*`, `/uploads/*`, favicons, web manifest — pentru ca `assets` service să poată download cu un User-Agent diferit. Snippet `static_assets_cors` în Caddyfile.

    Dacă upgrade-uiezi Next.js sau Caddy și se rupe replay-ul vizual, verifică:
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

### 15.8 Verificare integrare

Smoke test rapid din browser real:
1. Vizitezi https://manelecadou.ro
2. F12 → Network → filter `openreplay` → ar trebui POST la `/ingest/v1/web/tags`, `/ingest/v1/web/i`
3. Dashboard https://openreplay.manelecadou.ro/1/sessions → sesiunea apare în max 60s
4. SQL pe Ionos după 1 click:
   ```bash
   ssh VPSIonos 'docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -c "SELECT id, \"openReplaySessionId\" FROM error_logs WHERE \"openReplaySessionId\" IS NOT NULL LIMIT 5"'
   ```

---

## 16. Chat refactor (Faza 1-5) — arhitectură + setări obligatorii prod

Refactor masiv al chat-ului live (decizie 2026-05-25). Înlocuiește chat-ul simplu text-only cu un sistem realtime cu presence, rich messages, atașamente, plată din chat, AI agent cu tool calling. Vezi commit history pentru detalii incrementale (Faza 1 → Faza 5).

### 16.1 Funcționalități noi

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

### 16.2 Schema additive (sigur pentru `synchronize: true`)

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

### 16.3 Setări obligatorii în prod (admin `/settings`)

| Setting | Default | Necesar pentru | Note |
|---|---|---|---|
| `OPENAI_API_KEY` | env | AI chat + lyrics + translation | sk-… (existing) |
| `AI_CHAT_MODEL` | `gpt-4o-mini` | AI chat agent | Pick: `gpt-5-mini` (~$0.001/conv), `gpt-4o-mini` (~$0.0005), `gpt-4o` (~$0.005) |
| `AI_CHAT_TEMPERATURE` | `0.4` | Tonul răspunsurilor | 0=factual, 1=creativ |
| `AI_CHAT_SYSTEM_PROMPT` | (gol) | Override prompt | Lasă gol pentru default brand-aware |
| `AI_CHAT_MODE_DEFAULT` | `manual` | Mode pentru conversații noi | `manual` (safe) / `suggest` / `auto` |
| `AI_CHAT_REQUIRE_APPROVAL_FOR_PAYMENT` | `true` | Gate plată în mod auto | **NU schimba pe false** în prod |
| `AI_CHAT_REQUIRE_APPROVAL_FOR_GENERATION` | `true` | Gate generare în mod auto | Pentru viitoare tool submit_generation |
| `AI_CHAT_LEARN_NIGHTLY` | `false` | Cron extragere memory | Setează `true` după ~50 conversații reale |
| `AI_CHAT_PROACTIVE_ENABLED` | `false` | (rezervat) — proactive engagement | Nu folosit încă în Faza 5 |
| `VAPID_PUBLIC_KEY` | (gol) | Web Push admin | Generate: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | (gol, encrypted) | Web Push admin | După salvare → admin `Activează notificări` |
| `VAPID_SUBJECT` | (gol) | Web Push admin | `mailto:serban2702@gmail.com` |
| `AI_ALERT_EMAILS` | `serban2702@gmail.com,alexandru.tihon70@gmail.com` | Alerte urgente email de la Irina (escalări, generări blocate, cap mesaje) | CSV |
| `AI_FOLLOWUP_ENABLED` | ON (oprește cu `false`) | Follow-up automat în chat când userul tace 4+ min (max 2/fereastră, reset la mesaj user) | Cron pe minut |
| `RECOVERY_EMAIL_ENABLED` | ON (oprește cu `false`) | Emailuri recuperare comenzi abandonate: 1h/4h→10%, 24h→20%, 48h/72h/7z→30% | Cron 10 min, max 40/run |
| `RECOVERY_EXCLUDE_EMAILS` | `@manelecadou.ro` + emailuri interne | Excluderi recovery (CSV; `@domeniu` = sufix) | — |

**Update 2026-06-10 (AI v2 + recovery)**: cap mesaje 35→120 (doar mesaje text user+admin, fereastră resetată la plată/reactivare AI — `conversations.aiCapResetAt`); la cap/escalare/buclă: mesaj vizibil userului + web push + email alertă. Tools noi Irina: `start_new_order` (a 2-a comandă), `resend_payment_link` (reuse <25 min, altfel sesiune Stripe nouă), `generate_lyrics` (versuri în chat → `wizardState.data.customLyrics` → folosite literal la generare, max 3 drafturi), `request_modification` (gratuit 1× dacă e greșeala noastră — `generations.freeRemakeUsedAt`; altfel 14.99/29.99 lei prin payment_link cu `modificationForGenerationId` în payload; refacerea = `adminRegenerate overwrite` pornită automat în `markPaymentLinksAsPaid`), `inspect_customer_data` (diagnostic DB intern — NU se expune în chat), `alert_admins`. Delay uman 2-6s pe toate mesajele auto. Follow-up: `AiFollowupService` (cron 1 min). Recovery: modul `apps/api/src/modules/recovery/` + pagina web `/unsubscribe` (token unic + confirmare prin tastarea emailului; scope doar recovery).

### 16.4 Fluxul AI agent (production-grade)

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

### 16.5 Workflow de "training" AI

1. Lansezi cu `AI_CHAT_MODE_DEFAULT=suggest` pe câteva site-uri test (sau toate)
2. Răspunzi manual la sugestiile bune, editezi pe celelalte → AI învață din feedback (în Faza 6+)
3. După ~50 conversații rezolvate: activează `AI_CHAT_LEARN_NIGHTLY=true`
4. Dimineață: deschide `/ai-memory` → review candidates extrași automat → Approve / Edit / Reject
5. Faptele approved intră în system prompt la următorul AI run
6. După ~200 conversații cu mode=suggest, încearcă să muți selectiv conversații pe `auto` (per conv, nu global)
7. Monitorizează `/admin/ai-chat/audit/cost-summary` pentru tokens/cost (deocamdată read-only via API, dashboard UI = Faza 6)

### 16.6 Gotchas Faza 1-5

1. **`@nestjs/schedule` necesită rebuild Docker image** — anonymous volume `/app/node_modules` în compose dev nu picks up pachete noi. Workflow: `docker compose build --no-cache api && docker compose rm -fv api && docker compose up -d api`.
2. **AI sugestii NU se trimit la user** — sunt vizibile doar în admin. `listMyMessages` filtrează `ai_suggestion` + `system` + `authorRole='system'`.
3. **Tool call audit poate creste rapid** — fiecare apel = un rând. Pentru a controla: per session, max 6 iterations × 5 tools = max 30 rows. La 1000 conversații/zi → ~30k rows/zi. Adaugă cleanup cron la 30 zile dacă devine probleme. Pentru moment, neglijabil.
4. **AI poate halucina prețul** dacă nu ai memory facts. Soluție: adaugă manual în `/ai-memory` primele 5-10 fapte critice (preț, garanție, livrare, refund policy) la setup.
5. **Tab title flash + sound funcționează numai după prima interacțiune user pe pagină** (autoplay policy). Prima sugestie poate fi silent, restul fac noise.
6. **Magic link în dev** — bug-ul cu `https://manelecadou/login/verify?token=...` (lipsea TLD) e fixat: dacă `domain` nu are `.` și NODE_ENV != production, folosește `APP_URL`.
7. **Force-open chat funcționează doar dacă userul are tab vizibil** — dacă tab e în background, eventul WS ajunge dar widget-ul nu apare până userul revine. Combine cu push notification pentru efect garantat.

### 16.7 Endpoint-uri noi (sumar)

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

### 16.8 WS events (sumar)

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

## 17. Terminal ops — Claude Code în producție (admin /terminal)

Decizie 2026-06-10: container `ops` în stack-ul prod cu **Claude Code pe abonamentul
Max al lui Șerban** (NU API key — zero cost suplimentar), accesibil ca terminal web
din admin la `https://admin.manelecadou.ro/terminal` (sau direct `/ops/`).

### 17.1 Arhitectură

```
admin.manelecadou.ro/terminal (pagină admin, iframe)
        └─► Caddy handle /ops/* ──► ops:7681 (ttyd, Basic Auth propriu)
                                       └─ tmux session „ops" (persistentă)
                                            └─ claude (login Max, persistat pe volum)
```

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

### 17.2 Skills ops (în repo, ajung pe VPS la deploy)

`.claude/skills/ops-*` — funcționează și din containerul ops (psql/api-admin direct)
și de pe Mac (prin `ssh VPSIonos docker exec ...`): `ops-client` (dosar 360°),
`ops-payment` (investigare plăți), `ops-regen` (regenerare/modificare piese),
`ops-errors` (triaj erori + OpenReplay), `ops-db` (reguli query/mutate cu confirmare).

### 17.3 Env vars noi (în /home/manele/.env)

| Var | Ce e |
|---|---|
| `OPS_TERMINAL_CREDENTIAL` | `user:parolă` pentru Basic Auth ttyd (terminalul web) |
| `OPS_DB_PASSWORD` | parola rolului Postgres `claude_ops` |
| `OPS_ADMIN_USER_ID` | (opțional) uuid admin real pentru `sub` în JWT-ul de serviciu |

### 17.4 Gotchas ops

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
