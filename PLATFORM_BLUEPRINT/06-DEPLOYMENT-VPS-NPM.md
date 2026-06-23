# 06 — Deployment: single-VPS prin Nginx Proxy Manager

> Modelul-țintă pentru proiecte noi e cel de la **Melodia Ta**: o stivă Docker izolată pe un VPS, în spatele unui Nginx Proxy Manager (NPM) partajat, cu domeniu propriu. **NU** modelul cross-tenant + Caddy on-demand TLS de la Manele Cadou. Fiecare site = stivă proprie, intrare proprie în NPM, domeniu propriu.

---

## 1. Viziune

- O singură stivă de producție într-un folder izolat `/home/apps/<proiect>/`, orchestrată cu `docker compose`.
- **NPM existent** (în `/home/nginx-proxy-manager`) rămâne neatins; stiva se conectează la el printr-o **rețea Docker externă comună** (`npm_proxy` / `proxy`), ca să nu se mai expună porturi pe host.
- **Cloudflare** ține DNS-ul; **TLS se emite în NPM** (Let's Encrypt cu **DNS-01 challenge via token Cloudflare** — merge chiar dacă proxy-ul orange e pornit, fără să oprești proxy-ul la fiecare reînnoire).
- Autosync TypeORM rămâne pornit în prod (decizia din ambele proiecte). Volume persistente pentru Postgres + uploads; backup zilnic prin cron pe host.
- Mai multe aplicații coexistă pe același VPS (Hetzner-ul comun rulează deja Manele Cadou OpenReplay + alte apps) — fiecare în folderul ei, fără să se atingă.

---

## 2. Domenii & sub-domenii (șablon)

| Domeniu | Țintă | Rol |
|---|---|---|
| `<proiect>.ro` | container frontend (`XX00`) | site public |
| `www.<proiect>.ro` | redirect 301 → apex | canonical |
| `api.<proiect>.ro` | container backend (`XX01`) | API + Stripe webhook + uploads |
| `<admin-subdomeniu>.<proiect>.ro` | container admin (nginx static) | dashboard intern — **sub-domeniu non-evident**, nu `admin.` (ex. Melodia Ta a ales `interior.`; alte opțiuni: studio, panel, regie, backstage, birou) |
| `media.<proiect>.ro` (opțional) | backend/storage | CDN simplu pentru media generată |

Sub-domeniul de admin se alege la onboarding. Ideea e să nu fie ghicibil (`admin.` e prima țintă a scanerelor).

---

## 3. Layout pe VPS

```
/home/
├── nginx-proxy-manager/        # existent, neatins (are rețeaua proxy ca external)
└── apps/
    └── <proiect>/
        ├── docker-compose.prod.yml
        ├── .env                 # secrete, chmod 600
        ├── scripts/             # deploy.sh, backup-postgres.sh
        ├── secrets/             # ex. gcs-service-account.json (read-only)
        └── data/
            ├── postgres/  redis/  uploads/  backups/
```

---

## 4. Configurare NPM (un Proxy Host per (sub)domeniu)

Pentru fiecare (sub)domeniu, un Proxy Host în UI-ul NPM (port 81):

| Host | Forward → | Port | WebSocket | SSL |
|---|---|---|---|---|
| apex + www | `<proiect>_frontend` | `XX00` | DA (Next streaming) | LE + Force SSL + HSTS |
| `api.` | `<proiect>_backend` | `XX01` | DA | LE + Force SSL |
| admin sub-domeniu | `<proiect>_admin` | 80 | NU | LE + Force SSL + Block Exploits |
| `media.` (opțional) | backend | `XX01` | NU | LE |

Important:
- Pe `api.`: custom location `/stripe/webhook` cu `proxy_request_buffering off` + `client_max_body_size` mărit (raw body Stripe + upload-uri).
- SSL: „Use DNS Challenge" → provider Cloudflare → token cu `Zone.DNS: Edit` + `Zone.Zone: Read` scoped pe zonă.
- NPM trebuie atașat la rețeaua `proxy` (declarată `external: true` în compose-ul lui), altfel un restart rupe legătura cu serviciile.

---

## 5. DNS în Cloudflare

- A records (apex + sub-domenii) → IP VPS. CNAME `www` → apex.
- Proxied (orange) ON e ok cu DNS-01 challenge. SSL/TLS în Cloudflare: **Full (strict)** (NPM are cert LE valid).
- **Pentru OpenReplay sub-domeniu: proxy OFF (grey)** — altfel WAF/rate-limiting Cloudflare blochează ingest chunks (lecție Manele Cadou).
- Email DNS (MX/SPF/DKIM/DMARC) rămâne intact dacă proiectul are email pe domeniu.

---

## 6. Pipeline de deploy (Mac → VPS)

Două variante (aleg la onboarding):

**A. GHCR (recomandat, rapid):** build pe Mac (`docker buildx --platform linux/amd64`), push imagini tag-uite cu SHA + `latest` la GitHub Container Registry, apoi `ssh <host> 'cd /home/apps/<proiect> && docker compose pull && up -d --remove-orphans && image prune'`. VPS-ul nu compilează nimic → deploy rapid + rollback prin tag vechi.

**B. rsync + build pe server (folosit de Melodia Ta acum):** `scripts/deploy.sh` face: rsync sursă (exclude `.git`, `node_modules`, `.next`, `dist`, `.env*`, `data/`, `docs/`, `tasks/`, `.claude/`) → `docker compose -f docker-compose.prod.yml build` → `up -d --remove-orphans` → health check pe `https://api.<proiect>.ro/health` (retry) → `image prune`. Flags: `--no-build`, `--skip-rsync`. Mai lent la build, zero dependențe externe.

Ambele se rulează **dintr-un singur `./scripts/deploy.sh`** de pe Mac → toată lanțul. La proiecte noi prefer GHCR dacă VPS-ul e modest.

**Dockerfile-uri:** backend multi-stage (`node:22-alpine`, pnpm install + build, runtime `dist/main.js`, `apk add ffmpeg` dacă e nevoie de procesare media); frontend multi-stage Next (build args pentru toate `NEXT_PUBLIC_*`); admin multi-stage (Vite build → servit cu `nginx:alpine` static).

---

## 7. Secrete & `.env` pe server

`.env` la `/home/apps/<proiect>/.env` (chmod 600). Categorii (din `.env.production.example` Melodia Ta):
- App core: `NODE_ENV`, porturi, base URLs (`PUBLIC_FRONTEND_URL`, `PUBLIC_API_URL`, `ADMIN_BASE_URL`).
- DB & cache: `POSTGRES_*`, `REDIS_*`.
- Encryption: `APP_SETTINGS_ENCRYPTION_KEY` (32 bytes hex).
- Auth: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS`, `AUTH_COOKIE_DOMAIN`.
- Provideri AI: `OPENAI_*`, `<PROVIDER>_*` (Suno/Veo/Sora/etc.).
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (din Dashboard, nu `stripe listen`), `STRIPE_PUBLISHABLE_KEY`.
- Email/SMS: `EMAIL_PROVIDER` + `MAILGUN_*`/`BREVO_*`, `TWILIO_*`.
- Storage: `GCS_*` / credentials.
- Pixeli/CAPI: `META_*`, `TIKTOK_*` (server tokens) + `NEXT_PUBLIC_*` (client).
- OpenReplay: `NEXT_PUBLIC_OPENREPLAY_*`.
- Facturare (opțional): `SMARTBILL_*`.
- Web push: `VAPID_*`.

> Restul configului (chei editabile, prețuri, prompts) stă în DB (vezi `02` §3), nu în `.env`.

---

## 8. Backup & monitoring (minim viabil din ziua 1)

- **Backup Postgres** cron zilnic (`0 3 * * *`): `pg_dump | gzip` în `data/backups/`, retenție 14 zile (auto-delete `-mtime +14`). Plus backup automat **înainte de fiecare deploy** (predeploy dump).
- **Backup uploads** (dacă nu sunt în GCS): rsync la storage extern.
- **Logs:** `json-file` cu rotație (max-size + max-file) per serviciu.
- **Uptime extern:** UptimeRobot pe `https://api.<proiect>.ro/health` + apex (5 min).
- **Hardening OS:** UFW (80/443/SSH), fail2ban, unattended-upgrades, swap dacă RAM mic.

---

## 9. Deploy dintr-un singur skill Claude

Tot lanțul de mai sus e împachetat într-un **skill Claude Code** (`/deploy`) — vezi `09`. Eu rulez un singur command și agentul face push/build/deploy/health-check, raportând rezultatul. La fel pentru `start-app` (dev local), backup, rollback, logs. Scopul: să nu ating niciodată manual VPS-ul pentru operațiuni de rutină.
