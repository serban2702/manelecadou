# Admin Dashboard — Blueprint & Master Prompt (reutilizabil per proiect)

> **Ce este acest fișier.** Un singur document dens pe care îl dai ca prompt unui agent de cod (sau ție însuți) la începutul fiecărui proiect nou de tip „AI-as-a-service gift site". Conține arhitectura completă a unui **admin dashboard generic**, modulele *core* comune tuturor site-urilor, contractele API/date, deciziile de stack și o secțiune finală gata de copiat (`§12`) în care completezi doar variabilele specifice proiectului.
>
> Blueprint-ul este derivat din sistemul real **Manele Cadou** (`apps/api` NestJS+TypeORM, `apps/admin` Next.js), dar generalizat și *curățat* de suprapunerile actuale (vezi `§10 Refactor`). Nu copia structura veche 1:1 — folosește modelul consolidat de aici.

---

## §0. TL;DR pentru agentul de cod

Construiește un **admin dashboard** pentru un site care vinde produse generate de AI (muzică, video, imagini etc.) către clienți finali non-tehnici. Site-ul public are un **wizard pas-cu-pas** care se termină în plată. Adminul trebuie să dea **observabilitate totală** asupra fiecărui aspect: fiecare vizitator (real vs bot), fiecare pas din funnel, fiecare request către providerii AI, fiecare plată Stripe (inclusiv eșecuri cu motiv), fiecare email/SMS trimis, fiecare conversație de chat (cu asistență AI), recovery pentru coșuri abandonate, și toți metricii de ads (Meta, Google; TikTok amânat).

Stack impus:
- **Backend:** NestJS + TypeORM + PostgreSQL (monolit modular, deja existent — adminul consumă aceleași API-uri sub prefix `/admin/*`).
- **Frontend admin:** **React + Vite + TypeScript** (NU Next.js), **fără React Query**. Clase proprii pentru HTTP și auth (vezi `§11`). `shadcn/ui` + Radix + Recharts permise (adminul nu are constrângeri estetice de brand — doar să fie curat, rapid, responsive/mobil).
- **Auth admin:** **better-auth** (OTP pe email / Google / email+parolă), conturi de admin într-o tabelă dedicată (`§3`), separate de userii publici.
- **Multi-tenant:** un singur deployment servește N site-uri. Totul e filtrat pe `siteId`, propagat din header `x-site-id`. Selector de site în topbar + opțiune „Toate site-urile" (cross-site).

---

## §1. Contextul de business (de ce există adminul)

Modelul de afacere: iei modele AI de pe piață (Suno pentru muzică, modele image-to-video, LLM-uri precum OpenAI/Grok pentru text/lyrics) și le împachetezi într-un site frumos, performant, localizat, pentru oameni care nu le-ar folosi singuri. Clientul intră, parcurge un wizard (alege stil/ocazie/destinatar/mesaj → preview/demo → plată), iar tu livrezi produsul finit (melodie/manea/videoclip cadou).

Din perspectiva ta de operator, ai nevoie de un singur „cockpit" în care:

1. **Vezi banii** — fiecare inițiere de checkout, fiecare plată reușită/eșuată și **de ce** a eșuat, reconciliere cu Stripe, venit pe sursă/campanie.
2. **Vezi producția** — fiecare comandă, în ce stadiu e (lyrics → audio → livrat), fiecare request către providerul AI cu request/response body, cost estimat în credite, rată de eșec.
3. **Vezi oamenii** — vizitatori reali vs boți, pe ce pas din wizard au ajuns, de unde au venit (UTM/sursă), cine a abandonat.
4. **Comunici** — un singur loc unde vezi și trimiți pe **toate canalele**: chat live (cu AI concierge), email (Mailgun), SMS (Twilio), plus inbox IMAP pentru replies. Istoric complet per client și per canal.
5. **Recuperezi** — sistem automat de recovery pentru cei care au lăsat email/telefon dar n-au plătit (emailuri + SMS escaladate cu reduceri).
6. **Marketing & ads** — campanii manuale, reguli automate, și agregarea metricilor din Meta Ads + Google Analytics/Ads (pixel + CAPI server-side), pentru ROAS real (spend vs revenue atribuit).
7. **Configurezi** — branding, prețuri, chei API, prompturi AI, totul **per site**, fără redeploy.

---

## §2. Decizii de arhitectură (și de ce)

**Monolit modular pe backend, nu microservicii.** Volumul (câteva sute de evenimente/zi per site) nu justifică distribuția. NestJS cu un modul per domeniu, TypeORM cu `synchronize` în dev și migrații în prod. BullMQ + Redis pentru joburi async (generări AI, trimitere campanii, sincronizare ad-spend, recovery cron).

**Admin = SPA React separat, nu Next.js.** Adminul nu are nevoie de SSR/SEO și nu vrei lock-in pe App Router. Vite dă build rapid și HMR instant. Routing client-side cu `react-router-dom`. State din `useState`/`useReducer` + Context; date din server prin **un strat propriu** (`HttpClient` + un hook `useResource` care înlocuiește React Query — vezi `§11`). Motivul pentru a evita React Query: vrei control total și zero dependențe magice pe cache; un hook de ~80 linii acoperă 95% din nevoi (fetch + loading/error + refetch + invalidate manual).

**Auth admin complet separat de userii publici.** În sistemul vechi, adminii erau useri cu `role='admin'` în aceeași tabelă, autentificați prin magic-link JWT — același flux ca clienții. E fragil (un user public nu trebuie să poată ajunge admin printr-un bug de rol). În noul sistem: **better-auth** cu tabelă proprie `admin_users`, sesiuni proprii, MFA opțional (OTP email), și Google OAuth. Userii publici rămân în `users` cu fluxul lor. Adminul vorbește cu backendul printr-un guard `AdminGuard` care validează sesiunea better-auth, nu JWT-ul de user.

**Multi-tenancy prin coloană `siteId`, nu schema-per-tenant.** Fiecare entitate are `siteId uuid nullable` + index. Requesturile din admin trimit `x-site-id`; un interceptor NestJS îl rezolvă într-un `CurrentSiteId`. Valoarea specială `all` (sau lipsa headerului pe paginile agregat) = cross-site. Site-ul public își rezolvă `siteId` din `Host`/domeniu. **Regula de aur:** orice query în repository primește `where: { siteId }` (sau `In([...])` pentru cross-site), niciodată query global „din greșeală".

**Real-time prin Socket.IO** pentru chat live, prezența vizitatorilor pe wizard, și notificări (plată nouă, mesaj nou). Namespace separat pentru admin (autentificat) și pentru public.

**Observabilitate ca cetățean de prim rang.** Fiecare apel extern (provider AI, Stripe, Mailgun, Twilio, Meta CAPI) scrie un rând de audit *înainte* de apel (status `queued/pending`) și se actualizează la final (`sent/success/failed` + payload + eroare). Asta îți dă debugging post-mortem fără să te bazezi pe loguri efemere. Integrare opțională cu session-replay self-hosted (OpenReplay) — `sessionId` propagat prin AsyncLocalStorage și salvat pe payment/email pentru a lega un eșec de înregistrarea sesiunii.

---

## §3. Separarea CORE comun vs SPECIFIC per site

Aceasta e analiza centrală pe care o ceri. Am împărțit cele ~35 de module existente în trei categorii.

### A. CORE — identic pe toate site-urile (90% din admin)

| Domeniu core | Ce acoperă | Înlocuiește modulele vechi |
|---|---|---|
| **Auth & Admins** | Login admin (better-auth), conturi admin, roluri, sesiuni, audit acțiuni | `auth` (partea de admin) |
| **Sites** | Config per tenant: brand, prețuri, chei analytics, secrete server-side, config provider AI, prompturi | `sites`, `settings`, `seo-pages` |
| **Customers** | Identitate unificată user + guest, istoric per persoană (comenzi, plăți, mesaje, sesiuni) | `users`, `guest-sessions` |
| **Orders** | Agregatul de business: o comandă = intenție + plată + 1..N joburi de generare + livrare. Status machine. | `generations` + `payments` (consolidate — vezi §10) |
| **Payments** | Stripe: fiecare checkout, fiecare plată paid/failed/refunded + motiv, reconciliere, atribuire pixel | `payments`, `invoices` |
| **AI Provider Monitor** | Log generic per apel către orice provider AI (request/response/cost/outcome/latency) | `suno` (logs), `lyrics` (logs) → generalizat |
| **Communications** | **Un singur domeniu** pentru toate canalele: chat live, email (Mailgun), SMS (Twilio), inbox IMAP. Thread per client, multi-canal. | `chat`, `mail`, `outbound-email`, parțial `marketing` |
| **AI Concierge** | Agentul AI de vânzări din chat (tool-calling, moduri manual/suggest/auto), memorie, KB, review-uri | `ai-chat`, `ai-assistant`, `kb` |
| **Recovery** | Coș abandonat: escaladare email+SMS cu reduceri, opt-out, conversie | `recovery`, `promo`/`gift-codes` (parțial) |
| **Marketing** | Campanii manuale, reguli automate, audiențe, opt-out | `marketing` |
| **Analytics & Funnel** | Evenimente, sesiuni, bot detection, funnel wizard, surse/UTM, top pagini, devices | `analytics` |
| **Ads & Attribution** | Pixel + CAPI (Meta), GA4 (Measurement Protocol), spend din Marketing API, ROAS; TikTok amânat | `meta-capi`, `tiktok`, `analytics/ad-spend` |
| **Observability** | Error log, request log, health, web-push admin, database admin/backups | `errors`, `health`, `web-push`, `database-admin` |

### B. SPECIFIC — variază cu tipul de produs (≈10%, izolat ca „plugin")

Diferența reală între un site de muzică și unul de video este: **(1) câmpurile wizardului**, **(2) provider-ul AI și pipeline-ul de generare**, **(3) cum se randează preview-ul produsului**. Tot restul e core.

Izolează specificul într-un singur loc: un **„Product Plugin"** per site, cu trei contracte:

```ts
interface ProductPlugin {
  kind: 'music' | 'video' | 'image' | string;       // discriminant
  // 1. Schema datelor de comandă (ce colectează wizardul)
  orderSchema: ZodSchema;                            // validează generation.payload
  // 2. Pipeline-ul de generare (cum se produce livrabilul)
  generate(order: Order, ctx: ProviderCtx): Promise<GenerationResult>;
  // 3. Cum afișează adminul preview-ul + ce coloane în tabel
  adminPreview: React.ComponentType<{ order: Order }>;
  adminColumns: ColumnDef[];
}
```

Backendul stochează datele specifice în `generation.payload jsonb` (nu coloane dedicate per tip). Adminul are un registru `productPlugins[site.kind]` care decide ce randează în pagina de comandă. Astfel un site nou de „video cadou" nu atinge deloc Payments, Communications, Analytics etc. — implementează doar un plugin.

### C. OPȚIONAL — activabil per site prin feature flags

`invoices` (facturare SmartBill — doar RO/B2B), `roulette`/`gift-codes` (mecanici promo), `site-demos` (galerie publică de exemple), `collage` (unelte media auxiliare), `web-push`. Toate sub `site.features.{ invoices: true, ... }`.

---

## §4. Modelul de date (entități core, consolidat)

Doar câmpurile semnificative; toate au `id uuid pk`, `siteId uuid null + index`, `createdAt/updatedAt`. Tot ce e `jsonb` e marcat.

### 4.1 `admin_users` (better-auth) + `admin_sessions`
Gestionate de better-auth. `admin_users`: `email`, `name`, `role ('owner'|'admin'|'support')`, `image`, `emailVerified`, `mfaEnabled`. Provider tables (account, session, verification) conform schemei better-auth. **Niciun amestec cu `users`.**

### 4.2 `sites` (tenant config)
```
slug, domain, name, locale, currency
basePriceCents, standardPriceCents, giftPriceCents, premiumExtraCents, tip*Cents
brand           jsonb { primaryColor, accentColor, logoUrl, ogImageUrl, faviconUrl, emailBannerUrl, tagline }
seo             jsonb { title, description, keywords }
analytics       jsonb { ga4Id, metaPixelId, tiktokPixelId, metaAdAccountId, tiktokAdvertiserId }
analyticsSecrets jsonb (SERVER-ONLY, nu se expune public) { ga4ApiSecret, metaCapiToken, metaMarketingToken, metaTestEventCode, tiktok* }
stripe          jsonb { priceId, productName, statementDescriptor }
provider        jsonb (config plugin: ex. suno { basePrompt, stylePromptMap, voiceMap, writerSystemPrompt, criticSystemPrompt })
messaging       jsonb { mailFrom, mailgunDomain?, twilioFrom?, smsEnabled }
features        jsonb { invoices, roulette, giftCodes, webPush, demos }
social          jsonb { instagram, facebook, tiktok, youtube, whatsapp }
kind            varchar  // discriminant pentru ProductPlugin
```
**Important:** secretele NU pleacă spre clientul public. Endpoint `/public/site` returnează doar `brand/seo/analytics(ids)/prices`. Adminul vede tot.

### 4.3 `customers` (vizualizare unificată user+guest)
Păstrează `users` (cont real: `email` unic per site, `role`, `locale`) și `guest_sessions` (`email?`, `freeDemoUsed`, `meta jsonb`, `lastSeenAt`). Adminul le prezintă unificat: cheia de identitate la nivel de business e `(siteId, lower(email))` SAU `guestId`. Construiește un **view/serviciu `CustomerProfile`** care, pentru un email/guest, agregă: comenzi, plăți, mesaje (toate canalele), sesiuni analytics, stare recovery.

### 4.4 `orders` + `generations` (consolidat — vezi §10)
```
ORDER (agregatul de business)
  customerRef   { userId?, guestId?, email? }
  status        'draft'|'pending_payment'|'paid'|'in_production'|'delivered'|'failed'|'refunded'
  amountCents, currency, packageTier
  source        snapshot atribuire (utm, fbp/fbc, sessionKey)  // pentru CAPI + ROAS
  paymentId     -> payments.id
  generations   -> 1..N generation jobs

GENERATION (job tehnic, poate fi demo/full/variație)
  orderId?      (null pt demo gratuit pre-plată)
  type          'demo'|'full'|'variation'
  status        'pending'|'queued'|'running'|'succeeded'|'failed' (+ substatusuri pipeline)
  payload       jsonb  // datele specifice tipului (stil, ocazie, mesaj, imagine sursă...)
  result        jsonb  // url-uri media, durate, extras (wav, stems, video...)
  providerCalls -> ai_provider_calls (1..N)
  error, completedAt
```

### 4.5 `payments`
```
provider 'stripe', providerSessionId (Checkout Session), status 'pending'|'paid'|'failed'|'refunded'
amount, currency, amountRonCents, exchangeRateToRon
failureReason (text complet din Stripe), failureCode (decline_code scurt — filtrabil)
fbp, fbc, userAgent, ipAddress      // atribuire pixel capturată la checkout creation
capiSentAt                          // idempotency lock pt Meta CAPI Purchase
openReplaySessionId
```
Webhook Stripe (`checkout.session.completed`, `payment_intent.payment_failed`, `charge.refunded`) actualizează rândul și declanșază: livrarea comenzii, CAPI Purchase, factură (dacă feature on), oprirea recovery-ului.

### 4.6 `ai_provider_calls` (GENERALIZAT din `suno_logs` + `lyrics_logs`)
Tabelă unică pentru orice apel către orice provider AI. Asta îți dă „monitorizarea fiecărui request către Suno/Grok/OpenAI" cerută.
```
provider     'suno'|'openai'|'grok'|'replicate'|'elevenlabs'|...
operation    'audio.generate'|'lyrics.write'|'lyrics.critic'|'image.to_video'|'chat.completion'|...
generationId?  conversationId?   relatedId?
endpoint     varchar
requestBody  jsonb
responseStatus int, responseBody jsonb
providerTaskId  (pt polling async)
providerStatus  (status terminal raportat, ex SUCCESS / GENERATE_AUDIO_FAILED)
outcome      'pending'|'success'|'failed'|'http_error'|'timeout'
model, promptTokens, completionTokens     // pt LLM
costCredits / costMicroUsd                // estimare cost, pt rapoarte cheltuieli
latencyMs, errorMessage
createdAt, completedAt
```
Scrii rândul la submit (`pending`), îl închizi la rezultat. Polling-ul nu creează rânduri noi. UI: pagina **AI Monitor** cu filtre pe provider/operation/outcome, sumar (calls, success rate, cost total, latență p50/p95), drill-down pe request/response brut.

### 4.7 `communications` (CONSOLIDARE majoră — vezi §10)
Un domeniu unic în loc de 4. Două entități:
```
CONVERSATION (thread per client, indiferent de canal)
  customerRef, channel 'chat'|'email'|'sms', subject?
  status 'open'|'pending'|'archived', aiMode 'manual'|'suggest'|'auto'
  unreadCount, lastMessageAt, wizardState jsonb (pt AI concierge), tags[]

MESSAGE (un mesaj pe orice canal)
  conversationId, channel, direction 'inbound'|'outbound'
  authorRole 'customer'|'admin'|'system'|'ai'
  body, bodyTranslatedRo?, detectedLang?
  type 'text'|'image'|'file'|'payment_link'|'preview'|'system'|'ai_suggestion'
  payload jsonb (ex payment_link: amount, checkoutUrl, clickCount, firstClickedAt)
  -- delivery (înlocuiește outbound_email):
  deliveryStatus 'queued'|'sent'|'delivered'|'failed'|'read'
  deliveryProvider 'mailgun'|'twilio'|'smtp'|'ws'
  providerMessageId, errorMessage
  kind  (categorie funcțională: magic_link, payment_receipt, generation_done, recovery_h4...)
  openReplaySessionId
```
Toate emailurile tranzacționale, SMS-urile, mesajele de chat și replies-urile IMAP devin `MESSAGE` cu `channel` diferit. „Gestiunea tuturor mailurilor + mesajelor" cerută = o singură pagină filtrabilă pe canal/status/kind/client.
> IMAP inbox (`mail_*`) rămâne ca *sursă de import* (sync IMAP → creează MESSAGE inbound channel=email). Conturile IMAP + foldere + attachments rămân entități auxiliare ale acestui domeniu.

### 4.8 `recovery_states`
```
identity (siteId, lower(email)) UNIQUE
userId?, guestId?, generationId?, paymentId?
anchorAt (momentul abandonului)
stagesSent jsonb  // { h1, h4, h24, h48, h72, d7 } -> { sentAt, channel, promoCode, skippedAt }
optOutToken UNIQUE, optedOutAt, optOutReason
convertedAt, lastError
```
Cron la fiecare X min calculează etapele scadente față de `anchorAt`, trimite pe canalul disponibil (email și/sau SMS), atașează cod promo escaladat. Opt-out permanent cu scope DOAR pe recovery. Plată ulterioară `anchorAt` → `convertedAt` și stop.

### 4.9 `analytics_events` / `analytics_sessions` / `ad_spend`
```
EVENT: eventId (dedup GA/Pixel), type (page_view|click|generation_start|purchase_init|purchase_success|signup...),
       sessionKey, visitorId, userId?, guestId?, url/path/referrer, valueCents?, props jsonb (UTM, scroll, wizardStep),
       forwardStatus (spre GA4/CAPI)
SESSION: sessionKey UNIQUE, visitorId, pageViews, events, durationSec, bounced,
         source/medium/campaign/utm*, landingPath, device, isBot (bot detection prin UA regex), botReason
AD_SPEND: platform 'meta'|'tiktok', campaignId/Name, adsetId/Name, adId/Name, date,
          spendCents, currency, impressions, clicks  (upsert idempotent pe (siteId,platform,adId,date))
```
**Bot detection** (deja existent): regex pe User-Agent (`bot|crawler|spider|googlebot|...|headlesschrome|puppeteer|playwright|curl/|python-requests|...`). Adminul afișează split real vs bot pe funnel și trafic.

### 4.10 Auxiliare
`errors` (error_log), `app_settings` (key-value per site, dacă vrei override fără redeploy), `promo_codes`/`gift_codes`, `seo_pages`, `web_push_subscriptions`, `invoices`.

---

## §5. Suprafața API (`/admin/*`) — convenții

Toate sub `/api/admin/...`, protejate de `AdminGuard` (sesiune better-auth) + `x-site-id`. Convenții:

- **Listare:** `GET /admin/<res>?limit=&offset=&q=&<filtre>` → `{ items, total, hasMore }`. Niciodată „return tot".
- **Detaliu:** `GET /admin/<res>/:id`.
- **Mutație:** `POST/PATCH/DELETE`. Răspuns `{ ok: true, ... }`.
- **Sumar/stats:** `GET /admin/<res>/summary` sau `/stats` → carduri KPI.
- **Range temporal:** `?from=ISO&to=ISO&bucket=hour|day` pentru toate rapoartele.
- **Erori:** status HTTP corect + body `{ statusCode, message, error }`. Frontendul are `ApiError`.
- **Realtime:** Socket.IO namespace `/admin`, autentificat cu token de sesiune; evenimente `chat:new_message`, `payment:new`, `presence:wizard_state`, `generation:status`.

Endpoint-uri reprezentative (model, nu exhaustiv):
```
GET  /admin/overview                      // dashboard home: KPI azi/7z/30z, revenue, comenzi, funnel top-line
GET  /admin/orders?status=&q=             // + /orders/:id (timeline complet)
GET  /admin/payments?status=failed        // + /payments/summary, /payments/:id
GET  /admin/ai-calls?provider=&outcome=   // + /ai-calls/summary, /ai-calls/:id (request/response brut)
GET  /admin/communications?channel=&kind= // + /:id thread; POST /:id/reply (alege canal)
POST /admin/communications/:id/ai-suggest // generează draft AI
GET  /admin/conversations (live chat)     // WS pentru realtime
GET  /admin/recovery?state=               // + /recovery/:id, POST /recovery/:id/opt-out
GET  /admin/marketing/campaigns|rules|audiences
GET  /admin/analytics/overview|time-series|funnel|sources|top-pages|devices|revenue-by-source|revenue-by-campaign
GET  /admin/analytics/stripe-reconciliation|pixel-cross-check
GET  /admin/ads/spend?platform=&from=&to= // + /ads/roas (spend vs revenue atribuit)
GET  /admin/sites + PATCH /admin/sites/:id
GET  /admin/customers?q= + /customers/:id (profil 360)
GET  /admin/errors  /admin/health  /admin/database/*  /admin/settings
```

---

## §6. Modulele admin (UI) — pagini și ce conțin

Sidebar grupat. Fiecare pagină respectă: header cu titlu + range/filtre, carduri KPI sus, tabel paginat + drill-down în panou lateral/drawer. Mobile: sidebar colapsabil în drawer, tabele → carduri.

1. **Overview (Home)** — KPI azi/7z/30z: revenue, comenzi paid, rată conversie funnel, vizitatori reali, AI calls + success rate, mesaje necitite, recovery în curs. Grafice revenue & sesiuni (Recharts). Alerte (plăți eșuate spike, provider AI down).
2. **Orders** — listă comenzi cu status pipeline; detaliu = timeline unificat (created → checkout → paid → generation jobs → delivered) + preview produs (din ProductPlugin) + acțiuni (re-roll, refund, retrimite livrare).
3. **Payments** — toate tranzacțiile; filtru pe `failed` cu `failureReason/Code`; reconciliere Stripe; export. Card „de ce eșuează plățile" (top decline codes).
4. **AI Monitor** — fiecare apel provider; sumar cost (credite/USD), success rate, latență; drill-down request/response brut; filtru provider/operation/outcome. Buton „retry".
5. **Communications** — inbox unificat: tab-uri/filtru pe canal (chat/email/SMS), status, kind. Thread per client cu istoric complet pe toate canalele. Compose cu alegere canal + asistent AI (reply/reformulează/scurtează/traduce). Sub-secțiuni: conturi IMAP, quick replies, blacklist.
6. **Live Chat** — vedere realtime a conversațiilor online; prezența vizitatorilor pe wizard (ce pas, ce date completate); AI concierge cu moduri manual/suggest/auto; trimite payment link în chat cu click-tracking.
7. **AI Concierge** — config agent: memorie (fapte/FAQ/edge-cases aprobabile), KB, audit tool-calls (input/output/tokens/cost), review-uri conversații (good/bad + categorie) pentru tuning.
8. **Recovery** — candidați de coș abandonat, în ce etapă sunt, ce s-a trimis (email/SMS), conversii, opt-out. Config program (ferestre h1..d7, reduceri).
9. **Marketing** — campanii (audiență all/payers/nonpayers/single + template + cod promo), reguli automate, opt-out list, audience counts.
10. **Analytics** — funnel wizard pas-cu-pas (cu rate de conversie între pași), trafic & vizitatori (real vs bot), surse/UTM, top pagini, devices, revenue pe sursă/campanie.
11. **Ads** — spend Meta + Google pe campanie/adset/ad, ROAS (spend vs revenue atribuit prin CAPI/UTM), status pixel & CAPI (cross-check evenimente server vs client, EMQ). TikTok: secțiune marcată „necesită cont business verificat — amânat".
12. **Customers** — căutare + profil 360 (comenzi, plăți, mesaje, sesiuni, recovery).
13. **Sites** — config per tenant (toate câmpurile din §4.2), incl. chei/secrete, prompturi AI, prețuri, branding, feature flags.
14. **Content** (specific/opțional) — demos publice, pagini SEO, coduri promo/gift, roulette.
15. **System** — error log, health, web-push, database backups/restore, settings, admin users & roluri.

---

## §7. Multi-tenancy & site selector (detaliu)

Topbar: dropdown cu site-urile + „Toate site-urile". Selecția se persistă (`localStorage: admin_active_site`) și se trimite ca `x-site-id` pe fiecare request (interceptor în HttpClient). Excepție: `/auth/*` și endpointuri global-admin nu depind de site. Paginile agregat (Overview cross-site, reconciliere globală) trimit `all` și backendul face `In(siteIds)` sau omite filtrul. Backend: `@CurrentSiteId()` decorator citește headerul; un `SiteScopeInterceptor` injectează `siteId` în context. Repository helper `scoped(qb, siteId)` care adaugă `where siteId` automat — folosit peste tot ca să nu uiți filtrarea.

---

## §8. Realtime, joburi async, cron

**BullMQ queues:** `generation` (rulează ProductPlugin.generate cu polling provider), `email`/`sms` (trimitere + retry), `campaign` (fan-out), `ad-sync` (trage spend Meta/Google zilnic), `recovery` (cron evaluare etape), `capi-forward` (evenimente spre Meta/GA4). Fiecare job scrie audit (`ai_provider_calls` / `communications.deliveryStatus`).

**Socket.IO:** `/admin` namespace pentru: mesaj nou, plată nouă (toast + sunet), status generare live, prezența vizitatorilor pe wizard (din WS public `presence:form_state`). `/public` namespace pentru widgetul de chat + tracking prezență.

**Cron (@nestjs/schedule):** recovery evaluation, ad-spend sync, cleanup loguri >90 zile, reconciliere Stripe nightly, health checks providere.

---

## §9. Cross-cutting: securitate, RBAC, performanță, design

- **RBAC:** `owner` (tot, inclusiv settings/admins/secrete), `admin` (operațional, fără secrete/billing config), `support` (doar Communications + Orders read). Guard pe rută + ascundere UI.
- **Secrete:** `analyticsSecrets`/`provider tokens` doar pentru `owner`, mascate în UI (reveal on demand), niciodată în răspuns public.
- **Rate limiting:** ThrottlerGuard (10/s, 60/min, 1000/zi per IP), throttle agresiv pe `/auth/*`.
- **Performanță:** paginare peste tot, indexuri pe `(siteId, createdAt)` și pe câmpurile de filtru, `jsonb` pentru flexibil dar coloane reale + index pentru ce filtrezi des (status, outcome, kind). Frontend: code-splitting pe rută (lazy), virtualizare tabele lungi, debounce pe search, `useResource` cu cache în memorie + invalidate manual.
- **Design:** shadcn/ui + Radix, dark mode default, Recharts pentru grafice, `lucide-react` iconuri. Mobile-first: layout fluid, sidebar drawer, tabele responsive. Fără bibliotecă grea de UI.
- **Observabilitate proprie:** OpenReplay opțional (sessionId propagat prin AsyncLocalStorage, salvat pe payment/message), error_log centralizat cu legătură la sesiune.

---

## §10. Refactor — cum consolidezi suprapunerile actuale

Acestea sunt problemele pe care le-ai semnalat. Map vechi → nou:

**(a) `generations` ≈ `payments` (module gemene).** În realitate sunt două laturi ale aceluiași lucru. Introdu agregatul **`Order`** (§4.4). `payments` rămâne entitate (tranzacția Stripe) dar **subordonată** unui `Order`; `generations` devin joburi tehnice ale Order-ului (1 order → 1..N generări: demo, full, variații). Adminul nu mai are „Generations" și „Payments" ca pagini paralele care arată aproape la fel — are **Orders** (vederea de business) + **Payments** (vederea financiară/Stripe) + **AI Monitor** (vederea tehnică a apelurilor). Câmpurile specifice produsului ies din coloane și intră în `generation.payload jsonb` (via ProductPlugin).

**(b) `mail` + `outbound-email` + `marketing` + `recovery` (4 module care trimit mesaje).** Unifică sub domeniul **Communications** (§4.7). `outbound_email` → `messages` cu `channel=email`. IMAP `mail_*` → sursă de import care creează `messages` inbound. `marketing` și `recovery` devin **producători** de mesaje (campanii/cron) care scriu în același log `communications`, nu silozuri separate de trimitere. Rezultat: un singur loc unde vezi „fiecare mail și fiecare SMS", cu același model indiferent de declanșator (tranzacțional, marketing, recovery, chat). **Adaugă canalul SMS (Twilio) aici** — nu există încă în cod (doar Mailgun e implementat); e un `MessageProvider` nou alături de `MailgunProvider`.

**(c) `chat` + `ai-chat` + `ai-assistant` (3 module de conversație).** `chat` = transportul (conversații/mesaje live). `ai-chat` = agentul concierge cu tool-calling + memorie. `ai-assistant` = helper de redactare pentru admin (reply/reformulează). Consolidează: **Communications** deține conversațiile/mesajele (toate canalele); **AI Concierge** e un *serviciu* care operează peste ele (sugerează/auto-răspunde, are memorie/KB/audit/review). „Assistant"-ul de redactare devine o capabilitate a aceluiași serviciu AI (un `op` diferit), nu un modul separat. `kb` + `ai-memory` + `ai-tool-call` + `conversation-review` stau toate sub AI Concierge.

**(d) Provider logs (`suno_logs`, `lyrics_logs`).** Generalizează la `ai_provider_calls` (§4.6) ca să adaugi Grok/OpenAI/orice fără tabelă nouă. Un câmp `provider` + `operation` în loc de o tabelă per provider.

**(e) Auth.** Scoate adminii din `users`/`role`. Tabelă `admin_users` + better-auth (§3).

---

## §11. Scheletul frontend (React + Vite, fără React Query)

Structură de foldere:
```
admin/
  src/
    main.tsx, App.tsx, router.tsx
    lib/
      http/client.ts        // HttpClient (clasă, singleton) + ApiError
      auth/client.ts        // AuthClient (wrapper better-auth) + useAuth()
      hooks/use-resource.ts // înlocuiește React Query
      site/site-context.tsx // site activ + selector
      ws/socket.ts          // Socket.IO admin
    api/                    // un fișier per domeniu: orders.api.ts, payments.api.ts...
    components/ui/          // shadcn
    components/             // shared (DataTable, KpiCard, RangePicker, Drawer...)
    features/               // o mapă per pagină din §6
    plugins/                // ProductPlugin registry (specific per kind)
```

**HttpClient** (clasă proprie, singleton — pattern din sistemul actual, dar fără Next):
```ts
export class ApiError extends Error {
  constructor(public status: number, public body: unknown, msg?: string) {
    super(msg ?? (body as any)?.message ?? `HTTP ${status}`);
  }
}
class HttpClient {
  private base = `${import.meta.env.VITE_API_URL}/api`;
  private async req<T>(method: string, url: string, body?: unknown, opts: RequestInit = {}): Promise<T> {
    const headers: Record<string,string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
    const token = authClient.getSessionToken();           // better-auth session
    if (token) headers.Authorization = `Bearer ${token}`;
    const siteId = localStorage.getItem('admin_active_site');
    if (siteId && !url.startsWith('/auth')) headers['x-site-id'] = siteId;
    const res = await fetch(`${this.base}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined, ...opts });
    if (res.status === 401) { authClient.signOut(); location.href = '/login'; throw new ApiError(401, null); }
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  }
  get<T>(u: string){return this.req<T>('GET',u);}
  post<T>(u: string,b?: unknown){return this.req<T>('POST',u,b);}
  patch<T>(u: string,b?: unknown){return this.req<T>('PATCH',u,b);}
  delete<T>(u: string,b?: unknown){return this.req<T>('DELETE',u,b);}
}
export const http = new HttpClient();
```

**useResource** (înlocuiește React Query — fetch + loading/error + refetch + cache simplu in-memory):
```ts
const cache = new Map<string, unknown>();
export function useResource<T>(key: string | null, fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(key ? (cache.get(key) as T) : undefined);
  const [loading, setLoading] = useState(!cache.has(key ?? ''));
  const [error, setError] = useState<ApiError | null>(null);
  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true); setError(null);
    try { const r = await fetcher(); cache.set(key, r); setData(r); }
    catch (e) { setError(e as ApiError); }
    finally { setLoading(false); }
  }, [key, ...deps]);
  useEffect(() => { void load(); }, [load]);
  return { data, loading, error, refetch: load, mutate: (d: T) => { if(key) cache.set(key,d); setData(d); } };
}
export const invalidate = (prefix: string) => { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k); };
```
Pentru mutații: funcție directă pe `*.api.ts` + `invalidate('orders')` + `refetch()`. Realtime: handler WS care apelează `mutate`/`invalidate`.

**AuthClient (better-auth):** configurează `createAuthClient({ baseURL })` cu pluginurile `emailOTP`, `genericOAuth(google)`, `emailAndPassword`. Pagina `/login` oferă cele 3 metode. Backend NestJS expune handlerul better-auth (sau better-auth rulează pe un endpoint dedicat) + `AdminGuard` care validează sesiunea pe rutele `/admin/*`. Conturile inițiale de admin se seed-uiesc în `admin_users`.

---

## §12. ⭐ PROMPT REUTILIZABIL (copiază-l per proiect, completează `{{...}}`)

> Lipește blocul de mai jos în agentul de cod la începutul fiecărui proiect nou. Completează variabilele. Trimite-l împreună cu §3–§11 din acest document ca referință de arhitectură.

```
Construiește admin dashboard-ul pentru proiectul „{{NUME_PROIECT}}".

CONTEXT PRODUS:
- Tip produs (ProductPlugin.kind): {{music | video | image | ...}}
- Ce generează: {{ex: manea cadou personalizată din wizard}}
- Provideri AI folosiți: {{ex: Suno (audio), OpenAI (lyrics+critic), Grok (...)}}
- Pași wizard public (pentru funnel analytics): {{ex: stil → ocazie → destinatar → mesaj → voce → pachet → plată}}
- Pachete/prețuri: {{ex: basic/plus/premium; basePrice ... currency RON}}
- Limbi: {{ro, bg, sr, tr, el, ...}}

STACK (obligatoriu, vezi blueprint §2):
- Backend existent: NestJS + TypeORM + PostgreSQL, admin consumă /api/admin/*. Refolosește modulele core; adaugă DOAR ProductPlugin specific (§3.B).
- Admin: React + Vite + TypeScript, FĂRĂ Next.js, FĂRĂ React Query. HttpClient + useResource proprii (§11). shadcn/ui + Recharts. Mobile-first.
- Auth admin: better-auth (email OTP + Google + email/parolă), tabelă admin_users separată de userii publici (§3). Seed cont owner: {{email_owner}}.
- Multi-tenant: filtrare pe siteId via x-site-id (§7), site selector + „toate site-urile".

MODULE CORE DE INCLUS (toate, §6): Overview, Orders, Payments, AI Monitor,
Communications (chat+email Mailgun+SMS Twilio+IMAP unificate), Live Chat, AI Concierge,
Recovery, Marketing, Analytics (funnel+bot detection), Ads (Meta CAPI+pixel, GA4; TikTok amânat),
Customers (profil 360), Sites (config+secrete+prompturi), System (errors/health/db/web-push/admins).

CONSOLIDĂRI (NU repeta greșelile vechi, §10):
- Order = agregat; payments + generations subordonate. Nu pagini paralele Generations/Payments.
- Communications = un singur domeniu pentru toate canalele (email+SMS+chat+IMAP), un singur log de mesaje.
- AI Concierge = un serviciu peste Communications, nu 3 module (chat/ai-chat/ai-assistant).
- ai_provider_calls = log generic per apel AI (nu tabelă per provider).

INTEGRĂRI EXTERNE NECESARE:
- Stripe: checkout + webhook (paid/failed/refunded), salvează failureReason/Code, atribuire pixel (fbp/fbc), reconciliere.
- Mailgun: email tranzacțional + marketing (provider implementat). 
- Twilio: SMS — NOU, implementează ca MessageProvider lângă Mailgun.
- Meta: Pixel client + Conversions API server-side (Purchase/InitiateCheckout), EMQ, cross-check; Marketing API pt spend/ROAS.
- Google: GA4 Measurement Protocol + (opțional) Google Ads spend.
- Feature flags per site: {{invoices? roulette? giftCodes? webPush? demos?}}.

LIVRABIL: cod production-ready, SOLID, componente funcționale tipate, servicii cu separare clară,
queries optimizate cu paginare + index, error handling + validare, realtime Socket.IO pe /admin.
Începe cu scheletul §11 (HttpClient, useResource, AuthClient, layout, router, site-context),
apoi modulele core în ordinea: Overview → Orders/Payments → Communications → AI Monitor → Analytics → restul.
```

---

## §13. Checklist de acoperire a cerințelor (verificare)

| Cerință | Acoperit în |
|---|---|
| Chat cu clienții + integrare AI | §6.5–6.7 Communications/Live Chat/AI Concierge |
| Monitorizare fiecare request către provideri AI (Suno/Grok/OpenAI) | §4.6 `ai_provider_calls`, §6.4 AI Monitor |
| Fiecare email trimis | §4.7 Communications (channel=email), §6.5 |
| Fiecare SMS (Twilio) | §4.7 + §10(b) — feature NOU de implementat |
| Fiecare formular completat | §4.9 events (`generation_start`, props wizard) + §6.10 funnel |
| Statistici wizard: câți pași, trafic, vizitatori, boți vs reali | §4.9 bot detection, §6.10 Analytics funnel |
| Google Analytics + campanii Google | §4.2 secrets, §6.11 Ads (GA4 + Google Ads) |
| TikTok Ads (necesită cont verificat) | §6.11 — marcat amânat, schema pregătită (`ad_spend.platform='tiktok'`) |
| Meta Ads + pixel integrat | §4.5 fbp/fbc, §6.11, CAPI server-side |
| Stripe: fiecare încercare, plată, motiv eșec | §4.5 payments, §6.3 Payments |
| Gestiune mailuri pt cei care n-au plătit | §4.8 Recovery + §6.8 |
| Sistem identic mail + mesaje (email Mailgun / SMS Twilio) | §4.7 Communications unificat |
| Estetic, performant, mobil | §9 Design & performanță |
| React (nu Next), fără React Query, clase proprii | §2, §11 |
| better-auth (OTP/Google/parolă), conturi admin în DB | §3, §11 AuthClient |
| Backend NestJS + TypeORM | §2, păstrat din sistemul existent |
```
