# 01 — Stack canonic & arhitectură

## 1. Stack-ul impus (ne-negociabil pentru proiecte noi)

| Strat | Tehnologie | Note |
|---|---|---|
| **Design / prototip** | Claude Design | Punctul de plecare. Eu generez UI-ul aici înainte de orice cod. |
| **Frontend public** | Next.js (App Router) + React | Site-ul vizibil clientului. SSR pentru SEO + injectare IP pentru OpenReplay. La Melodia Ta = Next.js 16; folosește versiunea curentă, dar verifică breaking changes în docs-ul instalat înainte de a scrie cod. |
| **Admin** | React + Vite + TypeScript | SPA separat. **Fără Next.js, fără TanStack/React Query.** Layer API propriu (clase `*.api.ts` + client axios cu interceptori). shadcn/ui + Radix + Tailwind + Recharts + lucide. Admin = doar în română (echipă internă). |
| **Backend** | NestJS + TypeORM + PostgreSQL | Monolit modular, un modul per domeniu. Schema prin `synchronize: true` din entități (fără migrations — vezi §6). |
| **Cozi / async** | BullMQ + Redis | Pipeline de generare AI, trimitere email/SMS, recovery cron, sync ad-spend, polling provideri. |
| **Auth** | Better Auth | Cookie HttpOnly. Conturi admin separate de userii publici. Pe frontend public, login e rar (doar anumite proiecte). |
| **Storage** | GCS (sau emulator local fake-gcs în dev) | Fișiere generate (audio/video/imagini), upload-uri client, signed URLs. |
| **Plăți** | Stripe (Checkout Session / Payment Intent) + webhook | Un cont per proiect. |
| **Email** | Mailgun (tranzacțional + marketing) sau Brevo fallback; SMTP la nevoie | Provider abstractizat. |
| **SMS / WhatsApp** | Twilio | Provider abstractizat lângă email; activat per proiect. |
| **Reverse proxy / TLS** | Nginx Proxy Manager (NPM) pe VPS partajat | Un Proxy Host per (sub)domeniu, cert Let's Encrypt prin DNS-01 Cloudflare. |
| **DNS** | Cloudflare | DNS + (opțional) proxy orange-cloud cu SSL Full strict. |
| **Session replay** | OpenReplay self-hosted | Pe VPS-ul comun (Hetzner). Overlay/tracker adaptat per site. |
| **Containerizare** | Docker + docker-compose | Un compose dev, un compose prod. |
| **Facturare** (opțional) | SmartBill | Doar pentru proiectele RO/B2B care emit facturi. |

---

## 2. Principii de arhitectură

**Monolit modular, nu microservicii.** Volumul (sute de evenimente/zi) nu justifică distribuția. Un singur backend NestJS cu module clare, un singur Postgres, un Redis pentru cozi. Simplu de operat, simplu de raționat.

**Single-tenant per proiect.** Fiecare site e propriul deployment, propria bază de date, propriul domeniu. **NU** reproducem modelul cross-tenant din Manele Cadou (siteId / x-site-id / on-demand TLS pentru N domenii). Un site = un proiect. Localizare = traduceri în același site.

**Admin = SPA separat de site-ul public.** Adminul nu are nevoie de SSR/SEO. Vite dă build rapid și HMR instant. Comunică cu același backend NestJS prin rute sub prefix `/admin/*`, protejate de `AdminGuard` (sesiune Better Auth). Userii publici și adminii sunt în tabele și fluxuri separate.

**Observabilitate ca cetățean de prim rang.** Fiecare apel extern (provider AI, Stripe, Mailgun, Twilio, Meta/TikTok CAPI) scrie un rând de audit *înainte* de apel (status pending) și se actualizează la final (success/failed + payload + eroare + cost estimat). Asta dă debugging post-mortem fără să depinzi de loguri efemere. OpenReplay leagă un eșec de înregistrarea sesiunii prin `openReplaySessionId` propagat și salvat pe order/payment/song.

**Config în DB, nu în `.env`.** Cheile API, prețurile, prompturile, feature-flag-urile, setările de brand se țin într-o tabelă de settings criptată, editabilă din admin fără redeploy. `.env` ține doar bootstrap-ul (DB url, secrete de criptare, secrete care nu se schimbă). Vezi `02` §3.

**Real-time prin Socket.IO.** Chat live, prezența vizitatorilor pe wizard, notificări admin (plată nouă, mesaj nou). Namespace separat pentru admin (autentificat) și public.

**Mobile-first, obsesiv.** Majoritatea clienților vin de pe telefon (inclusiv in-app browsere TikTok/Instagram). UX-ul mobil nu e un afterthought — e criteriul principal. Vezi `03`.

---

## 3. Structura de repo (șablon Melodia Ta)

Repo monorepo cu pnpm workspace, trei pachete + infrastructură la rădăcină:

```
<proiect>/
├── frontend/            Next.js — site public
├── admin/               React + Vite — dashboard intern
├── backend/             NestJS — API + module
├── scripts/             deploy.sh, backup-postgres.sh, smoke-e2e.sh
├── docs/                documentație per categorie (backend/admin/frontend/deployment/tracking/...)
├── .claude/             agents + skills + commands (vezi 09)
├── docker-compose.yml         DEV
├── docker-compose.prod.yml    PROD
├── .env.production.example
├── pnpm-workspace.yaml
├── CLAUDE.md            context global pentru agenți (derivat din acest blueprint)
├── CONVENTIONS.md       convenții de cod / commit / naming
└── README / ROADMAP / TASKS / FEATURES
```

**Convenții de cod de bază** (din CONVENTIONS.md Melodia Ta, valabile pentru toate):
- Fișiere `kebab-case`, componente `PascalCase`, hooks `useCamelCase`, tipuri `PascalCase` fără prefix `I`.
- Entități TypeORM: `*.entity.ts` în `src/<modul>/entities/`.
- Admin: nicio componentă nu face `axios.get` direct — totul prin clase statice `src/api/*.api.ts` peste `src/lib/http/` (client cu retry + refresh-token + auth-check + error-handler → `ApiError` normalizat).
- Fără abstracții premature, fără comentarii care explică *ce* face codul (doar *de ce* non-evident), TypeScript strict, validare doar la boundaries.

---

## 4. Convenția de porturi (prefix per proiect)

Fiecare proiect primește un **prefix unic de 2 cifre** și toate serviciile lui locale stau pe acel bloc. Asta permite să rulez mai multe proiecte simultan pe aceeași mașină fără conflicte de port.

Schema de offset (constantă pentru toate proiectele, doar prefixul `XX` se schimbă):

| Serviciu | Port | Exemplu Melodia Ta (49) | Exemplu proiect nou (42) |
|---|---|---|---|
| Frontend (Next.js) | `XX00` | 4900 | 4200 |
| Backend (NestJS API) | `XX01` | 4901 | 4201 |
| Postgres | `XX02` | 4902 | 4202 |
| Adminer (DB UI, doar dev) | `XX03` | 4903 | 4203 |
| Redis | `XX04` | 4904 | 4204 |
| Storage (fake-gcs emulator, dev) | `XX05` | 4905 | 4205 |
| Admin (Vite dev server) | `XX06` | (vite default) | 4206 |

Reguli:
- Prefixele deja folosite: **49** = Melodia Ta. Manele Cadou folosește 15xx (modelul vechi). Pentru proiecte noi aleg prefixe libere (42, 43, 44...).
- În **producție** serviciile nu expun porturi pe host — comunică prin rețeaua Docker internă, doar NPM ascultă pe 80/443. Prefixul de port contează mai ales pentru dev local și pentru numele containerelor.
- Agentul mă întreabă prefixul în chestionarul de onboarding și îl folosește consecvent în docker-compose, `.env`, scripts.

---

## 5. Rețele & containere Docker (șablon)

**Dev** (`docker-compose.yml`): postgres, redis, adminer, fake-gcs (emulator storage), backend (hot-reload), frontend (hot-reload). Admin rulează separat cu `vite dev` sau în container.

**Prod** (`docker-compose.prod.yml`):
- Servicii: `postgres`, `redis`, `backend`, `frontend`, `admin` (Vite build servit cu nginx-alpine static). Opțional `worker` separat pentru BullMQ dacă vrei izolare.
- Două rețele: `internal` (postgres ↔ redis ↔ backend, fără expunere) și `proxy` / `npm_proxy` (external — backend/frontend/admin vorbesc cu NPM-ul). Niciun `ports:` pe host în afară de NPM.
- Volume persistente: `./data/postgres`, `./data/redis`, `./data/uploads` (sau bucket GCS în prod), `./data/backups`.
- Logging cu rotație (`json-file`, max-size + max-file) per serviciu.
- Toate serviciile cu `restart: unless-stopped` + healthcheck.

Detaliile complete de deployment în `06-DEPLOYMENT-VPS-NPM.md`.

---

## 6. Schema DB — fără migrations

Schema se definește exclusiv prin entități `*.entity.ts`; TypeORM o aliniază la boot cu `synchronize: true`. Nu folosim fișiere de migration.

- **Sigur** (synchronize face automat, fără pierderi): adaugi coloană nouă (cu default/nullable), index nou, entitate/tabel nou.
- **Periculos** (DROP de date): ștergi/redenumești coloană, schimbi tipul, treci `nullable:true→false` cu null-uri existente, adaugi `unique` pe coloană cu duplicate. Astea cer migrare manuală pe SQL **înainte** de deploy, cu backup luat întâi.
- Plasa de siguranță: backup `pg_dump` automat înainte de fiecare deploy (vezi `06`).

Aceeași regulă ca în Manele Cadou și Melodia Ta — e deja validată în producție.
