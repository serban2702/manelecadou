# Rețetă — Muzică populară cadou

## Esența
Melodie de muzică populară personalizată, cadou pentru o persoană dragă. Aproape identic ca mecanică cu Melodia Ta / Manele Cadou — diferă genul muzical, vocile și brandul. **Cel mai simplu de lansat: e portarea unui sistem deja matur.**

## ProductPlugin
- **kind:** `music`
- **Provideri AI:**
  - Audio: **Suno** (sunoapi.org) — întoarce ≥2 variante. Cheie din contul sunoapi.org.
  - Lyrics: **OpenAI** (writer + critic/validare) sau **Grok**. Cheie din platforma respectivă.
- **Reutilizare maximă:** pipeline-ul, modulele și chiar prompturile din Melodia Ta se copiază; se schimbă `basePrompt`, `stylePromptMap`, `voiceMap`, `writerSystemPrompt`, sample-urile de stil/voce (toate în settings-DB).

## Wizard
1. **Ocazie** (zi de naștere, nuntă, botez, aniversare, „doar așa") — obligatoriu.
2. **Poveste / destinatar** — pentru cine (nume obligatoriu), de la cine, detalii/poveste (text liber).
3. **Stil** — sub-genuri de populară (lăutărească, populară de petrecere, doină/baladă, ardelenească etc.) — obligatoriu.
4. **Voce** — masculin/feminin + sample-uri — obligatoriu.
5. **Add-on-uri** (opțional) — variante extra, versiune extinsă, livrare video cu versuri, QR cadou.
6. **Plată** (checkout inline).

## Pipeline de generare
- Pre-plată (opțional, per setare): **versuri** (LLM writer) → **validare/corectare** versuri (LLM critic) → pas de review versuri pentru client. STOP, fără audio.
- Post-plată: **Suno submit async** → poll cron → finalizare → ≥2 variante salvate (`song_variants`) → clientul alege → livrare email/SMS.
- Retry: contoare separate manual vs auto; fonetizare pentru Suno + moderare versuri.

## Preview
- Frontend: player audio cu 2 variante, selecție variantă finală.
- Admin: coloane status pipeline, link variante, re-roll, regenerare versuri.

## Prețuri-tip & pachete
- Basic (1 melodie, 2 variante) / Plus (+ versiune extinsă) / Premium (+ video cu versuri / livrare specială). RON. Recovery activ.

## Chat
- **Direcția C** (agent de vânzări complet, stil Irina/Diana) — merită aici, pentru că poate duce toată comanda din chat. Pornire pe `suggest`, plată gated pe aprobare.

## Specific & capcane
- Moderare versuri (cuvinte interzise, conținut sensibil) înainte de Suno.
- Fonetizare nume/cuvinte pentru pronunție corectă Suno.
- Monitorizare credite Suno cu alertă (cont gol ≈ 10 credite afișate).

## Decizii deschise
- Genul exact + lista de stiluri și voci.
- Brand/nume/domeniu.
- Limbi (RO only sau +piețe vecine).
- Versuri pre-plată DA/NU.
