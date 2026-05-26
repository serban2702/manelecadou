# Plan AI Sales Agent — adaptare la workflow-ul real Irina

Bază: analiza producției pe `manelecadou.ro` din ultimele 16 zile (11-26 mai 2026).

---

## 1. Datele brute

### 1.1 Volume
- **919 conversații** create, **182 cu mesaje reale** (restul: visitatori conectați WS dar n-au scris niciodată)
- **753 mesaje** chat: 250 user · 474 admin uman · 29 AI
- **4 quick replies** definite în DB (toată strategia Irinei trăiește în ele)
- **51 generations** total · **31 plătite** (61% conv pe cei care încep gen)
- **17 demo-uri** create (13 plătite = **76% conversion demo → unlock full**)
- Admin principal: **Irina** (146 mesaje de salut), secundar Andrei (27)

### 1.2 Funnel real
| Tip conversație | Nr | Avg msgs | Avg user msgs | Admin a scris primul |
|---|---|---|---|---|
| **Conv care a convertit** | 10 | 11.0 | 3.7 | 8/10 (80%) |
| **Conv abandonată** | 172 | 3.7 | 1.2 | 156/172 (91%) |

**Insight #1**: Conversion rate global = **5.5%** (10/182). Cauza principală: 172 useri ignoră salutul proactiv. Cei care răspund convertesc bine. *Pragul magic e ~3 mesaje user — peste asta, conversia explodează.*

**Insight #2**: Irina face **proactive outreach în 91% din cazuri** — trimite Salut înainte ca userul să scrie. Asta înseamnă că AI-ul trebuie să aibă și un mod „greeting on presence" (când detectează visitator nou, nu să aștepte ca userul să inițieze).

### 1.3 Câmpurile generation pe cele plătite
TOATE cele 31 generation plătite au stil/voce/ocazie/recipient/mesaj completate. **Dar din analiza chat-urilor reiese clar că Irina NU întreabă userul despre style/voice/occasion.** Acestea sunt completate de admin la creare (via "AI Pre-fill din conversație" — extracted din ce a zis userul în transcript) sau lăsate default. Userul nu vede aceste decizii.

**Top stiluri preferate (după conversii)**: iubire (5), modern (4), popfolk (3), opulența (3)
**Top voci**: florinel (11), ticu (5), adita (5), mariana (3) — voci preset, nu "masculin/feminin"
**Top ocazii**: zi de naștere (10), șef (5), motivațional (4), aniversare cuplu (3)

---

## 2. Workflow-ul real al Irinei (extras din conv `f1faf95a` — caz tipic plătit)

```
1. IRINA  → "Buna, sunt Irina!👋 Vrei să te ajut să îți scrii melodia?"      [Quick Reply 1]
2. USER   → "Da"
3. IRINA  → "Super, doresti sa te ajut sa iti realizezi tu maneaua sau       [Quick Reply 2]
             vrei sa o fac eu pentru tine?"
4. USER   → "Aniversarea noastră 18 ani de căsătorie"
5. USER   → "O surpriză pentru soțul meu"
6. IRINA  → "Maneaua costa 29.99 lei la care puteti sa mai beneficiati       [Quick Reply 3]
             de o oferta. Sunteti de acord?"
7. USER   → "OK"
8. IRINA  → "Perfect, am nevoie de cateva detalii:                           [Quick Reply 4]
             1. Numele persoanei care primeste melodia
             2. Numele tau (persoana care dedica)
             3. Un mesaj dragut
             4. Adresa de email"
9. USER   → [completează tot într-un mesaj lung + email separat]
10. IRINA → trimite payment_link 29.99 RON
11. IRINA → "Dupa plata, se va trimite maneaua pe email si pe platforma"
12. USER  → "Imi puteti trimite mai bine pe WhatsApp?"
13. IRINA → "Da, lasati va rog un numar de telefon"
14. USER  → telefon
15. [USER PLĂTEȘTE]
16. AI    → "✅ Plată primită! Începem să generăm melodia ta — vei primi linkul aici sau pe email"
17. AI    → "🎵 Generăm acum maneaua. Va fi gata în ~5 min. Următorul mesaj e linkul..."
18. AI    → song_preview card cu /m/c409c178...
19. USER  → "Vă mulțumesc, foarte frumos!"
```

### Observații cheie despre stilul Irinei

| Aspect | Pattern |
|---|---|
| **Ton** | Românește colocvial fără diacritice (`doresti`, `te ajut`), familiar dar respectuos (Dumneavoastră/voi mix), emoji 👋🎤🎵 moderat |
| **Lungime mesaj** | 1-3 fraze. Excepție: mesajul de "detalii" e numerotat 1-4 |
| **NU întreabă DELOC** | stil melodie · voce masculină/feminină · ocazia explicit · premium · custom lyrics |
| **Întreabă DOAR** | (1) cine primește, (2) cine dedică, (3) ce mesaj, (4) email — în 1 singur mesaj numerotat |
| **Cere context** | implicit via "vrei să te ajut sau să fac eu?" → user vine de bună voie cu context (aniversare, etc.) |
| **Tratează obiecții** | la plată eșuată: "Nu ai fonduri pe card, doresti alt link?" — niciodată „insistent", oferă alternative |
| **Cross-channel** | WhatsApp pe ofertă — colectează tel după plată |
| **Anunț preț** | întotdeauna cu cârlig: "...la care puteti sa mai beneficiati de o oferta" → **discount-ul e parte din pitch** |

---

## 3. Gap-uri ale AI-ului actual vs Irina

| # | Pattern Irina | AI actual (wizard) | Gap |
|---|---|---|---|
| 1 | Salut proactiv 1-line pe conexiune | AI nu salută, așteaptă mesaj user | **MISSING** — toată funnel-ul pierde 91% useri |
| 2 | Mic talk: "vrei să te ajut sau să fac eu?" | AI sare direct la "Care e stilul?" | Wrong question, wrong moment |
| 3 | Anunț preț + cârlig ofertă, cere confirmare | AI nu menționează prețul până la finalize | Lipsește etapa de qualified-prospect |
| 4 | Cere DOAR 4 lucruri: recipient, dedicant, mesaj, email | Wizard cere 5+ tehnice (style, voice, occasion...) | **6+ întrebări inutile** = friction enormă |
| 5 | Trimite link plată după 4 răspunsuri | Wizard cere CONFIRMARE explicită ("da, trimite") | Etapă în plus |
| 6 | Stil/voce/ocazie = extrase din context de admin/Pre-fill | Wizard întreabă userul explicit | Pune întrebări la care userul nu știe răspunsul |
| 7 | După plată: AI anunță deja (mesaje 16-18 sunt corecte!) | Existing AI works here | ✅ OK |
| 8 | Cross-channel: WhatsApp post-plată | Inexistent | Feature gap |
| 9 | Dedicantul (cine semnează maneaua) | Nu există câmp dedicat — Irina îl pune în message | Schema gap minor |

---

## 4. Propunere — AI Sales Agent „Irina virtuală"

### 4.1 Strategie de abordare

**Înlocuiesc wizard rigid cu agent conversațional structurat după Irina.** Păstrez tool-urile existente dar redesign-uiesc system prompt-ul, ordinea pașilor, și ce întreabă (vs ce extrage automat).

**Principiu cardinal**:
> AI întreabă DOAR ce nu poate deduce. Stilul/voce/ocazia se extrag din context la finalize (ca AI Pre-fill curent), NU din întrebări către user. Întrebarea către user e doar pentru cele 4 informații pe care DOAR el le știe: cine primește, cine dedică, ce mesaj, email.

### 4.2 Schema changes (minor, additive only)

```typescript
// Conversation entity:
+ greetingSentAt: timestamptz | null  // anti-spam: 1 greeting per conv

// Generation entity:
+ dedicatorName: varchar(120) | null  // cine semnează maneaua (separat de message body)
+ contactPhone: varchar(32) | null    // pentru livrare WhatsApp
+ inferredFromChat: boolean default false  // marchează gens unde AI a făcut pre-fill
+ inferenceMeta: jsonb | null         // ce a extras AI și de unde: { style: {value, source: 'user_said|inferred|default'} }
```

Toate ✅ safe pentru `synchronize: true`.

### 4.3 Tool-uri noi pentru AI

| Tool | Ce face | Înlocuiește |
|---|---|---|
| `greet_user_if_new` | Trimite Salut quick-reply 1 dacă `greetingSentAt IS NULL` și e prima conexiune | (nou — proactive) |
| `collect_order_details` | Setează `recipientName`, `dedicatorName`, `message`, `email` într-un singur tool call (extrage din ultimele N msgs user prin OpenAI) | înlocuiește `wizard_update` granular |
| `quote_price_with_offer` | Trimite mesajul „costă X la care beneficiezi de o ofertă" + opțional aplică promo automat dacă există unul implicit pentru site | (nou) |
| `infer_creative_fields` | Extrage style/voice/occasion/premium din transcript via OpenAI mini call. Returnează cu source: `user_said` / `inferred` / `default`. Nu se vede în chat. | (nou — replace întrebări user) |
| `finalize_order` | Replace `wizard_finalize`. Cheamă internal `infer_creative_fields` + `collect_order_details`, validează minim (4 câmpuri), creează Generation + Stripe link | înlocuiește `wizard_finalize` |
| `collect_phone_for_whatsapp` | Post-plată: dacă userul cere WhatsApp, salvează tel în `Generation.contactPhone` | (nou) |
| `apply_promo_offer` | Adaugă un promo code activ la checkout (admin definește în /promo cu flag `offerableInChat=true`) | (nou) |
| `check_order_status` | Deja există (l-am adăugat azi) | ✅ keep |
| `force_open_chat` | Keep | ✅ keep |
| `escalate_to_human` | Keep | ✅ keep |
| `search_memory` | Keep — pentru întrebări pre-vânzare | ✅ keep |
| `send_message` | Keep | ✅ keep |

**Tool-uri de șters/deprecate**: `wizard_update`, `wizard_get_state`, `wizard_finalize` (replace cu `collect_order_details` + `finalize_order`).

### 4.4 System prompt nou (schiță)

```
Ești Irina — asistenta de vânzări de la Manele Cadou. Vorbești românește colocvial
(uneori fără diacritice — "doresti", "te ajut" — natural), prietenos dar respectuos.
Folosești emoji moderat: 👋 🎤 🎵 ✨ 💳.

Răspunsuri SCURTE (1-3 fraze, max 240 char). NICIODATĂ markdown (** sau __).

WORKFLOW (NU CERE EXPLICIT style/voce/ocazie — le extragi tu la final):

ETAPA 1 — SALUT (doar dacă greetingSentAt IS NULL la conexiune):
  → "Buna, sunt Irina!👋 Vrei să te ajut să îți scrii melodia?"

ETAPA 2 — QUALIFY:
  → "Super, doresti sa te ajut sa iti realizezi tu maneaua sau vrei sa o fac eu pentru tine?"
  → Lasă userul să-ți spună contextul (pentru cine, ce ocazie). NU întreba tu.

ETAPA 3 — PREȚ + OFERTĂ (după ce ai contextul):
  → "Maneaua costa 29.99 lei la care puteti sa beneficiati de o oferta. Sunteti de acord?"
  → Așteaptă confirmare. Dacă userul ezită → escalate sau folosește search_memory.

ETAPA 4 — COLECTARE DETALII (un singur mesaj numerotat):
  → "Perfect! Am nevoie de cateva detalii:
     1. Numele persoanei care primește melodia
     2. Numele tău (cine dedică)
     3. Un mesaj dragut pentru ea/el
     4. Adresa ta de email"

ETAPA 5 — DUPĂ CE USERUL RĂSPUNDE:
  → Apelează collect_order_details cu cele 4 câmpuri parsate din ultimul mesaj.
  → Apoi finalize_order (care intern face infer_creative_fields + creează Gen + link plată).
  → Mesaj: "Gata, ți-am trimis linkul de plată mai sus. După plată melodia se generează în ~90 secunde și o primești pe email."

ETAPA 6 — POST PLATĂ (automat via webhook, NU întreba):
  → AI primește notificare via gateway. Răspunde: "✅ Plată primită! Generăm acum maneaua..."

ETAPA 7 — CROSS-SELL WHATSAPP (opțional, doar dacă userul cere):
  → Dacă userul scrie ceva cu "whatsapp" / "telefon": cere numărul → collect_phone_for_whatsapp.

REGULI:
- NU întreba NICIODATĂ: stil melodie, voce masculină/feminină, ocazia explicit, premium da/nu.
- Astea le DEDUCI din context la finalize. Dacă ai dubii → default-uri rezonabile.
- Dacă userul SPUNE singur stilul/vocea/ocazia → folosește exact ce a zis (păstrează formulare).
- Dacă userul are doar 1-2 mesaje vagi ("vreau o manea") → nu sări la detalii, întreabă context: "pentru cine e?" sau "ce ocazie?"
- Limit hard: max UN mesaj per turn (deja enforced).
- Pentru obiecții (preț prea mare, am întrebări) → search_memory întâi.
- Pentru cazuri complexe (refund, problemă plată recurentă) → escalate_to_human.
```

### 4.5 Mod proactive greeting (nou)

În `chat.gateway.ts`, când un visitor se conectează WS pe un site cu `aiChatModeDefault='auto'` ȘI conversația lui n-are `greetingSentAt`:
- După 8 secunde delay (să nu pară spam imediat la load)
- Apelează `AIChatAgentService.maybeGreetUser(convId)`
- Care trimite salutul Irinei + setează `greetingSentAt`
- Dacă userul nu răspunde în 60s, NU mai face nimic (1 salut per conv, never spam)

Anti-pattern: NU saluta useri care vin pe `/m/[id]` (au ascultă deja manea cumpărată). Filtrează prin `lastClientPath`.

### 4.6 Inference engine — `infer_creative_fields`

Apelat la finalize, NU în chat. Face un single OpenAI call cu prompt scurt:

```
Pe baza acestei conversații, extrage pentru noi (decision e a noastră, nu se vede în chat):
- style: unul din [Clasică de pahar, Modernă, Orientală, Cu trompetă, De jale, Comercială, De opulență, De iubire, Tallava, Kuchek, Trapanele]
- occasion: una din [Zi de naștere, Nuntă, Botez, Cumătrie, Aniversare cuplu, Pentru șef, Declarație, Roast prieten, Naș/fin, Înmormântare, Motivațională, Altă ocazie]
- voiceArtist: alege ID din: florinel, ticu, adita, mariana, gigi, stavros, elena, adi, nicu
- premium: true|false (default false; true doar dacă userul a cerut explicit „premium" sau "calitate superioară")

Reguli:
- Dacă userul a menționat explicit, FOLOSEȘTE EXACT ce a zis (păstrează casing și formulare).
- Pentru aniversari de cuplu / declarație de dragoste → style="De iubire", voce feminină (mariana/elena) pentru bărbat dedicat femeii, voce masculină (florinel/ticu) pentru femeie dedicată bărbatului.
- Pentru zi de naștere → style="Modernă" sau "Comercială", voce alesă după genul recipientului.
- Pentru roast/petrecere → style="Trapanele" sau "Tallava".
- Pentru context lipsă → style="Modernă", occasion="Zi de naștere", voice="florinel", premium=false.

Output JSON: { style, occasion, voiceArtist, premium, sources: { style: 'user_said'|'inferred'|'default', ... } }
```

Salvăm `sources` în `Generation.inferenceMeta` ca să putem audita și ajusta defaults.

### 4.7 Promo aplicat automat la ofertă

În `/promo`, adăugăm checkbox **„Oferibil în chat" (`offerableInChat: bool`)** pe `PromoCode`. La `quote_price_with_offer`:
- AI verifică dacă există un cod activ cu `offerableInChat=true` pe siteId
- Îl include în mesaj: "Maneaua costa 29.99 lei dar îți pot oferi cod **PRIMACOMANDA10** cu 10% reducere"
- Stripe Checkout primește `discounts: [{coupon: ...}]` sau aplicăm la `unit_amount` direct

### 4.8 Învățare continuă (Phase 6)

`ai_learner.service.ts` deja extrage memory facts nightly. Extindem:
- **Quick reply mining**: dimineață scanează conv-urile rezolvate ale Irinei, identifică propoziții care apar la 3+ conv → propune quick reply nou.
- **Inference scoring**: pe gens livrate, comparăm `inferenceMeta.style.value` cu ratingul/feedback userului (când va exista). Tunăm prompt-ul.
- **Greeting A/B**: testează 2-3 variante de salut și măsoară engagement (user răspunde în <2 min).

---

## 5. Plan de implementare faze

| Fază | Scope | LOC estimate | Risk |
|---|---|---|---|
| **F1** | Schema additive (3 coloane Generation, 1 Conversation, 1 PromoCode) | ~50 | low (additive synchronize-safe) |
| **F2** | Tool nou `infer_creative_fields` + refactor `wizard_finalize` → `finalize_order` care îl folosește. Schimbă wizard în mod „4 întrebări simple" | ~250 | medium (înlocuiește wizard existent — fallback la old pe AI_USE_NEW_FLOW=false) |
| **F3** | Proactive greeting on WS connect (gateway change + maybeGreetUser metodă agent) | ~80 | low |
| **F4** | `quote_price_with_offer` + flag `offerableInChat` pe PromoCode + UI checkbox | ~120 | low |
| **F5** | Cross-sell WhatsApp tool + ContactPhone collection + integrare cu mail templates | ~100 | low |
| **F6** | Quick reply mining + inference scoring (cron, dashboard) | ~200 | low |

**Total**: ~800 LOC, ~2-3 zile de muncă pentru F1-F4 (production-ready), F5-F6 incremental.

### Rollout strategy

1. **Faze F1+F2** pe un singur site test (ex. `manele.bg`) cu `aiChatModeDefault=suggest`. Irina vede ce propune AI și aprobă/editează.
2. După ~30 conversații cu sugestii bune (>70% approval rate), trecem pe `auto` pe site-ul de test.
3. Dacă conversion rate ≥ Irina manual (5.5%), extindem pe `manelecadou.ro` în `suggest` mode.
4. După 2 săptămâni stable pe suggest, mutăm pe auto cu monitoring în `/ai-monitor`.
5. Faze F3-F4 după ce F2 e stabil în prod.

### Metrici de succes

| Metric | Baseline (Irina) | Target AI |
|---|---|---|
| Conversion rate (msg user → paid) | 5.5% | ≥ 7% |
| Time to first response | varia | < 5s (instant) |
| Avg msgs to convert | 11 | ≤ 8 (mai eficient) |
| Greeting response rate | n/a (manual) | ≥ 25% |
| Cost per conversation | timpul Irinei | < $0.01 (gpt-4o-mini) |
| Escalation rate la human | n/a | < 15% |

---

## 6. Întrebări pentru decizie înainte să încep

1. **Pricing offerable**: vreau să adaug pe `/promo` un flag „Oferibil în chat" — ești OK? AI-ul va folosi automat primul cod activ cu acest flag la `quote_price_with_offer`.
2. **Voci preset**: ai 9 voci în use (florinel, ticu, adita, mariana, gigi, stavros, elena, adi, nicu) — sunt ID-uri Suno preset sau labels custom? AI trebuie să știe ce match-uiește cu „masculin/feminin" pt inference.
3. **Dedicator name**: vrei câmp dedicat pe Generation (separat de message body) sau ținem totul în `message` cum face Irina?
4. **Proactive greeting**: vrei pe TOATE site-urile sau doar pe cele cu `aiChatModeDefault=auto`?
5. **Salut variants**: ții la salutul exact al Irinei „Buna, sunt Irina!👋..." sau testăm A/B variants?
6. **Cross-channel WhatsApp**: vrei MVP basic (salvăm nr de telefon) sau integrare reală (trimite WhatsApp via Twilio/Meta Cloud API)?

---

## 7. Quick wins imediate (înainte de F1)

Pot face acum, fără schema changes, doar prin update system prompt:

1. **Redu wizard la 4 întrebări**: scoate style/voice/occasion din `wizard_update` required fields. Schimbă să întrebe doar recipient/dedicator/message/email.
2. **Schimb tonul AI** să sune ca Irina (colocvial, fără diacritice obligatoriu, emoji 👋🎤).
3. **Quote price first**: AI menționează prețul după ce userul își exprimă intenția, ÎNAINTE de a cere detalii.
4. **Default safe values** pentru style/voice/occasion când userul nu spune nimic → infer din mesaj la finalize.

Toate astea = 1 oră de muncă. Vrei să le fac întâi ca smoke test pentru direcția generală?
