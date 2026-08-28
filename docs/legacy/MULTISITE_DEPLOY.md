# Deploy multi-site cu auto-management de domenii (Caddy on-demand TLS)

## Concept

Pe VPS rulează un singur stack: **API (NestJS)** + **Web app (Next.js)** + **Admin app (Next.js)** + **Postgres** + **Redis** + **Caddy reverse proxy**.

Toate cele 10 domenii (manelecadou.ro, manele.bg, manele.rs, ...) au un **A record** care indică spre IP-ul VPS-ului. **Caddy** primește toate cererile, identifică domeniul, cere certificat SSL automat de la Let's Encrypt și forwardează către containerele potrivite.

**Magia**: nu trebuie să editezi `Caddyfile` sau să restartezi Caddy când adaugi un site nou. Caddy folosește **on-demand TLS** + un endpoint de validare în API-ul tău (`/api/internal/caddy/ask`). Când vine o cerere pe un domeniu necunoscut, Caddy întreabă API-ul: „pot să cer cert pentru `<domeniu>`?". API-ul verifică în tabelul `sites` dacă există un site activ cu acel domeniu și răspunde DA/NU. Dacă DA → Caddy obține certificatul și începe să servească.

Concluzie: **adaugi un site din admin → A record DNS spre VPS → totul merge automat**.

---

## Caddyfile

Fișierul `Caddyfile` din rădăcina monorepo-ului:

```caddyfile
{
    # Email pentru notificări Let's Encrypt
    email admin@manelecadou.ro

    # On-demand TLS: Caddy emite certificate pentru orice domeniu pe care îl APROBĂ API-ul
    on_demand_tls {
        # Caddy face GET la endpoint-ul ăsta înainte să ceară un cert
        ask http://api:3000/api/internal/caddy/ask
        # Rate limit pentru a preveni abuzuri (ex. cineva pointează 10000 de domenii spre IP-ul tău)
        interval 2m
        burst    5
    }

    # Persistă datele de TLS pe disk (între restart-uri)
    storage file_system /data/caddy
}

# Match pe ORICE domeniu — on-demand TLS îl validează prin API
:443 {
    tls {
        on_demand
    }

    # Dacă request-ul e către un domeniu admin specific (ex. admin.manelecadou.ro), forward la admin app
    @admin host admin.manelecadou.ro
    handle @admin {
        reverse_proxy admin:1505
    }

    # Dacă e API (api.manelecadou.ro), forward la API
    @api host api.manelecadou.ro
    handle @api {
        reverse_proxy api:3000
    }

    # Toate celelalte domenii → web app (Next.js multi-tenant care identifică site-ul din Host)
    handle {
        # Forward Host original ca să-l vadă Next.js
        header_up X-Forwarded-Host {host}
        header_up X-Real-IP {remote_host}
        reverse_proxy web:1500
    }
}

# HTTP -> HTTPS redirect
:80 {
    redir https://{host}{uri} permanent
}
```

## Endpoint-ul `/api/internal/caddy/ask`

Deja implementat în `apps/api/src/modules/sites/sites.controller.ts` ca `CaddyAskController`. Răspunde:
- `200 { ok: true }` dacă există un Site cu `domain == query.domain`, `active=true`, `sslEnabled=true`.
- `404` altfel → Caddy refuză să ceară cert.

> Important: endpoint-ul **NU** e expus prin Caddy către internet — e accesat doar pe rețeaua internă Docker (`http://api:3000/...`). Dacă rulezi Caddy pe altă mașină, expune-l pe IP privat sau cu basic auth.

---

## docker-compose pentru producție

Un fișier nou `docker-compose.prod.yml` (la rădăcina monorepo):

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pg_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      SUNO_API_KEY: ${SUNO_API_KEY}
      ADMIN_EMAILS: ${ADMIN_EMAILS}
      JWT_SECRET: ${JWT_SECRET}
      DEFAULT_SITE_DOMAIN: ${DEFAULT_SITE_DOMAIN}
    depends_on: [postgres, redis]
    restart: unless-stopped

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    environment:
      NEXT_PUBLIC_API_URL: https://api.manelecadou.ro
    depends_on: [api]
    restart: unless-stopped

  admin:
    build:
      context: ./apps/admin
      dockerfile: Dockerfile
    environment:
      NEXT_PUBLIC_API_URL: https://api.manelecadou.ro
    depends_on: [api]
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [api, web, admin]
    restart: unless-stopped

volumes:
  pg_data:
  redis_data:
  caddy_data:
  caddy_config:
```

## Procedura de adăugare a unui site nou

1. **Cumperi domeniul** (ex. `manele.bg`).
2. **A record** la registrar: `manele.bg → IP-VPS`. (Și opțional `www.manele.bg → IP-VPS`).
3. **Aștepți propagarea DNS** (5-30 min).
4. **Login admin**, mergi la `/sites`, click „Adaugă site nou":
   - Slug: `bg`
   - Domain: `manele.bg`
   - Name: `Manele BG`
   - Locale: `bg`
   - Currency: `EUR`
   - Base price: `2999` (în cenți → 29.99 EUR)
   - Suno prompt override: ce vrei specific pentru BG
   - Active: ✓
   - SSL Enabled: ✓
5. **Salvezi**. În spate:
   - DB are noul rând în `sites`.
   - La primul request HTTPS spre `manele.bg`, Caddy întreabă `/api/internal/caddy/ask?domain=manele.bg` → API răspunde 200 → Caddy cere cert Let's Encrypt → **gata, site-ul live cu SSL**.
   - Web app primește request, citește `Host: manele.bg`, încarcă config-ul din DB, randează cu branding/locale BG.

## Adăugare 2-3 domenii pentru aceeași țară (ex. doar nume diferit, conținut identic în BG)

Tu mi-ai zis că vrei să poți avea 2-3 site-uri pe aceeași limbă cu nume/domenii diferite. Pentru asta:
- Creezi **3 Sites separate** în admin (fiecare cu propriul `domain` unique).
- Toate au `locale: 'bg'`, `currency: 'EUR'`, etc.
- Au `name`, `slug`, eventual brandColor diferite — fiecare poate avea logo propriu.
- DB-ul e același → comerciantul (tu) le vede agregat în admin.

> Limitare: dacă vrei ca în 3 site-uri BG conținutul să fie **literalmente identic** (același user să vadă același istoric între ele), nu e posibil cu modelul actual — fiecare site are useri proprii. Dacă vrei să le grupezi, ar trebui să adaugi `Site.groupId` ulterior. Spune-mi dacă e cazul.

## Manangement DNS direct din admin (extra, opțional)

Caddy se ocupă **doar de SSL** automat. DNS-ul (`A record`) îl faci tot la registrar — nu poți automatiza asta din aplicație decât dacă folosești un provider DNS cu API (Cloudflare, Route53). Dacă vrei să automatizez și asta:
1. Mută toate domeniile pe **Cloudflare** (nameservers Cloudflare).
2. Adaug în admin un câmp `cloudflareApiToken` global + un buton „Pointează DNS-ul la VPS" pe fiecare site.
3. Codul apelează API-ul Cloudflare să creeze A record automat.

Spune-mi dacă vrei și asta — implementarea e ~50 linii cu `cloudflare` SDK.

## Backup-uri

Postgres dump nightly:
```bash
0 3 * * * docker exec manelecadou_postgres pg_dump -U manele manele | gzip > /backups/db_$(date +\%F).sql.gz
```

Caddy data (certificate, OCSP staples) — backup volum `caddy_data` zilnic.

## Monitoring

În admin există deja `/errors` pentru error tracking + un view pe `health` la `/health`. Ar fi util să adaugi un mic endpoint cron care testează disponibilitatea fiecărui domeniu activ:
```
GET https://<site.domain>/api/health (prin Caddy → web → API)
→ dacă fail, trimite alertă pe email admin
```

## Comenzi utile

```bash
# Pornește toate
docker compose -f docker-compose.prod.yml up -d

# Vezi log-uri
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f caddy

# Forțează Caddy să recheckuiască un domeniu (după ce schimbi în admin că e activ)
docker compose -f docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile

# Listă certificate emise
docker compose -f docker-compose.prod.yml exec caddy caddy list-certificates
```
