# Admin studio + lansare

Local: http://localhost:1505 — selectează un site din sidebar.

## Ce s-a adăugat

### Acest site (`/site`)
Nav internă, un singur form, **Salvează** sus.

| Unde | Ce |
|---|---|
| Privire de ansamblu | stare + goluri |
| Identitate | domeniu, nume, limbă, valută |
| **Interfețe** | **design-ul**: pachete, prețuri, stiluri/ocazii/voci, surse Suno/Google, motor |
| Aspect | culori, logo, SEO, social, recenzii |
| Plată | demo 30s vs plată întâi, cadou, Stripe extras — **nu pachete** |
| Librărie | stiluri/ocazii/voci comune, se copiază în interfețe |
| Versuri | writer/critic default + motor fallback |
| Operațiuni | live/HTTPS/mentenanță, mail, firmă, pixeli |
| Top | seed / live / template |

Pachetele Standard/Plus/Premium se editează **doar** pe Interfețe → un design.

### Setări (`/settings`)
Aceleași chei env, alt grupaj: Acces · Chei (OpenAI / Suno / **Gemini** / **Cloudflare R2** / Stripe / Mailgun / VAPID / Wingo) · Email · AI Chat · Marketing · Advanced. Search sus.

Ce s-a schimbat la chei:
- **R2 se citește efectiv din DB.** `StorageService` ia `STORAGE_DRIVER` și
  `R2_*` prin `SettingsService` (DB întâi, env ca rezervă) și se reinițializează
  la salvare — fără restart. Dacă pui `r2` fără credențiale complete, API-ul
  **nu** mai cade: loghează eroarea și rămâne pe disc.
- Cheile care se citesc doar din `.env` (`ADMIN_EMAILS`, `MAGIC_LINK_TTL_MIN`,
  `SUNO_PROVIDER`, `MAIL_POLL_INTERVAL_MS`, `MAIL_ATTACH_DIR`) sunt marcate
  „doar citire" în ajutor — înainte pretindeau că se aplică la cald.
- Setări care existau în cod dar nu erau editabile, acum sunt: `AI_ALERT_EMAILS`,
  `AI_CHAT_REASONING_EFFORT`, `AI_FOLLOWUP_ENABLED`, `RECOVERY_EMAIL_ENABLED`,
  `RECOVERY_EXCLUDE_EMAILS`.
- Cele rezervate, fără consumator încă (`AI_CHAT_PROACTIVE_*`,
  `AI_CHAT_REQUIRE_APPROVAL_FOR_GENERATION`, `MAILGUN_WEBHOOK_SIGNING_KEY`) o
  spun în text, ca să nu pară că schimbă ceva.

### Lansare producție (`/rollout`)
Checklist per site: Gata / Lipsește / Parțial. **Umple golurile** = doar câmpuri
goale din seed (nu rescrie, nu schimbă motorul, nu schimbă prețurile).

Două lucruri de știut:
- **Seed-ul are limbă.** Există prompturi pentru `ro`, `bg` și `el`; se aplică
  doar pe site-urile cu acel `locale`. Un site pe altă limbă nu primește nimic
  automat — altfel „Aplică pe toate site-urile" ar fi pus text românesc în
  prompturile trimise la motor pe site-ul bulgăresc.
- **Numărătoarea e onestă.** Stilurile/ocaziile care nu au rând în seed (id-uri
  proprii) apar ca lipsă cu „de completat manual", nu ca „Gata". Înainte un site
  cu 0 din 12 prompturi Google raporta „Toate cele 12 au prompt".

---

## Cum testezi

1. Login admin → un site selectat.
2. Interfețe → Cadou → Pachete: preț + refaceri + colaj. Salvează.
3. Aceeași interfață → Catalog propriu → un stil → surse Suno și Google.
4. Librăria tenant e doar pool de copiat, nu vitrina.
5. Plată = demo / cadou / Stripe, nu Standard/Plus/Premium.
6. `/settings` → search `gemini` → Chei.
7. `/rollout` → deschide un site → vezi golurile. **Umple golurile** pe un site de test, apoi Catalog: prompturile goale trebuie să fie pline.

Mostre: Catalog → panou stil → generează/upload. Nu din `/rollout`.

---

## Cum modifici

| Vrei | Unde |
|---|---|
| Prompt Google/Suno pe un stil | Interfețe → design → Catalog (sau Librărie dacă moștenește) |
| Motor pe un design | Interfețe → design → Motor |
| Pachete / preț / refaceri / colaj | Interfețe → design → Pachete |
| Cheie Gemini | `/settings` → Chei |
| Demo 30s / cadou | `/site` → Plată |
| Ce e gol pe prod | `/rollout` |
| Text seed (fill goluri) | `apps/admin/lib/seed-categories.ts` **și** `apps/api/src/modules/sites/catalog-seed.ts` (același id) |
| Check nou pe `/rollout` | `ROLLOUT_CHECKS` + `buildPatch` în `apps/api/src/modules/sites/site-rollout.service.ts` (`autoApply: true` doar dacă umple goluri) |

API rollout: `GET /api/admin/rollout`, `POST /api/admin/rollout/:id/apply`.


### Analitică pe interfețe (`/analytics` → Marketing)
Card „Interfețe (design)" + dimensiune nouă în matricea de marketing: sesiuni,
comenzi începute, comenzi plătite, venit, conversie — per `classic` / `cadou`.
Listele de generări și plăți au coloană + filtru „Interfață". Rândurile vechi
(fără slug) se citesc ca `classic`, deci nu dispar din filtre.

---

## Ce s-a mai reparat în studio

| Problemă | Acum |
|---|---|
| Back-ul browserului ocolea „ai modificări nesalvate" | garda rulează și pe `popstate` |
| „Reset la default" zicea succes chiar dacă ștergerea mostrelor pica | avertisment cu ce a eșuat |
| Contorul „pachete personalizate" rata 9 câmpuri | derivat din tip — un câmp nou rupe typecheck-ul până e trecut în hartă |
| Persona Suno legacy se pierdea la „Editează stilurile Cadou" | `sunoPersonaId` / `sunoPersonaName` se propagă |
| Căutarea ducea în listă, nu la câmp | fiecare din cele 60 de intrări are ancoră; cele de pe un design se rezolvă pe designul deschis |
| Overview zicea „Nimic critic" unde `/rollout` zicea „Lipsește" | Overview verifică și cataloagele per-interfață, fiecare pe motorul lui |
| Etichete de diff care nu se potriveau (`photoLimit`, `fullTrack`) | corectate + completate |
