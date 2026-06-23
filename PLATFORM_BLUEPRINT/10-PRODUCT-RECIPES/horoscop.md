# Rețetă — Horoscop / Astrologie

## Esența
Citiri astrologice personalizate pe baza datelor de naștere — horoscop personal, compatibilitate de cuplu, hartă natală, previziuni. Diferă de restul: **e mai degrabă serviciu informațional recurent decât cadou one-shot** → potențial de abonament + cadou.

## ProductPlugin
- **kind:** `text` (cu extensie `audio`/`image` opțională)
- **Provideri AI / calcul:**
  - **Calcul astrologic** (determinist, NU AI): bibliotecă de efemeride (ex. Swiss Ephemeris) pentru poziții planetare, case, aspecte din dată/oră/loc naștere. **Asta nu se halucinează — se calculează.**
  - **Interpretare:** LLM (OpenAI/Grok/Claude) primește datele calculate + cere o citire în ton accesibil.
  - Opțional: TTS (citire audio) + imagine hartă natală.
- **Chei:** LLM provider; calculul astro e local (bibliotecă), fără cheie externă.

## Wizard
1. **Tip citire** — horoscop personal / compatibilitate cuplu / hartă natală / previziune (lună/an) — obligatoriu.
2. **Date naștere** — dată + oră (cât mai exactă) + loc (oraș) — obligatoriu (ora contează pentru case). Pentru cuplu: două seturi.
3. **Pentru cine / focus** — sănătate, dragoste, carieră, general.
4. **Format** — text / text + audio / card imagine cu harta.
5. **Plată** (sau abonament).

## Pipeline de generare
- **Calcul astro** (instant, determinist) → **LLM interpretare** (cu validare ton/lungime) → opțional TTS/imagine → livrare.
- Rapid. Pentru abonament: cron lunar care regenerează previziunea și o trimite.

## Preview
- Frontend: citire formatată frumos + (opțional) hartă natală vizuală + audio.
- Admin: datele + citirea + status.

## Prețuri-tip & pachete
- One-shot (o citire) + **abonament** (horoscop lunar/săptămânal) — model recurent, LTV mare. Cadou: „dăruiește o citire / un abonament".

## Chat
- **Direcția B/C.** Agent care explică tipurile de citire, colectează datele de naștere, ghidează spre comandă/abonament.

## Specific & capcane
- **Acuratețea calculului** — folosește efemeride reale; LLM-ul interpretează, NU calculează (altfel halucinează poziții).
- **Disclaimer** „divertisment/auto-cunoaștere", evită promisiuni medicale/financiare.
- **Abonament** = nevoie de management recurent (Stripe subscriptions, nu doar one-shot) — diferență față de celelalte produse.
- Ora/locul naștere lipsă → fallback grațios (citire fără case).

## Decizii deschise
- One-shot, abonament, sau ambele? (Schimbă modelul de plată — Stripe subscriptions.)
- Ce tipuri de citiri în v1.
- Hartă natală vizuală DA/NU.
- Tradiție astrologică (vestică/tropicală default).
