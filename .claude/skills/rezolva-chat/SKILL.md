---
name: rezolva-chat
description: Rezolvă on-demand problema unui client dintr-o conversație de chat de producție — investighează, răspunde SCURT ca operator uman („Daniel") și repară piesa (regenerare/modificare conform cerințelor). Folosește când userul cere „rezolvă clientul X", „rezolvă conversația cu Y", „vezi ce a pățit clientul de pe chat și rezolvă", „preia conversația lui Z".
argument-hint: "<email / guest:ID / conversationId / nume>"
---

# Rezolvă client din chat

Preia o conversație de chat problematică, răspunde clientului ca **operator uman** și
repară piesa exact cum a cerut clientul. Codifică fluxul manual dovedit (investigare →
mesaj scurt de operator → regenerare → livrare).

## ⚠️ REGULI DE COMUNICARE (cele mai importante — citește-le întâi)

Când scrii clientului în chat:

1. **SCURT și la obiect.** Max 2-3 fraze pe mesaj. FĂRĂ paragrafe lungi, FĂRĂ liste cu
   buline, FĂRĂ explicații tehnice întinse. Clientul vrea soluția, nu un eseu.
2. **Te prezinți ca „Daniel".** „Bună, sunt Daniel de la Manele Cadou." La mesajele
   următoare nu mai repeta numele.
3. **NICIODATĂ numele real al ownerului** (vezi memoria `never-say-owner-name`). Doar
   „Daniel" sau „echipa Manele Cadou".
4. **Cald + onest.** Recunoaște scurt greșeala („ai dreptate, îmi pare rău"), spune ce
   faci, dă un timp („revin în 10-15 min"). Fără să te aperi, fără promisiuni de refund
   (aia o decide ownerul).
5. **Onest despre ce NU se poate** (ex. negativ extern al unei piese, voce reală a unui
   artist) — reformulează spre ce se poate, nu inventa.

Contrast (ce să EVIȚI vs ce vrem):
- ❌ Prea lung: „Bună! Am verificat tot personal ✅ Vestea bună: … [5 rânduri] … Două
  lucruri, cinstit: 1) … 2) … [încă 6 rânduri]"
- ✅ Bun: „Bună, sunt Daniel de la Manele Cadou. Am văzut ce s-a întâmplat și ai dreptate —
  o refac acum corect (cu X și Y) și revin în 10-15 min. 🙏"

## Mediu de execuție

- **Local (Mac)**: DB → `ssh VPSIonos 'docker exec manele-postgres-1 psql -U manelecadou -d manelecadou -c "…"'`;
  API admin → `ssh VPSIonos 'docker exec manele-ops-1 api-admin GET|POST /api/... [json]'`.
- **Container ops (VPS)**: `psql` și `api-admin` direct (fără ssh/docker exec).
- **JSON cu diacritice/emoji**: construiește-l cu `python3 -c 'import json; print(json.dumps({...}, ensure_ascii=False))'`
  într-un fișier, apoi `cat file | ssh VPSIonos 'docker exec -i manele-ops-1 sh -c "cat > /tmp/x.json"'`
  și `api-admin POST <path> "$(cat /tmp/x.json)"`. NU pune diacritice/ghilimele direct în shell.

## Pași

### 1. Găsește clientul + conversația
Acceptă email, `guest:<prefix>`, conversationId sau nume. Prefixul de guest:
```sql
SELECT id, email, "siteId", "createdAt" FROM guest_sessions
WHERE id::text LIKE '<prefix>%' OR email ILIKE '%<termen>%' ORDER BY "createdAt" DESC LIMIT 5;
-- users, dacă e cont:
SELECT id, email, name FROM users WHERE email ILIKE '%<termen>%' LIMIT 5;
-- conversația:
SELECT id, "aiMode", "createdAt" FROM conversations WHERE "guestId"='<id>' OR "userId"='<id>';
```
Atenție: un client poate avea mai multe guest-uri (device-uri diferite). Comanda reală poate
fi sub alt guest decât cel din conversația curentă — caută după email în `guest_sessions`.

### 2. Citește transcriptul + comanda
```sql
SELECT "authorRole", LEFT(COALESCE("bodyRo",body),320) AS msg, "messageType", "createdAt"
FROM chat_messages WHERE "conversationId"='<convId>' AND "deletedAt" IS NULL ORDER BY "createdAt" ASC;

SELECT id, status, style, occasion, "recipientName", "dedicatorName", "voiceArtist",
       "packageTier", "paidUnlocked", "retryCount", "freeRemakeUsedAt", message, dedication,
       LEFT(lyrics,120) FROM generations WHERE "ownerGuestId"='<id>' OR "ownerUserId"='<id>'
ORDER BY "createdAt" DESC;
```
Diagnostichează concret: **ce a cerut clientul** (nume, poveste, replici, stil, voce, negativ?)
și **ce a ieșit prost** (nume greșit, versuri generice fără detalii, voce/ritm nepotrivit,
promisiune imposibilă). Verifică și `SELECT lyrics FROM generations WHERE id='<gid>'` complet
dacă problema e de conținut.

### 3. Trimite un mesaj SCURT de operator (Daniel)
Verifică că `conversations.aiMode='manual'` (ca AI-ul să nu răspundă peste tine); dacă nu:
`api-admin POST /api/admin/chat/conversations/<convId>/ai-mode '{"mode":"manual"}'`.

Mesaj de preluare (2-3 fraze, vezi regulile de sus). Endpoint:
`POST /api/admin/chat/conversations/<convId>/messages` cu `{"body":"…"}`.

### 4. Repară piesa
Pentru regenerare/modificare folosește pattern-ul din **/ops-regen**:
- Nume/relație/versuri greșite → `lyricsMode:"custom"` cu versurile corecte (scrise de tine,
  incluzând TOT ce a cerut clientul: poveste, replici, nume copil, mulțumiri).
- Stil/ritm nepotrivit → `edits.style` (o cheie reală din `site.suno.stylePromptMap`; vezi
  `SELECT jsonb_object_keys(suno->'stylePromptMap') FROM sites WHERE id='<siteId>'`).
- Voce greșită → `edits.voiceArtist` (`male`/`female`). Atenție la perspectiva versurilor:
  dacă „eu" din versuri e o femeie (soție→soț), vocea corectă e `female`.

```bash
# regenerare ca variație (non-distructiv), apoi promovare:
api-admin POST /api/admin/generations/<gid>/regenerate '{"target":"new_track","lyricsMode":"custom","customLyrics":"…","edits":{"voiceArtist":"female","style":"pahar"},"label":"fix"}'
# monitorizează până succeeded (1-3 min), apoi:
api-admin POST /api/admin/generations/<variationId>/promote '{"slot":"main","notify":true}'
```
`promote {notify:true}` copiază audio-ul în comanda principală (pagina `/m/<gid>` se
actualizează), trimite email clientului și postează în chat. NB: promote copiază doar audio-ul
— dacă ai schimbat `voiceArtist`/`recipientName`, corectează și metadata comenzii principale
cu un UPDATE (altfel o viitoare regenerare revine la valoarea veche).

### 5. Confirmă clientului (scurt)
După promote, un mesaj scurt: ce s-a schimbat + link + „dă refresh". Ex.:
> Gata, am refăcut-o cu vocea corectă și cu tot ce ai cerut. E aici (dă un refresh):
> /m/<gid> — ți-a plecat și pe email. Zi-mi dacă e bine! ❤️

Linkul `/m/<gid>` e același ca înainte → spune explicit „dă refresh", altfel clientul crede
că e tot piesa veche (bug real văzut de 2 ori).

## Reguli de siguranță
- O regenerare consumă credite Suno reale — max 2-3 încercări pe o problemă, apoi escaladează.
- NU promite refund/banii înapoi în chat — semnalează ownerului, el decide.
- La final, raportează ownerului pe scurt: ce era greșit, ce ai schimbat, ce ai trimis clientului.
- Dacă problema e recurentă (aceeași greșeală la mulți clienți), semnaleaz-o ca fix de fond în
  AI (prompt) — vezi **/improve-ai-chat** — nu doar peticul pe conversația curentă.
