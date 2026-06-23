# 10 — Rețete de produs

> O rețetă = un tip de produs pre-completat. În loc să răspund la cele 42 de întrebări din `08` de la zero, pornesc de la rețeta tipului de produs (deja ~80% completată) și confirm/ajustez doar ce diferă. Fiecare rețetă fixează `ProductPlugin`-ul (vezi `02` §7): provider AI, pașii de wizard, preview-ul, pipeline-ul, prețuri-tip, direcția de chat, capcanele.

## Cum se folosesc
1. Aleg tipul de produs → deschid rețeta.
2. Scriu **Product Brief**-ul (vezi `11`) pe baza ei — acolo blochez viziunea/brandul.
3. Agentul citește rețeta + brief-ul + blueprint-ul și sare peste întrebările deja acoperite; întreabă doar deciziile deschise din rețetă.
4. Restul = workflow-ul din `07` (bootstrap → buclă autonomă → check final).

## Rețete disponibile
| Tip | Fișier | Provider central | Output |
|---|---|---|---|
| Muzică populară cadou | `muzica-populara-cadou.md` | Suno + LLM (lyrics) | audio |
| Animăluțul Vorbăreț | `animalutul-vorbaret.md` | image→video talking + TTS | video |
| Rugăciunea-ta | `rugaciunea-ta.md` | LLM + TTS (opțional) | text + audio |
| Video cadou | `video-cadou.md` | image/text→video | video |
| Horoscop / astrologie | `horoscop.md` | calcul astro + LLM | text (+ audio) |

## Structura unei rețete (template)
- **Esența** — one-liner + emoția vândută.
- **ProductPlugin** — `kind`, provideri AI recomandați (+ alternative), de unde iau cheile.
- **Wizard** — pașii + câmpurile (obligatorii marcate).
- **Pipeline de generare** — pași, async/poll, câte variante, retry.
- **Preview** — cum arată în frontend + admin.
- **Prețuri-tip & pachete.**
- **Chat** — direcția din `05`.
- **Specific & capcane** — moderare, cost, sensibilitate, edge-cases.
- **Decizii deschise** — ce trebuie să confirm explicit.

> Provider-ele AI evoluează rapid. Rețetele dau recomandarea curentă + alternative; la start agentul verifică ce e disponibil/cel mai bun raport preț-calitate și confirmă cu mine înainte de a fixa providerul.
