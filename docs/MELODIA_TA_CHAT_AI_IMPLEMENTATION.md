# Implementare Chat Live + AI Agent pe melodia-ta.ro

> Document de implementare integral pentru portarea modulului de **chat live + AI agent vânzător** (Irina) de pe `manelecadou` pe site-ul nou **melodia-ta.ro**.
>
> **Diferențe față de manelecadou (de care ținem cont peste tot în acest doc):**
> - **Single-tenant** — un singur site. NU există `siteId`, NU există tabelul `sites`, NU există `SiteContextMiddleware`, NU există header `x-site-id`. Tot ce era „per-site" devine config global (env / settings / constante).
> - **Single-language** — o singură limbă (RO). NU folosim `next-intl`, NU avem `messages/*.json`, NU avem detecție/traducere de limbă pe reply (`detectedLang`, `bodyRo`, `translationConsensus` se elimină). Tot textul e română hardcodat.
> - **Alte upsell-uri** — pachetele/prețurile/produsele sunt ale melodia-ta.ro (vezi §11). Logica e identică; doar valorile diferă.
>
> Tot restul (WebSocket realtime, presence, receipts, AI agent cu tool calling, wizard de vânzare, link de plată Stripe, generare melodie+versuri din chat, web push, pixel) se păstrează **identic**.

---

## Cuprins

1. [Lista completă a funcționalităților modulului](#1-lista-completă-a-funcționalităților)
2. [Arhitectură de ansamblu](#2-arhitectură-de-ansamblu)
3. [Schema bazei de date (entități)](#3-schema-bazei-de-date)
4. [Backend — modulul Chat (NestJS)](#4-backend--modulul-chat)
5. [Backend — WebSocket Gateway](#5-backend--websocket-gateway)
6. [Backend — AI Agent (tool calling)](#6-backend--ai-agent)
7. [Backend — AI Learner (cron nightly)](#7-backend--ai-learner)
8. [Backend — Knowledge Base + AI Memory](#8-backend--knowledge-base--ai-memory)
9. [Backend — Web Push](#9-backend--web-push)
10. [Backend — integrare plată / generare melodie / versuri din chat](#10-backend--platăgenerareversuri-din-chat)
11. [Pachete & prețuri (upsell melodia-ta.ro)](#11-pachete--prețuri)
12. [Frontend WEB — widget client](#12-frontend-web--widget-client)
13. [Frontend WEB — pixel & tracking](#13-frontend-web--pixel--tracking)
14. [Frontend ADMIN — dashboard operator](#14-frontend-admin--dashboard-operator)
15. [Dependențe NPM](#15-dependențe-npm)
16. [Variabile de mediu & settings](#16-variabile-de-mediu--settings)
17. [Plan de implementare pas cu pas](#17-plan-de-implementare-pas-cu-pas)
18. [Checklist final + gotchas](#18-checklist-final--gotchas)

---

## 1. Lista completă a funcționalităților

### A. Chat live (realtime)
- [ ] Widget flotant pe site-ul public (buton auriu jos-dreapta) + panou de chat.
- [ ] Conexiune WebSocket (socket.io) cu autentificare prin JWT (user logat) sau `guestId` (vizitator anonim).
- [ ] Trimitere/primire mesaje în timp real (fără refresh).
- [ ] Polling REST de fallback (refetch la 30s dacă chat deschis, 60s dacă închis).
- [ ] **Receipts WhatsApp-style**: trimis (1 check), livrat (2 checkmark-uri gri), citit (2 albastre) — pe ambele părți.
- [ ] **Typing indicator** bidirecțional („scrie…") cu throttle 1/s și auto-stop la 2s.
- [ ] **Presence enriched** vizibil în admin: online/offline, „online de X", pagina curentă a userului, device (mobile/tablet/desktop + OS + browser + viewport), IP, chat deschis/închis.
- [ ] **Notificări client la mesaj nou**: sunet sintetic (WebAudio), animație pulse/jiggle pe buton, punct roșu pe favicon, flash în titlul tab-ului.
- [ ] **Notificări admin**: chime la sugestie AI nouă, flash titlu tab, web push desktop.

### B. Control chat de la admin
- [ ] **Force-open chat** — adminul (sau AI) deschide widgetul pe ecranul clientului (buton Zap).
- [ ] **Force-close chat** — închide widgetul pe client.
- [ ] **Claim/Release conversație** (assignment către un operator).
- [ ] Redenumire / arhivare / ștergere conversație.
- [ ] Editare / ștergere (soft-delete) mesaje.
- [ ] Marcare favorit + notă privată admin per conversație.
- [ ] **Blacklist** IP/email + blocare directă din conversație (disconnect instant pe WS).
- [ ] **Quick replies** (replici rapide pre-definite, cu culoare).
- [ ] Atașamente (imagini PNG/JPEG/GIF/WEBP + PDF, max 5MB) trimise de admin.
- [ ] Setare email conversație.

### C. AI Agent (Irina)
- [ ] 3 moduri per conversație: **Manual** (AI tace), **Suggest** (AI sugerează, adminul aprobă), **Auto** (AI răspunde singur).
- [ ] **Greeting proactiv** la ~5s după ce userul intră (atomic, anti-dublu pe 2 taburi) + force-open chat.
- [ ] Agent loop OpenAI cu **tool calling** (max 6 iterații, max 1000 tokens).
- [ ] **Wizard de vânzare** state-machine (idle → collecting → review → payment_sent → paid → generating → completed).
- [ ] Tools: `send_message`, `search_memory`, `wizard_get_state`, `wizard_update`, `wizard_finalize`, `quote_price_with_offer`, `issue_discount_offer`, `play_sample`, `send_empathy`, `force_open_chat`, `change_email_and_resend`, `check_order_status`, `escalate_to_human`.
- [ ] **Inferare automată** style/occasion/voce din transcript la finalize (userul e întrebat doar nume + mesaj + email + opțional voce/pachet).
- [ ] **Empatie** contextuală (condoleanțe/copii/aniversare) — max 2 mesaje/conv.
- [ ] **Reducere la cerere** (cod 1-shot, max 20%).
- [ ] **Sugestii AI** (mod suggest): card violet în admin cu Trimite / Editează / Respinge.
- [ ] Guardrails: hard-cap 35 mesaje → escalare la uman; anti-buclă sterilă (>70% overlap pe ultimele 2 mesaje AI); 1 singur mesaj per turn; dedup pe text.
- [ ] **Audit** complet (`ai_tool_calls`): tool, input/output, model, tokens, mod, approval.

### D. AI Memory + Learner
- [ ] **Knowledge Base** (fapte verificate) injectate în system prompt.
- [ ] **AI Memory** (fapte aprobate de admin): fact/faq/tone_example/edge_case/product/policy.
- [ ] **Learner cron nightly** (03:30) — extrage candidați de fapte din conversațiile rezolvate; adminul aprobă/respinge în UI.
- [ ] Pagina admin `/ai-memory`: review queue, approve/edit/reject, „Extrage acum".

### E. Plată + generare din chat
- [ ] **Payment link** card în chat (sumă + „Plătește acum →") → Stripe Checkout.
- [ ] Webhook Stripe → marcare plată în chat + mesaj de confirmare + push admin + update wizard.
- [ ] **Generare melodie din chat** (directă la plată via wizard_finalize, sau manual de admin via „Lansează generare").
- [ ] **Demo + plată combo** (admin pre-completează formularul, opțional din extragerea AI, + link de plată).
- [ ] **Song preview** card în chat („Ascultă maneaua →" / „Pagina melodiei") când Suno termină.
- [ ] **Generare versuri din chat** (preview lyrics) — admin generează draft + variantă rafinată.
- [ ] Schimbare email + retrimitere melodie.
- [ ] Verificare status comandă (paid / în generare / gata / eroare tehnică).

### F. Tracking / pixel
- [ ] Meta Pixel (+ Advanced Matching SHA-256 email/external_id) + CAPI server-side.
- [ ] GA4, TikTok Pixel.
- [ ] OpenReplay (session recording) — opțional.
- [ ] Eventuri pixel din chat: `InitiateCheckout` (click pe payment link), `AddPaymentInfo` (link trimis), `Purchase` (post-plată).
- [ ] Tracker custom (sesiune/vizitator, UTM, enrichment, web vitals).

---

## 2. Arhitectură de ansamblu

```
┌─────────────────────────────────────────────────────────────────┐
│ WEB public (Next.js)            ADMIN (Next.js)                    │
│  ChatWidget ──┐                  ChatPage ──┐                      │
│  useChatSocket│                  useAdminChatSocket                │
└───────────────┼──────────────────────────┼───────────────────────┘
                │ socket.io /chat            │ socket.io /chat (role=admin)
                ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ API (NestJS)                                                      │
│  ChatGateway (WS) ── ChatService (REST + logică)                  │
│        │                  │                                       │
│        │                  ├─► maybeTriggerAi() ──► AIChatAgentService
│        │                  │         │ tool calling (OpenAiClient) │
│        │                  │         ├─► wizard_finalize ──► GenerationsService + PaymentsService (Stripe)
│        │                  │         ├─► search_memory ──► KbService + AiMemory
│        │                  │         └─► audit ──► AiToolCall            │
│        │                  ├─► previewLyrics() ──► LyricsService (OpenAI)│
│        │                  └─► markPaymentLinksAsPaid() ◄── Stripe webhook│
│        └─► WebPushService (VAPID)   AILearnerService (cron 03:30)  │
└─────────────────────────────────────────────────────────────────┘
                │
                ▼  Postgres: conversations, chat_messages, ai_memory,
                   ai_tool_calls, web_push_subscriptions, chat_quick_replies,
                   chat_blacklist, kb_entries
```

---

## 3. Schema bazei de date

> **Single-tenant**: peste tot scoatem coloana `siteId` și indecșii pe ea.
> **Single-language**: pe `chat_messages` scoatem `detectedLang`, `bodyRo`, `translationConsensus`.

### 3.1 `conversations`

| Coloană | Tip | Default | Note |
|---|---|---|---|
| `id` | uuid PK | | |
| `userId` | uuid null | | user logat |
| `guestId` | uuid null | | sesiune anonimă |
| `email` | varchar(320) null | | captat pentru livrare |
| `subject` | varchar(200) | `'Conversație'` | |
| `unreadByAdmin` | int | 0 | |
| `unreadByUser` | int | 0 | |
| `status` | varchar(16) | `'open'` | `open` \| `closed` |
| `createdAt` / `updatedAt` | timestamptz | now | |
| `lastMessageAt` | timestamptz null | | |
| `aiMode` | varchar(16) | `'manual'` | `manual`\|`suggest`\|`auto` |
| `chatOpenOnClient` | bool | false | snapshot widget deschis |
| `lastClientPath` | varchar(500) null | | ruta curentă a userului |
| `lastDevice` | jsonb null | | `{type,os,browser,viewport,userAgent}` |
| `connectedAt` / `disconnectedAt` | timestamptz null | | |
| `assignedAdminId` | uuid null | | operator care a preluat |
| `assignedAdminEmail` | varchar(320) null | | |
| `assignedAt` | timestamptz null | | |
| `isFavorite` | bool | false | |
| `adminNote` | text null | | notă privată |
| `wizardState` | jsonb null | | vezi tip mai jos |
| `archivedAt` | timestamptz null | | soft-hide din listă |
| `greetingSentAt` | timestamptz null | | marker atomic greeting |
| `empathyMessagesSent` | int | 0 | cap 2 |
| `lastIp` | varchar(64) null | | |

```ts
type WizardStep = 'idle' | 'collecting' | 'review' | 'payment_sent' | 'paid' | 'generating' | 'completed';

interface WizardData {
  recipientName?: string;     // OBLIGATORIU
  dedicatorName?: string;     // optional
  message?: string;           // OBLIGATORIU
  email?: string;             // OBLIGATORIU
  recipientGender?: 'M' | 'F';
  voiceArtist?: 'male' | 'female';
  style?: string;             // inferat dacă lipsește
  occasion?: string;          // inferat dacă lipsește
  styleHint?: string;         // ex. „stil Dani Mocanu"
  dedication?: string;
  customLyrics?: string;
  packageTier?: 'basic' | 'plus' | 'premium';   // adaptează pentru melodia-ta.ro
}

interface WizardState {
  step: WizardStep;
  data: WizardData;
  generationId?: string | null;
  paymentId?: string | null;
  linkReissueCount?: number;  // cap 2
  updatedAt: string;          // ISO
}
```

### 3.2 `chat_messages`

| Coloană | Tip | Default | Note |
|---|---|---|---|
| `id` | uuid PK | | |
| `conversationId` | uuid FK | | |
| `authorRole` | varchar(16) | | `user`\|`admin`\|`system` |
| `authorId` | uuid null | | |
| `body` | text | | |
| `createdAt` | timestamptz | now | |
| `messageType` | varchar(32) | `'text'` | `text`\|`image`\|`file`\|`payment_link`\|`song_preview`\|`song_form_step`\|`system`\|`ai_suggestion` |
| `payload` | jsonb null | | metadata după tip |
| `deliveredAt` | timestamptz null | | receipt |
| `readAt` | timestamptz null | | receipt |
| `attachmentUrl` | text null | | |
| `attachmentMime` | varchar(100) null | | |
| `attachmentSize` | int null | | |
| `attachmentName` | varchar(255) null | | |
| `aiGenerated` | bool | false | |
| `aiApprovedBy` | uuid null | | admin care a aprobat sugestia |
| `aiSuggestionFor` | uuid null | | id msg user care a declanșat |
| `editedAt` | timestamptz null | | |
| `deletedAt` | timestamptz null | | soft-delete |

> **Scoatem** (single-language): `detectedLang`, `bodyRo`, `translationConsensus`.

```ts
interface ChatMessagePayload {
  // payment_link
  amount?: number;          // cents
  currency?: string;
  description?: string;
  checkoutUrl?: string;
  paymentId?: string;
  packageTier?: 'basic' | 'plus' | 'premium';
  packageLabel?: string;
  status?: 'paid' | 'failed';
  paidAt?: string;
  pendingApproval?: boolean;
  // song_preview
  generationId?: string;
  audioUrl?: string;
  recipientName?: string;
  pending?: boolean;
  unlocked?: boolean;
  // ai_suggestion
  suggestedText?: string;
  [k: string]: unknown;
}
```

### 3.3 `chat_quick_replies`
`id`, `label varchar(120)`, `text text`, `color varchar(16)`, `sortOrder int`, `createdAt`, `updatedAt`.

### 3.4 `chat_blacklist`
`id`, `type varchar(16)` (`ip`\|`email`), `value varchar(320)`, `reason text null`, `createdByEmail`, `createdAt`. UNIQUE `(type, value)`.

### 3.5 `ai_memory`
`id`, `kind varchar(32)` (`fact`\|`faq`\|`tone_example`\|`edge_case`\|`product`\|`policy`), `content text`, `sourceConversationId uuid null`, `extractedFrom jsonb null`, `approved bool` (default false), `usageCount int` (default 0), `approvedBy uuid null`, `approvedAt`, `createdAt`, `updatedAt`. Index pe `approved`.

### 3.6 `ai_tool_calls`
`id`, `conversationId`, `triggerMessageId uuid null`, `toolName varchar(64)`, `input jsonb`, `output jsonb`, `error text null`, `aiMode varchar(16)`, `model varchar(64) null`, `totalPromptTokens int null`, `totalCompletionTokens int null`, `requiredApproval bool`, `approvedBy uuid null`, `createdAt`. Index `(conversationId, createdAt)`.

### 3.7 `web_push_subscriptions`
`id`, `userId uuid`, `endpoint text UNIQUE`, `p256dh text`, `auth text`, `userAgent text null`, `label varchar(120) null`, `createdAt`, `updatedAt`, `lastSuccessAt timestamptz null`, `failureCount int` (default 0).

### 3.8 `kb_entries`
`id`, `title`, `content`, `tags`, `createdAt`, `updatedAt` (structura existentă; folosit de `search_memory`).

> Toate sunt operații **additive** → sigure cu TypeORM `synchronize: true` (sau migrare dedicată dacă melodia-ta.ro nu folosește synchronize).

---

## 4. Backend — modulul Chat

Structură fișiere (copiate din `apps/api/src/modules/chat/`, simplificate single-tenant):

```
modules/chat/
├── conversation.entity.ts        # entitatea de mai sus (fără siteId)
├── message.entity.ts             # fără detectedLang/bodyRo/translationConsensus
├── quick-reply.entity.ts
├── chat-blacklist.entity.ts
├── chat-blacklist.service.ts
├── chat-attachments.service.ts   # upload imagini/PDF, max 5MB
├── chat.controller.ts            # endpoints user (/chat/*)
├── chat-admin.controller.ts      # endpoints admin (/admin/chat/*)
├── chat.gateway.ts               # WebSocket
├── chat.service.ts               # logică principală
└── chat.module.ts
```

### 4.1 Endpoints USER — prefix `/api/chat`

| Metodă | Path | Auth | Descriere |
|---|---|---|---|
| GET | `/me` | JWT sau guestId | conversația proprie + mesaje |
| POST | `/me/messages` | JWT sau guestId | trimite mesaj (body ≤ 4000 char) → `sendAsUser()` → `maybeTriggerAi()` |

`sendAsUser(ctx, body)`: găsește/creează conversația proprie (`getOrCreateMine`), salvează mesajul, emite WS, apoi non-blocking `void this.maybeTriggerAi(convId, msgId)`.

`getOrCreateMine`: **single-tenant** → o conversație per user/guest (fără filtrul pe siteId). `aiMode` default citit din setarea globală `AI_CHAT_MODE_DEFAULT`.

### 4.2 Endpoints ADMIN — prefix `/api/admin/chat` (AdminGuard)

| Metodă | Path | Body | Descriere |
|---|---|---|---|
| GET | `/conversations` | `?q&archived` | listă (single-tenant: fără filtrare site) |
| GET | `/conversations/:id` | | detalii + presence + mesaje |
| POST | `/conversations/:id/messages` | `{body}` | reply admin |
| PATCH | `/conversations/:id/rename` | `{subject}` | |
| PATCH | `/conversations/:id/archive` | `{archived?}` | |
| DELETE | `/conversations/:id` | | ștergere hard |
| POST | `/conversations/:id/assign` | `{adminUserId?}` | claim/`'release'` |
| POST | `/conversations/:id/ai-mode` | `{mode}` | manual\|suggest\|auto |
| POST | `/conversations/:id/force-open` | `{open?}` | force open/close widget |
| POST | `/conversations/:id/attachments` | multipart `file` + `caption?` | upload |
| PATCH | `/conversations/:id/email` | `{email}` | |
| PATCH | `/conversations/:id/favorite` | `{favorite}` | |
| PATCH | `/conversations/:id/note` | `{note}` | |
| POST | `/conversations/:id/block` | `{blockIp?,blockEmail?,reason?}` | |
| POST | `/conversations/:id/payment-link` | `{amount?,currency?,description?,packageTier?}` | trimite link Stripe |
| POST | `/conversations/:id/launch-generation` | `{paymentId,style,occasion,recipientName,message,voiceArtist,...}` | generare manuală |
| POST | `/conversations/:id/demo-with-payment` | `{...formular, amount, currency}` | demo + link |
| POST | `/conversations/:id/summarize-order` | | AI extrage datele comenzii din chat |
| POST | `/lyrics/preview` | `{style,occasion,recipientName,message,voiceArtist,dedication?,refine?}` | preview versuri |
| PATCH | `/messages/:id` | `{body}` | edit |
| DELETE | `/messages/:id` | | soft-delete |
| GET/POST/PATCH/DELETE | `/quick-replies[/:id]` | | CRUD replici |
| GET/POST/DELETE | `/blacklist[/:id]` | | CRUD blacklist |
| POST | `/suggestions/:msgId/approve` | `{editedText?}` | trimite sugestia AI |
| POST | `/suggestions/:msgId/reject` | | șterge sugestia |

### 4.3 Hooks importante în `chat.service.ts`
- `maybeTriggerAi(convId, msgId)` → `agent.maybeRun(...)` (rezolvă agentul prin moduleRef/forwardRef ca să eviți dependență circulară).
- `markPaymentLinksAsPaid(paymentId, status)` → apelat din **Stripe webhook**; găsește mesajele `payment_link` cu `payload.paymentId`, le marchează `status`, trimite mesaj system de confirmare, update `wizardState.step='paid'`, push admin. (Vezi §10.)
- `notifyGenerationCompleted(generationId, status)` → apelat când Suno termină; trimite card `song_preview` în conversația aferentă.
- `onModuleInit` → `gateway.registerAckHandler(...)` pentru receipts.

---

## 5. Backend — WebSocket Gateway

**Namespace:** `/chat`. **Autentificare la handshake:** `auth.token` (JWT) sau `auth.guestId`; pentru admin `auth.token` + `auth.role='admin'`.

La connect verifică **blacklist** (IP/email) → disconnect dacă blocat. Persistă `lastIp` din `X-Forwarded-For` pe conversație.

### 5.1 Rooms
```
ADMIN_ROOM         = 'admin:chat'
userRoom(id)       = `user:${userId}`
guestRoom(id)      = `guest:${guestId}`
conversationRoom() = `conv:${conversationId}`
```

### 5.2 Server → Client

| Event | Payload | Destinatar |
|---|---|---|
| `chat:message` | `{message, conversation}` | admin + user/guest + conv |
| `chat:message_updated` | `{message, conversation}` | idem |
| `chat:message_deleted` | `{messageId, conversationId}` | idem |
| `chat:message:ack` | `{conversationId, messageIds[], status, by, at}` | participanți |
| `chat:ai_suggestion` | `{conversationId, message}` | **doar admin** (nu user) |
| `chat:presence` | `{userId\|guestId, online, lastSeenAt?, enriched?}` | admin |
| `chat:presence:snapshot` | `{users[], guests[], enriched}` | admin la connect |
| `chat:force_open` / `chat:force_close` | `{at}` | user/guest |
| `chat:typing` | `{conversationId, isTyping, from}` | conv + counterpart |
| `chat:conversation_updated` | `{conversation}` | admin |

### 5.3 Client → Server

| Event | Payload | Handler |
|---|---|---|
| `chat:join` / `chat:leave` | `{conversationId}` | doar admin (subscribe conv) |
| `chat:typing` | `{conversationId, isTyping}` | broadcast |
| `presence:heartbeat` | `{path?, title?, viewport?, chatOpen?, device?}` | update enriched (la 15s) |
| `presence:page_change` | `{from?, to, title?}` | update path (anulează greeting dacă `/m/`) |
| `presence:chat_toggle` | `{open}` | update flag |
| `message:ack` | `{messageIds[], status}` | `onMessageAck` → receipts |

### 5.4 Metode publice ale gateway-ului (apelate de service/AI)
`emitMessage`, `emitAiSuggestion`, `emitMessageAck`, `forceOpenChat`, `forceToggleChat`, `triggerGreetingIfEligible` (apelează `agent.maybeGreetUser` după ~5s), `disconnectTarget` (pentru block).

### 5.5 EnrichedPresence
```ts
interface DeviceInfo { type?: 'mobile'|'tablet'|'desktop'; os?: string; browser?: string; viewport?: {w:number;h:number}; userAgent?: string; }
interface EnrichedPresence {
  online: boolean; connectedAt: string|null; lastSeenAt: string|null;
  currentPath: string|null; currentTitle: string|null; chatOpen: boolean;
  device: DeviceInfo|null; ip: string|null;
}
```
Gateway ține `Map<'u:'|'g:'+id, EnrichedPresence>`. Prioritate IP: `conversation.lastIp` → analytics → handshake memory → null.

---

## 6. Backend — AI Agent

Fișier: `modules/ai-chat/ai-chat-agent.service.ts`. **Cel mai important fișier de portat.** Logica e identică; doar prompt-ul și pachetele se adaptează la melodia-ta.ro.

### 6.1 Ciclul de viață
- `maybeRun(convId, userMsgId)`: lock per-conv (un singur run paralel; followup dacă vine alt mesaj), dedup pe același msgId, delay 800ms (fereastră ca adminul să schimbe modul), skip dacă `aiMode==='manual'`, hard-cap 35 mesaje → escalare+manual.
- `runAgent(conv, userMsgId)`: ia ultimele 30 mesaje (DESC+reverse), filtrează `ai_suggestion`+`system`, build system prompt + memory facts, `openai.chatWithTools({maxIterations:6, maxTokens:1000, temperature: AI_CHAT_TEMPERATURE||0.4})`, persistă audit, bump `usageCount`. **Safety net**: în mod `auto` fără niciun `send_message` → mesaj de fallback.
- `maybeGreetUser(convId, target)`: apelat de gateway la ~5s. UPDATE atomic `greetingSentAt IS NULL` (anti-dublu pe 2 taburi). Skip dacă există deja mesaje admin sau dacă `lastClientPath` începe cu `/m/`. Trimite salutul Irinei + force-open (dacă activat).

### 6.2 OpenAiClient (`src/openai/openai.client.ts`)
```ts
interface ToolDef { name: string; description: string; parameters: object; }
type ToolHandler = (args: Record<string,unknown>) => Promise<unknown>;

chatWithTools(opts: {
  messages: ChatMessage[];           // {role, content}
  tools: ToolDef[];
  toolHandlers: Record<string, ToolHandler>;
  temperature?: number;
  maxIterations?: number;            // default agent: 6
  maxTokens?: number;                // 1000
  model?: string;                    // fallback gpt-4o-mini
}): Promise<{ finalContent, toolCalls[], iterations, model, usage:{prompt,completion} }>
```
Model: `AI_CHAT_MODEL` setting → `gpt-4o-mini` default.

### 6.3 Tools (13) — definiții & handlers
| Tool | Ce face |
|---|---|
| `send_message` | trimite text (max 600 char). Mod suggest→persistă `ai_suggestion` + emit doar admin; mod auto→mesaj real + emit WS. **1 singur per turn**, dedup, anti-buclă sterilă. |
| `search_memory` | KB + ai_memory (ILIKE pe content/kind). |
| `wizard_get_state` | returnează `{step, data, missingFields, hasEmail, readyToFinalize, instruction}`. |
| `wizard_update` | salvează `WizardData` (partial UPDATE pe jsonb, anti-race). Setează email pe guest. |
| `wizard_finalize` | inferează creativ (vezi §6.5) → `GenerationsService.createPendingForPayment` → `PaymentsService.createCheckoutSession` (aplică promo) → card `payment_link` în chat → `state.step='payment_sent'` + `linkReissueCount++`. Idempotent: `paid`/`generating`→`ORDER_ALREADY_PAID`; al 2-lea reissue→`LINK_ALREADY_SENT`. Trimite **Meta CAPI `AddPaymentInfo`** (`eventId=addpay-${paymentId}`). |
| `quote_price_with_offer` | verifică cod promo activ (roata norocului / emis) → trimite mesaj cu preț (cu/fără reducere). |
| `issue_discount_offer` | emite cod 1-shot ≤20%, legat de email, 24h. |
| `play_sample` | trimite link mostră (`kind: style\|voice`, `id`). |
| `send_empathy` | mesaj empatie (cap 2/conv → `limit_reached`). |
| `force_open_chat` | forțează widget (skip în mod suggest). |
| `change_email_and_resend` | schimbă email livrare + retrimite melodia. |
| `check_order_status` | status comandă cu `healthCategory: ok\|in_progress\|in_progress_slow\|tech_error\|failed\|waiting_payment` + `instruction` per caz. |
| `escalate_to_human` | switch `aiMode='manual'` + mesaj system către admin. |

### 6.4 System prompt (buildSystemPrompt)
Dacă `AI_CHAT_SYSTEM_PROMPT` setting e gol → prompt default „Irina" generat dinamic din: nume brand, **preț basic** (din pachete), pitch pachete, workflow 7 etape, reguli empatie, reducere, demo, **23 reguli stricte**. Apoi appendă memory facts aprobate + email support.

**Pentru melodia-ta.ro:** păstrezi structura, schimbi:
- numele brandului (`Manele Cadou` → `Melodia Ta` sau ce e cazul),
- prețul/pachetele (vezi §11),
- eventual numele asistentei,
- listele `STYLES` / `OCCASIONS` dacă diferă oferta.
- Limba e fixă RO → scoți rândul „Limba conversației: ${locale}".

Workflow (rezumat): 1) QUALIFY → 2) PREȚ+OFERTĂ (MEREU prin `quote_price_with_offer`) → 2.5) auto-extract din primul mesaj → 2.6) preferințe stil/artist → 3) colectare detalii (un mesaj numerotat, doar câmpuri lipsă) → 4) parse răspuns → 5) voce M/F (doar dacă conv < 8 mesaje) → 5.5) alegere pachet → 6) `wizard_finalize` → 7) post-plată (webhook automat).

### 6.5 Inferare creativă (`inferCreativeFields`)
La finalize, un call OpenAI lightweight (gpt-4o-mini) extrage din transcript: `style`, `occasion`, `voiceArtist`, `enrichedMessage` (mesaj îmbogățit cu context autobiografic). Fiecare câmp are `source: user_said|inferred|default`. Persistă `inferredFromChat=true` + `inferenceMeta` pe generation.

### 6.6 Constante de adaptat
```ts
const STYLES = [...];      // stilurile melodia-ta.ro
const OCCASIONS = [...];   // ocaziile melodia-ta.ro
const REQUIRED_WIZARD_FIELDS = ['recipientName', 'message'];
const MAX_USER_MSGS_BEFORE_DEFAULT_GENDER = 8;
const MAX_MESSAGES_BEFORE_HUMAN = 35;
```

---

## 7. Backend — AI Learner

Fișier: `modules/ai-chat/ai-learner.service.ts`. Cron `'30 3 * * *'` (necesită `@nestjs/schedule` + `ScheduleModule.forRoot()` în AppModule). **Dezactivat** dacă `AI_CHAT_LEARN_NIGHTLY !== 'true'`.

Flux: scanează conversațiile cu activitate în 24h și `lastMessageAt` „liniștit" (par rezolvate, max 50/run) → pentru fiecare, transcript (skip system+suggestion, min 4 mesaje) → OpenAI JSON extractor → candidați `{kind, content, confidence}` → dedup vs memory existentă → insert `ai_memory` cu `approved=false`. Admin aprobă în `/ai-memory`.

Endpoint manual: `POST /api/admin/ai-chat/memory/extract-now`.

---

## 8. Backend — Knowledge Base + AI Memory

`modules/kb/` (KbService.search(query, limit) — **scoatem param siteId**). `modules/ai-chat/ai-memory.entity.ts` + controller.

Endpoints AI Memory (prefix `/api/admin/ai-chat`):
```
GET    /memory[?approved=true|false]
GET    /memory/stats
POST   /memory                  { kind, content, approved? }
PUT    /memory/:id
DELETE /memory/:id
POST   /memory/extract-now
GET    /audit[?conversationId&toolName&limit]
GET    /audit/cost-summary
```

> **Seed obligatoriu la lansare**: adaugă manual 5-10 fapte critice (preț, garanție, livrare, refund, ETA) ca AI-ul să nu halucineze.

---

## 9. Backend — Web Push

Fișier: `modules/web-push/`. Generează VAPID: `npx web-push generate-vapid-keys`.

Settings: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:...`).

Endpoints (prefix `/api/admin/web-push`):
```
GET    /public-key      → { publicKey, configured }
GET    /subscriptions
POST   /subscribe       { endpoint, p256dh, auth, userAgent?, label? }
DELETE /subscribe       { endpoint }
POST   /test
POST   /reload          (re-citește VAPID din settings)
```
`sendToAll({title, body, tag, url, icon, badge, data})`. Pruning: 410/404 → delete; alte erori → `failureCount++`, drop la ≥5.

---

## 10. Backend — plată/generare/versuri din chat

### 10.1 Link de plată (din chat)
- **AI (wizard_finalize)** sau **admin (`/payment-link`)** → `PaymentsService.createCheckoutSession({userId,guestId,generationId?,packageTier,email?,promoCode?})` → `{paymentId, url}`.
- Se creează mesaj `messageType='payment_link'` cu `payload={amount,currency,description,checkoutUrl,paymentId,generationId?,packageTier,packageLabel}`.
- Card în chat pe client cu buton „Plătește acum →".

### 10.2 Webhook Stripe → chat
În handler-ul de webhook (`checkout.session.completed` / `payment_intent.*` / `charge.refunded`), după ce marchezi plata, apelează:
```ts
await chatService.markPaymentLinksAsPaid(paymentId, 'paid');  // sau 'failed'
```
Acesta: marchează `payload.status`, trimite mesaj „✅ Plată primită! … 5-10 minute …", `wizardState.step='paid'`, push admin „💰 Plată primită".

> **Single-tenant**: webhook-ul nu mai trebuie să citească `metadata.siteId` — un singur cont/site. Păstrezi doar `metadata.generationId` / `paymentId`.

### 10.3 Generare melodie din chat
- **Directă (wizard)**: `wizard_finalize` → `GenerationsService.createPendingForPayment(payload, {userId,guestId})` (scoți siteId). După plată, pipeline-ul Suno existent generează. Când termină → `chatService.notifyGenerationCompleted(genId, 'succeeded')` trimite card `song_preview` în chat.
- **Manuală (admin)**: `POST /conversations/:id/launch-generation {paymentId, style, occasion, recipientName, message, voiceArtist, dedication?, customLyrics?, packageTier?, email?}` → `launchGenerationFromPayment`.
- **Demo + plată (admin)**: `POST /conversations/:id/demo-with-payment` (pre-completat din `summarize-order`).

### 10.4 Generare versuri din chat
`POST /admin/chat/lyrics/preview {style, occasion, recipientName, message, voiceArtist, dedication?, refine?}` → `LyricsService.writeDraft(...)` + opțional `refineDraft(...)`. Returnează `{draft, refined?, locale}`. (Single-language: `locale` mereu `ro`.)

---

## 11. Pachete & prețuri

> **Aici e diferența principală melodia-ta.ro** (alte upsell-uri). Toată logica de mai sus consumă 3 helper-e din `modules/payments/packages.ts` + `pricing.ts`:

```ts
type PackageTier = 'basic' | 'plus' | 'premium';
normalizeTier(x): PackageTier
packageLabel(tier): string
packageTotalCents(tier, overrides): number    // overrides = per-site la manelecadou; la melodia-ta.ro = constante
packagesPitchRo(overrides): string             // text vândut în prompt-ul AI
```

**De făcut pentru melodia-ta.ro:**
1. Definește pachetele reale (nume, preț în cents, ce conține fiecare upsell).
2. `packageTotalCents` → întoarce prețurile fixe (fără `overrides` per-site).
3. `packagesPitchRo` → textul exact pe care îl spune Irina în ETAPA 5.5.
4. Actualizează enum-ul `packageTier` dacă ai alt număr de pachete (ex. doar 2, sau 4) — în entity, în tool `wizard_update`, în modaluri admin.
5. Verifică `GenerationsService.createPendingForPayment` să accepte tier-urile tale și să mapeze corect upsell-urile (imagini social / videoclip / pagină premium / colaj — sau ce ai tu).

---

## 12. Frontend WEB — widget client

Fișiere de portat din `apps/web/`:
```
components/ChatWidget.tsx     # widgetul (~850 linii)
lib/chat-socket.ts            # useChatSocket() hook
lib/api.ts                    # chatMe(), chatSend() + headers
lib/site-context.tsx          # → simplifică la config static (vezi mai jos)
```

### 12.1 useChatSocket (`lib/chat-socket.ts`)
- `io(\`${NEXT_PUBLIC_API_URL}/chat\`, { auth: token?{token}:{guestId}, transports:['websocket','polling'], withCredentials:true })`.
- **Heartbeat la 15s**: `presence:heartbeat {path,title,viewport,chatOpen,device}`. `detectDevice()` (type/os/browser/viewport).
- **Page change**: poll path la 1s + popstate → `presence:page_change`.
- **visibilitychange** → resend heartbeat.
- Ascultă: `chat:message`, `chat:message_updated`, `chat:message_deleted`, `chat:force_open`, `chat:force_close`, `chat:message:ack`, `chat:typing`.
- Returnează: `{connected, setChatOpen(open), ack(ids,status), sendTyping(convId,isTyping)}`.

### 12.2 ChatWidget — funcționalități
- React Query `['chat-me']` polling (30s open / 60s closed) + update local pe WS.
- **Receipts**: delivered ACK instant la primire mesaj admin; read ACK la `open=true`. `ReceiptIcon` (1/2 checkmark-uri, albastru = citit).
- **Typing**: `emitUserTyping` throttle 1/s, stop 2s; admin typing expiry 4.5s.
- **Notificări**: `playPing()` (WebAudio 880→660Hz), `useFaviconDot()` (canvas + dot roșu), `useTabTitleFlash()` (`(N) 💬 Mesaj nou — {brand}`).
- **Force open/close**: `onForceOpen→setOpen(true)`, `onForceClose→setOpen(false)`.
- **Render pe `messageType`**:
  - `text` — bulă normală (user auriu / admin cream).
  - `payment_link` — card; **unpaid**: buton „Plătește acum →" (fire pixel `InitiateCheckout` la click); **paid**: „🎵 Vezi melodia →" `/m/{generationId}`.
  - `song_preview` — card „Ascultă maneaua →" / „Pagina (în lucru)".
  - imagine (`attachmentMime` image/*) — `<img>` max 220px; PDF — link 📎.
- **Pixel `AddPaymentInfo`** când sosește un mesaj `payment_link` nou (vezi §13), `event_id=addpay-${paymentId}`.

### 12.3 Single-language — ce elimini
- Scoți `next-intl` complet (`useTranslations`, `useLocale`, `NextIntlClientProvider`, `messages/*.json`).
- Înlocuiește `t('chat.xxx')` cu string-uri RO hardcodate (un mic obiect `lib/chat-strings.ts`).
- `new Date(...).toLocaleTimeString('ro', {hour:'2-digit',minute:'2-digit'})`.
- Header API: `X-Locale: 'ro'` fix (sau scoți de tot dacă backend nu-l mai cere).

### 12.4 Single-tenant — ce simplifici
- `lib/site-context.tsx` → fie îl ții ca obiect static cu branding (nume, culori, support email), fie hardcodezi direct în widget. Nu mai faci fetch `/api/public/site?host=`.
- API client: scoți header `X-Guest-Id` doar dacă păstrezi guest sessions (recomandat să le păstrezi). Nu mai trimiți nimic legat de site.

### 12.5 Montare
`<ChatWidget />` în root layout, lângă `<Tracker />`. Necesită `QueryClientProvider` (Tanstack Query).

---

## 13. Frontend WEB — pixel & tracking

Fișiere: `components/Analytics.tsx`, `components/Tracker.tsx`, `lib/tracker.ts`, opțional `components/OpenReplay.tsx`.

### 13.1 Pixel-uri
- **Meta Pixel** + Advanced Matching: SHA-256 pe email/userId, `_fbc` din `fbclid`, re-init la 30s pentru login-uri. ID din env (`NEXT_PUBLIC_META_PIXEL_ID`) — la single-tenant nu mai vine din SiteConfig.
- **GA4**: `gtag config NEXT_PUBLIC_GA_ID`.
- **TikTok Pixel**: `ttq.load(NEXT_PUBLIC_TIKTOK_PIXEL_ID)`.

### 13.2 Eventuri din chat (critice pentru conversie)
| Moment | Event Meta | event_id (dedup cu CAPI) |
|---|---|---|
| Sosește card `payment_link` în chat | `AddPaymentInfo` | `addpay-${paymentId}` |
| Click pe „Plătește acum →" | `InitiateCheckout` | `init-${paymentId}` |
| Webhook plată (server, CAPI) | `AddPaymentInfo` (server) | `addpay-${paymentId}` |
| Post-plată success | `Purchase` | `purchase-${paymentId}` |

> Backend trimite `AddPaymentInfo` server-side din `wizard_finalize` (Meta CAPI) cu **același** `event_id` ca clientul → deduplicare corectă. Portează `MetaCapiService` (scoți param `site`, folosești config global).

### 13.3 OpenReplay (opțional)
Dacă vrei session recording, portează `OpenReplay.tsx` + header `X-OpenReplay-SessionID` în `api.ts`. Necesită server OpenReplay (deja ai unul pe Hetzner). Altfel sari peste — nu e blocant pentru chat.

---

## 14. Frontend ADMIN — dashboard operator

Fișiere: `app/(dashboard)/chat/_content.tsx` (monolit ~3600 linii), `app/(dashboard)/ai-memory/_content.tsx`, `lib/api/chat.api.ts`, `lib/chat-socket.ts` (`useAdminChatSocket`), `components/ai-assistant/AssistantPanel.tsx`, `components/PushNotificationsToggle.tsx`, `public/sw.js`.

### 14.1 Layout 3 coloane
- **Stânga** — listă conversații: search (debounce 250ms, după IP/email/ID), presence dot + „online de X", last message time, badge-uri (favorit, notă, AI mode, assignment, unread), device icon, current path, typing. Context menu: rename/archive/delete. Refetch 30s. Badge WS Live/Offline.
- **Centru** — thread: `ChatBubble` (text/system/payment_link/ai_suggestion), `ReceiptIcon`, attachments. Header cu: email, favorit, notă, block, assignment pill, **AI mode switcher**, **Zap (force open/close)**. Composer: textarea autogrow + `ActionsMenu` (📎 Atașament / 💳 Link plată / 🎵 Versuri / 🎁 Demo+Plată) + typing emit.
- **Dreapta** — tab-uri: **Răspunsuri** (quick replies, click → inserează în draft, CRUD + color picker) și **AI Assistant** (`AssistantPanel` — generează draft RO + reformulează/corectează; la single-language scoți partea de „target lang" / translation consensus).

### 14.2 AI suggestion card (mod suggest)
`AiSuggestionBubble` (violet, „Sugestie AI · neasumată"): **Respinge** / **Editează** (textarea inline) / **Trimite** → `approveSuggestion(msgId, editedText?)` / `rejectSuggestion(msgId)`.

### 14.3 Modaluri
- **PaymentLinkModal**: descriere, sumă (cents), monedă, pachet → `sendPaymentLink`. Preîncarcă suma din pachet.
- **DemoPaymentModal**: formular complet (stil/ocazie/beneficiar/mesaj/voce/dedicație/pachet/email/sumă/monedă/versuri custom) + buton „AI pre-fill" (`summarizeOrder`) → `demoWithPayment`.
- **LyricsPreviewModal** → `previewLyrics`.
- SetEmail / AdminNote / BlockPerson / EditMessage / QuickReplyEdit.

### 14.4 useAdminChatSocket
`io(\`${API}/chat\`, {auth:{token, role:'admin'}})`. Ascultă: `chat:presence`, `chat:presence:snapshot`, `chat:message(_updated|_deleted)`, `chat:ai_suggestion` (→ `playAdminPing()` chime + badge + tab title flash), `chat:message:ack`, `chat:typing`. Emite: `chat:join/leave/typing`.

### 14.5 Web Push (PushNotificationsToggle + sw.js)
`Notification.requestPermission()` → `WebPushApi.publicKey()` → `pushManager.subscribe({applicationServerKey})` → `WebPushApi.subscribe(...)`. `sw.js` ascultă `push` și postează `push-click {url}` înapoi → navighează la `/chat?c=${convId}`.

### 14.6 Single-tenant — ce simplifici în admin
- Scoți `useSitesMap`, `isAllSelected`, `SiteBadge`, header „cross-tenant", env `NEXT_PUBLIC_SITES_CROSS_TENANT`.
- `ChatApi.list()` fără logică de site.
- AssistantPanel: scoți override limbă / translation consensus.

---

## 15. Dependențe NPM

**API (NestJS):**
```
@nestjs/websockets ^10   @nestjs/platform-socket.io ^10
@nestjs/schedule ^6      socket.io ^4.8
openai ^4.77             web-push ^3.6
stripe ^17               typeorm ^0.3   pg ^8
```
În `AppModule`: `ScheduleModule.forRoot()` (pentru learner cron).

**WEB + ADMIN (Next.js):**
```
socket.io-client ^4.8    @tanstack/react-query ^5
next ^15                 react 18.3
lucide-react (admin)     @radix-ui/* (admin)
# OPȚIONAL: @openreplay/tracker, @openreplay/tracker-assist
# ELIMINAT la single-language: next-intl
```

---

## 16. Variabile de mediu & settings

**Settings (din admin /settings, encriptate unde e cazul):**
| Cheie | Default | Rol |
|---|---|---|
| `OPENAI_API_KEY` | — | obligatoriu |
| `AI_CHAT_MODEL` | `gpt-4o-mini` | model agent |
| `AI_CHAT_TEMPERATURE` | `0.4` | |
| `AI_CHAT_SYSTEM_PROMPT` | (gol) | override prompt |
| `AI_CHAT_MODE_DEFAULT` | `manual` | mod conversații noi |
| `AI_CHAT_REQUIRE_APPROVAL_FOR_PAYMENT` | `true` | **nu pune false în prod** |
| `AI_CHAT_LEARN_NIGHTLY` | `false` | activează cron extract după ~50 conv |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | — | web push |

> **Single-tenant**: tot ce la manelecadou era override per-site (`site.aiChatModeDefault`, `site.packagePricesCents`, `site.suno.*`, `site.aiGreetingEnabled/AutoOpenChat`) devine setare globală sau constantă. Adaugă în settings: `AI_GREETING_ENABLED`, `AI_GREETING_AUTO_OPEN`, `AI_GREETING_DELAY_SEC` dacă vrei să le ții configurabile.

**Env frontend:**
```
NEXT_PUBLIC_API_URL=...        # WS + REST
NEXT_PUBLIC_META_PIXEL_ID=...
NEXT_PUBLIC_GA_ID=...
NEXT_PUBLIC_TIKTOK_PIXEL_ID=...
# OPȚIONAL: NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY, NEXT_PUBLIC_OPENREPLAY_INGEST_POINT
```

---

## 17. Plan de implementare pas cu pas

1. **DB / entități** — adaugă cele 7 tabele (fără `siteId`; `chat_messages` fără câmpurile de traducere). Migrare sau synchronize.
2. **Helper pachete** (`packages.ts` + `pricing.ts`) — definește upsell-urile melodia-ta.ro (§11).
3. **Modulul Chat** (entities, service, gateway, controllers user+admin, attachments, blacklist, quick replies). Wire `ScheduleModule`, `registerAckHandler`.
4. **OpenAiClient** — `chatWithTools` (din `src/openai/`).
5. **AI Agent** — portează `ai-chat-agent.service.ts`, adaptează prompt + STYLES/OCCASIONS + pachete. Scoate `siteId`.
6. **AI Memory + KB + Learner** — entități, controller, cron.
7. **Web Push** — service, controller, generează VAPID, setări.
8. **Integrare plată**: în webhook Stripe apelează `markPaymentLinksAsPaid`. Verifică `createCheckoutSession` + `createPendingForPayment` fără siteId.
9. **Integrare Suno**: `notifyGenerationCompleted` → card `song_preview`. Verifică pipeline generare existent pe melodia-ta.ro.
10. **Integrare versuri**: `LyricsService.writeDraft/refineDraft` + endpoint preview.
11. **Frontend WEB**: `ChatWidget` + `useChatSocket` + `api.ts`. Scoate next-intl, hardcodează RO. Montează în layout cu QueryClient.
12. **Pixel**: `Analytics` + `tracker.ts` + eventuri chat (`InitiateCheckout`/`AddPaymentInfo`/`Purchase`). `MetaCapiService` server-side (dedup event_id).
13. **Frontend ADMIN**: pagina chat + ai-memory + AssistantPanel + PushNotificationsToggle + `sw.js`. Scoate multi-tenant.
14. **Settings**: completează cheile din §16. Seed 5-10 fapte AI Memory.
15. **Test end-to-end** (vezi §18).

---

## 18. Checklist final + gotchas

### Test E2E (browser real)
- [ ] Vizitezi site → la ~5s Irina salută + chatul se deschide singur (dacă auto-open ON).
- [ ] Trimiți mesaj → AI răspunde (mod auto) sau apare sugestie în admin (mod suggest).
- [ ] AI cere preț → detalii → pachet → `wizard_finalize` → apare card payment_link.
- [ ] Click „Plătește acum" → Stripe Checkout → plătești (test card) → webhook → mesaj „✅ Plată primită" + push admin.
- [ ] Suno termină → card `song_preview` „Ascultă maneaua →".
- [ ] Receipts (1/2/2-albastre) funcționează ambele direcții.
- [ ] Admin: force-open, claim, AI mode switch, quick reply, attachment, lyrics preview, demo+plată.
- [ ] Pixel: în Meta Events Manager apar `InitiateCheckout`, `AddPaymentInfo`, `Purchase` (fără dublură = dedup CAPI OK).

### Gotchas
1. **`@nestjs/schedule` în Docker** — anonymous volume `node_modules` nu ia pachetul nou: `docker compose build --no-cache api`.
2. **Dependență circulară** ChatGateway ↔ AIChatAgentService → `forwardRef()`.
3. **Race condition wizardState** — întotdeauna **partial UPDATE** (`UPDATE ... SET wizardState`), niciodată `save(entity)` full (ar suprascrie cu stale).
4. **AI mode race** — `assertNotManual()` re-citește live înainte de orice acțiune cu efect (admin poate comuta pe manual în timpul run-ului).
5. **Greeting dublu pe 2 taburi** — UPDATE atomic `WHERE greetingSentAt IS NULL`.
6. **`tracker.start()` așteaptă tab vizibil** (OpenReplay) — irelevant dacă nu folosești OpenReplay.
7. **Tab title flash + sunet** doar după prima interacțiune user (autoplay policy).
8. **VAPID build/restart** — după schimbare cheie → `/reload` endpoint sau restart.
9. **AI poate halucina prețul** fără memory facts → seed manual la lansare.
10. **`AI_CHAT_REQUIRE_APPROVAL_FOR_PAYMENT=true`** — chiar și în mod auto, linkurile de plată ad-hoc (tool `send_payment_link`) cer aprobare. `wizard_finalize` trimite direct (e flow-ul principal de vânzare).
11. **Webhook Stripe single-tenant** — scoți citirea `metadata.siteId`; un singur cont.
