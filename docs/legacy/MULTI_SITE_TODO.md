# Multi-site refactor — STATUS FINAL

Toate cele 5 etape sunt livrate. Typecheck curat pe `apps/api`, `apps/web`, `apps/admin`.

## Ce există acum

### Backend (NestJS, `apps/api`)
- **Modulul `sites/`** — entity `Site` cu toate câmpurile per-tenant (slug, domain, locale, currency, basePriceCents, giftPriceCents, brand, seo, analytics, stripe, suno, social, companyInfo, supportEmail, fromEmail, adminEmails, active, isDefault, sslEnabled, maintenanceMode).
- **`SitesService`** — cache 30s pe domain + id, bootstrap automat al site-ului default la primul start, `findById/findByDomain/listAll/listActiveDomains/create/update/remove`.
- **`SiteContextMiddleware`** — rulează înaintea guards, decode best-effort al JWT-ului prin `JwtService`, anti-abuz pe `role==='user'` (forțează `req.siteId = payload.siteId`, ignoră header-ul). Pentru `role==='admin'` cu `x-site-id='all'` setează `req.siteId = undefined` (cross-tenant). Fallback: header → Host → default site.
- **Decoratori** — `@CurrentSite()`, `@CurrentSiteId()`, `@CurrentUser()`, `@CurrentGuestId()`. JWT include `siteId` și `JwtAuthGuard` îl populează pe `req.user.siteId`.
- **siteId pe toate entitățile** cu date: `users` (unique `(siteId, email)`), `guest_sessions`, `magic_links`, `generations`, `payments` (+ `exchangeRateToRon`/`amountRonCents`), `conversations`, `chat_messages`, `promo_codes` (unique `(siteId, code)`), `promo_redemptions`, `gift_codes` (unique `(siteId, code)`), `roulette_spins`, `error_logs`, `analytics_sessions` (`@Index(['siteId','startedAt'])`), `analytics_events` (`@Index(['siteId','createdAt'])`), `suno_logs` (`@Index(['siteId','createdAt'])`), `suno_credit_purchases`, `app_settings` (unique `(siteId, key)`), `kb_entries`, `ai_reply_suggestions`, `mail_*`.
- **Seeder backfill** — primul start după upgrade setează `siteId = defaultSite.id` pe toate rândurile existente.
- **Filtrare cross-tenant** — toate serviciile (promo, gift-codes, roulette, errors, generations, suno-logs, analytics, chat, kb, mail, admin KPIs) primesc `siteId` și filtrează corespunzător. `siteId === null` în servicii = agregat cross-site (doar pentru endpoint-uri admin sub `AdminGuard`).
- **Auth + Magic link** — link-urile sunt scoped pe `(siteId, email)`; consume-ul refuză cross-site cu `ForbiddenException` clar; user-ii cu același email pe site-uri diferite sunt conturi distincte.
- **Payments + Suno + Lyrics** — `Stripe Checkout` folosește `site.basePriceCents`, `site.currency`, `site.stripe.productName`, `site.stripe.statementDescriptor`, success/cancel pe `https://${site.domain}`, metadata cu `siteId/siteSlug/siteDomain`. Webhook citește `metadata.siteId`, retrieve `balance_transaction.exchange_rate`. Suno respectă `site.suno.basePrompt` + `stylePromptMap`. Lyrics writer folosește `site.suno.lyricsLocale ?? site.locale`.
- **Chat scope** — `listAllConversations(siteId)` aruncă `Forbidden` când `siteId` e null (cross-tenant „all" interzis în inbox — adminul comută prin selector).
- **Mail sync** — cron iterează prin toate site-urile via `listActiveAccountsForSync()`; mesajele/folderele ingestate moștenesc `siteId` din contul de mail.
- **`Caddyfile` + `MULTISITE_DEPLOY.md` + `STRIPE_SETUP.md`** — on-demand TLS prin `/api/internal/caddy/ask`, ghid deploy + decizia de un singur cont Stripe.

### Web (Next.js, `apps/web`)
- **`lib/site-config.ts`** — `getSiteConfig()` server-only cached per request, fetch din `/api/public/site` cu Host forwardat. Helper-i: `formatPrice(site, cents)` cu `Intl.NumberFormat`, `siteUrl(site)`, `siteSupportEmail(site)`. Fallback minimal când API e indisponibil.
- **`lib/site-context.tsx`** — `<SiteProvider>` + `useSite()` hook pentru client components.
- **`app/layout.tsx`** — `generateMetadata` per-site (title, OG, themeColor, metadataBase, keywords, authors din `companyInfo.legalName`); locale-ul site-ului forțează `NextIntlClientProvider`; CSS var `--brand-primary` injectat în `<head>`; JSON-LD Organization + WebSite construite dinamic per-site. Maintenance mode randează static.
- **Header (`SiteShell`) + Footer (`sections.tsx`)** — logo (`site.brand.logoUrl || /logo-80.png`), nume brand, taglină, social links condiționale (`site.social`), telefon/email contact, datele firmei din `companyInfo`.
- **`/cadou`** — TIER_RATIOS scalate pe `site.giftPriceCents`; prețurile prin `formatPrice`.
- **`/studio` Generator** — `DedicStep` + `UnlockStep` folosesc `formatPrice(site, cents)`, fallback `site.basePriceCents`.
- **`/m/[id]`** — `generateMetadata` paralel cu `getSiteConfig`; OG siteName/URL/locale/image per-site.
- **Pagini legale (`/termeni`, `/confidentialitate`, `/cookies`) + `/contact`** — `generateMetadata` async; date firmă, mailto-uri pe `${site.domain}`, prețuri din site.
- **`ChatWidget`** — header folosește `site.name`.
- Stilurile muzicale (`OCC/STYLES/VOICES/...` din `lib/seed-data.ts`) rămân partajate între site-uri (decizie default).

### Admin (Next.js, `apps/admin`)
- **`lib/api/sites.api.ts`** — `SitesApi` (list/get/create/update/remove), `getSelectedSiteId`/`setSelectedSiteId`, constanta `ALL_SITES = 'all'`.
- **HTTP interceptor (`lib/http/client.ts`)** — atașează `x-site-id` din localStorage la fiecare request; **excepție**: `/auth/*` nu primesc header (login-ul nu depinde de selector).
- **`SiteSelector`** — dropdown global în sidebar; auto-pin pe singurul site existent; afișaj static read-only când există un singur site (fără dropdown). Schimbarea declanșează `mc:site-changed` + `window.location.reload()`.
- **`useSitesMap()` hook** + **`SiteBadge` component** — lookup global cached al site-urilor; badge cu dot colorat (din `brand.primaryColor`) + slug + tooltip cu numele complet.
- **Coloana „Site" în tabele** când selectorul e pe „Toate" — Generations, Payments, Users, Guests, Promo, Gift codes (+ inline pe cardurile Errors).
- **`/chat` și `/inbox`** afișează empty state „Selectează un site" când selectorul e pe „Toate" — modul cross-tenant nu e suportat în chat/mail.
- **`/sites`** — pagina de management, mereu cross-site indiferent de selector.
- **Endpoints admin** întorc `siteId` pe entități (TypeORM) → SiteBadge îl rezolvă din `useSitesMap()`.

---

## Comenzi de verificare

```bash
# Health check site config (web)
curl http://localhost:1501/api/public/site -H 'Host: manelecadou.ro'

# Caddy on-demand TLS hook
curl 'http://localhost:1501/api/internal/caddy/ask?domain=manelecadou.ro'

# List sites (admin token necesar)
curl http://localhost:1501/api/admin/sites -H 'Authorization: Bearer <token>'

# Cross-site agregat (admin selector pe „Toate")
curl http://localhost:1501/api/admin/stats \
  -H 'Authorization: Bearer <token>' \
  -H 'x-site-id: all'

# Stats pentru un site specific
curl http://localhost:1501/api/admin/stats \
  -H 'Authorization: Bearer <token>' \
  -H "x-site-id: <siteId>"

# Anti-abuz user — încearcă să spoofezi siteId cu token de user normal:
curl http://localhost:1501/api/generations/123 \
  -H 'Authorization: Bearer <user-token>' \
  -H 'x-site-id: <alt-site-id>'
# → middleware ignoră header-ul, folosește siteId-ul din JWT

# Typecheck pe toate cele 3 apps
( cd apps/api && npm run typecheck )
( cd apps/web && npm run typecheck )
( cd apps/admin && npm run typecheck )
```

---

## Strategia de migrare a producției existente

1. **Backup DB** înainte de orice deploy.
2. Deploy cu `synchronize: true` (default în non-prod):
   - Tabelul nou `sites` se creează automat.
   - Coloana `siteId` se adaugă ca nullable pe toate tabelele.
   - Index-urile compus se creează (`(siteId, code)`, `(siteId, email)`, `(siteId, createdAt)` etc).
3. La primul start: `SitesService.onModuleInit` creează site-ul default cu `DEFAULT_SITE_DOMAIN`; `SeederService.run()` backfillează `siteId` pe rândurile existente.
4. **După verificare**, dacă vrei strict NOT NULL: rulează manual `ALTER TABLE ... ALTER COLUMN "siteId" SET NOT NULL`. Recomand să lași nullable o perioadă pentru siguranță.
5. Pentru fiecare site nou: A record DNS → admin `/sites` → adaugă → instant live (Caddy cere certul on-demand prin `/ask`).

---

## Decizii confirmate (NU se implementează)

- **Cloudflare auto-DNS** — DNS-ul îl pune user-ul manual.
- **Stripe Connect / conturi multiple** — un singur cont Stripe RO, conversie automată la RON la payout (vezi `STRIPE_SETUP.md`).
- **Admini per-site** — un singur tip de admin (super-admin global), comută între site-uri prin selector.
- **Stiluri muzicale per-site** — toate site-urile partajează aceeași listă din `seed-data.ts`. Dacă vine cerința, mută-le într-un câmp `site.styles` jsonb.

---

## Risc-uri & atenționări

- **TypeORM `synchronize`** poate eșua dacă index-urile compus se creează înainte ca `siteId` să fie populat complet. Dacă întâlnești asta: oprește app-ul, manual `UPDATE ... SET "siteId" = '<default>' WHERE "siteId" IS NULL`, repornește.
- **Performance cross-site** — query-urile admin „Toate" pot fi lente pe volume mari; index-urile `(siteId, createdAt DESC)` sunt deja adăugate pe `analytics_*`, `suno_logs`. Adaugă manual și pe `generations`/`payments` dacă vezi degradare.
- **Webhook-uri Stripe** — NU se rezolvă prin Host (Stripe lovește un singur endpoint). Folosește OBLIGATORIU `metadata.siteId` ca să știi cărui site îi aparține plata.
- **Magic link cross-domain** — link-urile emise pe `manelecadou.ro` sunt respinse când sunt deschise pe `manelecadou.bg` (`ForbiddenException` clar). Dacă vrei să accepți cross-domain, modifică `consumeMagicLink`.
- **Selectorul „Toate" în chat/inbox** — backend-ul răspunde cu `Forbidden`; frontend-ul afișează empty state. Nu e bug, e by-design.

---

## Bug-uri găsite în smoke test local (rezolvate)

- **`site-config.ts` importat în client components** — `next/headers` e server-only, dar `sections.tsx` și `Generator.tsx` (client) îl importau pentru `formatPrice`/`siteUrl`/`siteSupportEmail`. Fix: split în `lib/site-shared.ts` (pure helpers, safe în client) + `lib/site-config.ts` (server-only cu `getSiteConfig`). Client components importă din `site-shared`.
- **`i18n/request.ts` nu folosea `site.locale`** — `next-intl` are propriul `getRequestConfig` separat de `getLocale()` din layout. Componentele SSR (footer, sections) cădeau pe cookie/default = `ro` indiferent de site. Fix: `request.ts` apelează `getSiteConfig()` și prioritizează `site.locale`. React `cache()` din `getSiteConfig` deduplică call-ul per request.
- **SEO multi-site incomplet** — `sitemap.ts` și `robots.ts` foloseau `APP_URL` hardcoded → Google ar fi primit pe `manele-bg.com/sitemap.xml` URL-uri cu `manelecadou.ro`. `og:locale` lipsea. `canonical` URL nu era setat. Fix: ambele rezolvă acum din `getSiteConfig()` + Host forward; `sitemap` filtrează generations doar pe site-ul curent (API filtra deja, dar acum trimit Host); `robots` blochează indexarea pe site-uri inactive sau în mentenanță; layout setează `og:locale` (`bg_BG`, `tr_TR`, etc.) + `alternates.canonical` per site. Niciun `hreflang` cross-site (per cerință — site-urile sunt entități SEO complet izolate).

---

## Improvements pentru iterația următoare — Site samples (mostre audio /studio)

Implementat în prima iterație: `apps/api/src/modules/sites/site-samples.service.ts` + `AdminSiteSamplesController` + pagina admin `/sites/[id]/samples`. Funcțional, dar de făcut mai robust:

- **`POST /admin/sites/:id/samples/generate` să fie async (202)** — momentan e sincron și ține conexiunea HTTP deschisă ~3 minute (durata reală a generării Suno). Riscă timeout pe reverse-proxy (Caddy / nginx default 60-120s) și pe browser. Soluție: queue-uiește jobul (BullMQ sau pattern-ul similar din `bulk` care deja merge async), întoarce 202 imediat, polling-ul UI există deja (refresh la 8s pe `GET /samples`) și va prinde tranziția `generating → present` natural.
- **State `generating` mută-l din memorie în Redis (sau DB)** — `SiteSamplesService.inFlight` e `Set<string>` in-process. Se pierde la restart API (rămân mostre marcate „generating" în UI fără să mai genereze nimeni) și nu funcționează pe mai multe instanțe API (load balancer). Soluție: cheie Redis `site-samples:inflight:<siteId>:<kind>:<key>` cu TTL ~10 min (auto-cleanup dacă jobul moare), sau coloană `inFlightUntil` pe `Site.suno.styleSamples[key]`. Redis e mai curat fiindcă deja folosim BullMQ pe Redis.
