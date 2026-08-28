---
name: improve-ai-chat
description: Analizează review-urile nerezolvate pe conversațiile AI (Irina) din producție, identifică problemele pe categorii, implementează fix-uri în AI agent (prompt + cod), cere confirmare și dă deploy, apoi marchează review-urile ca rezolvate. Folosește când userul cere "îmbunătățește AI-ul din review-uri", "rezolvă review-urile la chat", "analizează feedback-ul Irinei", "/improve-ai-chat".
---

# Improve AI chat — din review-urile adminului

Adminul lasă review-uri pe conversațiile Irinei (chat admin → buton ClipboardCheck →
rating + categorie + comentariu). Acest skill le citește din producție, le analizează,
implementează fix-uri în agentul AI și (după confirmare) dă deploy.

> Tabelul review-urilor: `conversation_reviews` (entitate `ConversationReview` în
> `apps/api/src/modules/ai-chat/conversation-review.entity.ts`). `resolved=false` = în coadă.
> Codul agentului: `apps/api/src/modules/ai-chat/ai-chat-agent.service.ts` (prompt + tools).
> Pachete: `apps/api/src/modules/payments/packages.ts`.

## Pași

### 1. Trage review-urile nerezolvate din prod

Întâi numără-le:
```bash
deploy/prod.sh psql-tsv "SELECT COUNT(*) FROM conversation_reviews WHERE resolved=false"
```
Dacă e 0 → spune userului că nu există review-uri de procesat și oprește-te.

Listează review-urile (id, conversație, verdict, categorie, comentariu):
```bash
deploy/prod.sh psql-tsv "SELECT r.id, r.\"conversationId\", r.rating, r.category, COALESCE(r.comment,''), COALESCE(r.\"createdByEmail\",'admin'), r.\"createdAt\" FROM conversation_reviews r WHERE r.resolved=false ORDER BY r.category, r.\"createdAt\" DESC"
```

### 2. Trage transcriptul fiecărei conversații reviewuite

Pentru fiecare `conversationId` unic din lista de mai sus, dump transcriptul complet
(rulează în paralel pentru toate conversațiile):
```bash
deploy/prod.sh psql-tsv "SELECT \"authorRole\", \"messageType\", COALESCE(LEFT(body,800),'') FROM chat_messages WHERE \"conversationId\"='<CONVERSATION_ID>' AND \"deletedAt\" IS NULL ORDER BY \"createdAt\" ASC"
```
Opțional, vezi și tool call-urile AI pe conversație (ce a apelat agentul, ce a primit):
```bash
deploy/prod.sh psql-tsv "SELECT \"toolName\", LEFT(input::text,200), LEFT(output::text,200) FROM ai_tool_calls WHERE \"conversationId\"='<CONVERSATION_ID>' ORDER BY \"createdAt\" ASC"
```

### 3. Analizează pe categorii

Grupează review-urile pe `category` și citește fiecare comentariu împreună cu transcriptul.
Pentru fiecare problemă, identifică **cauza reală** în cod, nu doar simptomul:

| Categorie     | Unde te uiți întâi |
|---------------|--------------------|
| `price`       | ETAPA 2 (cotare preț) + guard `looksLikePriceConfirmation` + `priceQuotedCount` |
| `package`     | ETAPA 5.5 (upsell), `chatPackageUpsellRo` în packages.ts, `wizard_update.packageTier` |
| `tone`        | „REGULI DE TON" din `buildSystemPrompt` |
| `flow`        | ordinea ETAPELOR, regulile anti-buclă (24, 25), `handleWizardFinalize` |
| `accuracy`    | `search_memory` / `ai_memory` (poate lipsește un fapt) + reguli „NU inventa" |
| `escalation`  | `escalate_to_human`, regulile 17/22/23 |
| `other`       | judecă din comentariu |

Caută **tipare repetate** (mai multe review-uri cu aceeași plângere) — alea au prioritate
maximă. Distinge între: (a) problemă de prompt (rescrie instrucțiunea), (b) problemă de
guard/cod (modifică logica), (c) fapt lipsă din memorie (adaugă în `ai_memory`).

### 4. Implementează fix-urile

Modifică `ai-chat-agent.service.ts` (și `packages.ts` / alte fișiere dacă e nevoie).
Reguli:
- Modificări **additive și prudente** la prompt — nu rupe etapele/regulile existente.
- Dacă fix-ul e un fapt nou (preț, politică), preferă să-l adaugi ca `ai_memory` aprobat
  (prin admin `/ai-memory` sau direct INSERT) în loc să hardcodezi în prompt.
- ⚠️ Atenție la schema DB: orice schimbare de entitate respectă regulile din `CLAUDE.md §6.2`
  (additive = safe; drop/rename = migrare manuală).
- Lasă un comentariu scurt în cod DOAR dacă fix-ul e legat de un bug non-evident observat
  în review (ca celelalte „BUG observat <dată> conv <id>" din prompt).

### 5. Typecheck

```bash
cd "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou/apps/api" && npx tsc --noEmit
```
Dacă ai atins web/admin, rulează `npx tsc --noEmit` și acolo. Repară până e curat.

### 6. Rezumat + CONFIRMARE înainte de deploy

Prezintă userului un rezumat scurt:
- câte review-uri ai procesat, pe ce categorii,
- ce fix-uri concrete ai făcut (fișier + ce s-a schimbat),
- că deploy-ul e `make deploy-coolify` (pe Coolify stack-ul se deployează întreg,
  nu pe servicii — nu mai există `deploy-api` / `deploy-web` separate).

**OPREȘTE-TE și cere confirmare explicită** ("Dau deploy?"). NU da deploy fără aprobare.

### 7. Deploy (după confirmare)

Commit **doar fișierele pe care le-ai atins**. Working tree-ul are aproape mereu
modificări străine, necommise, ale altcuiva — `git add -A` le-ar trimite în producție
odată cu fix-ul tău.

```bash
cd "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou"
git add <fișierele pe care chiar le-ai modificat>
git commit -m "fix(ai-chat): îmbunătățiri din review-uri admin"
make deploy-coolify
```

`git push` singur **nu** deployează (repo-ul e legat prin deploy key, fără webhook).
După deploy verifică `curl -s https://manelecadou.ro/health`.

### 8. Marchează review-urile ca rezolvate

DOAR review-urile pe care chiar le-ai adresat. Cu lista de ID-uri procesate:
```bash
deploy/prod.sh psql "UPDATE conversation_reviews SET resolved=true, \"resolvedAt\"=NOW() WHERE id IN ('<id1>','<id2>',...)"
```
Dacă le-ai adresat pe toate, poți folosi `WHERE resolved=false`.

Confirmă userului: câte review-uri rezolvate + linkul de health verificat.

## Note

- Review-urile sunt per-site (`siteId`), dar promptul Irinei e partajat. Dacă un fix e
  specific unui singur site, preferă `ai_memory` cu `siteId` setat, nu promptul global.
- Nu șterge review-uri — doar marchează `resolved=true` (rămân ca istoric/audit).
- Dacă un review e contradictoriu sau neclar, lasă-l `resolved=false` și menționează-l
  userului în rezumat în loc să ghicești.
