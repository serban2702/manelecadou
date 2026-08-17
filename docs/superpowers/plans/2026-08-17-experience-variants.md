# Experience Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visitors can be assigned to a code-defined site interface (`classic` or `cadou`) via `?ui=`, UTM, cookie, FingerprintJS, or device signature, stay there, and get that interface’s package deliverables — plus a RO `cadou` skin modeled on manele-cadou.ro.

**Architecture:** Pure assign/package helpers live in the API and are reused by identify, public site, generations, and payments. Identity is a new Nest module (`identity_persons` + `identity_visitors`). The web app wraps existing routes in an `ExperienceProvider` that picks `Shell` / `HomePage` / `StudioPage` / `SongView` from a registry. `classic` re-exports today’s pages (no 2k-line moves). `cadou` is a new landing + 4-step pay-first wizard + song page + upsell.

**Tech Stack:** NestJS 10 + TypeORM 0.3 (synchronize ON, additive only), Next.js 15 app router, `@fingerprintjs/fingerprintjs` v4 OSS, Stripe Checkout (existing `checkout-direct`), cookie `mc_ui`.

**Spec:** `docs/superpowers/specs/2026-08-17-experience-variants-design.md`

## Global Constraints

- No page builder. New interfaces = a folder + a line in `EXPERIENCE_CATALOG` (API) and `registry.ts` (web).
- No login in the identity graph.
- Prices and Stripe stay per-site. Deliverables are per-experience; snapshot at pay time.
- `?ui=` wins over sticky. Cookie `mc_ui`, Path=/, SameSite=Lax, Max-Age=31536000.
- Schema: only ADD tables/columns (nullable or with defaults). Never DROP/rename.
- `classic` is always treated as enabled. Missing `experienceConfig` ⇒ behave as today.
- Tests for pure logic use Node’s built-in runner (`node:test`) via `npx ts-node --transpile-only`. No new test framework.
- Do not move `Generator.tsx` / `view.tsx` / `SiteShell.tsx` — re-export them from `experiences/classic/`.

---

## File map

**API (new)**
- `apps/api/src/modules/experiences/catalog.ts` — slugs + labels
- `apps/api/src/modules/experiences/types.ts` — `SiteExperienceConfig`, package override types
- `apps/api/src/modules/experiences/assign.ts` — `resolveExperienceSlug(...)`
- `apps/api/src/modules/experiences/package-resolve.ts` — merge global + defaults + admin
- `apps/api/src/modules/experiences/experiences.controller.ts` — `GET /admin/experiences`
- `apps/api/src/modules/experiences/experiences.module.ts`
- `apps/api/src/modules/identity/device-key.ts` — `ipsCompatible`, types
- `apps/api/src/modules/identity/identity-person.entity.ts`
- `apps/api/src/modules/identity/identity-visitor.entity.ts`
- `apps/api/src/modules/identity/identity.service.ts` — `identify(...)`
- `apps/api/src/modules/identity/identity.controller.ts` — `POST /identity/identify`
- `apps/api/src/modules/identity/identity.module.ts`

**API (modify)**
- `apps/api/src/modules/sites/site.entity.ts` — `experienceConfig` jsonb
- `apps/api/src/modules/sites/sites.controller.ts` — serialize public + admin PATCH
- `apps/api/src/modules/guest-sessions/guest-session.entity.ts` — `personId`
- `apps/api/src/modules/chat/conversation.entity.ts` — `personId`, `mergedIntoConversationId`
- `apps/api/src/modules/chat/chat.service.ts` — `getOrCreateMine` by person
- `apps/api/src/modules/generations/generation.entity.ts` — `experienceSlug`, `packageSnapshot`, `personId`
- `apps/api/src/modules/generations/generations.service.ts` + processor — snapshot
- `apps/api/src/modules/payments/payment.entity.ts` — `experienceSlug`, `personId`
- `apps/api/src/modules/payments/payments.service.ts` + controller — persist slug, `checkout-upgrade`
- `apps/api/src/modules/analytics/analytics-session.entity.ts` + ingest — slug/person
- `apps/api/src/app.module.ts` — import new modules
- `apps/api/src/database/database.module.ts` — register entities

**Web (new)**
- `apps/web/experiences/types.ts`
- `apps/web/experiences/registry.ts`
- `apps/web/experiences/assign.ts` — same algorithm as API (keep in sync)
- `apps/web/experiences/classic/index.ts`
- `apps/web/experiences/cadou/*` — theme, shell, home, wizard, song, upsell
- `apps/web/lib/experience-context.tsx`
- `apps/web/components/ExperienceBoot.tsx` — FingerprintJS + identify
- `apps/web/lib/identity.ts`

**Web (modify)**
- `apps/web/middleware.ts` — set `mc_ui` from `?ui=` / UTM / default
- `apps/web/app/page.tsx`, `studio/page.tsx`, `m/[id]/page.tsx` + `view.tsx` wrapper
- `apps/web/lib/site-shared.ts` — `experienceConfig` on `SiteConfig`
- `apps/web/lib/api.ts` — `X-MC-Experience`, identify, checkout-upgrade
- `apps/web/package.json` — `@fingerprintjs/fingerprintjs`
- `apps/web/app/layout.tsx` — ExperienceBoot

**Admin**
- `apps/admin/app/(dashboard)/site/_content.tsx` — tab Interfețe
- `apps/admin/lib/api/sites.api.ts` — types
- `apps/admin/lib/types.ts` if SiteDto lives there

---

### Task 1: Pure assign + package resolve + catalog

**Files:**
- Create: `apps/api/src/modules/experiences/catalog.ts`
- Create: `apps/api/src/modules/experiences/types.ts`
- Create: `apps/api/src/modules/experiences/assign.ts`
- Create: `apps/api/src/modules/experiences/package-resolve.ts`
- Create: `apps/api/src/modules/experiences/assign.spec.ts`
- Create: `apps/api/src/modules/experiences/package-resolve.spec.ts`

**Interfaces:**
- Consumes: `PACKAGES` / `PackageTier` from `apps/api/src/modules/payments/packages.ts`
- Produces:
  - `EXPERIENCE_CATALOG: { slug: string; label: string }[]`
  - `isKnownExperienceSlug(slug: string): boolean`
  - `resolveExperienceSlug(input: ResolveInput): { slug: string; reason: AssignReason }`
  - `resolvePackageDef(tier, experienceSlug, adminOverride): PackageDef & { features?: string[]; upsell?: ... }`

- [ ] **Step 1: Write failing tests** in `assign.spec.ts` and `package-resolve.spec.ts` covering: `?ui=` wins; invalid ui ignored; cookie; UTM first-match AND wildcards; default; classic always enabled; disabled slug skipped; package merge admin > defaults > global.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/api && node --import ts-node/register/transpile-only --test src/modules/experiences/assign.spec.ts src/modules/experiences/package-resolve.spec.ts
```

- [ ] **Step 3: Implement catalog, types, assign, package-resolve**

`ResolveInput`:
```ts
{
  uiParam?: string | null;
  cookieSlug?: string | null;
  personSlug?: string | null;
  utm?: { source?: string | null; campaign?: string | null; content?: string | null };
  config?: SiteExperienceConfig | null;
}
```

`AssignReason`: `'url' | 'cookie' | 'fingerprint' | 'device' | 'utm' | 'default'`

Assign order exactly as spec §5. `classic` cannot be disabled. Unknown registry slugs ignored.

`EXPERIENCE_PACKAGE_DEFAULTS`: both `classic` and `cadou` start as copies of global `PACKAGES` flags (video only on premium).

- [ ] **Step 4: Re-run tests — expect PASS**

- [ ] **Step 5: Commit** `feat(experiences): assign + package resolve helpers`

---

### Task 2: Schema — experienceConfig + identity tables + snapshot columns

**Files:**
- Modify: `apps/api/src/modules/sites/site.entity.ts` — add `experienceConfig` jsonb nullable
- Create: identity entities
- Modify: guest-session, conversation, generation, payment, analytics-session entities
- Modify: `apps/api/src/database/database.module.ts` — register `IdentityPerson`, `IdentityVisitor`

**Interfaces:**
- Produces columns/tables from spec §6.2 exactly (`identity_persons`, `identity_visitors`, unique `(siteId, visitorId)`, index `(siteId, deviceKey, lastSeenAt)`).

- [ ] **Step 1: Add types + columns.** `SiteExperienceConfig` imported from `experiences/types.ts`. All new columns nullable or defaulted.

- [ ] **Step 2: Typecheck** `cd apps/api && pnpm typecheck`

- [ ] **Step 3: Commit** `feat(db): experience config, identity tables, package snapshot columns`

---

### Task 3: Identity service + POST /identity/identify

**Files:**
- Create: `apps/api/src/modules/identity/device-key.ts` + `device-key.spec.ts` (`ipsCompatible`)
- Create: `identity.service.ts`, `identity.controller.ts`, `identity.module.ts`
- Modify: `app.module.ts`
- Modify: guest-sessions service to allow `personId` update

**Interfaces:**
- Consumes: `resolveExperienceSlug`
- Produces: `identify(siteId, ip, dto): Promise<{ personId, guestId, experienceSlug, adoptedGuest, reason }>`
- DTO: `{ visitorId: string; deviceKey: string; guestId?: string; email?: string; uiParam?: string; cookieSlug?: string; utm?: { source?, campaign?, content? } }`

- [ ] **Step 1: Tests for `ipsCompatible`** (exact IPv4, same /24 public, reject private /24, IPv6 exact only) and identify-match helpers extracted if needed.

- [ ] **Step 2: Implement identify** exactly spec §6.3:
  1. upsert visitor `(siteId, visitorId)`
  2. find person: existing visitor → guest.personId → email → single device candidate (14d, compatible IP, no email conflict, not 2+ persons in 24h)
  3. else create person
  4. link visitor + guest.personId
  5. single device match ⇒ return canonical oldest guestId (`adoptedGuest: true`)
  6. 2+ candidates ⇒ new person, copy experienceSlug only
  7. email later: merge persons; keep conversation with more messages; set `mergedIntoConversationId`

- [ ] **Step 3: Controller** `POST /identity/identify` (public, site from Host). Rate-limit via existing throttler.

- [ ] **Step 4: Typecheck + device-key tests PASS**

- [ ] **Step 5: Commit** `feat(identity): fingerprint + device identify endpoint`

---

### Task 4: Public site config + X-MC-Experience + chat by person

**Files:**
- Modify: `sites.controller.ts` `serialize` — add public `experienceConfig` (`defaultSlug`, per-item `enabled`, `utmRules`, resolved `packages`)
- Modify: `apps/web/lib/site-shared.ts` `SiteConfig`
- Modify: `chat.service.ts` `getOrCreateMine` — if guest has `personId`, find conversation by `personId` first (skip `mergedIntoConversationId`)
- Modify: `apps/web/lib/api.ts` — send `X-MC-Experience` from cookie/`window.__MC_EXPERIENCE__`

- [ ] **Step 1: Serialize public config.** Admin PATCH already spreads site fields — ensure `experienceConfig` is in the allowed update body (same pattern as `packagePricesCents`).

- [ ] **Step 2: Chat lookup by personId** before guestId.

- [ ] **Step 3: Typecheck api + web**

- [ ] **Step 4: Commit** `feat(experiences): expose config, tag requests, chat by person`

---

### Task 5: Snapshot on create/pay + processor + checkout-upgrade

**Files:**
- Modify: `generations.service.ts` create paths — set `experienceSlug` + `packageSnapshot` via `resolvePackageDef`
- Modify: `generations.processor.ts` — `const def = gen.packageSnapshot ?? packageDef(tier)` for duration + extras (`instrumental`, `socialImage`, `video`)
- Modify: `payments.service.ts` checkout-direct + checkout-session — copy slug/person onto payment; persist snapshot on the pending generation
- Modify: `payments.controller.ts` — `POST /payments/checkout-upgrade`
- Modify: `apps/web/lib/api.ts` — `createUpgradeCheckoutSession`

**Interfaces:**
- `checkout-upgrade` body `{ generationId: string; targetTier: 'plus' | 'premium' }`
- Amount = `packagePriceCents(target) − alreadyPaid` (0 ⇒ upgrade in-place, no Stripe)
- After paid: rewrite `packageTier` + `packageSnapshot`, enqueue `upgrade-deliverables`

- [ ] **Step 1: Helper `snapshotFromDef(def)`** in `package-resolve.ts`

- [ ] **Step 2: Wire create + processor**

- [ ] **Step 3: checkout-upgrade + webhook metadata `upgradeGenerationId`**

- [ ] **Step 4: Typecheck**

- [ ] **Step 5: Commit** `feat(payments): experience package snapshot and upgrade checkout`

---

### Task 6: Web assign middleware + ExperienceProvider + classic re-exports

**Files:**
- Create: `apps/web/experiences/types.ts`, `assign.ts` (copy algorithm; keep comments “must match API assign.ts”), `registry.ts`, `classic/index.ts`
- Create: `apps/web/lib/experience-context.tsx`
- Modify: `middleware.ts` — after site flags, resolve slug (`?ui=`, cookie, UTM from search, default), `response.cookies.set('mc_ui', slug, ...)`
- Modify: `app/page.tsx` — render `useExperience().HomePage`
- Modify: `app/studio/page.tsx` — `StudioPage`
- Modify: `app/m/[id]/page.tsx` — wrap existing view with `SongView` from registry (keep generateMetadata)
- Modify: `layout.tsx` — `ExperienceBoot` inside providers

`classic/index.ts` re-exports:
- `Shell` = current `SiteShell`
- `HomePage` = extract current `app/page.tsx` body into `experiences/classic/HomePage.tsx` (move JSX, leave `app/page.tsx` as one-liner)
- `StudioPage` = current studio JSX
- `SongView` = current `app/m/[id]/view.tsx` default export
- `wizard: { payFirst: false, lyricsReview: 'site' }`
- `packageDefaults` = global flags

Default registry slug `classic`. Until Task 8, `cadou` is not registered (or registered pointing at classic placeholders — **do not register cadou until Task 8** so `?ui=cadou` is ignored until the skin exists).

- [ ] **Step 1: Move homepage/studio JSX into classic files; thin route files**

- [ ] **Step 2: Middleware cookie set. Do not break hiddenMode / slug rewrite.**

- [ ] **Step 3: Manual: `/` still looks like today. `?ui=nope` ignored.**

- [ ] **Step 4: Commit** `feat(web): experience registry and classic extraction`

---

### Task 7: FingerprintJS boot + identify client

**Files:**
- `apps/web/package.json` — add `"@fingerprintjs/fingerprintjs": "4.6.2"` (pin exact)
- Create: `apps/web/lib/identity.ts` — `computeDeviceKey()`, `bootIdentity()`
- Create: `apps/web/components/ExperienceBoot.tsx`
- Modify: `lib/api.ts` — `api.identify(...)`, `setGuestId` if `adoptedGuest`

`computeDeviceKey`: SHA-256 hex of spec §6.1 fields joined by `|`. Use `crypto.subtle.digest` (fallback: simple hash only if subtle missing — still send the raw components string so server can hash). Prefer Web Crypto.

Boot order:
1. Read `?ui=`, cookie, localStorage
2. If `?ui=` valid, write cookie + localStorage immediately (don’t wait FP)
3. Load FPJS (dynamic import), timeout 3s
4. `POST /api/identity/identify`
5. If `adoptedGuest`, `setGuestId` and dispatch `mc:identity-adopted` (chat socket reconnects)
6. If returned slug differs and no `?ui=` this load, switch cookie + `window.location.reload()` once (guard `sessionStorage.mc_ui_reloaded`)

- [ ] **Step 1: pnpm add in `apps/web`**

- [ ] **Step 2: Implement identity + ExperienceBoot; mount in layout**

- [ ] **Step 3: Commit** `feat(web): fingerprint + device identity boot`

---

### Task 8: Cadou shell + homepage

**Files:**
- `apps/web/experiences/cadou/theme.css`
- `apps/web/experiences/cadou/Shell.tsx`
- `apps/web/experiences/cadou/HomePage.tsx`
- `apps/web/experiences/cadou/index.ts`
- Register in `registry.ts`

Visual: dark, gold CTA, landing only (no wizard). Sections from spec §9.1. Styles from `useSite()`. CTA → `/studio`. No login in nav. Irina chat stays (global widget). Use site testimonials, prices from site, package bullets from `experienceConfig.items.cadou.packages` or defaults.

- [ ] **Step 1: theme + Shell + HomePage**
- [ ] **Step 2: Register `cadou`. `?ui=cadou` shows new home; cookie sticks.**
- [ ] **Step 3: Desktop + mobile check (browser).**
- [ ] **Step 4: Commit** `feat(cadou): landing homepage and shell`

---

### Task 9: Cadou 4-step wizard

**Files:**
- `apps/web/experiences/cadou/WizardPage.tsx`
- `apps/web/experiences/cadou/wizard-storage.ts` — key `mc_wizard_cadou_v1`
- Wire as `StudioPage`

Steps exactly spec §9.2. Pay via `createDirectCheckoutSession`. Lyrics preview `api.suggestLyrics` / existing `/suggestions/lyrics`. Email required (also sent to identify). Persist wizard snapshot.

- [ ] **Step 1: Four steps + validation + recap**
- [ ] **Step 2: Checkout-direct + cancel restore (`?paymentCanceled`)**
- [ ] **Step 3: Browser walkthrough (no real pay needed — stop at Stripe URL or mock)**
- [ ] **Step 4: Commit** `feat(cadou): four-step pay-first wizard`

---

### Task 10: Cadou song page + upsell

**Files:**
- `apps/web/experiences/cadou/SongView.tsx`
- `apps/web/experiences/cadou/UpsellModal.tsx`

Reuse player/download from existing components where possible. Upsell once per `mc_upsell_<genId>` when snapshot lacks video/social and admin/code upsell is set. Calls `createUpgradeCheckoutSession`.

- [ ] **Step 1: SongView skin**
- [ ] **Step 2: UpsellModal + upgrade API**
- [ ] **Step 3: Commit** `feat(cadou): song page and post-generation upsell`

---

### Task 11: Admin Interfețe tab

**Files:**
- Modify: `apps/admin/app/(dashboard)/site/_content.tsx` — tab `experiences`
- Modify: SiteDto types
- Create API usage of `GET /api/admin/experiences` + PATCH `experienceConfig`

UI: default slug select; per catalog item: enabled, UTM rule rows, per-tier toggles (video, socialImage, instrumental, premiumPage), duration, features textarea, upsell fields.

- [ ] **Step 1: Tab + save through existing site PATCH**
- [ ] **Step 2: Commit** `feat(admin): per-site experience and package overrides`

---

### Task 12: Analytics + admin filters

**Files:**
- Analytics ingest: persist `experienceSlug` / `personId` from header + identify
- Payments / generations / chat admin lists: show slug; optional filter
- Marketing breakdown: group by `experienceSlug` (sessions, payments, revenue)

- [ ] **Step 1: Write slug on analytics_sessions at session create**
- [ ] **Step 2: Minimal filter/column on payments + generations admin**
- [ ] **Step 3: Commit** `feat(analytics): conversion breakdown by experience`

---

## Spec coverage

| Spec section | Task |
|---|---|
| §4 registry | 6, 8 |
| §5 assign | 1, 6, 7 |
| §6 identity | 2, 3, 7 |
| §7 packages/snapshot/upsell | 1, 5, 10, 11 |
| §8 classic | 6 |
| §9 cadou | 8, 9, 10 |
| §10 admin | 11, 12 |
| §11 API | 3, 4, 5 |
| §12 analytics | 12 |
| §13 fallbacks | 3, 6, 7 |
| §14 add experience | catalog + registry (documented in Task 1/6) |

## Execution notes

- Work on branch `feat/experience-variants`, not `main`.
- After Task 6, `classic` must be visually unchanged (regression).
- After Task 8, test only with `?ui=cadou`; do not change RO default in admin until asked.
)
