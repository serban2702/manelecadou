# 03 — Frontend public, wizard & UX mobile-first

> Aici sunt regulile pentru site-ul vizibil clientului. Cele mai importante sunt în §3 (UX mobil) — acolo se câștigă sau se pierde conversia. Majoritatea traficului vine de pe telefon, des din in-app browsere (TikTok, Instagram, Facebook), care au comportament special.

---

## 1. Structura frontendului

- **Next.js App Router.** Pagini server pentru SEO + injectare de date la mount (ex. IP-ul clientului pus în `<head>` prin SSR pentru OpenReplay — vezi `04`). Restul = client components.
- **Shell de site** (header/footer/brand) + **zona de wizard** = inima conversiei.
- **i18n** prin dicționar central (vezi §4). Fără rute pe locale (toate URL-urile fără prefix `/ro/`).
- **Guest sessions:** fiecare vizitator primește un cookie de sesiune anonimă (`gs_token`/echivalent) emis de backend; persistă cross-tab/cross-device; se „revendică" automat dacă userul își face cont. Pe asta se leagă tracking-ul, wizard-ul salvat și comanda fără cont.
- **Comunicarea cu backend** prin `NEXT_PUBLIC_API_URL` (base URL API). Build args injectează cheile publice (Stripe publishable, GA4, pixeli, OpenReplay project key + ingest point).

---

## 2. Wizard-ul — state machine

Inima produsului. Pași pas-cu-pas care se termină în plată. Pașii **concreți diferă per produs** (vezi `08`), dar pattern-ul e identic:

- **State centralizat** într-un context (`WizardState`) cu toate selecțiile (ocazie, destinatar, mesaj, stil, voce, add-on-uri, email/telefon, pachet). Persistat în `sessionStorage` (supraviețuiește refresh, dispare la închiderea tab-ului) — sau în DB prin `wizard_sessions` pentru restore cross-device.
- **Pași opționali condiționați** de selecții (ex. pasul „poze" apare doar dacă a bifat add-on-ul video-collage). O funcție `stepsFor(state)` calculează lista activă de pași la runtime.
- **Validare „soft":** butonul „Continuă" NU e disabled; la click pe un pas invalid → highlight roșu + animație shake + scroll la câmpul lipsă. Nu blochez userul cu butoane gri inexplicabile — îi arăt ce lipsește.
- **Navigare:** „Înapoi" mereu permis; „Înainte" prin click pe stepper permis doar dacă pașii anteriori sunt valizi; pasul „generating" e ireversibil (niciodată clicabil înapoi).
- **Autosave** debounced al stării în DB (`wizard_sessions`: `currentStep`, `furthestStep`, snapshot) — sursa funnel-ului din admin (până unde a ajuns fiecare, ce a abandonat).
- **Emit de stare către chat** (dacă proiectul are agent AI): un eveniment debounced (`mt:wizard_state`) trimite progresul wizardului pe socket → agentul AI vede în timp real unde e clientul și poate interveni.

---

## 3. Standarde UX mobile-first (obligatorii — aici e conversia)

Acestea sunt regulile pe care fiecare proiect trebuie să le respecte. Sunt extrase din ce funcționează deja și din cerințele explicite.

### 3.1 Scroll & focus management
- **Scroll-to-top la fiecare schimbare de pas.** Când userul apasă „Continuă"/„Înapoi" sau sare în stepper, pagina face **smooth scroll** la începutul wizardului, compensând înălțimea header-ului sticky. Fără asta, pe telefon userul rămâne la mijlocul ecranului și nu vede titlul noului pas. (Implementat deja în Melodia Ta — `scrollToWizardTop`.)
- **Scroll la primul câmp invalid** când validarea pică, nu doar highlight.
- **Focus pe primul input** al pasului (când e tastare), fără să declanșeze zoom nedorit pe iOS (font-size ≥ 16px pe inputuri).

### 3.2 Sticky & thumb-friendly
- **CTA principal sticky jos** pe mobil („Continuă" / „Plătește"), mereu la îndemâna degetului, fără să fie nevoie de scroll până jos.
- Butoane mari (target ≥ 44px), spațiere generoasă, fără hover-only interactions.
- Stepper compact pe mobil (numere/puncte), extins pe desktop.

### 3.3 Performanță percepută
- **Skeletons / loading states** pentru orice fetch (prețuri, liste, preview), nu spinner gol.
- **Fallback-uri hardcodate** pentru date critice (ex. prețul de bază) dacă API-ul întârzie/pică — userul nu vede niciodată „—" la preț.
- Pauză automată a oricărui audio/video demo la schimbarea pasului (fără suprapunere de sunet).
- Lazy-load pentru media grea; imagini responsive.

### 3.4 In-app browsere & edge cases mobile
- **TikTok/Instagram in-app browser:** vizibilitate „hidden" frecventă, preload în background, închidere rapidă. Tot ce e critic (IP pentru OpenReplay, atribuire, tracking landing) trebuie să ruleze **instant la mount**, fără să aștepte `visibilitychange` sau fetch-uri lente (lecție din Manele Cadou — vezi `04`).
- Tastatură care acoperă inputul: scroll-into-view la focus.
- Upload de poze: drag-drop **plus** fallback click (mobilul nu are drag) + preview imediat.

### 3.5 Checkout fără fricțiune
- **Checkout inline** în wizard (Stripe Payment Element), nu redirect inutil. Email/telefon + plată pe același ecran.
- Mesaje de eroare clare la plată eșuată (card refuzat → ce să facă), nu coduri tehnice.
- Revenire grațioasă din Stripe (success/cancel) care reia exact unde a rămas.

### 3.6 Trust & claritate
- Preț vizibil din timp, fără surprize la final; ce primește exact (ex. „2 variante", „livrare în X").
- Recenzii/testimoniale și exemple reale pe landing.
- Limbaj cald, orientat pe cadou/emoție, nu corporate.

---

## 4. i18n

- Dicționar central (un fișier cu toate cheile) cu toate limbile proiectului. La Melodia Ta: `ro/en/de/es`. La Manele Cadou: 8 limbi. Numărul de limbi = decizie per proiect (vezi `08`).
- Conținutul dinamic (liste de ocazii, stiluri, voci) vine **localizat din backend** (parametru `lang`), cu fallback pe dicționarul frontend.
- Detecția limbii: query param explicit → cookie/localStorage → Accept-Language → default. Switcher de limbă afișat doar dacă proiectul e multi-limbă.
- **Regulă:** orice string vizibil userului intră în toate limbile proiectului. Adminul rămâne doar în română.

---

## 5. Componente comune de frontend (reutilizabile)

- `SiteShell` (header/footer/brand din settings), `Wizard` + `StepperHeader`, `AnalyticsProvider` (vezi `04`), `OpenReplay` (vezi `04`), `Tracker` (landing/first-touch), widget de **Chat** (dacă proiectul are — vezi `05`), `Generator`/`PreviewPlayer` (specific produsului), pagini de `success`/`cancel`/`redeem`/`unsubscribe`.
- Branding-ul (logo, culori, tagline, OG image, favicon) vine din settings, nu hardcodat — ca să pot ajusta fără redeploy.
