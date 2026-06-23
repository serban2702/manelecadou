# 05 — Chat & agent AI: zona NEstandardizată (direcții per proiect)

> Spre deosebire de restul platformei, chatul **nu e standardizat**. Diferă mult de la proiect la proiect: unele vor un agent de vânzări complet care comandă din chat (ca Irina la Manele Cadou / Diana la Melodia Ta), altele vor doar un asistent care răspunde la întrebări despre site. Aici descriu **infrastructura comună** (mereu la fel) + **direcțiile** între care aleg per proiect. La onboarding (vezi `08`) decid care direcție.

---

## 1. Infrastructura comună (identică indiferent de direcție)

Dacă proiectul are chat, scheletul e mereu același (din Manele Cadou + Melodia Ta):
- **`conversations`** — thread per client (user sau guest), status, `aiMode` (manual/suggest/auto), presence enriched (ce pagină, ce device, chat deschis/închis, online de cât timp, IP), assignment admin, `wizardState` jsonb.
- **`chat_messages`** — `authorRole` (user/admin/system/ai), `messageType` (text/image/file/payment_link/song_preview/system/ai_suggestion), `payload` jsonb, delivery+read receipts (WhatsApp-style), atașamente, proveniență AI.
- **Realtime Socket.IO** — mesaje live, presence, force-open chat din admin, delivery/seen ACK.
- **Web Push admin** (VAPID + Service Worker) — notificare nativă la mesaj nou.
- **Atașamente** — upload imagini/PDF, render în chat.
- **Audit AI** (`ai_tool_calls`) + **memorie** (`ai_memory`, fapte aprobate care intră în system prompt) + **review-uri** (`conversation_reviews`) + **KB** (`kb_entries`).

Asta nu se schimbă. Ce se schimbă e **cât de mult face agentul**.

---

## 2. Direcțiile posibile (aleg una per proiect)

### Direcția A — Fără chat AI (sau doar chat uman)
Cel mai simplu. Widget de chat care merge la admin (răspund eu/echipa) sau deloc. Fără agent AI, fără tool-calling. Potrivit pentru produse simple sau lansări rapide unde nu vreau complexitate.

### Direcția B — Asistent informativ (info-only)
Agentul AI răspunde **doar la întrebări despre site/produs** (preț, livrare, cum funcționează, garanție), folosind KB + memorie aprobată. **Nu** comandă, **nu** trimite linkuri de plată, **nu** generează produsul. Dacă userul vrea să cumpere, îl ghidează spre wizard. Escaladează la om când nu știe. Risc minim, util pentru reducerea întrebărilor repetitive. Mod recomandat: `suggest` la început (eu aprob răspunsurile), apoi `auto`.

### Direcția C — Agent de vânzări complet (ca Irina / Diana)
Agentul poate duce clientul prin **toată comanda din chat**: colectează datele (destinatar, mesaj, ocazie, stil, voce), inferează automat ce lipsește (stil/voce din context), generează versuri/preview, **trimite link de plată** (gated pe aprobare admin în settings), iar după plată declanșează generarea și livrarea. Tool-calling complet:
- `search_memory` / `search_kb`, `send_message`, `quote_price_with_offer`, `create_payment_link` / `resend_payment_link`, `generate_lyrics` (input client folosit literal), `request_modification` (refacere gratuită 1× dacă e greșeala noastră, altfel contra cost), `start_new_order`, `force_open_chat`, `escalate_to_human`, `alert_admins`, `inspect_customer_data` (diagnostic intern, nu se expune în chat).
- Moduri: `manual` (AI tace) / `suggest` (AI propune, admin aprobă/editează/respinge — card în admin) / `auto` (AI răspunde singur, cu rate-limit și plată gated pe aprobare).
- Hardening: cap de mesaje per conversație (resetat la plată), delay uman 2-6s pe mesaje auto, follow-up automat când userul tace (cron, cap 2/fereastră), alerte email+push la escaladare/buclă/cap atins.
- **Training loop:** cron nightly extrage fapte din conversațiile rezolvate → review queue în admin → aprob → intră în system prompt. Plus review-uri pe conversații (good/bad + categorie) pentru tuning. Skill dedicat (`improve-ai-chat`) care analizează feedback-ul și implementează fix-uri.

---

## 3. Cum decid (la onboarding)

Întrebări care fixează direcția (detaliate în `08`):
- Vreau ca userul să **poată comanda din chat**, sau doar să primească informații?
- Agentul poate **trimite linkuri de plată**? Cu aprobare admin sau automat?
- Agentul poate **genera/modifica produsul** (versuri, re-roll), sau doar vorbește?
- Pornesc pe `suggest` (eu aprob) sau direct `auto`?
- Ce **persona** are agentul (nume, ton, limbă)? (Irina = manele, Diana = Melodia Ta.)
- Ce **canale** are: doar chat web, sau și email/SMS/WhatsApp în același inbox unificat?

**Recomandare implicită:** pornesc pe Direcția B sau C în mod `suggest`, ca să acumulez memorie și să văd cum răspunde înainte să-l las pe `auto`. Plata rămâne mereu gated pe aprobare admin la început.

---

## 4. System prompt brand-aware (comun)

Indiferent de direcție, agentul primește în system prompt: numele site-ului, limba, prețurile din DB, tagline, support email, plus faptele aprobate din `ai_memory` și hit-urile relevante din KB. Asta vine din settings (editabil din admin), nu hardcodat — ca să nu halucineze prețul și să fie consistent cu brandul fiecărui proiect.
