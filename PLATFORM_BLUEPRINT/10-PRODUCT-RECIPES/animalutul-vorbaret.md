# Rețetă — Animăluțul Vorbăreț

## Esența
Userul încarcă o poză cu animalul lui, scrie ce să spună, iar noi îi animăm botul și îl facem să „vorbească" / cânte — un clip amuzant sau emoționant, de dat cadou sau de postat. Produs viral, foarte bun pentru TikTok/Reels.

## ProductPlugin
- **kind:** `video`
- **Provideri AI** (pipeline pe mai multe modele):
  - **Voce (TTS):** ElevenLabs (voci expresive, multilingv) sau alt TTS de calitate. Generează audio-ul din textul userului.
  - **Animare poză → video cu lip-sync:** model image-to-video / audio-driven talking (candidați: Hedra, Kling, Runway, Pika, Google Veo, sau modele de „talking head/animal" audio-driven). Agentul evaluează la start care dă cel mai bun lip-sync pe animale + preț/sec.
  - **Opțional:** pas de pregătire imagine (upscale/crop/segmentare bot) pentru lip-sync mai bun.
- **Chei:** ElevenLabs (consola lor) + provider video (consola lui). Cost mare per secundă video → tracking cost obligatoriu (`ai_provider_calls`).

## Wizard
1. **Upload poză** — obligatoriu. Drag-drop + fallback click (mobil), preview imediat, validare (animal vizibil, rezoluție minimă).
2. **Ce spune / cântă** — text liber (obligatoriu) + alegere: vorbește / cântă / mesaj amuzant / mesaj emoționant.
3. **Voce / ton** — voce TTS + ton (vesel, dulce, hazliu) — obligatoriu.
4. **Add-on-uri** (opțional) — fundal/muzică, durată mai mare, watermark off, format vertical pt Reels.
5. **Plată.**

## Pipeline de generare
- Post-plată: **TTS** (generează audio) → **animare poză cu lip-sync pe audio** (submit async → poll) → post-proces (fundal/muzică/format) → 1-2 variante video → livrare.
- Async cu polling (video durează). Retry pe eșec model.

## Preview
- Frontend: player video, format vertical pe mobil.
- Admin: thumbnail + status + re-roll + acces la poza sursă.

## Prețuri-tip & pachete
- Basic (clip scurt ~10s) / Plus (mai lung + fundal) / Premium (vertical Reels + fără watermark + 2 variante). Marjă atentă (cost video mare).

## Chat
- **Direcția B sau C.** Util pentru help la upload („poza nu merge") și upsell. Comandă din chat = posibil dar mai complex (upload în chat) — poate la v2.

## Specific & capcane
- **Moderare poză obligatorie** — refuz conținut nepotrivit (oameni, conținut explicit). Verificare automată + posibil review.
- **Cost per secundă mare** — limitez durata, monitorizez marja per comandă.
- **Calitatea lip-sync pe animale variază** — testez modelul pe poze reale înainte de lansare; fallback pe stil „cartoon/overlay gură" dacă modelul fotorealist eșuează.
- Upload + storage: poze + video în GCS, signed URLs.

## Decizii deschise
- Ce model video (după evaluare lip-sync + cost).
- Durată max per pachet.
- Vorbește vs cântă (cântatul cere sincronizare muzicală — mai greu).
- Watermark pe varianta gratuită/ieftină DA/NU.
