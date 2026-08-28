# Prompt-uri pentru Grok / Imagine Generator pentru brand-ul Manele Cadou

> **Site:** manelecadou.ro
> **Vibe:** "Luxury chici / TaraftTV vibe" — auriu cu burgundy, parodic-elegant, exuberant
> **Limbi promptable:** EN (Grok răspunde mai bine în EN la image gen)

---

## 🎨 Paleta de culori (referință pentru toate)

- **Auriu primar:** `#f1c84d` (gold)
- **Auriu deschis:** `#ffe28a` (gold-2)
- **Auriu profund:** `#b07c1e` (gold-deep)
- **Burgundy:** `#5a0d18`
- **Bg dark:** `#0c0707`
- **Cream:** `#fff5dc`
- **Accent rose:** `#ff2d7e`
- **Tipografie:** Cinzel (titluri, serif chic) + Manrope (body, sans-serif)

---

## 1️⃣ LOGO PRINCIPAL — SVG / PNG transparent

**Dimensiune:** 1024×1024 (livrabil) + variante 200×200, 64×64

**Prompt Grok:**
```
Create a luxurious, ornate logo for "Manele Cadou" — a premium AI-generated Romanian manele music studio. The logo should feature:

- A central golden crown (5-point royal crown) as the dominant emblem, rendered in metallic gold gradient (from #fff5cc highlight at top, through #f1c84d, to #b07c1e shadow at bottom)
- Below the crown, the wordmark "Manele Cadou" in elegant serif typography (Cinzel-style), with the same gold gradient
- Optional: small star decorations flanking the crown, golden
- Background: TRANSPARENT (PNG with alpha)
- Style: vector-clean, suitable for scaling, balkan luxury aesthetic, NOT cartoonish, NOT amateurish
- Avoid: text "AI", microphones, music notes (these will go in sub-marks)
- Output: 1024×1024px, transparent background, centered composition with breathing room

Tone reference: imagine an old-world royal seal meets modern boutique. Gold leaf on dark velvet. Premium romantic Balkan brand.
```

**Salvează ca:** `apps/web/public/logo.svg` (sau `.png` cu transparent)

---

## 2️⃣ FAVICON — set complet

**Prompt Grok:**
```
Create a minimalist favicon for "Manele Cadou" — a stylized golden royal crown emblem (no text), rendered in solid gold (#f1c84d) with subtle gradient. The crown should be:

- Bold, recognizable at 16×16 pixels
- 5-point royal crown silhouette
- Solid gold fill, with thin dark outline (#2a1a04) for contrast on light backgrounds
- Centered with minimal padding
- Background: dark burgundy circle (#5a0d18) for the icon variant, or transparent for the SVG

Output 3 variants:
1. 512×512 PNG with dark burgundy circle background
2. 192×192 PNG with dark burgundy circle background
3. 32×32 SVG with transparent background

This will be used as browser tab icon.
```

**Salvează ca:**
- `apps/web/public/favicon.ico` (32×32 ICO)
- `apps/web/public/icon-192.png`
- `apps/web/public/icon-512.png`
- `apps/web/public/icon.svg`

---

## 3️⃣ OG SHARE IMAGE DEFAULT — 1200×630

**Prompt Grok:**
```
Create a luxurious Open Graph share image (1200×630 pixels exactly) for "Manele Cadou" — a Romanian AI manele music generator. The composition:

- Background: deep dark gradient from burgundy (#5a0d18) at top-left to near-black (#0c0707) at bottom-right, with subtle vignette and ornate filigree patterns barely visible (low opacity gold #f1c84d)
- LEFT SIDE (40%): A large rotating vinyl record (golden label center, dark grooves), tilted slightly, with a soft golden glow. The vinyl center label has a small crown.
- RIGHT SIDE (60%): Bold serif title "Manele Cadou" in metallic gold gradient (Cinzel-like serif), positioned at top
- Below title: subtitle in cream color (#fff5dc), sans-serif (Manrope-like): "Fă-i o manea cu numele lui în 90 de secunde"
- Bottom-right corner: small golden badge "1+1 GRATIS · 24,99 lei"
- Top-right corner: small "👑 Studio AI" tag
- Style: opulent, balkan luxury, parodic-yet-elegant, premium

Output: 1200×630 PNG, no transparent background, magazine-quality composition.
```

**Salvează ca:** `apps/web/public/og-default.png`

---

## 4️⃣ HERO BACKGROUND PATTERN (opțional — pentru viitor)

**Prompt Grok:**
```
Create a seamless tileable background pattern (1024×1024) for a luxury Balkan music brand. The pattern features:

- Ornate golden filigree on dark burgundy background
- Repeating motifs: small crowns, music notes (very subtle), and Balkan flora (carnation flowers, oriental scrolls)
- Color: gold (#f1c84d) at ~15% opacity over burgundy (#5a0d18)
- Seamless tiling (left edge matches right, top matches bottom)
- Style: Ottoman-meets-Romanian baroque, ornamental but not busy

Output: 1024×1024 PNG, seamless tile.
```

**Salvează ca:** `apps/web/public/pattern-bg.png`

---

## 5️⃣ EMAIL HEADER LOGO — banner

**Prompt Grok:**
```
Create an email header banner (600×200 pixels) for "Manele Cadou" newsletter. Composition:

- Background: rich burgundy (#5a0d18) gradient with subtle gold filigree at edges
- Centered: golden crown emblem (small) + "Manele Cadou" wordmark in Cinzel-style serif gold
- Below wordmark: tiny tagline "★ Studio AI ★" in cream uppercase
- Optional: thin gold horizontal line beneath, with star at center
- Style: like a classy invitation letterhead

Output: 600×200 PNG, suitable for email rendering (no fancy gradients that break in Outlook).
```

**Salvează ca:** `apps/web/public/email-banner.png`

---

## 6️⃣ MASCOT / CHARACTER — opțional pentru roata norocului

**Prompt Grok:**
```
Design a small whimsical mascot character for "Manele Cadou" — a luxury Balkan AI manele studio. The character is:

- A stylized golden royal crown with eyes and a small smile (anthropomorphic but minimal)
- Wearing tiny gold chains around its base
- Holding a microphone in one "stub" arm
- Color palette: gold + burgundy
- Style: cartoon but luxury, like a chibi mascot but elegant
- Pose: 3/4 angle, friendly waving/winking
- Background: TRANSPARENT

Use cases: mascot for the lottery wheel popup, fun engagement moments. Should feel parodic-elegant, not childish.

Output: 512×512 PNG with transparent background.
```

**Salvează ca:** `apps/web/public/mascot.png`

---

## 📁 Cum mă-i livrezi

Pune fișierele direct în:
```
/Users/serbanrusu/Desktop/ Manele/Manele cadou/manelecadou/apps/web/public/
```

Sau în Downloads și îmi dai calea — le copiez eu.

**Numele exacte așteptate de cod:**
| Asset | Path |
|---|---|
| Logo principal | `logo.svg` (sau `.png`) |
| Favicon ICO | `favicon.ico` |
| Favicon 192 | `icon-192.png` |
| Favicon 512 | `icon-512.png` |
| OG default | `og-default.png` |
| Email banner | `email-banner.png` |
| Mascot | `mascot.png` |

După ce le pui, restartez Next dev (HMR le prinde la următorul reload) și verific în browser că arată corect.

---

## 💡 Tips pentru Grok image generation

1. **Precizează "transparent background"** când vrei SVG/PNG fără fundal
2. **Cere dimensiuni exacte** ("1200×630 pixels exactly") — Grok altfel face square
3. Dacă rezultatul nu e bun, re-run cu "more luxurious / more ornate / more refined" — modelele înțeleg gradele
4. Pentru SVG real (vector, nu raster), Grok n-are output direct — generezi PNG și apoi tracing cu un convertor (ex: vectorizer.ai sau Inkscape) sau folosesc Adobe Illustrator
5. Pentru consistență brand: dacă ești mulțumit de unul, **referențiază-l** în prompt-urile următoare ("matching the style of the logo I just generated")
