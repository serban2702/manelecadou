# 12 — Prompturi Claude Design

> Șabloane de prompt pe care le lipesc în Claude Design ca să prototipez UI-ul fiecărui site. Scopul: site-urile arată ca o **familie coerentă** (aceeași calitate, aceleași pattern-uri de UX, mobile-first) dar **distincte ca brand** (culori, ton, personalitate per produs). Completez doar variabilele `{{...}}` din brief (vezi `11`).

---

## 1. Reguli comune (le includ în orice prompt de design)

Aceste constrângeri rămân constante peste toate proiectele — ele dau „semnătura" de calitate:
- **Mobile-first absolut.** Designul se gândește pe telefon întâi (majoritatea traficului e mobil, din in-app browsere TikTok/Instagram). Desktop e adaptare, nu invers.
- **Wizard pas-cu-pas** cu stepper clar, un singur focus pe ecran, CTA principal **sticky jos** pe mobil, butoane mari (≥44px), scroll-to-top la schimbarea pasului.
- **Conversie peste tot:** preț vizibil din timp, trust signals (recenzii, exemple reale), zero fricțiune la checkout (plată inline), microcopy cald orientat pe emoție/cadou.
- **Stări vizibile:** skeletons la load, feedback la eroare clar (nu coduri tehnice), preview generos al produsului.
- **Accesibil & rapid:** contrast bun, font ≥16px pe inputuri (fără zoom iOS), media lazy.
- **Pagini necesare:** landing (hero + cum funcționează + exemple + testimoniale + preț + FAQ), wizard, success, (opțional) widget chat.

---

## 2. Prompt master (șablon)

> Lipesc asta în Claude Design, completând din `PRODUCT-BRIEF.md`:

```
Proiectează un site de tip „cadou generat de AI" pentru „{{NUME}}".

PRODUS: {{esența — ce primește clientul, ex. clip video în care animalul vorbește}}.
EMOȚIE: {{emoția vândută — ex. surpriză + râs + „trebuie să arăt tuturor"}}.
PUBLIC: {{cine cumpără, de pe ce canal}}.
BRAND: ton {{cald/hazliu/solemn}}; stil vizual {{3-5 cuvinte}}; paletă {{culori}};
       anti-exemple (ce să eviți): {{ce NU vrem}}.

CERINȚE DE STRUCTURĂ:
- Mobile-first. Landing: hero cu propunere clară + CTA, „cum funcționează" în 3 pași,
  galerie exemple reale, testimoniale, prețuri ({{pachete}}), FAQ, footer.
- Wizard de comandă pas-cu-pas: {{pașii din rețetă/brief}}. Stepper sus, un focus per ecran,
  CTA „Continuă" sticky jos pe mobil, validare blândă (highlight, nu butoane gri).
- Checkout inline (plată pe loc, fără redirect care sperie).
- Pagină de preview al rezultatului ({{audio/video/text}}) + livrare.

STIL: premium dar prietenos, conversie-first, ca o familie de site-uri de cadouri AI de calitate.
Dă-mi landing + toți pașii wizardului + ecranul de preview, pe mobil și desktop.
```

---

## 3. Note de adaptare per tip de produs

Variabilele de mai sus se schimbă, dar pattern-ul rămâne. Accente specifice:

- **Muzică populară cadou** — hero cu player de sample, galerie audio, voci/stiluri ca alegeri vizuale (cards cu preview). Ton festiv, cald.
- **Animăluțul Vorbăreț** — hero cu un clip exemplu care vorbește (autoplay mut + tap pentru sunet), upload de poză ca pas-vedetă (mare, prietenos), ton hazliu/jucăuș, optimizat vizibil pentru „share pe TikTok".
- **Rugăciunea-ta** — sobru, cald, tipografie elegantă, paletă liniștită; fără gimmicks; accent pe respect și pe textul frumos formatat. Preview = text îngrijit + audio opțional.
- **Video cadou** — cinematic, galerie video puternică, alegere de stil/temă vizuală; accent pe rezultatul emoționant.
- **Horoscop** — mistic dar curat (nu kitsch), formular de date naștere prietenos, posibil layout de abonament (nu doar one-shot), hartă natală vizuală ca „wow".

---

## 4. Workflow cu Claude Design
1. Completez șablonul master din brief.
2. Generez în Claude Design, iterez vizual până îmi place.
3. Export prototipul → îl dau lui Claude Code împreună cu `PLATFORM_BLUEPRINT/` + `PRODUCT-BRIEF.md`.
4. Agentul implementează frontendul fidel design-ului, respectând standardele de UX din `03`.

> Pe măsură ce fac mai multe site-uri, salvez prompturile care au mers bine ca preset-uri reutilizabile (un fișier per tip de produs), ca să nu repornesc de la zero.
