---
name: auto-review-chats
description: Audit AUTONOM (fără confirmare umană) al conversațiilor AI (Irina) din producție din ultimele 5 ore. Trage conversațiile cu ≥5 mesaje + review-urile manuale nerezolvate, citește fiecare transcript, detectează probleme (mesaje repetitive, regenerare fără schimbarea versurilor, email re-cerut, escaladări greșite, cod promo neaplicat, etc.), implementează fix-uri în AI agent (prompt + cod), face typecheck, dă DEPLOY singur și marchează ce a procesat. Gândit să ruleze într-un loop la 5 ore. Folosește când userul cere "rulează auditul de chat", "review automat al conversațiilor", "/auto-review-chats".
---

# Auto-review chats — audit autonom al conversațiilor Irinei

Acest skill rulează **complet autonom**: analizează conversațiile recente din producție,
găsește problemele de comportament ale AI-ului (Irina), le **rezolvă în cod**, **dă deploy
singur** și ține evidența a ce-a procesat — **fără să ceară confirmarea userului**. E gândit
să ruleze într-un loop la fiecare 5 ore (vezi `/loop 5h /auto-review-chats`).

Diferența față de `improve-ai-chat`: acela procesează DOAR review-urile manuale și cere
confirmare înainte de deploy. Acesta scanează TOATE conversațiile recente proactiv, integrează
și review-urile manuale, și deployează autonom.

> Cod agent: `apps/api/src/modules/ai-chat/ai-chat-agent.service.ts` (prompt + tools).
> Pachete: `apps/api/src/modules/payments/packages.ts`.
> Review-uri manuale: `conversation_reviews` (`resolved=false` = în coadă).
> Regenerare melodie: `chat.service.ts` (markPaymentLinksAsPaid) + `generations.service.ts` (adminRegenerate).

---

## PRINCIPII (citește înainte de orice)

1. **Autonom** — NU cere confirmare. Userul a autorizat durabil deploy-ul automat pentru
   acest flux. Rulează capăt-la-capăt și raportează la final.
2. **Garduri de siguranță NENEGOCIABILE**:
   - `npx tsc --noEmit` TREBUIE să treacă înainte de orice deploy. Dacă pică și nu poți
     repara curat → `git checkout -- <fișiere>` (revert) + NU deploya + raportează în log.
   - Deploy DOAR dacă ai făcut modificări reale (`git status` arată schimbări). Niciun
     deploy gol.
   - Fix-uri **additive și prudente** (prompt rules, guard-uri, mici corecții de logică).
     NICIODATĂ schimbări DB distructive (DROP/RENAME coloane) — vezi `CLAUDE.md §6.2`.
     Dacă o problemă chiar cere așa ceva → NU o executa; loghează-o ca `needs_human` și
     trece mai departe.
   - După deploy: health check pe cele 3 domenii. Dacă pică → loghează `deploy_unhealthy`.
3. **Idempotent** — nu reprocesa la nesfârșit aceeași conversație. Folosește `chat_audit_log`
   (vezi Pas 0). O conversație se re-auditează DOAR dacă a primit mesaje noi SAU are un
   review manual nou de la ultimul audit.
4. **Conservator la fix-uri de cod riscante** — dacă un bug cere o schimbare arhitecturală
   amplă, aplică varianta minimă sigură (ex. o regulă de prompt + un guard) și loghează
   restul ca `needs_human` în loc să rescrii subsisteme întregi într-o rulare automată.

---

## Pas 0 — Tabela de tracking (idempotent, o creezi o singură dată)

`chat_audit_log` NU e entitate TypeORM (deci `synchronize` o ignoră, nu o atinge). O creezi
prin SQL idempotent la fiecare rulare (CREATE IF NOT EXISTS e instant dacă există deja):

```bash
ssh VPSIonos "docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -c \"
CREATE TABLE IF NOT EXISTS chat_audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  \\\"conversationId\\\" uuid NOT NULL,
  \\\"siteId\\\" uuid,
  \\\"auditedAt\\\" timestamptz NOT NULL DEFAULT now(),
  \\\"lastMessageAtSeen\\\" timestamptz,
  \\\"messageCount\\\" int,
  \\\"issuesFound\\\" jsonb,
  \\\"actionsTaken\\\" text,
  \\\"deployTriggered\\\" boolean DEFAULT false,
  \\\"createdAt\\\" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_audit_conv ON chat_audit_log (\\\"conversationId\\\");
CREATE INDEX IF NOT EXISTS idx_chat_audit_at ON chat_audit_log (\\\"auditedAt\\\" DESC);
\""
```

---

## Pas 1 — Selectează conversațiile de auditat

Trage conversațiile candidate. Logica acoperă EXACT cererea: (A) conversații recente cu
destule mesaje, nemaiprocesate de la ultima activitate; (B) ORICE conversație cu review
manual nerezolvat (chiar veche, chiar deja auditată — un review nou = re-audit).

```bash
ssh VPSIonos "docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -t -A -F'|' -c \"
SELECT c.id, c.\\\"siteId\\\", c.\\\"lastMessageAt\\\", COALESCE(c.email,'guest'),
  (SELECT COUNT(*) FROM chat_messages m WHERE m.\\\"conversationId\\\"=c.id AND m.\\\"messageType\\\"='text' AND m.\\\"authorRole\\\" IN ('user','admin') AND m.\\\"deletedAt\\\" IS NULL) AS msg_count,
  EXISTS(SELECT 1 FROM conversation_reviews r WHERE r.\\\"conversationId\\\"=c.id AND r.resolved=false) AS has_review
FROM conversations c
WHERE (
    c.\\\"lastMessageAt\\\" > now() - interval '5 hours'
    AND (SELECT COUNT(*) FROM chat_messages m WHERE m.\\\"conversationId\\\"=c.id AND m.\\\"messageType\\\"='text' AND m.\\\"authorRole\\\" IN ('user','admin') AND m.\\\"deletedAt\\\" IS NULL) >= 5
    AND NOT EXISTS (SELECT 1 FROM chat_audit_log a WHERE a.\\\"conversationId\\\"=c.id AND a.\\\"lastMessageAtSeen\\\" >= c.\\\"lastMessageAt\\\")
  )
  OR EXISTS (SELECT 1 FROM conversation_reviews r WHERE r.\\\"conversationId\\\"=c.id AND r.resolved=false)
ORDER BY has_review DESC, c.\\\"lastMessageAt\\\" DESC
LIMIT 60
\""
```

Dacă rezultatul e gol → nu e nimic de auditat. Loghează „0 conversații" (poți insera un
rând marker în chat_audit_log dacă vrei, opțional) și OPREȘTE-TE fără deploy.

> Plafon 60 conversații/rulare ca să nu exploadeze contextul. Dacă ar fi mai multe,
> prioritizează cele cu `has_review=true`, apoi cele mai recente, și loghează câte ai sărit.

---

## Pas 2 — Trage datele fiecărei conversații (în paralel)

Pentru fiecare `conversationId` selectat, trage transcriptul + tool call-urile AI. Rulează
batch-uri în paralel (mai multe `ssh` deodată):

```bash
# Transcript
ssh VPSIonos "docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -t -A -F'>>' -c \"SELECT \\\"authorRole\\\", \\\"messageType\\\", COALESCE(LEFT(body,800),'') FROM chat_messages WHERE \\\"conversationId\\\"='<ID>' AND \\\"deletedAt\\\" IS NULL ORDER BY \\\"createdAt\\\" ASC\""

# Tool calls AI (ce a apelat agentul + ce a primit)
ssh VPSIonos "docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -t -A -F'|' -c \"SELECT \\\"toolName\\\", LEFT(input::text,200), LEFT(output::text,160) FROM ai_tool_calls WHERE \\\"conversationId\\\"='<ID>' ORDER BY \\\"createdAt\\\" ASC\""
```

Dacă o conversație are review(uri) manual(e), trage și comentariile (sunt semnal prioritar):
```bash
ssh VPSIonos "docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -t -A -F'|' -c \"SELECT id, rating, category, COALESCE(comment,'') FROM conversation_reviews WHERE \\\"conversationId\\\"='<ID>' AND resolved=false\""
```

Pentru suspiciuni de regenerare melodie, trage și statusul generărilor clientului:
```bash
ssh VPSIonos "docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -t -A -F'|' -c \"SELECT g.id, g.status, g.\\\"recipientName\\\", LEFT(g.lyrics,120), LEFT(g.\\\"customLyrics\\\",120), g.\\\"freeRemakeUsedAt\\\", g.\\\"createdAt\\\" FROM generations g JOIN conversations c ON (c.\\\"userId\\\"=g.\\\"ownerUserId\\\" OR c.\\\"guestId\\\"=g.\\\"ownerGuestId\\\") WHERE c.id='<ID>' ORDER BY g.\\\"createdAt\\\" DESC LIMIT 4\""
```

---

## Pas 3 — Detectează problemele (pe categorii)

Citește fiecare transcript ca un om atent. Caută TIPARELE de mai jos. Marchează pentru
fiecare conversație: ce probleme are + dacă sunt de **prompt** (rescrie instrucțiunea), de
**cod/guard** (modifică logica) sau **fapt lipsă** (`ai_memory`). Prioritizează tiparele care
se repetă la mai multe conversații.

| Categorie | Cum o recunoști în transcript | Unde se rezolvă |
|---|---|---|
| **Mesaje repetitive / fraze repetate** | AI trimite același mesaj (sau aproape) de 2+ ori; mesaje de mulțumire/închidere în serie; recapitulări identice | Guard anti-dup în `handleSendMessage` (textOverlap) + reguli de ton din prompt |
| **Regenerare fără schimbarea versurilor** | User cere „schimbă versul X" / „modifică strofa" → melodia se regenerează dar versurile rămân la fel SAU se rescriu complet de la zero (pierd versurile aprobate) | ⚠️ Vezi secțiunea REGENERARE de mai jos — bug de cod confirmat |
| **Email re-cerut** | Userul a dat email-ul mai sus, dar AI îl mai cere o dată / nu-l recunoaște | ETAPA 2.7 + wizard_update email handling + `conv.email` persistence |
| **Prea multe mesaje** | Conversație umflată inutil — AI pune întrebări redundante, nu avansează, repetă pași | Reguli de flow (anti-buclă 24/25), ETAPA-le, max mesaje per turn |
| **Escaladare greșită** | AI escaladează la om degeaba (refund pe comandă neplătită, buclă falsă pe info nouă) | Reguli 17/22/23/29 + detecția de buclă sterilă din `handleSendMessage` |
| **Cod promo** | User dă un cod și AI emite altul / nu aplică reducerea; reducere care nu ajunge pe link | `apply_user_code`, `findActivePromoCode`, `quote_price`, regula 28 |
| **Link plată** | Link trimis de 2 ori / nu e trimis deloc / sume greșite | `wizard_finalize`, `findReusablePaymentLink`, `resend_payment_link` |
| **Pachete** | AI nu prezintă corect pachetele / cotează greșit | ETAPA 5.5, `chatPackageUpsellRo` în packages.ts |
| **Ton / inventat** | AI sună robotic, inventează prețuri/politici, promite ce nu poate | REGULI DE TON, ai_memory, reguli „NU inventa" |

### REGENERARE versuri — bug de cod cunoscut (investighează ÎNTÂI, apoi fixează)

Fluxul (confirmat 2026-06-17): user cere modificare în chat → `handleRequestModification`
(`ai-chat-agent.service.ts`) salvează DOAR textul `changes` în `wizardState.modification` +
payload payment_link (`modificationChanges`). După plată, `markPaymentLinksAsPaid`
(`chat.service.ts`, ~linia 1104-1157) cheamă `generations.adminRegenerate(genId, { target:
'overwrite', lyricsMode: 'rewrite', edits: { message: base + "MODIFICĂRI: " + changes } })`.

`resolveRegenLyrics` (`generations.service.ts`) cu `lyricsMode:'rewrite'` returnează `null` →
AI rescrie versurile DE LA ZERO din `message`. Consecințe:
- versurile aprobate anterior de client (`wizardState.data.customLyrics` / `generation.customLyrics`)
  se pierd complet;
- modificarea punctuală („schimbă DOAR versul 2") se diluează în mesaj → writer-ul poate să
  n-o aplice fidel sau să schimbe și restul.

**Înainte de fix**: confirmă pe ≥1 conversație reală (compară `lyrics`/`customLyrics` din
`generations` cu ce a cerut userul). **Fix sigur, minim**: în `markPaymentLinksAsPaid` (și
calea de free remake), când există versuri custom aprobate pentru acea generație, pasează-le
explicit: `lyricsMode: 'custom'` + `customLyrics: <versuri existente>` cu instrucțiunea de
modificare punctuală aplicată peste ele; altfel păstrează `rewrite` dar întărește mesajul ca
modificarea să fie respectată. Typecheck obligatoriu. Dacă fix-ul iese din zona „minim sigur"
→ loghează `needs_human` și alertează (vezi mai jos), nu improviza arhitectură nouă automat.

---

## Pas 4 — Implementează fix-urile

Modifică `ai-chat-agent.service.ts` (și `packages.ts` / `chat.service.ts` / `generations.service.ts`
dacă e nevoie). Reguli (la fel ca improve-ai-chat):
- Fix-uri additive și prudente la prompt — nu rupe etapele/regulile existente.
- Lasă comentariu scurt în cod DOAR pentru bug-uri non-evidente, cu data + conv id
  (ca celelalte „BUG observat <dată> conv <id>" din prompt).
- Fapt nou (preț, politică) → preferă `ai_memory` aprobat în loc de hardcodare în prompt.
- Schimbări de entitate → respectă `CLAUDE.md §6.2` (additive=safe; drop/rename=INTERZIS aici).

---

## Pas 5 — Typecheck (GARD)

```bash
cd "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou/apps/api" && npx tsc --noEmit
```
Dacă ai atins web/admin, rulează și acolo. **Dacă pică și nu repari curat → `git checkout --`
pe fișierele atinse, NU deploya, loghează eșecul.**

---

## Pas 6 — Deploy autonom (FĂRĂ confirmare)

Doar dacă `git status` arată modificări ȘI typecheck a trecut:

```bash
cd "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou" && git add -A && git commit -m "fix(ai-chat): audit automat conversații — <sumar scurt probleme>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" && make deploy-api
```
(`make deploy` dacă ai modificat și web/admin.) `make deploy-api` face backup pre-deploy
automat + health check pe cele 3 domenii. Verifică în output că health-ul e ✓. Dacă pică,
loghează `deploy_unhealthy` și (opțional) `alert_admins` prin endpoint-ul intern.

Dacă NU ai făcut nicio modificare (conversațiile erau curate) → NU deploya. Doar loghează
auditul.

---

## Pas 7 — Tracking + marcare review-uri

Pentru FIECARE conversație auditată, inserează un rând în `chat_audit_log` (așa nu o reiei
până nu primește mesaje noi / review nou):

```bash
ssh VPSIonos "docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -c \"
INSERT INTO chat_audit_log (\\\"conversationId\\\", \\\"siteId\\\", \\\"lastMessageAtSeen\\\", \\\"messageCount\\\", \\\"issuesFound\\\", \\\"actionsTaken\\\", \\\"deployTriggered\\\")
VALUES ('<ID>', <siteId-or-NULL>, '<lastMessageAt>', <count>, '<json>'::jsonb, '<ce ai făcut>', <true|false>)
\""
```
(`<siteId-or-NULL>`: pune `'uuid'` sau `NULL`. `<json>`: ex. `[{\"cat\":\"repetitive\",\"fixed\":true}]`.)

Marchează review-urile manuale pe care le-ai adresat ca rezolvate (DOAR cele adresate):
```bash
ssh VPSIonos "docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -c \"UPDATE conversation_reviews SET resolved=true, \\\"resolvedAt\\\"=NOW() WHERE id IN ('<id1>','<id2>')\""
```
Dacă un review e neclar/contradictoriu, lasă-l `resolved=false` și menționează-l în raport.

---

## Pas 8 — Raport final

Printează un sumar scurt:
- câte conversații auditate, câte aveau probleme, pe ce categorii (cu tipare repetate evidențiate);
- ce fix-uri ai făcut (fișier + ce s-a schimbat);
- deploy: DA (+ commit hash + health) / NU (curat) / BLOCAT (typecheck/deploy eșuat — de ce);
- câte review-uri manuale ai rezolvat;
- orice `needs_human` (bug-uri prea riscante pentru fix automat) — descrie-le clar.

---

## Note

- Review-urile sunt per-site (`siteId`), dar promptul Irinei e partajat. Fix specific unui
  singur site → `ai_memory` cu `siteId` setat, nu promptul global.
- Nu șterge review-uri — doar `resolved=true` (rămân ca istoric).
- Nu duplica logica: dacă o problemă e DEJA acoperită de o regulă existentă în prompt dar
  AI tot greșește, întărește regula / mută detecția în cod (guard), nu adăuga a 3-a regulă
  redundantă.
- E ok să rulezi capăt-la-capăt fără să te oprești. Singurul moment în care NU deployezi:
  zero modificări, sau typecheck/deploy eșuat.
