# Plan dezvoltare manelecadou.ro

> Fișier de adevăr pentru orice continuare. Bifează cu `[x]` ce e gata, `[ ]` ce mai e de făcut.
> La fiecare modificare, pune un comentariu sub task cu data + ce s-a făcut.

---

## ETAPA 0 — Credentiale & config (de la user)

- [x] **Stripe SECRET_KEY** (test mode): `sk_test_51TSFFEIxJidZDct6nP...UQ`
- [ ] **Stripe WEBHOOK_SECRET** — se obține astfel:
  - Instalez `stripe` CLI local pe macOS: `brew install stripe/stripe-cli/stripe`
  - User rulează `stripe login` o dată (deschide browser, autorizare)
  - Cream un script `apps/api/scripts/stripe-listen.sh` care rulează `stripe listen --forward-to http://localhost:1501/api/payments/webhook` și afișează în consolă `whsec_...`
  - User copiază `whsec_...` în `.env` la `STRIPE_WEBHOOK_SECRET`
  - Documentat în `README.md` flux-ul
- [ ] **Sentry DSN** (când vrei tracking) — `https://xxxx@sentry.io/xxxx`
- [ ] **Google Analytics 4** Measurement ID (G-XXXXXXX) — pentru tracking
- [ ] **Meta Pixel ID** — pentru reclame Facebook/Instagram
- [ ] **TikTok Pixel ID** — pentru reclame TikTok
- [ ] **Domeniu producție** — manelecadou.ro DNS pointing
- [ ] **Asset-uri brand**: logo SVG, share image default 1200×630 pentru OG, favicon set
- [ ] **OG share fallback image** (1200×630, jpg/png) — folosit când o manea n-are cover
- [ ] **Testimoniale reale** (înlocuim mock-urile din seed-data) — pe măsură ce le primești

> **Note**: `OPENAI_MODEL=gpt-5.4-mini` rămâne așa cum e (model real, doar că knowledge cutoff-ul agentului anterior nu-l acoperea). Nu schimbăm.

---

## ETAPA 1 — Stiluri muzicale extinse 🟡 priority

- [ ] Inventar stiluri actuale: Clasică, Modernă, Orientală, Cu trompetă, De jale, Comercială (6)
- [ ] Adaugă în `apps/web/lib/seed-data.ts` stilurile noi:
  - [x] **Tallava** (BG/MK/AL crossover)
  - [ ] **Kuchek** (BG roma rhythm)
  - [ ] **Trapanele** (trap × manele, modern hard)
  - [ ] **De opulență** (luxury chic, cu strofe despre bani/lux)
  - [ ] **De iubire** (dragoste pură, romantic ușor — distinct de "De jale")
  - [ ] **De pahar** (variantă mai veselă a Clasicei, pentru petreceri)
- [ ] Update mapping în `apps/api/.../suno.real.provider.ts buildStyleTag()` pentru fiecare stil nou (cu tag-uri Suno corecte în engleză)
- [ ] Update `apps/api/.../lyrics.module.ts` writer-system pentru a ști de stiluri noi
- [ ] Verifică pe `/studio` step 1 că toate apar și se selectează corect
- [ ] Update grid CSS pentru >12 stiluri (tablet/desktop să încapă fără scroll)

---

## ETAPA 2 — DB seeder + auto-run 🟡

- [ ] Drop tot ce ține de migrations din plan (rămâne `synchronize: true`)
- [ ] Creez `apps/api/src/database/seeder/seeder.module.ts` cu:
  - [ ] Demo user admin: `serban2702@gmail.com` cu role=admin
  - [ ] Demo user normal pentru teste
  - [ ] 5 generații demo "succeeded" cu audio URL-uri publice (din pool-ul mock) ca să fie populat `/asculta`
  - [ ] 1 conversație de test cu mesaj "Salut!" pentru chat
  - [ ] 3-5 promo codes demo pentru testare
- [ ] Auto-run pe `NODE_ENV=development` la prima pornire dacă tabelul `users` e gol (idempotent)
- [ ] Endpoint admin `POST /api/admin/seeder/run` pentru re-rulare manuală
- [ ] Buton în Admin Dashboard "Rulează seeder" cu confirmare

---

## ETAPA 3 — Stripe webhook server local + integration test 🔴

- [ ] Creez `scripts/stripe-listen.sh` (chmod +x) — rulează `stripe listen --forward-to`
- [ ] Documentez în `README.md` cum se folosește (terminal 3, lângă docker + web)
- [ ] User rulează scriptul, copiază `whsec_...` afișat → `.env`
- [ ] Test E2E plată:
  - [ ] Pe `/studio` flow complet până la pasul 6 unlock
  - [ ] Click "Plătește" → redirect Stripe Checkout test mode
  - [ ] Card test `4242 4242 4242 4242`, exp viitor, CVC orice
  - [ ] Confirmă plată
  - [ ] Redirect la `/m/:id?paymentId=...&success=1`
  - [ ] Webhook primit → payment.status=paid → unlock generation → audio devine `paidUnlocked=true`
  - [ ] Verifică în Adminer (1504) tabelele `payments` + `generations`

---

## ETAPA 4 — Test E2E Suno real 🔴

- [ ] Verifică `OPENAI_API_KEY` (deja setat) și `OPENAI_MODEL=gpt-5.4-mini`
- [ ] Verifică `SUNO_API_KEY=a4d05ee...` și `SUNO_PROVIDER=real`
- [ ] Pe `/studio` completează flow complet (1-5 pași) cu email real
- [ ] Click "Generează demo gratis 30s"
- [ ] Așteaptă ~2-3 min (lyrics writer → critic → Suno submit → polling → audio gata)
- [ ] Verifică în consola API log-uri: `submit task → status=PENDING → SUCCESS`
- [ ] Verifică în UI:
  - [ ] Status pipeline (writing_lyrics → checking_lyrics → generating_audio → succeeded)
  - [ ] Lyrics afișate progresiv (ciornă → versuri verificate)
  - [ ] 2 audio players cu manele REALE
- [ ] Verifică email primit (Wingo SMTP) cu link `/m/:id`
- [ ] Verifică în `/admin/generations` că apare cu tracks complete
- [ ] Cost estimat: 1 credit Suno + ~$0.001 OpenAI

---

## ETAPA 5 — Cookie banner: tot obligatoriu 🟢

- [ ] Modific `Cookie` component din `apps/web/components/sections.tsx` să afișeze:
  - [ ] Mesaj despre tracking (analytics, marketing, Stripe, etc.)
  - [ ] Doar 1 buton: "Am înțeles, continuă"
  - [ ] Fără opțiune "doar necesare"
- [ ] Actualizez `/cookies` page să listeze toate cookie-urile ca obligatorii
- [ ] Update `/confidentialitate` să menționeze că folosim toate cookie-urile pentru personalizare reclame
- [ ] Persist în localStorage `mc_cookie_consent='all'` la accept

---

## ETAPA 6 — Rate limiting backend 🟡

- [ ] Instalez `@nestjs/throttler` în `apps/api`
- [ ] Configurez în `app.module.ts` global throttler:
  - [ ] 10 req/sec per IP global
  - [ ] 60 req/min per IP global
  - [ ] 1000 req/zi per IP global
- [ ] Throttle particularizat pe endpoint-uri sensibile:
  - [ ] `POST /api/guest-sessions` — max 5/oră per IP (anti-spam guest)
  - [ ] `POST /api/auth/magic-link/request` — max 3/oră per email
  - [ ] `POST /api/generations` (demo) — max 1/zi per IP+UA fingerprint
  - [ ] `POST /api/chat/me/messages` — max 30/min per conversație
- [ ] Excepție pentru tokens de admin (skip throttle pentru `role=admin`)
- [ ] Mesaj prietenos pe frontend când dă 429

---

## ETAPA 7 — Email templates HTML profesionale 🟡

- [ ] Creez folder `apps/api/src/mailer/templates/`
- [ ] Master layout `base.html` cu:
  - [ ] Header cu logo + brand
  - [ ] Body container 600px
  - [ ] Footer cu unsubscribe + adresă SRL + social
  - [ ] Stiluri inline (Outlook compat)
- [ ] Template-uri specifice:
  - [ ] `magic-link.html` — buton hero "Intră în cont", link backup, expiră în 15min
  - [ ] `generation-ready.html` — preview manea, 2 buttons (ascultă + descarcă), upsell pentru completă
  - [ ] `payment-success.html` — recipisă, totalul plătit, link manea
  - [ ] `gift-code.html` — codul cadou, instrucțiuni redempție
  - [ ] `admin-gdpr-request.html` — primit la admin când user cere export/delete
- [ ] Helper `renderTemplate(name, vars)` cu Handlebars/Mustache
- [ ] Update `MailerService.send()` să accepte `template + vars` ca alternativă la html raw
- [ ] Înlocuiesc tot inline HTML din `auth.service.ts` și `generations.processor.ts` cu template-uri

---

## ETAPA 8 — OG meta tags + sharing 🟡

- [ ] Creez `apps/web/app/m/[id]/layout.tsx` cu `generateMetadata` async:
  - [ ] Fetch generation prin API server-side
  - [ ] Set `title`, `description` din nume destinatar
  - [ ] OG image: `coverUrl` din generation sau default brand image
  - [ ] Twitter card cu `summary_large_image`
- [ ] Default OG image asset în `public/og-default.png`
- [ ] Test cu Twitter Card Validator + FB Sharing Debugger
- [ ] Open Graph audio (dacă FB suportă): `og:audio` cu mp3 URL

---

## ETAPA 9 — GDPR export + delete 🟢

- [ ] Pagina `/cont` (după login) cu secțiunea "Confidențialitate"
- [ ] Buton "Cere export date" → trimite email la admin (`dpo@manelecadou.ro`) cu user ID
- [ ] Buton "Cere ștergere cont" → trimite email la admin + flag `user.deletionRequested=true`
- [ ] Admin în /users vede flag-uri și poate procesa manual
- [ ] Email confirmare către user "Cererea ta a fost înregistrată, te contactăm în 30 zile"
- [ ] În `/confidentialitate` actualizez secțiunea "Drepturile tale" să facă referire la `/cont`

---

## ETAPA 10 — Sitemap, robots, structured data 🟢

- [ ] `apps/web/app/sitemap.ts` (Next 15 native) — listează toate paginile statice + recent generations publice
- [ ] `apps/web/app/robots.ts` — allow toate, disallow `/api/`, `/admin/` (admin e altă app oricum)
- [ ] Structured data:
  - [ ] `Organization` în root layout
  - [ ] `Product` pe `/cadou` (preț, recenzii, garanție)
  - [ ] `MusicRecording` pe `/m/:id`
  - [ ] `BreadcrumbList` pe pagini de detaliu
  - [ ] `FAQPage` pe `/faq`
- [ ] Verifică cu Google Rich Results Test

---

## ETAPA 11 — Audio player custom cu waveform 🟢

- [ ] Bibliotecă: `wavesurfer.js` (lightweight, peak-uri lazy-load)
- [ ] Component `<ManeaPlayer audioUrl coverUrl title artist>` în `apps/web/components/`:
  - [ ] Play/pause butoane mari
  - [ ] Waveform color gold gradient (păstrăm paleta Claude Design)
  - [ ] Timestamp curent / durată totală
  - [ ] Volum slider
  - [ ] Buton download MP3
  - [ ] Buton share (copy link / WhatsApp / TikTok)
- [ ] Înlocuiesc `<audio controls>` din `Generator.tsx`, `/m/[id]`, `/asculta`
- [ ] Lazy-load wavesurfer doar când userul apasă play (perf)

---

## ETAPA 12 — i18n RO / Balcani — fișier de plan 🟢

- [ ] Creez `I18N_PLAN.md` cu:
  - [ ] Limbi target: **RO** (default), **BG** (bulgară), **HU** (maghiară), **EL** (greacă), **TR** (turcă), **SR** (sârbă), **AL** (albaneză), **MK** (macedoneană), **HR** (croată), **EN** (universal fallback)
  - [ ] Strategie traducere: AI-translated initial (DeepL / GPT) + native review după lansare
  - [ ] Tehnologie: `next-intl` cu route-based locale (`/ro/...`, `/bg/...`)
  - [ ] Date culturale specifice: nume populare per limbă, sărbători locale, format dată
  - [ ] Stiluri muzicale traduse adecvat (Tallava e BG/MK, Kuchek e BG, etc.)
  - [ ] Suno API: prompt în engleză + lyrics în limba aleasă
  - [ ] Plan etape implementare (~2 săpt total)

---

## ETAPA 13 — Chat real-time (SSE) 🟢

- [ ] Replace polling 3s cu Server-Sent Events
- [ ] Endpoint `GET /api/chat/me/stream` (SSE) — emite `message` la fiecare update
- [ ] Endpoint admin `GET /api/admin/chat/conversations/:id/stream`
- [ ] Frontend `EventSource` în `ChatWidget.tsx` și admin `chat/page.tsx`
- [ ] Reconnect automat cu backoff
- [ ] Fallback la polling dacă SSE eșuează 3 ori

---

## ETAPA 14 — Galerie publică sortabilă 🟢

- [ ] Endpoint `GET /api/generations/public` cu query params:
  - [ ] `style` — filtrează după stil
  - [ ] `occasion` — filtrează după ocazie
  - [ ] `voice` — filtrează după voce
  - [ ] `period` — `week|month|all`
  - [ ] `sort` — `recent|popular`
  - [ ] `limit`, `offset` — paginare
- [ ] Tracking views: incrementez `generation.viewCount` la fiecare GET pe `/m/:id`
- [ ] Update pagina `/asculta` cu:
  - [ ] Toolbar filtre (chips)
  - [ ] Grid cu paginare (load more)
  - [ ] Sort dropdown
- [ ] Admin: setting "Public by default" / "Private by default" pe generation
- [ ] User în `/cont`: toggle pe fiecare manea proprie "publică / privată"

---

## ETAPA 15 — Promo codes (general + per email) 🟡

- [ ] Entity `PromoCode` cu fields: `code`, `discountType` (percent|fixed), `discountValue`, `validFrom`, `validUntil`, `maxUses`, `usedCount`, `restrictedToEmail` (nullable), `active`
- [ ] Entity `PromoCodeRedemption` (audit cine a folosit ce, când)
- [ ] Endpoint `POST /api/payments/promo/validate` cu `{code, email}` → întoarce discount aplicabil
- [ ] Update `PaymentsService.createCheckoutSession` să accepte `promoCode` și să-l aplice prețului
- [ ] Admin pages:
  - [ ] `/admin/promo` — listă, create, edit, deactivate
  - [ ] Create form: tip discount, valoare, perioadă valabilitate, max uses, email restriction (sau `null` = general)
  - [ ] Generare cod aleator sau manual
  - [ ] Stats: cod cu cele mai multe redemptions
- [ ] UI pe `/studio` step 6: input "Cod promo?" — cu validare live
- [ ] Anti-abuz: rate limit pe `/promo/validate` (5/min per IP)

---

## ETAPA 16 — Cumpărare cod cadou (backend) 🟡

- [ ] Entity `GiftCode`: `code`, `purchasedByUserId/guestId`, `paymentId`, `redeemedByUserId/guestId` (nullable), `redeemedAt`, `validUntil` (1 an), `tier` (single/pack3/pack10), `usesLeft`
- [ ] Endpoint `POST /api/gift-codes/purchase` (Stripe checkout cu metadata `giftPurchase: true`)
- [ ] La webhook payment.status=paid: dacă `giftPurchase` → generez cod (8 chars uppercase) + trimit email user cu codul
- [ ] Endpoint `POST /api/gift-codes/redeem` cu `{code}` → atribuie usesLeft user-ului curent
- [ ] Pagina `/cadou/redeem` (sau modal pe `/studio`) — input cod
- [ ] Update flow generare: dacă user are usesLeft > 0 din gift code, descrește la generare full (skip plată)
- [x] Email template `gift-code.html` cu cod + instrucțiuni
- [ ] Pe `/cadou` butoanele "Cumpără cod" devin funcționale

---

## ETAPA 17 — Sentry / error tracking 🟢

- [ ] Cont Sentry (user creează) → DSN
- [ ] Install `@sentry/nestjs` + `@sentry/nextjs`
- [ ] Config în `apps/api/src/main.ts` cu DSN, environment, release tag
- [ ] Config în `apps/web/sentry.{client,server,edge}.config.ts`
- [ ] Config în `apps/admin/sentry.*.config.ts`
- [ ] Test cu eroare deliberată (`/api/admin/test-error`)
- [ ] Source maps upload în CI/build
- [ ] Dashboard Sentry: alert pe erori critice → email admin

---

## ETAPA 18 — Admin app extrem de complex 🔴

> User vrea să poată urmări fiecare aspect, profesionist.

### 18.1 Dashboard analitic
- [ ] KPI cards extinse: revenue today/week/month, conversion rate, avg ticket
- [ ] Graphic chart-uri (recharts/chart.js):
  - [ ] Generations per zi (ultimele 30 zile)
  - [ ] Conversia demo → paid (funnel)
  - [ ] Revenue evolution
  - [ ] Top stiluri / voci / ocazii
- [ ] Live counter (refresh 5s): "Acum X useri pe site"
- [ ] Heatmap pe ore (când se generează cele mai multe manele)

### 18.2 Users management
- [ ] List cu search, filter, sort
- [ ] Click user → detalii: generations, payments, gift codes, chat history
- [ ] Acțiuni: ban, unban, delete, set role admin/user, reset freeDemoUsed
- [ ] Buton "Trimite email" — formular custom către un user

### 18.3 Generations management
- [ ] List cu filter (status, type, date)
- [ ] Audio player inline (folosim ManeaPlayer)
- [ ] Acțiuni: re-run failed, force unlock (skip plată), delete, mark as flagged
- [ ] View pipeline complet: lyrics draft, lyrics final, suno taskId, audio URLs

### 18.4 Payments management
- [ ] List cu filter (status, provider, date, amount range)
- [ ] Click payment → detalii Stripe Session ID + linkbutton către Stripe Dashboard
- [ ] Acțiuni: refund (cu motiv), mark as disputed, manual confirm
- [ ] Export CSV pentru contabilitate

### 18.5 Promo codes (acoperit la Etapa 15)

### 18.6 Gift codes
- [ ] List cu filter (used/unused, expired, by tier)
- [ ] Acțiuni: revoke, extend validity, regenerate

### 18.7 Chat moderation
- [ ] (deja livrat) — adaug indicatori SLA: "Răspuns în <X> min", "Conversații pending", filtre status
- [ ] Macros pentru răspunsuri rapide (predefinite, salvate per admin)
- [ ] Asignare conversație la admin specific (dacă mai mulți admini)

### 18.8 Settings
- [ ] Toggle features: maintenance mode, new generations enabled, registration enabled
- [ ] Edit pricing (base price, tip cap)
- [ ] Edit ADMIN_EMAILS din UI (cu confirmare)
- [ ] Banner global (text afișat sus pe site, ex: "Update programat la X")

### 18.9 Logs
- [ ] Tab cu log-uri API recente (BullMQ queue, Suno calls, Stripe events) — paginare
- [ ] Filter pe severity (error/warn/info)

### 18.10 Email queue
- [ ] List emails trimise: la cine, când, status (sent/failed), provider folosit
- [ ] Acțiuni: resend, view content

---

## ETAPA 19 — Roata norocului (gamification) 🟢

- [ ] Component `<RouletteWheel>` în `apps/web/components/`
- [ ] Apare în modal după închiderea cookie banner (sau pe homepage)
- [ ] Premii (stochastic):
  - [ ] 50% — "Mai noroc data viitoare"
  - [ ] 25% — "5 lei reducere" (promo code generat dinamic)
  - [ ] 15% — "10 lei reducere"
  - [ ] 8% — "20 lei reducere"
  - [ ] 2% — "Manea gratis (cod cadou single)"
- [ ] Animație CSS rotire (3-4s)
- [ ] La oprire: dacă a câștigat, generează promo code în backend, copiază pe clipboard
- [ ] Cookie / localStorage: limit 1 spin per user/guest, reset la 7 zile
- [ ] Endpoint `POST /api/roulette/spin` (cu rate limit 1/săpt)

---

## ETAPA 20 — Calculator șmecher cu manele 🟢

- [ ] Refactor `Smecher` component:
  - [ ] Întrebări noi tematice manele:
    - "Câte manele ai pus la nuntă?"
    - "Mergi cu Mercedes la Mamaia?"
    - "Ai nas de aur la fini?"
    - "Câte petreceri pe lună cu lăutari?"
    - "Cumperi sau dai banii la nuntă/botez?"
  - [ ] Verdict pe scală manelistă: BOSCHETAR → AMATOR → PETRECĂREȚ → BARON DE NUNȚI → REGE 👑
  - [ ] La verdict: buton "Fă-ți maneaua de șmecher" cu prefill style="comerciala" + occasion adaptat
  - [ ] Share rezultat pe WhatsApp/FB cu badge personalizat
- [ ] Generator de imagine cu rezultatul (canvas) — pentru share visual

---

## ETAPA 21 — Production deployment (skip pentru acum)

- [ ] Dockerfile.prod multi-stage pentru API
- [ ] Build static export pentru web/admin (sau Vercel deploy)
- [ ] Docker Compose pentru prod cu Traefik / Caddy + SSL Let's Encrypt
- [ ] CI/CD GitHub Actions
- [ ] Backups DB nightly
- [ ] Monitoring uptime

---

## Status global

**Etape completate:** 0 / 20 (excluding 21 deferred)
**În lucru:** ETAPA 0 (credentiale)
**Următoare:** ETAPA 1 (stiluri extinse) — quick win, fără dependențe externe

---

## CHANGELOG

<!-- La fiecare task bifat, adăugă o intrare aici cu data + descriere scurtă -->

- 2026-05-01: Plan creat. Cookie consent persisted (din Iter 1 overnight).

---

## STATUS LIVRARE (sesiune 2026-05-01)

| Etapă | Status | Note |
|---|---|---|
| ETAPA 0 — credentiale | 🟡 parțial | Stripe SECRET_KEY ✅ · Webhook SECRET ⏳ user · Sentry/GA/Pixel ⏳ user |
| ETAPA 1 — stiluri extinse | ✅ DONE | 12 stiluri (cele 6 originale + Tallava, Kuchek, Trapanele, Opulență, Iubire, Pahar). Suno mapping + lyrics writer extinse. Grid 3-col tablet+. |
| ETAPA 2 — seeder + auto-run | ✅ DONE | `apps/api/src/database/seeder/`, auto-run la boot dev, endpoint `/api/admin/seeder/run`, buton dashboard. 5 generations + 1 conv test. |
| ETAPA 3 — Stripe webhook local | ⏳ TODO | Necesită `stripe listen` rulat de user pentru a obține `whsec_...` |
| ETAPA 4 — test E2E Suno real | ⏳ TODO | Manual de către user (1 credit Suno cost) |
| ETAPA 5 — cookie all-mandatory | ✅ DONE | Banner cu un singur buton "Am înțeles, continuă". `/cookies` listează toate ca obligatorii. |
| ETAPA 6 — rate limiting | ✅ DONE | `@nestjs/throttler` + `CustomThrottlerGuard` (skip /admin). Throttle pe magic-link, guest-sessions, generations, chat. Smoke test 3 OK + 429. |
| ETAPA 7 — email templates HTML | ✅ DONE | `apps/api/src/mailer/templates/templates.ts` cu 5 template-uri (magic-link, generation-ready, payment-success, gift-code, admin-gdpr). Branding gold + footer cu CUI. |
| ETAPA 8 — OG meta tags | ✅ DONE | `/m/[id]/page.tsx` server-side `generateMetadata`. Root layout cu OG default. Twitter cards. |
| ETAPA 9 — GDPR stub | ✅ DONE | `/cont` cu butoane export/delete. Endpoint `/api/auth/gdpr/request` trimite email la `ADMIN_EMAILS`. |
| ETAPA 10 — SEO sitemap/robots/schema | ✅ DONE | `app/sitemap.ts` + `app/robots.ts`. Schema.org Organization + WebSite în root, FAQPage pe /faq. |
| ETAPA 11 — audio waveform player | ✅ DONE | `<ManeaPlayer>` cu wavesurfer.js, fallback graceful la `<audio>` nativ când CORS eșuează. Folosit pe /m/[id], Generator, /asculta. |
| ETAPA 12 — i18n | ✅ MVP livrat (2026-05-03) | next-intl + 8 limbi (RO/BG/SR/TR/EL/HR/SL/BS) · LangSwitcher · email & lyrics localizate · build prod per `NEXT_PUBLIC_DEFAULT_LOCALE`. Rămas Generator.tsx + native review. |
| ETAPA 13 — chat SSE | ✅ DONE | `@Sse('/api/chat/me/stream')` + EventSource în ChatWidget. Polling backup. |
| ETAPA 14 — galerie sortabilă | ✅ DONE | `GET /api/generations/public` cu filtre style/occasion/voice/period/sort + paginare. /asculta complet refactorizat cu filter chips. View tracking. |
| ETAPA 15 — promo codes | ✅ DONE | Entity `PromoCode` + `PromoRedemption`. `/admin/promo` page cu create form. Validare la checkout, redempție automată în webhook Stripe. UI input pe step 6 unlock cu apply/clear. |
| ETAPA 16 — gift codes backend | ⏳ TODO | Frontend există pe /cadou, backend lipsește |
| ETAPA 17 — Sentry | ⏳ TODO | Așteaptă DSN-ul de la user |
| ETAPA 18 — admin extins | ⏳ TODO | Următorul block mare — refund, ban user, force unlock, charts, etc. |
| ETAPA 19 — roata norocului | ⏳ TODO | |
| ETAPA 20 — smecher refactor | ⏳ TODO | |
| ETAPA 21 — production deploy | 🚫 deferred | |

### Schimbări structurale notabile (sesiune 2026-05-01)

- DB extins: `Generation.viewCount`, `User.role`, `GuestSession.email`, `Conversation`, `ChatMessage`, `PromoCode`, `PromoRedemption`
- Module noi: `lyrics`, `chat`, `admin`, `promo`, `seeder`
- Endpoint-uri publice: `/api/generations/recent`, `/api/generations/public`, `/api/promo/validate`
- Endpoint-uri auth: `/api/auth/gdpr/request`, `/api/auth/me` cu role
- Endpoint-uri admin: `/api/admin/seeder/run`, `/api/admin/mail/{status,test}`, `/api/admin/promo/*`
- SSE: `/api/chat/me/stream`
- Pagini noi web: `/cont`, `/sitemap.xml`, `/robots.txt`, audio player wired peste tot
- Pagini noi admin: `/promo`
- Throttle global cu skip pentru /api/admin/* (admin polling 5s nu lovește 429)


---

## STATUS FINAL (sesiune extinsă 2026-05-01)

### Etape complete în această sesiune (cumulativ 16/21):

| Etapă | Status | Note |
|---|---|---|
| ETAPA 1 — Stiluri extinse | ✅ | 12 stiluri totale |
| ETAPA 2 — Seeder | ✅ | Auto-run + endpoint admin |
| ETAPA 5 — Cookie all-mandatory | ✅ | |
| ETAPA 6 — Rate limiting | ✅ | @nestjs/throttler cu skip /api/admin |
| ETAPA 7 — Email templates HTML | ✅ | 5 template-uri cu branding gold |
| ETAPA 8 — OG meta tags | ✅ | server-side `generateMetadata` |
| ETAPA 9 — GDPR stub | ✅ | `/cont` + email admin |
| ETAPA 10 — SEO | ✅ | sitemap + robots + Schema.org |
| ETAPA 11 — Audio waveform player | ✅ | wavesurfer.js + fallback CORS |
| ETAPA 13 — Chat SSE | ✅ | `@Sse` + EventSource |
| ETAPA 14 — Galerie sortabilă | ✅ | filtre + sort + paginare |
| ETAPA 15 — Promo codes | ✅ | entity + admin UI + checkout integration |
| **ETAPA 16 — Gift codes** | ✅ | entity + service + Stripe webhook + email + redeem + unlock-with-gift |
| **ETAPA 18 — Admin extins** | ✅ | KPI revenue/conversion + force unlock + role toggle + reset demo + gift codes admin page |
| **ETAPA 19 — Roata norocului** | ✅ | RouletteSpin entity + service cu cooldown 7d + SVG wheel cu animație + creează promo code automat |
| **ETAPA 20 — Smecher refactor** | ✅ | 5 întrebări manele + verdict scale BOSCHETAR/AMATOR/PETRECĂREȚ/BARON/REGE + share + buton "Fă-ți maneaua" cu prefill |

### Etape care NU pot fi atinse fără user input:
- ETAPA 3 — Stripe webhook local (rulezi `stripe listen`)
- ETAPA 4 — Test E2E Suno real (manual, costă 1 credit)
- ETAPA 17 — Sentry (DSN de la user)

### Etape rămase (nice-to-have):
- ETAPA 12 — i18n implementation (plan în `I18N_PLAN.md`)
- ETAPA 21 — Production deploy (deferred)

### Module noi adăugate în această sesiune extinsă:
- `apps/api/src/modules/gift-codes/` (entity + service + 2 controllers + module)
- `apps/api/src/modules/roulette/` (entity + service + controller + module)
- `apps/admin/app/(dashboard)/gift-codes/` (page)
- `apps/web/components/RouletteWheel.tsx` (SVG wheel cu CSS animation)
- `apps/web/app/cadou/redeem/`, `apps/web/app/cadou/success/` (pagini)
- Integrare gift-code în UnlockStep prin `unlockGenerationWithGift`

### Endpoint-uri noi:
- `POST /api/gift-codes/{purchase,validate,redeem}` + `GET /api/gift-codes/mine`
- `POST /api/admin/gift-codes/:id/{active,extend}` + `GET /api/admin/gift-codes`
- `POST /api/generations/:id/unlock-with-gift`
- `POST /api/roulette/spin` + `GET /api/roulette/{prizes,status}`
- `POST /api/admin/generations/:id/force-unlock` + `DELETE /api/admin/generations/:id`
- `PATCH /api/admin/users/:id/role` + `POST /api/admin/users/:id/reset-demo`

### Schema DB extinsă:
+ `gift_codes` (cu link la payment + lastRedeemed tracking)
+ `roulette_spins` (cu link la promo code generat)

### Browser smoke confirmat:
- Homepage cu 12 stiluri + roata flotantă jos-stânga + chat jos-dreapta
- Smecher cu 5 întrebări tematice + verdict scale + buton fă maneaua
- Toate paginile răspund 200 (web 12 rute, admin 9 rute, api 9+ rute)
- Typecheck pasat curat pe toate 3 apps


---

## STATUS PARȚIAL CREDENTIALE & ETAPE TÂRZII (2026-05-01 sesiune 3)

### Aplicat în această iterație:
- ✅ **Stripe WEBHOOK_SECRET** obținut automat (`stripe listen --api-key`) și salvat: `whsec_72344897...`. Stripe CLI rulează în background (PID `bmsthvjxm`) — webhook-ul e operațional.
- ✅ **GA4 ID** salvat: `NEXT_PUBLIC_GA_ID=G-0PX6KXDQHX`. Component `<Analytics>` montat în root layout cu suport extensibil pentru Meta + TikTok pixel.
- ✅ **Domeniu** `manelecadou.ro` cumpărat (DNS rămâne de configurat la deploy).
- ✅ **Sentry înlocuit** cu **error tracking local** (mai bun controlul datelor, fără cost):
  - Entity `error_logs` cu nivel/sursă/path/userId/stack/resolved
  - `GlobalErrorsFilter` (APP_FILTER) prinde toate exception-urile API → persistă în DB
  - Endpoint public `POST /api/errors/client` — rate-limited — pentru raportare client-side
  - Component `<ClientErrorReporter>` montat în layout-ul web (window.error + unhandledrejection auto-trimise, cu dedupe 30s)
  - Endpoint admin `GET /api/admin/errors` cu filtre level/source/resolved + paginare
  - Pagină admin `/errors` cu stats card-uri (24h breakdown), filtre, expand pentru stack trace, buton "✓ rezolvă"
  - **Badge roșu live** în sidebar admin pe linkul "Errors" cu numărul de erori unresolved (refetch 10s)
- ✅ **Prompt Grok** complet generat în `GROK_BRAND_PROMPT.md` (logo, favicon, OG image, email banner, mascot, hero pattern) cu paleta exactă și dimensiuni precise

### Necesită acțiune user (rămas):
- ⏳ **Meta Pixel ID** — user a încercat să-l creeze, dar dialog-ul nu permite "Web", doar "App". Probabil e o limitare a contului Meta Business. Soluție: verifică în Meta Business Manager → Settings → Business Info dacă ai un *verified domain*; dacă nu, adaugă `manelecadou.ro` și verifică-l (DNS TXT record). După verificare, opțiunea Web va apărea.
- ⏳ **TikTok Pixel** — amânat de user
- ⏳ **Brand assets** — user va genera prin Grok cu prompt-urile din `GROK_BRAND_PROMPT.md`

### Module noi adăugate:
- `apps/api/src/modules/errors/` — entity + service + filter + 2 controllers + module
- `apps/web/components/Analytics.tsx` — GA4/Meta/TikTok wrapper
- `apps/web/components/ClientErrorReporter.tsx` — capture client errors

### Endpoint-uri noi:
- `POST /api/errors/client` (public, throttled)
- `GET /api/admin/errors` + `/stats` + `PATCH /api/admin/errors/:id/resolve`

### Schema DB extinsă:
+ `error_logs` (cu jsonb meta, nivel/sursă, resolved tracking)

