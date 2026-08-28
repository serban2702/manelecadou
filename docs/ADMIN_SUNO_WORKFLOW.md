# Configurare site nou — de la zero

Secvența exactă, în ordine.

---

## 0. Settings globale (o singură dată per platformă)

`Admin → Settings`

| Cheie | Valoare |
|---|---|
| `SUNO_API_KEY` | token de la sunoapi.org |
| `SUNO_MODEL` | `V5_5` |
| `OPENAI_API_KEY` | token OpenAI |

---

## 1. Selectează site-ul

Dropdown sus-dreapta în admin. Tot ce urmează se aplică site-ului selectat.

---

## 2. Tab „Suno & Stripe" → secțiunea Suno / OpenAI

**Lyrics (OpenAI)**

| Câmp | Ce pui |
|---|---|
| `writerSystemPrompt` | Personalitatea scriitorului AI („Ești un lăutar român autentic...") |
| `writerUserTemplate` | Template cu `{{recipientName}}`, `{{style}}`, `{{occasion}}` etc. |
| `criticSystemPrompt` | Rafinorul — ajustează tonul, ritmul, autenticitatea |
| `criticUserTemplate` | Template critic |
| `lyricsLocale` | Limba versurilor (default: locale-ul site-ului) |

**Audio (Suno)**

| Câmp | Ce pui |
|---|---|
| `basePrompt` | ADN-ul sonor al site-ului — tag-uri Suno comune tuturor stilurilor |

---

## 3. Tab „Categorii & Mostre" → Voci

**3a. Completează câmpurile**

| Câmp | Ce pui |
|---|---|
| `gender` | ♂ sau ♀ — **obligatoriu**, altfel Suno ignoră vocea |

**3b. Generează mostra audio**
- Buton **Generează** → așteaptă 2–3 min.
- Ascultă → dacă nu e bună, ajustezi `gender` / `negativeTags` pe stil → **Regenerează**.
- Mostra trebuie să aibă `sunoAudioId` vizibil în card — fără el nu poți face Persona.
- Mostrele generate cu **Upload manual** nu au `sunoAudioId` → nu pot fi sursă pentru Persona. Regenerează-le prin butonul Generează.

**3c. Generează Persona**
- Buton **Generează persona** în cardul vocii.
- Opțional: descriere custom, segment vocal (10–30s din mostră).
- Efectul: Suno copiază timbrul + ornamentele vocale din mostră în **toate** generările cu vocea respectivă. Fără persona → Suno cântă cu o voce random.
- Un `audioId` = un singur persona. Dacă vrei altul: regenerează mai întâi mostra (obții `audioId` nou), apoi generează persona din nou.

---

## 4. Tab „Categorii & Mostre" → Stiluri

Pentru fiecare stil, deschizi rândul (▼) și completezi:

| Câmp | Valoare recomandată |
|---|---|
| `sunoPrompt` | Tag-uri Suno specifice stilului — override peste `basePrompt` |
| `styleWeight` | `0.7` (0.6–0.8 = sweet spot; 1.0 → mecanic) |
| `weirdnessConstraint` | `0.2` (conservator) |
| `negativeTags` | `pop, edm, trap-rap, autotune-pop, generic dance` |
| `lyricsHint` | Hint pentru writer („versuri de pahar", „romantic pur") |

Apoi generezi mostra fiecărui stil — la generare **alege vocea** (preferabil una cu Persona generat).

**Personalizare mostră (opțional, înainte de Generează):**
- „Nume destinatar" — apare în versuri ca persoana cântată; lasă gol = generic fără nume
- „Dedicație" — „de la X" în deschidere
- „Hint AI versuri" — instrucțiune suplimentară pentru writer
- „Prompt Suno temporar" — înlocuiește `sunoPrompt` salvat doar pentru această generare (nu se salvează)

---

## 5. Tab „Categorii & Mostre" → Ocazii

Doar `id`, `nm`, icoană SVG. Nu afectează audio-ul direct.

---

## 6. Test final

Deschide `/studio` pe web → generează o manea cu (orice stil + voce cu Persona) → verifică audio-ul.

---

## Referință rapidă: cine controlează ce

| Aspectul piesei | Câmpul |
|---|---|
| Limba versurilor | `lyricsLocale` + `writerSystemPrompt` |
| Stilul versurilor | `lyricsHint` pe stil |
| Instrumentația | `basePrompt` + `sunoPrompt` per stil |
| Strictețea stilului | `styleWeight` (0.6–0.8) |
| Ce să excludă | `negativeTags` |
| Registrul vocal ♂/♀ | `gender` pe voce |
| Timbrul / accentul vocal | `sunoPersonaId` (generat din mostră) |

---

## Erori comune

| Eroare | Cauză | Fix |
|---|---|---|
| `music title cannot exceed 80 characters` | Titlul generat depășește limita Suno | Fix aplicat în cod (limita e 75 cu marjă) |
| Cuvântul „Demo" apare în versuri | `recipientName` lipsă → fallback era „Demo" | Fix aplicat; acum fallback = gol (fără nume specific) |
| Toate vocile sună la fel | Nicio voce nu are Persona generat | Generează Persona pentru fiecare voce |
| Piesa sună a pop / EDM | `styleWeight` mic + `negativeTags` lipsă | `styleWeight=0.7` + adaugă `negativeTags` |
| Persona eșuează cu 400 | Mostra fără `sunoAudioId` (upload manual sau veche) | Regenerează mostra prin buton Generează |
