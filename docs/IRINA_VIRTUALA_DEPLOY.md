# Irina virtuală — deploy autonom 26-27 mai 2026

Status: **TOT LIVE ÎN PROD.** Schema sync ok, API + admin booted clean, 0 errors.

## Ce s-a livrat (commit `db8ebf6`)

### Schema additive (sync-uri automate via TypeORM)

| Tabel | Coloană | Scop |
|---|---|---|
| `conversations` | `greetingSentAt` timestamptz | Anti-spam: o singură salutare per sesiune |
| `conversations` | `empathyMessagesSent` int default 0 | Hard cap 2 mesaje empatie per conv |
| `generations` | `dedicatorName` varchar(120) | „De la" (optional) |
| `generations` | `recipientGender` varchar(8) | M/F pentru inferarea vocii |
| `generations` | `inferredFromChat` bool default false | Marker generation creată de AI |
| `generations` | `inferenceMeta` jsonb | Audit per câmp: value + source ('user_said'/'inferred'/'default') |
| `sites` | `aiGreetingEnabled` bool default false | Toggle Irina proactivă |
| `promo_codes` | `source` varchar(32) | 'admin'/'roata'/'ai_request' |
| `promo_codes` | `aiIssued` bool default false | Tracking coduri emise de AI |

### Refactor AI agent — system prompt în stil Irina

System prompt rescris complet pe baza analizei datelor reale (146 mesaje quick-reply Irina). Stil colocvial RO fără diacritice obligatoriu, prietenos, max 2-3 fraze, emoji moderat 👋🎤.

**Workflow nou (replică Irina):**
1. ETAPA 1 — Qualify („vrei să te ajut sau să fac eu?")
2. ETAPA 2 — Preț + ofertă (cu cod roata norocului auto-aplicat)
3. ETAPA 3 — Cere DOAR 3 obligatorii + 1 optional într-un mesaj numerotat
4. ETAPA 4 — Parse răspuns user (TOATE câmpurile dintr-un single tool call)
5. ETAPA 5 — (Conditional) Întreabă voce M/F dacă conv ≤ 8 user msgs; altfel default masculin
6. ETAPA 6 — `wizard_finalize` cu inferare automată + message enrichment
7. ETAPA 7 — Post plată (deja automatizat via webhook)

### Tools noi în AI agent

| Tool | Ce face |
|---|---|
| `quote_price_with_offer` | Verifică `roulette_spins` pentru user/guest curent; dacă există cod activ → îl aplică automat la quote. Pattern Irina cu mesaj verbatim. |
| `issue_discount_offer` | Emite cod 1-shot max 20% când userul cere reducere. Restricționat la email-ul lui, valid 24h. `source='ai_request'`, `aiIssued=true`. |
| `play_sample` | Trimite URL audio pentru style/voice din `site.suno.styleSamples` / `voiceSamples`. |
| `send_empathy` | Mesaj de empatie (condoleanțe / „să-ți trăiască copiii"). Hard cap 2 per conv (atomic UPDATE counter). |
| `check_order_status` | (deja exista din 26 mai) — verifică plată + status generare + link manea. |

### Inference engine — `inferCreativeFields`

Apelat intern în `wizard_finalize`. Single OpenAI call (~600 tokens, gpt-4o-mini) care:
- Inferează `style` din 12 valori valide
- Inferează `occasion` din 12 valori valide
- Alege `voiceArtist` din voci preset matched la `recipientGender` (`florinel`/`mariana` defaults)
- **Enrichează `message`** cu detalii autobiografice din transcript (locuri, ani, momente, copii — natural, nu listate)
- Returnează cu `source: 'user_said' | 'inferred' | 'default'` pentru audit

Persistat în `generations.inferenceMeta` pentru a putea audita și ajusta defaults pe baza ratingurilor viitoare.

### Proactive greeting Irina

`ChatGateway.handleConnection`:
- La fiecare connect user/guest → setează timer 5s
- La fire timer → verifică:
  - userul încă online
  - Conv există pentru userId/guestId
  - `Site.aiGreetingEnabled === true`
  - `Conversation.greetingSentAt IS NULL` (one-shot permanent)
  - `currentPath` (din enriched memory + DB) nu începe cu `/m/` (ascultători skip)
- → `AIChatAgentService.maybeGreetUser` trimite salutul verbatim + `forceToggleChat(open=true)`

Anti-spam strict: `UPDATE conversations SET greetingSentAt=NOW() WHERE id=$1 AND greetingSentAt IS NULL` — atomic, doar primul caller câștigă race-ul. Tab-uri multiple, multi-device etc. → o singură salutare.

`presence:page_change` cancellează timer dacă userul navighează pe `/m/[id]` în intervalul de 5s.

### Mass-propagation `aiChatModeDefault`

`SitesService.update` detectează când `aiChatModeDefault` se schimbă față de valoarea curentă. Dacă da → `UPDATE conversations SET aiMode = $newMode WHERE siteId = $id` direct (nu prin save() entity, evită overwrite-uri pe wizardState).

UI text updated la /sites să clarifice că schimbarea propagă pe TOATE conv-urile existente.

### Admin UI

`/sites/[id]` → Flagsuri → toggle nou **„AI Greeting — Irina deschide chat singură la 5s"** cu descriere clară de anti-spam și skip pe `/m/[id]`.

## Cum activezi (dimineață, ~30s)

1. Mergi la https://admin.manelecadou.ro/sites
2. Click pe `manelecadou.ro`
3. Tab „Flagsuri site":
   - `Mod AI chat default` → setează pe `AI Auto` (sau `AI Suggest` dacă vrei doar sugestii)
   - `AI Greeting` → ON
4. Salvează
5. Deschide site-ul în incognito → după 5s, Irina deschide chat automat cu salut

**Cumul efectului:**
- Mod AI Auto pentru conv noi + propagare pe cele existente
- Salutul automat la fiecare vizitator nou
- Tot flow-ul de vânzare automat: qualify → preț + ofertă → 4 întrebări → finalize → notificare plată/generare

## Setări per site care merită să le configurez

Pe alte site-uri (manele.bg, doroparaggelia.gr) — flag-ul `aiGreetingEnabled` rămâne OFF by default. Activează când vrei.

## Smoke test pe care îl recomand

Mâine după activare:

```bash
# vezi conv-urile cu greeting trimis în ultimele 2h
deploy/prod.sh psql "SELECT id, \"siteId\", \"greetingSentAt\", \"lastClientPath\" FROM conversations WHERE \"greetingSentAt\" > NOW() - INTERVAL '2 hours' ORDER BY \"greetingSentAt\" DESC LIMIT 20"

# vezi inferenceMeta pe ultimele generation
deploy/prod.sh psql "SELECT id, style, occasion, \"voiceArtist\", \"inferredFromChat\", jsonb_pretty(\"inferenceMeta\") AS inference FROM generations WHERE \"inferredFromChat\"=true ORDER BY \"createdAt\" DESC LIMIT 5"

# vezi coduri promo emise de AI
deploy/prod.sh psql "SELECT code, \"discountValue\", \"restrictedToEmail\", \"validUntil\", \"createdAt\" FROM promo_codes WHERE \"aiIssued\"=true ORDER BY \"createdAt\" DESC LIMIT 10"

# audit AI tool calls în ultima oră (vezi /ai-monitor UI)
deploy/prod.sh psql "SELECT \"toolName\", \"aiMode\", COUNT(*) FROM ai_tool_calls WHERE \"createdAt\" > NOW() - INTERVAL '1 hour' GROUP BY \"toolName\", \"aiMode\" ORDER BY COUNT(*) DESC"
```

## Lucruri neimplementate (intenționat)

- **WhatsApp cross-channel** — confirmat NU în clarificări.
- **Quick reply mining nightly** — exista deja `ai-learner.service` în Faza 5; extensia pe quick replies se poate adăuga când vrei.
- **A/B testing salut variants** — confirmat „păstrăm Irina exact".

## Risk assessment

| Risc | Probabilitate | Impact | Mitigare |
|---|---|---|---|
| AI infereaza style greșit | medium | low (mai bun ca default fix) | `inferenceMeta` track sursa, ajustabil din prompt |
| Conv multiple tabs → 2 saluturi | low | low | Atomic UPDATE WHERE greetingSentAt IS NULL |
| AI emite cod >20% accidental | very low | low | Math.min(20, percentage) clamp hard |
| Greeting spam dacă user re-login | none | n/a | `greetingSentAt` per conv permanent — nu se resetează |
| Mass-propagation rupe conv în lucru | low | medium | Admin poate override individual din /chat |
| Roata norocului cod expirat aplicat | low | low | Check `validUntil` + `active` + `usedCount<maxUses` |

## TODOs minore deschise

- Pagina admin `/promo` ar putea afișa un badge „AI emis" pe codurile cu `aiIssued=true`. (10 min)
- AI agent ar putea avea un setting global `AI_MAX_DISCOUNT_PCT` în loc de hardcoded 20. (5 min)
- Empatie messages ar putea avea un mode „suggest only" (chiar și în auto cere admin approval). (15 min)

---

Tot e ready. Spor la testat dimineață! 🎤
