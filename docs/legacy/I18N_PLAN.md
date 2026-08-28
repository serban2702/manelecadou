# Plan i18n — Balcani (LIVRAT iter 1)

Status: **infrastructură + traduceri MVP** livrate la 2026-05-03 pentru cele **8 limbi** cerute de user.

## Limbi target (livrate)

1. 🇷🇴 **Română** (`ro`) — default fallback
2. 🇧🇬 **Bulgară** (`bg`)
3. 🇷🇸 **Sârbă** (`sr`)
4. 🇹🇷 **Turcă** (`tr`)
5. 🇬🇷 **Greacă** (`el`)
6. 🇭🇷 **Croată** (`hr`)
7. 🇸🇮 **Slovenă** (`sl`)
8. 🇧🇦 **Bosniacă** (`bs`)

> Limbile din planul vechi (HU, AL, MK, EN) — amânate.

## Decizii finale

- **Tehnologie**: `next-intl` v4 în mod fără routing pe locale.
- **Strategie URL**: domeniu separat per țară (`manelecadou.ro`, `manele.bg`, ...). Codul e identic, doar `NEXT_PUBLIC_DEFAULT_LOCALE` se schimbă în `.env`.
- **Detecție**: cookie `NEXT_LOCALE` (setat de switcher) → `NEXT_PUBLIC_DEFAULT_LOCALE` → `'ro'`.
- **Switcher**: header dropdown cu 8 steaguri, ascuns prin `NEXT_PUBLIC_SHOW_LANG_SWITCHER=false` în prod.
- **Traduceri**: scrise manual în acest pas (drept "draft inteligent"). Reviziile native vin în iter 2.
- **Email-uri**: traduse pentru RO, BG, TR, EL, SR (și prin moștenire HR, SL, BS) în `apps/api/src/mailer/i18n/strings.ts`.
- **Suno lyrics**: prompt-ul OpenAI primește `targetLanguage` și instrucțiune explicită.

## Fișiere livrate

### Web
- `apps/web/i18n/{locales,request}.ts`
- `apps/web/messages/{ro,bg,sr,tr,el,hr,sl,bs}.json`
- `apps/web/components/LangSwitcher.tsx`
- `apps/web/next.config.ts` — wrap `createNextIntlPlugin`
- `apps/web/app/layout.tsx` — `NextIntlClientProvider`, `<html lang>` dinamic, `generateMetadata` localizat

### API
- `apps/api/src/mailer/i18n/strings.ts` — dicționare per limbă pentru email
- `apps/api/src/mailer/templates/templates.ts` — refactor cu `locale?` la fiecare template
- `apps/api/src/modules/users/user.entity.ts` — câmp `locale` (default `'ro'`)
- `apps/api/src/modules/users/users.service.ts` — `setLocale(id, locale)`
- `apps/api/src/modules/auth/auth.controller.ts` — `POST /api/auth/locale` (optional auth)
- `apps/api/src/modules/auth/auth.service.ts` — magic link respectă `user.locale`
- `apps/api/src/modules/lyrics/lyrics.module.ts` — directivă `targetLanguage` în prompt
- `apps/api/src/modules/generations/generation.entity.ts` — câmp `locale`
- `apps/api/src/modules/generations/dto/create-generation.dto.ts` — accept `locale`

### Componente refactorizate
- `SiteShell` (header + nav + sticky CTA)
- `sections.tsx` — `Hero`, `PriceStrip`, `QuickListen`, `Cookie`, `Footer`, `Smecher`, `Ticker`

## Plan iter 2 (TODO)

1. Refactor `Generator.tsx` complet (ETAPA cea mai mare — formularul de creație, ~800 linii). Acum doar fluxul backend e localizat (lyrics + email), UI-ul rămâne în RO până la refactor.
2. Pagini statice: `/termeni`, `/confidentialitate`, `/cookies`, `/faq` — nevoie traducători nativi (text legal).
3. `seed-data.ts`: trecere completă pe chei (`STYLES.id` → label din messages); momentan stilurile/ocaziile au și label hardcodat ca fallback.
4. Hreflang + sitemap per domeniu când avem domeniile reale.
5. Format preț cu currency conversion real (acum doar simbolul se schimbă).
6. Native review pentru BG/SR/TR/EL/HR/SL/BS — confirmă cu vorbitori nativi.

## Build-uri prod per țară

```bash
# România (default)
pnpm --filter web build

# Bulgaria
NEXT_PUBLIC_DEFAULT_LOCALE=bg \
NEXT_PUBLIC_SHOW_LANG_SWITCHER=false \
pnpm --filter web build

# … similar pentru sr, tr, el, hr, sl, bs
```
