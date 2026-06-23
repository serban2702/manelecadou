# 04 — Analytics, pixeli, OpenReplay, Stripe & dashboard de ROAS

> Tot ce ține de „văd banii, văd oamenii, văd de unde vin". Acesta e stratul care îmi spune cât cheltui pe ads vs cât încasez, până unde ajung userii în funnel, și îmi dă replay vizual pe fiecare sesiune.

---

## 1. Pixeli & tracking client-side

Fiecare proiect încarcă, printr-un `<AnalyticsProvider />` montat în layout-ul root:
- **GA4** (Google Analytics 4) — `NEXT_PUBLIC_GA4_MEASUREMENT_ID`.
- **Meta Pixel** — `NEXT_PUBLIC_META_PIXEL_ID`.
- **TikTok Pixel** — `NEXT_PUBLIC_TIKTOK_PIXEL_ID`.
- (Opțional) Google Ads tag.

Decizie de consimțământ (preluată din ambele proiecte): **pixelii se încarcă din prima secundă, fără banner de consent gate**; toggle-ul de cookie e cosmetic. Riscul GDPR/ePrivacy în EU e asumat conștient (decizie repetată în Manele Cadou și Melodia Ta). La proiecte pentru piețe sensibile, se poate reactiva un consent real — decizie per proiect.

**Evenimente standard pe funnel** (trimise la GA4 + pixeli):
- `page_view` / `ViewContent` la landing și mount wizard.
- `AddToCart` la prima selecție semnificativă (ex. ocazie aleasă).
- `wizard_step_completed` la fiecare pas finalizat (cu numărul pasului).
- `wizard_completed` la finalul colectării.
- `InitiateCheckout` / `view_item` la montarea formularului de plată.
- `Purchase` la confirmarea comenzii.

---

## 2. Pixeli server-side (CAPI) — `meta-capi` + `tiktok-events`

Pixelul din browser se pierde des (ad-blockere, ITP, in-app browsere). De aceea **dublez fiecare conversie cu Conversions API server-side**, declanșat din webhook-ul Stripe (sursa de adevăr a plății):
- **Meta CAPI:** la plată paid, backend construiește payload cu PII **hash-uite SHA256** (email, prenume, nume, telefon E.164, țară, oraș), `value`/`currency`, `content_ids` = order id, `event_id` = order id (dedup cu pixelul din browser). Test event code opțional pentru smoke în Events Manager.
- **TikTok Events API:** analog, eveniment `CompletePayment`, `event_time` = momentul plății. (Quirk TikTok: întoarce mereu 200; eroarea reală e în body cu `code != 0`.)
- Best-effort: dacă providerul pică, webhook-ul Stripe rămâne success (nu blochez livrarea pe un eșec de pixel). Idempotency lock (`capiSentAt`) ca să nu trimit Purchase de două ori.

**De ce contează:** atribuirea server-side corectă = ads-urile primesc semnal de conversie real → optimizare mai bună → cost pe achiziție mai mic. E unul dintre cele mai importante lucruri pentru profitabilitate.

---

## 3. Atribuire & funnel — `analytics` + `wizard_sessions`

- **Landing tracker:** la prima vizită, frontend POST-ează la backend `{ sessionId, source, medium, campaign, landingPage, referrer, userAgent }`. Backend marchează `isFirstTouch` (unic per sesiune), parsează UA → `device`/`browser`/`country`, detectează boții. **Bot detection** prin regex pe User-Agent (bot/crawler/spider/headless/puppeteer/playwright/curl/python-requests...). Adminul afișează split real vs bot pe trafic și funnel.
- **First-touch atribuire** copiată pe `orders` (`firstTouchSource/Medium/Campaign`) → permite venit-pe-sursă/campanie.
- **Funnel wizard:** din `wizard_sessions` (`furthestStep`) → câți au ajuns la fiecare pas, unde abandonează, rate de conversie între pași. Asta răspunde direct la „până unde s-a dus omul în wizard". Pentru produsele fără wizard (altă formă de checkout), funnel-ul se construiește din evenimentele echivalente.

---

## 4. OpenReplay (session replay self-hosted) — overlay adaptabil

Tracking full-fidelity al sesiunilor (DOM + network + console + performance), self-hosted pe VPS-ul comun (Hetzner, deja rulează pentru Manele Cadou la `openreplay.manelecadou.ro`). Fiecare proiect nou se conectează la **aceeași instanță OpenReplay** ca un **proiect nou** în dashboard (project key propriu), nu ridică o instanță separată.

Setup standard (din lecțiile Manele Cadou):
- **Componentă `<OpenReplay />`** în frontend: init la mount cu config max-data (capturează inputuri ne-sensibile, iframe-uri, network cu payload), masking automat pe parole + iframe Stripe.
- **IP instant prin SSR:** `app/layout.tsx` (server) citește `x-forwarded-for` și emite în `<head>` un script care setează IP-ul global; tracker-ul face `setUserID('ip:<IP>')` + `setMetadata('ip', ...)` **înainte** de `start()`, fără fetch/await. Asta rezolvă atribuirea pentru anonimii din in-app browsere (TikTok), unde fetch-urile lente eșuează.
- **Identify ulterior:** la checkout (email/telefon) și la login.
- **Pin la versiunea serverului:** SDK-ul `@openreplay/tracker` trebuie să aibă **același major** ca serverul self-hosted (altfel replay vizual stricat). Plus pluginul `tracker-assist` (același major) pentru live sessions + co-browse + remote control brand-uit.
- **Backend:** `openReplaySessionId` propagat prin AsyncLocalStorage și salvat pe `orders`/`payments`/`songs`/erori → din admin, fiecare eroare/comandă are link „▶ Watch replay".
- **Caddy/NPM:** CSP `frame-ancestors` + CORS permisiv pe assets statice ca player-ul OpenReplay să poată reconstrui vizual pagina (vezi gotchas Manele Cadou).

**„Overlay adaptat per site":** culorile/branding-ul dialogului de remote-control și metadatele (nume proiect) se setează per proiect din config; restul e identic.

---

## 5. Stripe — checkout & webhook

- **Checkout:** Payment Element inline în wizard (preferat) sau Checkout Session redirect (legacy). Sesiune cu `idempotencyKey` + cache `client_secret` pentru refresh mid-checkout fără a crea sesiuni duplicate.
- **Webhook** (`/webhook/stripe` sau `/api/payments/webhook`): semnătură verificată, fiecare event persistat în `stripe_events` (idempotency pe `eventId` + `processedAt`). Handlere:
  - `payment_intent.succeeded` / `checkout.session.completed` → `order.status=paid` → enqueue generare (post-plată) → CAPI Purchase → factură (dacă feature on) → stop recovery → livrare.
  - `payment_intent.payment_failed` → capturează `lastDeclineCode`/`lastDeclineReason` (pentru cardul „de ce eșuează plățile").
  - `charge.refunded` → marchează refund.
- **Un cont Stripe per proiect** (spre deosebire de Manele Cadou unde un cont servește toate tenant-urile). Webhook secret în settings/`.env`.
- **NPM custom location** pentru `/stripe/webhook`: `proxy_request_buffering off` + `client_max_body_size` mărit, ca Stripe să primească raw body intact pentru verificarea semnăturii.

---

## 6. Dashboard cheltuieli ads vs încasări (ROAS)

Pagina **Ads** din admin agregă, pe campanie/adset/ad și interval de timp:
- **Spend** din Marketing API-urile platformelor: Meta Ads, Google Ads, TikTok Ads (TikTok necesită cont business verificat — se poate amâna, dar schema `ad_spend.platform` îl suportă din start). Sync zilnic printr-un job BullMQ care face upsert idempotent în `ad_spend` (`platform`, `campaignId/Name`, `adsetId/Name`, `adId/Name`, `date`, `spendCents`, `impressions`, `clicks`).
- **Revenue atribuit** din `orders` (first-touch source/campaign + plăți paid).
- **ROAS = revenue atribuit / spend**, pe sursă și campanie. Plus status pixel & CAPI (cross-check evenimente server vs browser, calitate match).

Asta răspunde direct la cerința „să văd cât am cheltuit pe Meta/TikTok/Google Ads comparativ cu cât am încasat".

> Notă: integrarea spend-ului din Marketing API nu există încă complet în niciunul dintre proiectele-sursă (acolo e tracking-ul de conversie + pixeli). E o piesă de construit standardizat la proiectele noi; schema (`ad_spend`) și pagina Ads sunt deja proiectate în `ADMIN_DASHBOARD_BLUEPRINT.md`.
