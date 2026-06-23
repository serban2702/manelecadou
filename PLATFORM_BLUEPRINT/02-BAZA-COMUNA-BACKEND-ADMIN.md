# 02 — Baza comună: backend & admin

> Spec-ul detaliat al **paginilor** de admin trăiește în `apps/ADMIN_DASHBOARD_BLUEPRINT.md` (Manele Cadou). Aici descriu **fundația de date și de module** comună tuturor proiectelor, plus deciziile structurale cerute explicit: settings-în-DB, monitorizarea API-urilor externe + costuri, identitatea clientului pe email SAU telefon, autentificarea Better Auth.

---

## 1. Modulele backend core (comune, reutilizabile 1:1)

Derivate din cele 43 de module ale Melodia Ta. Acestea se copiază/adaptează la fiecare proiect nou; doar modulul de **generare** e specific.

| Domeniu | Modul(e) | Ce face |
|---|---|---|
| **Auth & sesiuni** | `auth`, `admin-users`, `users`, `guest-sessions` | Better Auth (cookie HttpOnly), conturi admin separate de userii publici, sesiuni anonime (guest) cu claim la login |
| **Config** | `settings` (`app_settings` criptat + `global_settings` singleton) | Chei API, prețuri, prompts, feature-flags, brand — editabile din admin (vezi §3) |
| **Comandă & plată** | `orders`, `checkout`, `stripe-events` | Modelul de comandă, sesiuni Stripe Checkout, webhook idempotent |
| **Generare** (parțial specific) | `pipeline`, `queue`, `<provider>` (`suno`/`lyrics`/`songs` la muzică) | Orchestrare BullMQ a generării; provider-ul concret diferă per produs |
| **Storage** | `storage`, `uploads` | GCS / emulator, signed URLs, upload-uri client |
| **Comunicații** | `email`, `notifications`, `web-push`, (`chat`, `ai-chat`, `kb` dacă proiectul are chat) | Email tranzacțional/marketing, push admin, chat live + agent AI |
| **Recovery** | `recovery`, `email-recovery`, `discounts` | Coș abandonat: escaladare emailuri/SMS cu reduceri |
| **Analytics & atribuire** | `analytics` (`traffic_events`), `wizard-sessions`, `meta-capi`, `tiktok-events` | Funnel, surse/UTM, bot detection, pixeli server-side (CAPI) |
| **Marketing** | `newsletter`, `campaigns` (în admin) | Campanii email, audiențe, opt-out |
| **Conținut** | `content`, `testimonials`, `addons` | Liste editabile din admin (ocazii, stiluri, voci, exemple, testimoniale, add-on-uri) |
| **Operare** | `audit-log`, `health`, `db-admin`, `seed` | Audit acțiuni admin, health checks, admin DB (view/edit tabele), seed config la boot |
| **Facturare** (opțional) | `smartbill` | Facturi RO, doar dacă feature on |
| **Livrare** | `deliveries`, `scheduled-deliveries`, `qr-codes` | Trimitere produs (email/SMS/WhatsApp), livrări programate, QR cadou |

Un proiect nou pornește de la acest set, **scoate** ce nu-i trebuie (ex. fără facturare, fără SMS) și **înlocuiește** doar modulul de generare.

---

## 2. Modelul de date — entitățile core (consolidate)

Toate au `id uuid`, `createdAt/updatedAt`. Câmpurile marcate sunt cele care contează. **Fără `siteId`** la proiecte noi (single-tenant).

**Identitate client:**
- `users` — cont real Better Auth: `email` unic, `emailVerified`, `name`, `image`, `role`, `locale`, `bannedAt/Reason`.
- `accounts`, `sessions` — tabele Better Auth (OAuth, parolă, token sesiune).
- `guest_sessions` — vizitator anonim: `tokenHash` unic, `email?`, `claimedByUserId?` (la login), `lastIp`, `lastUserAgent`, `lastSeenAt`, `expiresAt`. **Aici trăiește identitatea celor care comandă fără cont.**

**Comandă & plată:**
- `orders` — agregatul de business: `userId?` XOR `guestSessionId?`, `email`, **`phone`** (vezi §4), `status` (pending/processing/paid/delivered/failed/refunded), `amountCents`, `currency`, `discountId?`, `addons[]`, `packageId/Tier`, `stripePaymentIntentId?`, billing (`billingName/Address/City/County/Country/Phone`, `gdprAcceptedAt`), invoice (`invoiceNumber/Series/IssuedAt/Url/PdfStorageKey`), refund (`refundedAt/AmountCents/Reason`), atribuire (`firstTouchSource/Medium/Campaign`), decline tracking (`lastDeclineCode/Reason`), recovery (`emailCapturedAt`, `recoveryStage`), `paymentToken?` (link de plată manual generat de admin), `openReplaySessionId?`, `paidAt`, `deliveredAt`.
- `stripe_checkout_sessions` — `orderId`, `idempotencyKey`, `stripeSessionId` unic, `stripeSessionUrl`, `expiresAt`, `status`.
- `stripe_events` — `eventId` (PK = Stripe event id), `type`, `payload` jsonb, `processedAt?` (idempotency).

**Produsul generat** (exemplu muzică; la alt produs schema specifică intră în `payload`/variante):
- `songs` (generic: „generations") — datele comenzii + `status` pipeline + `customLyricsPayload?` (input client folosit literal) + `openReplaySessionId?` + flags de remake (`freeRemakeUsedAt`, `lyricsRegenCount`) + idempotency livrare (`deliveryEmailSentAt`).
- `song_variants` (generic: „variants") — `provider variant id`, `audioPath/coverPath`/`videoPath`, `durationSec`, `status`, `selected`, `metadata` jsonb. Produsul întoarce de obicei mai multe variante; toate se păstrează, clientul alege.

**Comunicații** (dacă proiectul are chat — vezi `05`):
- `conversations` — thread per client, `aiMode` (manual/suggest/auto), presence (`chatOpenOnClient`, `lastClientPath`, `lastDevice`), assignment admin, `wizardState` jsonb (pentru agentul AI).
- `chat_messages` — `authorRole`, `body`, `messageType` (text/image/file/payment_link/song_preview/system/ai_suggestion), `payload` jsonb, delivery receipts (`deliveredAt/readAt`), atașamente, proveniență AI.
- `ai_memory` — fapte aprobate care intră în system prompt; `conversation_reviews` — feedback pe conversații; `kb_entries` — knowledge base.

**Analytics:**
- `traffic_events` — `sessionId`, `source/medium/campaign`, `landingPage`, `referrer`, `country`, `device` (inclusiv `bot`), `browser`, `isFirstTouch`.
- `wizard_sessions` — `currentStep`, `furthestStep` (până unde a ajuns, nu scade la back), snapshot date wizard, `orderId?` (conversie). **Sursa funnel-ului.**

**Recovery:**
- `recovery_states` — `email` unic, `anchorAt` (abandon), `stagesSent` jsonb (h1/h4/h24/h48/h72/d7 + cod promo per etapă), `optOutToken` unic, `convertedAt?`.

**Config & operare:**
- `app_settings`, `global_settings` (§3), `audit_log`, log-uri per provider (§5), `discounts` / coduri promo, `content`/`testimonials`/`addons`.

---

## 3. Settings în DB (înlocuiește `.env`)

**Principiul:** `.env` ține doar bootstrap-ul (DB url, `APP_SETTINGS_ENCRYPTION_KEY`, secrete de infra care nu se schimbă). **Tot restul configului trăiește în DB și e editabil din admin fără redeploy.**

Două tabele:
- **`app_settings`** — key/value criptat (AES-256-GCM). Fiecare rând: `key`, `value` (prefix `plain:` sau `gcm:` + IV:TAG:CT base64), `isSecret`. Conține: chei API (OpenAI, Suno/provider, Stripe, Mailgun/Brevo, Twilio, VAPID, Meta/TikTok CAPI), feature-flags (`chat.enabled`, `recovery.emailEnabled`, `whatsappEnabled`), config AI chat (`aiChat.model`, `aiChat.systemPrompt`, moduri).
- **`global_settings`** — singleton (`id='default'`) cu setări scalare frecvent citite: model provider, parametri de generare (weirdness/styleWeight la Suno), `alertEmails`, feature-flags globale, `lyricsBeforePayment`.

**Serviciul de settings** are: cache in-memory (TTL ~60s), encrypt/decrypt transparent, fallback cascadă (cache → DB → env → default), seed din env la primul boot. Public-config endpoint expune doar setările ne-secrete necesare frontendului (`chat.enabled`, prețuri, flags), niciodată cheile.

**De ce:** schimb prețul, prompt-ul AI, cheia Stripe sau activez SMS-ul dintr-un click în admin, nu printr-un redeploy. La proiecte multiple, asta e diferența între „operabil" și „coșmar".

---

## 4. Identitatea clientului: email SAU telefon (cerință cheie)

Trebuie să pot susține o comandă identificată **fie pe email, fie pe număr de telefon** — unele produse/canale colectează unul, altele pe celălalt (ex. livrare prin WhatsApp/SMS unde n-am email).

Reguli de design:
- `orders` are **și** `email` **și** `phone`, ambele nullable, dar cu constrângere de aplicație: **cel puțin unul** prezent. Normalizare: email lowercase+trim; telefon în format E.164.
- Cheia de identitate de business e „prima dintre: userId → guestId → lower(email) → phone E.164". Serviciul `CustomerProfile` (vedere 360°) agregă pe oricare dintre ele: comenzi, plăți, mesaje (toate canalele), sesiuni analytics, stare recovery.
- Recovery, livrare, notificări și pixelii CAPI funcționează pe **canalul disponibil**: dacă am email → email; dacă am doar telefon → SMS/WhatsApp; dacă am ambele → preferința configurată.
- Căutarea în admin (Customers / Orders) merge după email, telefon, nume sau id, indiferent care a fost colectat.

Asta e o generalizare față de Melodia Ta/Manele Cadou (care sunt centrate pe email) și trebuie implementată din start la proiectele unde livrarea e pe telefon.

---

## 5. Monitorizarea API-urilor externe + costurile lor

Cerință explicită: să văd **fiecare request către orice provider extern**, statusul, payload-ul și **costul**. Două nivele:

**(a) Log generic per apel — `ai_provider_calls` (sau `external_api_calls`).** O singură tabelă pentru orice apel către orice provider AI/extern, ca să adaug provideri noi fără tabel nou:
- `provider` (openai/suno/grok/replicate/elevenlabs/veo/sora/stripe/mailgun/twilio/meta/tiktok...), `operation` (ex. `audio.generate`, `lyrics.write`, `image.to_video`, `tts.synthesize`, `chat.completion`), `relatedId?` (order/song/conversation), `endpoint`, `requestBody` jsonb, `responseStatus`, `responseBody` jsonb, `providerTaskId?` (pentru polling), `providerStatus` (status terminal raportat), `outcome` (pending/success/failed/http_error/timeout), `model?`, `promptTokens?`/`completionTokens?` (LLM), **`costCredits?` / `costMicroUsd?`** (estimare cost), `latencyMs`, `errorMessage?`, `createdAt`/`completedAt`.
- Se scrie rândul la submit (pending) și se închide la rezultat. Polling-ul **nu** creează rânduri noi, doar actualizează.

**(b) Pagina „AI / API Monitor" în admin:** filtre pe provider/operation/outcome; sumar (număr apeluri, success rate, **cost total pe provider și pe perioadă**, latență p50/p95); drill-down pe request/response brut; buton retry. Asta dă răspuns la „cât mă costă fiecare provider pe zi/lună" și „de ce a picat generarea X".

**Registrul de prețuri.** Pe lângă log, țin în settings (sau o tabelă `provider_pricing`) **prețul per unitate** pentru fiecare provider (cost per credit Suno, cost per 1K tokens OpenAI, cost per secundă video etc.), ca să pot calcula marja reală (cost generare vs preț încasat) în dashboard. La schimbarea tarifelor de la provider, editez prețul din admin.

> În Melodia Ta acum costul e tracked implicit (tokens în draft, attempts la Suno) fără tabel dedicat de cost. Pentru proiectele noi **standardizez** pe `ai_provider_calls` cu câmp de cost + registru de prețuri, ca să am rapoarte de cheltuieli corecte din prima.

---

## 6. Dashboard-ul de admin — module (rezumat)

Detaliile complete în `apps/ADMIN_DASHBOARD_BLUEPRINT.md`. Pe scurt, sidebar grupat:

1. **Overview** — KPI azi/7z/30z: venit, comenzi paid, rată conversie funnel, vizitatori reali vs boți, apeluri AI + success rate + **cost**, mesaje necitite, recovery în curs. Grafice (Recharts) + alerte.
2. **Orders** — listă + timeline complet per comandă (created → checkout → paid → joburi generare → livrat) + preview produs + acțiuni (re-roll, refund, retrimite).
3. **Payments** — toate tranzacțiile, filtru `failed` cu motiv (`failureReason/Code`), reconciliere Stripe, top decline codes.
4. **AI / API Monitor** — fiecare apel provider + cost + latență + drill-down (§5).
5. **Communications / Chat** — inbox unificat (chat/email/SMS), thread per client, agent AI cu moduri (vezi `05`).
6. **Recovery** — coș abandonat, etape trimise, conversii, opt-out, config program.
7. **Marketing / Newsletter** — campanii, audiențe, opt-out.
8. **Analytics** — funnel wizard pas-cu-pas, trafic real vs bot, surse/UTM, top pagini, devices, venit pe sursă/campanie.
9. **Ads** — spend Meta/Google/TikTok vs venit atribuit (ROAS), status pixel & CAPI. Vezi `04`.
10. **Customers** — căutare (email/telefon/nume/id) + profil 360.
11. **Content** — liste editabile (ocazii, stiluri, voci, testimoniale, add-on-uri, exemple).
12. **Settings** — chei API, prețuri, prompts, brand, feature-flags (§3).
13. **System** — audit log, health, db-admin, web-push, backups, admin users & roluri.

**RBAC:** `owner` (tot, inclusiv secrete/billing), `admin` (operațional, fără secrete), `support` (doar Communications + Orders read). Secretele mascate în UI, reveal on demand, niciodată în răspuns public.

---

## 7. Granița comun-vs-specific: pattern „ProductPlugin"

Diferența reală între un site de muzică, unul de video și unul de text e doar în **trei locuri**: (1) câmpurile colectate de wizard, (2) provider-ul AI + pipeline-ul de generare, (3) cum se randează preview-ul produsului în site și în admin. Tot restul (orders, payments, comms, analytics, recovery, settings, auth) e core identic.

De aceea izolez specificul într-un singur „plugin" per proiect, cu trei contracte:
- **Schema datelor de comandă** — ce validează wizardul; se stochează în `payload`/`metadata` jsonb pe `orders`/`generations`, **nu** în coloane dedicate per tip. Astfel un produs nou nu atinge schema core.
- **Pipeline-ul de generare** — funcția care produce livrabilul (submit la provider → poll → finalizare → variante). Scrie în `ai_provider_calls` (§5).
- **Randarea preview-ului** — componenta de preview în frontend + coloanele/preview-ul în pagina de comandă din admin.

Backendul ține un discriminant de tip (`kind`: music/video/image/text/voice...) și un registru de plugin-uri. Un site nou de „video cadou" implementează doar plugin-ul (schema wizard + pipeline Veo/Sora + player video), fără să atingă Payments, Communications, Analytics etc.

> Asta e formularea curată a separării din `ADMIN_DASHBOARD_BLUEPRINT.md` §3. Folosește-o ca regulă mentală: **dacă o piesă de cod nu e una dintre cele trei de mai sus, e core și se reutilizează — nu se rescrie per proiect.**

---

## 8. Stack-ul admin frontend (canonic) — reconciliere

`ADMIN_DASHBOARD_BLUEPRINT.md` §11 propune un `HttpClient` + `useResource` pe `fetch`. **Modelul canonic pentru proiecte noi e cel din Melodia Ta:** axios singleton (`src/lib/http/`) cu interceptori (retry, refresh-token, auth-check, error-handler → `ApiError` normalizat) + clase statice `src/api/*.api.ts` (o clasă per resursă, metode statice, returnează date plain). State local cu `useState`/`useEffect` sau un hook subțire — **fără TanStack/React Query**. Auth prin Better Auth (cookie HttpOnly), context de auth care ascultă evenimentul `unauthorized` de la interceptor și redirecționează la `/login`. Vezi `01` §3.
