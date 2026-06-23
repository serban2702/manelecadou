# Rețetă — Video cadou

## Esența
Transformi o imagine (sau o temă/mesaj) într-un scurt videoclip cadou personalizat — o amintire animată, un mesaj vizual, un clip emoționant. Categorie largă; se suprapune parțial cu Animăluțul Vorbăreț, dar aici accentul e pe **scenă/atmosferă vizuală**, nu neapărat pe lip-sync.

## ProductPlugin
- **kind:** `video`
- **Provideri AI:**
  - **image→video** sau **text→video:** Google **Veo**, OpenAI **Sora**, **Kling**, **Runway** Gen-3/4, **Pika**. Agentul alege după calitate/preț/durată la start.
  - Opțional: TTS pentru narațiune + muzică de fundal + text overlay (mesaj).
- **Chei:** provider video + (opțional) TTS/muzică.

## Wizard
1. **Punct de plecare** — upload imagine SAU alege temă/șablon (aniversare, dragoste, felicitare, amintire) — obligatoriu.
2. **Mesaj / poveste** — text care apare/se narează (obligatoriu).
3. **Stil vizual** — (cinematic, vesel, romantic, retro) + format (vertical/pătrat/landscape).
4. **Add-on-uri** — muzică, narațiune voce, durată mai mare, fără watermark.
5. **Plată.**

## Pipeline de generare
- Post-plată: (dacă imagine) pregătire imagine → **submit video async** → poll cron → post-proces (text overlay, muzică, narațiune) → 1-2 variante → livrare.
- Async lung; deadline + retry; cost per secundă ridicat.

## Preview
- Frontend: player video, format ales, descărcare.
- Admin: thumbnail + status + sursă + re-roll.

## Prețuri-tip & pachete
- Basic (clip scurt, watermark) / Plus (mai lung + muzică) / Premium (HD, fără watermark, 2 variante, narațiune). **Marja e cheia** — cost video mare, limitez durata.

## Chat
- **Direcția B/C.** Util la alegerea temei + upsell la durată/HD.

## Specific & capcane
- **Cost & marjă** — cel mai scump produs/sec; calculează marja per pachet, limitează durata, monitorizează `ai_provider_calls` cost.
- **Moderare imagine/temă** obligatorie.
- **Variabilitate calitate** — text→video poate ieși inconsistent; oferă re-roll și setează așteptări corecte în UI.
- Storage video mare → GCS + lifecycle (șterge sursele vechi).

## Decizii deschise
- Pornim de la imagine, de la temă, sau ambele?
- Ce model video (după evaluare).
- Durată max per pachet + politica de watermark.
- Narațiune/muzică în v1?
