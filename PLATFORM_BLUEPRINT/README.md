# PLATFORM BLUEPRINT — Fișa de proiect comună pentru site-urile de cadouri AI

> **Ce este acest set de documente.** Rețeta completă, reutilizabilă, după care se construiește orice site nou din familia mea de produse „cadou generat de AI" (Manele Cadou, Melodia Ta, VideoCadou, Rugăciunea Ta, site-uri de astrologie/ghicit, Animăluțul Vorbăreț etc.). Conține tot ce e **comun** între proiecte — stack, arhitectură, bază de date, admin, deployment, analytics, UX — și marchează clar zonele care **diferă** de la proiect la proiect, cu direcțiile posibile pentru fiecare.
>
> Documentul e gândit ca să-l dau ca referință unui agent de cod (Claude Code) la începutul fiecărui proiect nou. După ce eu prototipez design-ul în Claude Design, agentul citește acest set, îmi pune întrebările din chestionarul de onboarding (vezi `08`), îmi cere cheile API, apoi își construiește un workflow și implementează singur backend + admin + Docker + deployment, testându-se cu Chrome MCP. La final eu doar verific și dau feedback.

---

## De ce există acest blueprint

Fac în mod repetat același tip de produs: iau modele AI de pe piață (muzică, video, imagine, text/LLM, voce) și le împachetez într-un site frumos, rapid, localizat, pentru oameni care nu le-ar folosi singuri. Clientul intră, parcurge un wizard pas-cu-pas (alege ocazie/stil/destinatar/mesaj → review → plată), iar eu îi livrez produsul finit ca un cadou.

Fiecare astfel de site are **90% structură identică** și **10% specific** (tipul de produs + provider-ul AI + cum arată preview-ul). În loc să regândesc de fiecare dată arhitectura, fixez aici partea comună o singură dată, ca fiecare proiect nou să pornească din aceeași fundație matură și să adauge doar plugin-ul specific produsului.

---

## Cele două proiecte-sursă din care e derivat

| Proiect | Rol în blueprint | Ce iau de la el |
|---|---|---|
| **Manele Cadou** | Sistemul matur, „bătut" în producție | Logica de business completă: pipeline Suno+OpenAI, chat AI cu tool-calling (Irina), recovery emailuri, OpenReplay self-hosted, pixeli/CAPI, observabilitate. Plus `apps/ADMIN_DASHBOARD_BLUEPRINT.md` — spec-ul detaliat al admin-ului generic. **Atenție:** Manele Cadou e multi-tenant cross-domeniu (un deployment → N site-uri). **NU mai construim așa.** |
| **Melodia Ta** | Modelul-țintă pentru proiecte noi | Arhitectura curată single-site: backend NestJS modular (43 module), admin React+Vite separat, Better Auth, deploy single-VPS pe Nginx Proxy Manager cu GHCR/rsync, convenție de porturi pe prefix. **Asta e șablonul pentru tot ce urmează.** |

**Decizia structurală cheie:** proiectele noi NU se mai gândesc cu dashboard comun cross-tenant (ca Manele Cadou). Fiecare site = proiect propriu, repo propriu, bază de date proprie, domeniu propriu, admin propriu, intrare separată în Nginx Proxy Manager. Localizarea se face prin **traduceri în același site**, nu prin tenant-uri. E mai simplu de operat și de raționat. Tot ce e „multi-tenant / siteId / x-site-id" din Manele Cadou se **omite** la proiecte noi (rămâne single-tenant).

---

## Structura setului de documente

| Fișier | Ce conține |
|---|---|
| `README.md` (acesta) | Viziune, ce e comun vs specific, cum se folosește setul |
| `01-STACK-SI-ARHITECTURA.md` | Stack-ul canonic impus, principii de arhitectură, structura de repo, convenția de porturi |
| `02-BAZA-COMUNA-BACKEND-ADMIN.md` | Modulele core comune, modelul de date, settings-în-DB, monitorizarea API-urilor externe + costuri, identitatea clientului pe email SAU telefon, autentificare Better Auth |
| `03-FRONTEND-WIZARD-UX.md` | Frontend public, wizard-ul, standardele de UX mobile-first, i18n, persistența stării |
| `04-ANALYTICS-PIXELI-OPENREPLAY-STRIPE.md` | Pixeli + CAPI server-side, GA4, funnel & atribuire, OpenReplay (overlay adaptabil), Stripe checkout + webhook, dashboard cheltuieli ads vs încasări |
| `05-CHAT-AI-DIRECTII.md` | Chatul și agentul AI — zona NEstandardizată: direcțiile posibile (de la „doar info" la „agent de vânzări complet care comandă din chat") și ce se activează per proiect |
| `06-DEPLOYMENT.md` | Deployment single-VPS: **Coolify** (recomandat, probat pe Manele Cadou în aug. 2026) sau Nginx Proxy Manager; Docker, DNS Cloudflare, backup, skill de deploy dintr-un singur Claude command |
| `07-WORKFLOW-PROIECT-NOU.md` | Procedura completă de la zero: Claude Design → chestionar → chei API → workflow Claude autonom → self-test Chrome MCP → check final |
| `08-CHESTIONAR-ONBOARDING.md` | Lista completă de întrebări pe care agentul trebuie să mi le pună înainte să scrie o linie de cod, grupate pe domenii |
| `09-SKILLS-CLAUDE.md` | Skill-urile Claude Code standard pe care fiecare proiect le primește (deploy, start-app, ops, add-translation etc.) |
| `10-PRODUCT-RECIPES/` | Rețete pre-completate per tip de produs (muzică populară, animăluțul vorbăreț, rugăciunea-ta, video cadou, horoscop) — ProductPlugin + provider + wizard + preview + prețuri gata schițate |
| `11-PRODUCT-BRIEF-SI-BOOTSTRAP.md` | Șablonul de Product Brief (vision-lock — ideea ta blocată) + spec-ul skill-ului `create-project` care generează scheletul rulabil |
| `12-CLAUDE-DESIGN-PROMPTS.md` | Șabloane de prompt pentru Claude Design, coerente ca familie de branduri, distincte per produs |
| `13-MARKETING-AUTOMATION.md` | Growth automat cu AI: ideation campanii Meta/TikTok, prompturi creative, idei de feature, agent recurent, creare automată campanii (3 nivele) |

> **Referință adițională:** `apps/ADMIN_DASHBOARD_BLUEPRINT.md` din repo-ul Manele Cadou rămâne spec-ul detaliat, gata-de-prompt, al **admin-ului** (module, model de date admin, API `/admin/*`, RBAC). Acest set îl înconjoară cu restul platformei (frontend, deployment, workflow, analytics, chat). Citește-le împreună, dar cu **două corecții** când îl aplici la un proiect nou:
> 1. **Ignoră stratul multi-tenant** din el (`siteId`, `x-site-id`, site selector, on-demand TLS) — proiectele noi sunt single-tenant (vezi `01` §2). Tot ce e „filtrat pe siteId" se omite.
> 2. **Stack-ul admin frontend canonic e cel din Melodia Ta** (axios + interceptori + clase `.api.ts`), NU varianta `HttpClient`+`useResource` pe `fetch` din §11 al acelui document. Vezi `01` §3 și `02` §7.

---

## Harta „comun vs specific" pe scurt

| Strat | Comun (identic peste proiecte) | Specific (variază per proiect) |
|---|---|---|
| **Stack** | NestJS + TypeORM + Postgres + Redis/BullMQ; Next.js public; React+Vite admin; Better Auth; Docker; NPM | — |
| **Admin** | ~90% din module: settings, users/guests, orders, payments, AI monitor, communications, analytics, ads, recovery, chat, db-admin, audit | Coloanele de wizard afișate, preview-ul produsului |
| **Backend** | Auth, orders, checkout, stripe-events, settings, analytics, recovery, email/SMS, meta-capi, tiktok-events, chat/ai-chat, storage, queue, health, audit | Modulul de generare (pipeline + provider AI), schema datelor de comandă |
| **Frontend** | Shell, wizard cu state machine, i18n, analytics provider, OpenReplay, checkout inline, guest sessions | Pașii concreți ai wizardului, randarea preview-ului, design/brand |
| **Generare AI** | Pattern: submit async → poll cron → finalizare → livrare; audit per apel; retry | Provider concret (Suno / Veo / Sora / image-to-video / TTS / LLM), prompts, output |
| **Deployment** | Single-VPS, NPM, Docker compose, GHCR/rsync, backup cron, port-prefix | Domeniul, prefixul de port, sub-domeniile |
| **Chat / AI agent** | Infrastructura (conversații, mesaje, presence, web-push) | Cât de „inteligent" e: doar info ↔ agent de vânzări complet (vezi `05`) |

---

## Cum se folosește (rezumat)

1. Eu prototipez UI-ul în **Claude Design** și export design-ul / prototipul.
2. Pornesc Claude Code în repo-ul nou și îi dau acest set + design-ul.
3. Agentul îmi pune întrebările din `08-CHESTIONAR-ONBOARDING.md` (provideri AI, chei, prețuri, pași wizard, ce chat vreau, ce sub-domenii, ce prefix de port etc.).
4. Eu generez prin Grok prompturile/cheile necesare și i le dau, plus de unde se iau cheile externe.
5. Agentul își construiește un **workflow Claude** și implementează backend + admin + Docker + deployment, respectând acest blueprint.
6. Agentul se **auto-testează cu Chrome MCP** (zeci/sute de iterații) până golden-path-ul merge.
7. Eu testez la final și dau feedback prin chat-uri ulterioare.
