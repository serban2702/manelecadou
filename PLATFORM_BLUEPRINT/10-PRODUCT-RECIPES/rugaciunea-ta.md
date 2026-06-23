# Rețetă — Rugăciunea-ta / Rugăciune cadou

## Esența
O rugăciune personalizată — pentru cineva drag, pentru o intenție anume (sănătate, mulțumire, pomenire, ocazie religioasă) — generată cu grijă și ton potrivit, livrată ca text frumos formatat și/sau narată cu o voce caldă. Produs de nișă emoțională/spirituală; **sensibilitatea tonului e totul.**

## ProductPlugin
- **kind:** `text` (cu extensie `audio` opțională)
- **Provideri AI:**
  - Text: **LLM** (OpenAI/Grok/Claude) cu system prompt atent calibrat pe ton respectuos, ne-doctrinar (sau aliniat la o tradiție aleasă: ortodox/catolic/general creștin etc.).
  - Audio (opțional): **TTS** voce caldă/solemnă + fundal muzical liniștit.
- **Chei:** LLM provider + TTS provider.

## Wizard (scurt — nu obosi userul)
1. **Intenție / ocazie** — pentru ce (sănătate, mulțumire, pomenire, botez, nuntă, început de drum) — obligatoriu.
2. **Pentru cine** — nume + relație (obligatoriu nume).
3. **Tradiție & ton** — (opțional dacă vrei general) ortodox/catolic/general + ton (smerit, de mulțumire, de mângâiere).
4. **Detalii** — text liber scurt (ce e în sufletul lui).
5. **Format livrare** — text frumos / text + audio narat / card imagine cu rugăciunea.
6. **Plată.**

## Pipeline de generare
- LLM generează rugăciunea (cu validare/critic pe ton + lungime + corectitudine) → STOP review (opțional pre-plată, scurt) → post-plată: dacă audio, TTS + fundal → livrare.
- Rapid (text e ieftin/instant); audio adaugă un pas async scurt.

## Preview
- Frontend: text formatat frumos (tipografie îngrijită) + player audio dacă e cazul + opțional imagine/card descărcabil.
- Admin: textul + status + posibilitate de editare/regenerare manuală (sensibil — poate vreau să revizuiesc).

## Prețuri-tip & pachete
- Preț mic (text) / mediu (text + audio) / card cadou imagine. Volum mare, preț accesibil. Posibil cadou gratuit/teaser pentru achiziție.

## Chat
- **Direcția B (info-only) recomandat** — agent care explică, mângâie, ghidează spre comandă, dar NU improvizează teologie. Ton calibrat strict. Comandă din chat opțional.

## Specific & capcane
- **Ton și corectitudine — risc reputațional.** System prompt foarte atent; eventual review uman pe primele sute. Evită afirmații doctrinare riscante; rămâi cald și general dacă nu se alege o tradiție.
- Conținut sensibil (pomeniri/deces) — empatie, fără greșeli de nume.
- Moderare pe input (intenții abuzive).

## Decizii deschise
- O singură tradiție sau selecție?
- Audio DA/NU în v1.
- Review uman pe generări la început DA/NU.
- Card imagine descărcabil ca format principal?
