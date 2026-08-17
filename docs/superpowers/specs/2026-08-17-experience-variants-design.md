# Interfețe A/B (experience variants) + identitate device

**Data:** 2026-08-17
**Site-uri afectate:** toate (config per site); prima interfață nouă e doar pentru RO (`cadou`)
**Status:** agreat în conversație; așteaptă review înainte de planul de implementare

## 1. Problema

Vrem să testăm mai multe designuri / workflow-uri pe același domeniu (același backend, aceleași prețuri, același Stripe / Suno / Irina) și să măsurăm care convertește mai bine.

Un vizitator trebuie:

- să poată fi forțat pe o interfață din reclamă (`?ui=cadou`) sau din mapare UTM
- să rămână pe acea interfață la revenire, inclusiv după ștergerea cookie-urilor (cât putem)
- să fie recunoscut cât de cât pe **alt browser, același device** (cazul real: TikTok/Facebook in-app → apoi Safari), fără login

Nu construim page builder. Interfețele se scriu în cod (Claude/Grok). Adminul setează default-ul, mapările UTM, pachetele și conținutul (demo-uri deja existente per site).

## 2. Non-goals

- Page builder / editor vizual de layout
- Fingerprint Pro (plătit). Folosim `@fingerprintjs/fingerprintjs` open-source (v4)
- Login ca mecanism de identitate. Magic link rămâne pe `classic` / `/cont` unde există azi; graful de identitate **nu** depinde de el
- Schimbarea prețurilor sau a contului Stripe per interfață
- Clone pixel-perfect a manele-cadou.ro (layout, pași, ton — da; asset-urile lor, chat-ul Sofia, login-ul lor — nu)
- Interfață `cadou` pe site-urile non-RO în v1 (codul e pregătit; default-ul lor rămâne `classic`)
- Split aleatoriu 50/50. Atribuirea e: URL → sticky → device/fingerprint → UTM → default admin

## 3. Vocabular

| Termen | Semnificație |
|---|---|
| **Experience / interfață** | Pachet de frontend: shell, homepage, wizard, pagina melodiei, upsell, temă. Identificat prin `slug` (`classic`, `cadou`) |
| **Person** | Identitatea noastră internă pentru „același om”, indiferent de browser/guest |
| **Visitor** | Un browser concret: FingerprintJS `visitorId` + semnătură de device + `guestId` |
| **Package snapshot** | Ce includea pachetul **în momentul plății** (video, poze, durată…). Nu se schimbă retroactiv |

## 4. Arhitectură

### 4.1 Registry în cod

```
apps/web/experiences/
  types.ts                 // ExperienceModule
  registry.ts              // EXPERIENCES: Record<slug, ExperienceModule>
  resolve.ts               // citește cookie / context
  classic/                 // site-ul actual, mutat aici
    index.ts
    HomePage.tsx
    StudioPage.tsx
    SongView.tsx
    Shell.tsx
    theme.css
  cadou/                   // clona de flux manele-cadou.ro
    index.ts
    HomePage.tsx
    WizardPage.tsx
    SongView.tsx
    Shell.tsx
    UpsellModal.tsx
    theme.css
    packages.ts            // default-uri livrabile + copy
```

`ExperienceModule` exportă cel puțin:

- `slug`, `label` (admin)
- `Shell`, `HomePage`, `StudioPage` (wizard), `SongView`
- `packageDefaults`: per tier `{ video, socialImage, instrumental, premiumPage, durationSec, features[], upsell? }`
- `wizard`: `{ payFirst: boolean; lyricsReview: boolean; steps: ... }`

Rutele Next rămân aceleași (`/`, `/studio`, `/m/[id]`, legale, chat). Pagina alege componenta din registry via `ExperienceProvider`. URL-ul **nu** conține slug-ul interfeței (doar `?ui=` la landing din ads).

Pagini **partajate** (același component, îmbrăcate în `Shell`-ul experienței): login/verify, `/cont`, `/istoric`, legale, `/unsubscribe`, `/faq`, `/articole`. Chat-ul e Irina, restilizat prin CSS variables din `theme.css`.

### 4.2 Ce rămâne global (nu per interfață)

- Prețuri site (`packagePricesCents`, `packageCompareAtCents`, Stripe)
- Generare Suno, lyrics OpenAI, mail, gift codes, promo
- Stiluri / voci / ocazii / demo-uri / mostre — per **site** (adminul de azi). Interfața decide doar **cum** le arată
- `hiddenMode` / `maintenanceMode`

### 4.3 Config per site (admin, jsonb)

Coloană nouă `sites.experienceConfig` (jsonb, nullable — synchronize-safe):

```ts
interface SiteExperienceConfig {
  defaultSlug: string; // 'classic' dacă lipsește
  items: Record<string, {
    enabled: boolean;
    utmRules: Array<{
      source?: string;    // utm_source, case-insensitive; gol = oricare
      campaign?: string;  // utm_campaign
      content?: string;   // utm_content
    }>;
    packages?: Partial<Record<'basic' | 'plus' | 'premium', {
      video?: boolean;
      socialImage?: boolean;
      instrumental?: boolean;
      premiumPage?: boolean;
      durationSec?: number;
      features?: string[];
      upsell?: { title: string; body: string; targetTier: 'plus' | 'premium' } | null;
    }>>;
  }>;
}
```

Regulă UTM: prima regulă care se potrivește câștigă. Câmp gol = wildcard. Toate câmpurile completate trebuie să se potrivească (AND), case-insensitive.

Catalogul de slug-uri valide vine din registry (cod), nu din DB. Un slug din config care nu există în registry e ignorat.

## 5. Atribuire

Ordine, prima potrivire validă (slug existent în registry **și** `enabled` pe site; `classic` e mereu considerat enabled):

1. Query `?ui=<slug>` — forțează, rescrie sticky-ul pe person + cookie + localStorage
2. Cookie `mc_ui` sau localStorage `mc_ui`
3. Person găsit prin FingerprintJS `visitorId` sau prin semnătură de device (vezi §6)
4. Mapare UTM din `experienceConfig.items[*].utmRules`
5. `experienceConfig.defaultSlug` sau `classic`

`?ui=` invalid sau interfață disabled → se ignoră, se trece la pasul 2.

Cookie: `mc_ui=<slug>; Path=/; SameSite=Lax; Max-Age=31536000`. Pe HTTPS, `Secure`. Oglindit în `localStorage.mc_ui`.

**Middleware (SSR):** poate evalua 1, 2, 4, 5. Nu poate citi FingerprintJS. Setează cookie-ul dacă a rezolvat. Nu face rewrite de path.

**Client, la boot:** rulează FingerprintJS + semnează device-ul → `POST /api/identity/identify`. Răspunsul poate:

- adopta un `guestId` existent (alt browser, același device) → clientul înlocuiește `mc_guest_id` și reconectează chat-ul
- restaura `experienceSlug` dacă pașii 1–2 n-au dat nimic

Dacă URL-ul curent are `?ui=`, identify **nu** poate schimba interfața înapoi; doar persistă forțarea.

## 6. Identitate (fără login)

### 6.1 Semnale

La fiecare pageload, clientul trimite:

| Semnal | Sursă | Stabilitate |
|---|---|---|
| `guestId` | cookie / localStorage `mc_guest_id` (deja există, cu fallback memorie pentru in-app) | același browser |
| `visitorId` | FingerprintJS OSS `get()` | același browser / profil |
| `deviceKey` | hash (vezi mai jos) | aproximativ același device, alt browser |
| `ip` | server, din `X-Forwarded-For` | același rețea |
| `email` | dacă e deja pe guest (wizard / chat) | dur |

`deviceKey` = SHA-256 (hex, 64 chars) peste, concatenate cu `|`:

- `screen.width x screen.height`
- `devicePixelRatio` rotunjit la 2 zecimale
- `navigator.hardwareConcurrency` sau `na`
- `navigator.deviceMemory` sau `na`
- `navigator.maxTouchPoints`
- `Intl.DateTimeFormat().resolvedOptions().timeZone`
- `navigator.userAgentData?.platform || navigator.platform`
- `screen.colorDepth`

Nu includem user-agent-ul complet (diferă Chrome vs Safari).

### 6.2 Tabele (additive)

`identity_persons`

- `id` uuid PK
- `siteId` uuid index
- `experienceSlug` varchar(32) not null default `classic`
- `email` varchar(320) nullable index
- `createdAt`, `lastSeenAt`

`identity_visitors`

- `id` uuid PK
- `personId` uuid FK → persons, index
- `siteId` uuid index
- `visitorId` varchar(64) not null  — FingerprintJS
- `deviceKey` varchar(64) not null
- `guestId` uuid nullable index
- `lastIp` varchar(45) nullable
- `userAgent` varchar(512) nullable
- `lastSeenAt`
- unique `(siteId, visitorId)`

Index: `(siteId, deviceKey, lastSeenAt)`.

Coloane noi (nullable, synchronize-safe):

- `guest_sessions.personId`
- `conversations.personId`
- `generations.experienceSlug` varchar(32) nullable
- `generations.packageSnapshot` jsonb nullable
- `generations.personId` uuid nullable
- `payments.experienceSlug` varchar(32) nullable
- `payments.personId` uuid nullable
- `analytics_sessions.experienceSlug` varchar(32) nullable
- `analytics_sessions.personId` uuid nullable
- `conversations.mergedIntoConversationId` uuid nullable — conversația „înghițită” la unificarea pe email; userul și Irina văd doar ținta

Nicio coloană ștearsă sau redenumită.

Catalogul de slug-uri din admin (`GET /api/admin/experiences`) e o listă statică în API (`EXPERIENCE_CATALOG`: `{ slug, label }[]`), ținută în sync cu `apps/web/experiences/registry.ts`. Un slug nou = o linie în ambele locuri + folderul de frontend.

### 6.3 Algoritm `identify`

Input: `{ visitorId, deviceKey, guestId?, email? }`. IP din request. Totul scoped pe `siteId`.

1. Upsert visitor pe `(siteId, visitorId)`.
2. Găsește person, în această ordine:
   1. visitor-ul ăsta are deja `personId`
   2. `guestId` aparține unui guest cu `personId`
   3. `email` (normalized) se potrivește cu `identity_persons.email` pe site
   4. **match device:** același `siteId` + același `deviceKey` + IP compatibil + `lastSeenAt` în ultimele 14 zile + fără conflict de email
3. Dacă nu există person → creează unul, `experienceSlug` = rezultatul atribuirii (§5 fără pasul 3, ca să nu recurgem).
4. Leagă visitor-ul de person. Setează `guest.personId`. Touch `lastSeenAt`.
5. **Merge chat / guest:**
   - dacă person-ul are deja un `guestId` „canonic” și ăsta e altul → vezi regula de mai jos
6. Persistă `experienceSlug` pe person dacă a venit `?ui=` sau person-ul n-avea încă.
7. Returnează `{ personId, guestId, experienceSlug, adoptedGuest: boolean }`.

**IP compatibil:** același IP exact, **sau** (ambele IPv4 publice și același /24). Nu folosim /24 pe IP-uri private. IPv6: doar match exact.

**Conflict de email:** dacă person-ul candidat are email A și request-ul are email B (ambele non-null, diferite) → nu e match.

**Candidați device multipli în 24h:** dacă există 2+ persons distincte cu același `deviceKey` + IP compatibil văzute în ultimele 24h → **nu** unificăm (doi oameni, același model de telefon, același WiFi). Copiem doar `experienceSlug` de la cel mai recent, creăm person nou, guest nou, chat nou.

**Un singur candidat bun:** același person. `guestId` canonic = cel mai vechi guest al person-ului care încă există. Clientul primește acel `guestId`. `getOrCreateMine` pentru chat rezolvă conversația după `personId` (există una) — același thread Irina.

**Email ulterior:** când guest-ul salvează emailul (wizard pas 3 `cadou`, sau chat), rulam din nou legarea: dacă există person cu acel email, unificăm persons (mutăm visitors + `personId` pe guest/conv/generations/payments). Chat: rămâne conversația cu mai multe mesaje; cealaltă se marchează `mergedIntoConversationId` (coloană nullable pe `conversations`) și nu se mai listează la user.

### 6.4 Ce nu pretindem

Două iPhone-uri identice în aceeași casă, ambele fără email, în aceeași oră, pot fi confundate. Acceptăm riscul pentru interfață; regula „2+ candidați / 24h” evită cel mai prost caz la chat. Nu e 100%. Nu folosim login ca plasă.

## 7. Pachete și livrare

Prețul = site (neschimbat). Livrabilele = interfață (cod default + override admin).

Rezolvare:

```
global PACKAGES[tier]  ←  experience.packageDefaults[tier]  ←  admin override
```

La `createGeneration` / checkout, API-ul primește `experienceSlug` (din identify / header `X-MC-Experience`). Persistă pe generație:

```ts
experienceSlug: string
packageSnapshot: {
  video: boolean
  socialImage: boolean
  instrumental: boolean
  premiumPage: boolean
  durationSec: number
}
```

Processorul Suno / collage citește **snapshot-ul** dacă există, altfel `packageDef(tier)` (generări vechi). Schimbarea ulterioară în admin nu modifică comenzile deja plătite.

Upgrade după plată (upsell): `POST /api/payments/checkout-upgrade` cu `{ generationId, targetTier }`. Suma = `price(targetTier) − suma deja plătită pe generație` (minim 0; dacă 0, upgrade fără Stripe). Metadata Stripe: `upgradeGenerationId`, `targetTier`, `experienceSlug`. După webhook paid: `packageTier` + `packageSnapshot` se rescriu la livrabilele noului tier **al interfeței**, apoi job-ul existent `upgrade-deliverables`.

Quote/checkout ignoră snapshot-ul — suma e mereu `packagePriceCents(tier, site.packagePricesCents)`.

## 8. Interfața `classic`

Site-ul actual, mutat în `experiences/classic/` fără schimbare de comportament (wizard 5–6 pași, homepage cu generator, lyrics review dacă `site.lyricsReviewEnabled`, demo 30s dacă `site.demoEnabled`). Default pentru toate site-urile până îl schimbi în admin.

## 9. Interfața `cadou` (RO)

Referință: [manele-cadou.ro](https://manele-cadou.ro) — flux și ierarhie, nu brandul lor.

### 9.1 Homepage

Landing, **fără** wizard. Secțiuni:

1. Hero + CTA „Fă o manea” + preț tăiat (din `packageCompareAtCents`)
2. Player exemplu + statistici (copy, nu neapărat cifrele lor)
3. Grid stiluri (din `site.styles` / seed) — card cu preview audio
4. Cum funcționează — 4 pași
5. Reacții / testimoniale (din `site.testimonials`; layout tip carousel + carduri, mai vizibile decât pe `classic`)
6. Prețuri (3 pachete, conținut din §7)
7. FAQ (mesajele i18n existente)

CTA → `/studio`. `/` nu mai montează `Generator`.

### 9.2 Wizard (`/studio`) — 4 pași, pay-first

Query `?step=1..4` doar ca oglindă de UI (ca la ei). Persistăm snapshot-ul wizardului în `localStorage` (cheie `mc_wizard_cadou_v1`, separat de `mc_wizard_v1` al classic).

**Pas 1 — Stil.** Grid carduri. Preview audio din `styleSamples`. Continuă doar cu un stil selectat. `?style=` din homepage preselectează.

**Pas 2 — Detalii.** Un singur ecran:

- textarea „ce vrei să menționăm” (`message`) — obligatoriu
- checkbox „nu dedic nimănui”
- nume destinatar — obligatoriu dacă nu e bifat
- textarea scurtă despre destinatar (intră în `message` / `dedication`)
- ocazie opțională (chip-uri din `site.occasions`)
- sugestii rapide care prefill-uiesc mesajul

**Pas 3 — Extra.**

- Voce: Masculină / Feminină (id-urile existente `male` / `female`). Fără „Ambele”
- 3 carduri de pachet (Standard / Plus / Premium) — preț site, bullets din §7
- „Vreau să scriu propriile versuri” → textarea `customLyrics`
- Email obligatoriu (leagă identitatea, §6.3)
- Checkbox confidențialitate

**Pas 4 — Rezumat + plată.**

- Recapitulare cu „Modifică” per câmp (sare la pasul potrivit)
- Versuri: `POST /api/suggestions/lyrics` în fundal; placeholder „Compunem versurile…” până vin. Dacă userul a dat `customLyrics`, le arătăm pe acelea
- Total + compare-at + input promo (API promo existent)
- Recenzii / reacții
- Buton „Plătește {preț} →” apelează `createDirectCheckoutSession` (pay-first deja existent: generație pending + Stripe Checkout; webhook-ul pornește Suno). Fără Payment Element pe pagină. Fără demo 30s, fără pas de review versuri.

După întoarcerea de la Stripe → `/m/:id` în skin-ul `cadou`.

### 9.3 Pagina melodiei + upsell

`SongView` propriu: player, versuri, download, share. Dacă snapshot-ul are `premiumPage`, layout-ul premium al experienței (nu cel `classic`).

La `status=succeeded`, **o dată** (flag `localStorage mc_upsell_<genId>`): dacă pachetul n-are un livrabil pe care interfața îl poate vinde (video / poze) și e configurat `upsell`, arătăm `UpsellModal` → checkout upgrade.

### 9.4 Shell

Header: logo site, ACASĂ, FĂ O MANEA, top, tarife (`#tarife` pe homepage). Fără login în nav. Footer: legale existente, plăți, social din `site.social`. Ticker promo (1+1 / garanție) ca pe referință.

Chat: Irina, aceleași WS. Culori din `cadou/theme.css`.

### 9.5 Default-uri pachete `cadou` (cod)

Identice cu pachetele globale de azi (video doar pe Premium), ca adminul să poată testa „Plus + video” fără deploy, doar din override.

## 10. Admin

Pe editarea unui site, secțiune **Interfețe**:

- dropdown default
- pentru fiecare slug din `GET /api/admin/experiences` (catalog din registry, compilat în admin sau hardcodat `{classic, cadou}` + label):
  - enabled
  - lista de reguli UTM (source / campaign / content)
  - per tier: toggle-uri livrabile, durata, bullets (textarea câte una pe linie), upsell (titlu, body, target tier) sau „fără”

Demo-uri / mostre / stiluri rămân unde sunt azi (per site).

Analytics / payments / generations / chat:

- coloană sau filtru `experienceSlug`
- în marketing, breakdown conversie per interfață (sesiuni, plăți, revenue)
- în chat, badge dacă conversația e într-un cluster (alți visitors pe același person)

## 11. API

**Public**

- `POST /api/identity/identify` `{ visitorId, deviceKey, guestId?, email? }` → `{ personId, guestId, experienceSlug, adoptedGuest }`
- `GET /api/public/site` adaugă `experienceConfig` public (fără secrete): `defaultSlug`, per slug `enabled` + `utmRules` + `packages` rezolvate (defaults + override). Clientul și middleware-ul au nevoie de ele

**Header** `X-MC-Experience: cadou` pe request-urile web (generare, quote, checkout, analytics). Serverul validează slug-ul; dacă e invalid, folosește person / default.

- `POST /api/payments/checkout-upgrade` `{ generationId, targetTier }` → `{ url, paymentId }` (sau `{ upgraded: true }` dacă diferența e 0)

**Admin**

- `GET /api/admin/experiences` — catalog
- update site acceptă `experienceConfig` (deja e PATCH site)

Quote rămâne `GET /api/payments/quote?packageTier=`. Fulfillment-ul nu schimbă suma.

## 12. Analytics și tracking

`track()` și sesiunea analytics primesc `experienceSlug` + `personId`.

Evenimente noi (props pe cele existente unde e natural):

- `experience_assigned` `{ slug, reason: 'url' | 'cookie' | 'fingerprint' | 'device' | 'utm' | 'default' }`
- `experience_adopted_guest` `{ fromGuestId, toGuestId }` (doar intern / analytics)

Dashboard marketing: un rând sau un breakdown „Interfață”. Fără UI nou de experimente (nu ținem start/stop test, winner etc. în v1).

## 13. Erori și fallback

| Situație | Comportament |
|---|---|
| FingerprintJS eșuează / timeout 3s | Identify doar cu deviceKey + guestId. Nu blocăm UI |
| localStorage blocat (in-app) | cookie + memorie, ca `mc_guest_id` azi |
| Interfață disabled după ce userul e sticky pe ea | dacă slug-ul mai e în registry, rămâne (sticky câștigă peste enabled=false, ca să nu-i schimbi UI-ul la mijlocul comenzii). Dacă slug-ul a fost scos din registry → `classic` imediat |
| Identify 5xx | păstrăm cookie/local; chat pe guest-ul local |
| Două tab-uri, `?ui=` diferit | ultimul write câștigă (cookie) |
| Site fără `experienceConfig` | totul se comportă ca azi (`classic`) |

## 14. Cum se adaugă o interfață nouă (ulterior)

1. Folder `apps/web/experiences/<slug>/` care implementează `ExperienceModule`
2. Înregistrare în `registry.ts`
3. Deploy web. Apare în admin. Enabled=false până o pornești
4. Opțional: override pachete + UTM în admin
5. Ads: `https://manelecadou.ro/?ui=<slug>`

Fără migrare DB, fără page builder.

## 15. Testare

- `?ui=cadou` pe RO local (`manelecadou.local` / localhost) → homepage cadou, cookie setat, refresh fără query rămâne cadou
- `?ui=classic` forțează înapoi
- `?ui=nope` ignorat
- UTM: regulă `source=facebook` → cadou, fără cookie preexistent
- Identify: același `visitorId` restorează slug-ul după delete cookie (păstrăm visitorId în memorie de test / mock)
- Device: două profile-uri cu același deviceKey + același IP, un singur person existent → `adoptedGuest=true`, același chat
- Device: doi persons în 24h → nu merge chat
- Email: al doilea browser cu alt fingerprint, același email → merge
- Plată Plus pe cadou cu admin `plus.video=true` → generația are `packageSnapshot.video=true` și processorul generează video
- Schimbare admin după plată → generația veche nu pierde video
- `classic` pe RO cu default classic: homepage + wizard neschimbate vizual (regresie)
- Site BG: default classic, `?ui=cadou` funcționează (skin RO-oriented e ok; nu e scopul v1)
- Mobile + desktop viewport pe homepage + wizard cadou

## 16. Rollout

1. Schema + identity + registry + mutare `classic` (default neschimbat → zero impact vizitatori)
2. Admin config + package snapshot pe generații noi
3. Interfața `cadou` + upsell
4. Analytics breakdown
5. Pe RO, în admin: default rămâne `classic`; testul se face cu `?ui=cadou` pe ads. Când vrei, schimbi default-ul sau mapezi campanii

`synchronize: true` — doar coloane/tabele noi. Fără DROP.

## 17. Decizii închise

- Fără page builder
- Fără login în identitate
- URL `?ui=` + UTM admin; URL câștigă inclusiv peste sticky
- Cookie + localStorage + FingerprintJS + deviceKey + IP
- Chat se unifică pe match dur (fingerprint / guest / email) **și** pe match device cu un singur candidat
- Pachete: livrabile per interfață, preț per site, snapshot la plată
- `cadou`: landing + wizard 4 pași pay-first + song page + upsell popup
- Stripe rămâne Checkout redirect
- Irina rămâne chat-ul
)