# manelecadou

Platformă SaaS multi-tenant pentru manele AI personalizate, oferite cadou. Un
singur backend și o singură bază de date servesc mai multe site-uri, fiecare cu
domeniul, limba, moneda, prețurile, brandul și prompturile lui.

În producție: **manelecadou.ro** (RO), **chalgapodarok.bg** (BG),
**doroparaggelia.gr** (GR).

## Cum e făcut

| | |
|---|---|
| Site public | Next.js 15 (app router) + next-intl, 8 limbi |
| Admin | Next.js 15 + Radix UI |
| API | NestJS 10 + TypeORM + BullMQ |
| Date | Postgres 16, Redis 7 |
| Fișiere | Cloudflare R2 |
| Producție | Coolify pe OVH, Traefik pentru TLS, router nginx intern |

Tenantul se rezolvă din header-ul `Host`; toate tabelele cu date au `siteId`.
Generarea audio merge prin Suno sau Lyria, versurile prin OpenAI, plățile prin
Stripe (un singur cont pentru toate site-urile), emailurile prin PowerMail
(platforma proprie peste Amazon SES), cu SMTP ca alternativă.
Chatul are un agent AI care vinde și rezolvă comenzi.

## Local

```bash
docker compose up -d              # postgres, redis, adminer, api (hot-reload)
cd apps/web   && pnpm dev &       # :1500
cd apps/admin && pnpm dev &       # :1505
```

- Web http://localhost:1500 · Admin http://localhost:1505 · API http://localhost:1501
- Adminer http://localhost:1504 (server `postgres`, user/db `manelecadou`)

Repo-ul **nu** e pnpm workspace: fiecare app din `apps/` are propriul
`package.json`. Comenzile `pnpm` se rulează din directorul appului.

În Claude Code: `/start-app` face toate astea.

## Producție

```bash
make deploy-coolify               # git push singur NU deployează
deploy/prod.sh ps                 # ce rulează
deploy/prod.sh psql "SELECT ..."  # baza de producție
```

## Documentație

- **[CLAUDE.md](CLAUDE.md)** — referința de lucru: stack, deploy, acces la
  producție, convenții, capcane. Începe de aici.
- [docs/COOLIFY_R2.md](docs/COOLIFY_R2.md) — mutarea pe Coolify + R2, pas cu pas
- [docs/ADMIN_STUDIO.md](docs/ADMIN_STUDIO.md) — ecranele de configurare per tenant
- [docs/STRIPE_SETUP.md](docs/STRIPE_SETUP.md) — arhitectura de plăți
- [docs/legacy/](docs/legacy/) — cum arăta înainte de august 2026 (arheologie)
