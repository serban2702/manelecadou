---
name: add-email-template
description: Adaugă un șablon nou de email de marketing în platforma manelecadou (registry + render + i18n) și îl testează cu preview. Folosește când userul cere "fă un șablon de email nou", "adaugă un template de marketing", "vreau un email nou pentru ofertă/newsletter", "un email de reducere nou".
argument-hint: <descriere scurtă a șablonului dorit>
---

# Add email template — manelecadou

Adaugă un **șablon nou de email de marketing** care apare automat în admin (`/marketing` → tab „Șabloane" și în dialogul „Campanie nouă") și poate fi folosit și în regulile automate.

Toate șabloanele de marketing trăiesc într-un singur registry TypeScript. NU există generare AI la runtime — șabloanele sunt cod, iar tu (Claude Code) le scrii aici împreună cu userul și le testăm cu preview.

> Citește mai întâi `${CLAUDE_SKILL_DIR}/reference.md` pentru anatomia exactă a unui șablon + checklist.

## Context: $ARGUMENTS

## Fișiere cheie

| Fișier | Rol |
|---|---|
| `apps/api/src/mailer/templates/marketing.ts` | Șabloanele de marketing + i18n + **registry** `MARKETING_TEMPLATES`. Aici adaugi. |
| `apps/api/src/mailer/templates/templates.ts` | `renderBrandedEmail()` + `EmailBranding` (layout brandat reutilizabil). NU edita. |
| `apps/api/src/mailer/templates/template-catalog.ts` | Combină marketing + transacționale pentru admin. Se actualizează automat din registry. |

## Pași

### Pas 1 — Înțelege cererea
Clarifică cu userul (dacă nu reiese din `$ARGUMENTS`):
- **Scopul**: ofertă cu reducere / win-back / newsletter / anunț / altceva.
- **Are cod de reducere?** (card cu cod) — da/nu.
- **Câmpuri editabile de admin?** titlu custom (`customHeadline`), corp custom (`customBody`).
- **Ton & conținut**: ce text vrea în email.
- **Limbi**: RO obligatoriu; restul (bg, sr, tr, el, hr, sl, bs) — traduceri scurte sau fallback EN.

### Pas 2 — Scrie funcția de render
În `apps/api/src/mailer/templates/marketing.ts`:
1. Dacă șablonul are copy fix per limbă, adaugă textele în structurile de i18n (vezi `RO`, `EN`, etc. — replică același shape pentru toate cele 8 locale, sau lasă fallback la `EN`).
2. Scrie `export function <nume>Template(v: MarketingRenderVars): { subject; html; text }`.
   - Folosește `renderBrandedEmail({ subject, preheader, locale, branding, bodyHtml })` pentru layout (logo + footer + branding per site vin gratis).
   - Pentru buton folosește helper-ul local `ctaButton(href, label)`; pentru cardul de cod, `promoCard(...)`.
   - Întoarce ÎNTOTDEAUNA și `text` (versiunea plain-text).

### Pas 3 — Înregistrează în registry
Adaugă o intrare în `MARKETING_TEMPLATES`:
```ts
{
  id: 'snake_case_unic',
  name: 'Nume afișat în admin',
  description: 'Ce face și când se folosește.',
  supports: { promoCode: true, recipientName: true, customHeadline: true /*, customBody*/ },
  render: numeleTemplate,
  sample: { ...SAMPLE_BASE /* override-uri pentru preview */ },
}
```
`supports` controlează ce câmpuri apar în formularul din admin. `sample` e folosit la preview.

### Pas 4 — Typecheck
```bash
cd apps/api && npx tsc --noEmit
```
Repară orice eroare înainte să continui.

### Pas 5 — Testează preview-ul ÎMPREUNĂ cu userul
Două variante:

**A. În admin (recomandat dacă stack-ul rulează):** `/marketing` → tab „Șabloane" → noul card → **Preview**. (Pornește stack-ul cu `/start-app` dacă nu rulează.)

**B. Render rapid din terminal (fără DB/admin)** — randează HTML-ul direct și deschide-l în browser:
```bash
cd apps/api && npx ts-node -e "
  const { findMarketingTemplate } = require('./src/mailer/templates/marketing');
  const t = findMarketingTemplate('<ID-UL-TĂU>');
  const out = t.render(t.sample);
  require('fs').writeFileSync('/tmp/email-preview.html', out.html);
  console.log('SUBJECT:', out.subject);
  console.log('Scris în /tmp/email-preview.html');
"
open /tmp/email-preview.html
```
Arată-i userului subiectul + deschide HTML-ul. Iterați pe copy/stil până e ok.

### Pas 6 — Deploy (obligatoriu la final)
După ce userul confirmă că preview-ul arată bine, **dă deploy** ca șablonul să ajungă în producție.
Șablonul trăiește în API (`apps/api`), iar catalogul din admin îl ia de acolo — deci rebuild la ambele:
```bash
make deploy-api && make deploy-admin
```
`deploy-api` face automat backup DB pre-deploy. După deploy, confirmă cu userul că șablonul apare în
`https://admin.manelecadou.ro/marketing` → tab „Șabloane". Dacă userul cere explicit să NU dea deploy
încă (vrea doar local), sari peste acest pas și spune-i clar că modificarea e doar locală.

## Reguli
- NU modifica `templates.ts` (transacționalele) — doar `marketing.ts`.
- `id` trebuie unic și stabil (e referit de campanii/reguli salvate în DB).
- Escape la orice input dinamic (folosește `escape()` deja definit în fișier).
- Păstrează paleta gold/cream existentă pentru consistență vizuală.
