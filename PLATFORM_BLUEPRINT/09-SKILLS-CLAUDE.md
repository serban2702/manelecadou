# 09 — Skill-uri Claude Code standard per proiect

> Fiecare proiect nou primește un set de skill-uri Claude Code în `.claude/skills/` (+ comenzi/agenți), ca eu să operez totul prin comenzi simple, fără să ating manual VPS-ul sau DB-ul. Derivate din ce există deja în Manele Cadou și Melodia Ta. Le adaptez la prefixul de port, domeniul și provider-ul fiecărui proiect.

---

## 1. Skill-uri de dezvoltare & deploy (toate proiectele)

| Skill | Ce face |
|---|---|
| `/start-app` | Pornește tot stack-ul local (postgres, redis, adminer, storage, backend, frontend, admin) pe prefixul de port al proiectului + afișează toate URL-urile utile (web, admin, API, Adminer, colecția Bruno). |
| `/deploy` | Tot lanțul de producție dintr-o comandă: push/build (GHCR sau rsync) → backup predeploy → `up -d` pe VPS → health check pe `api.<proiect>.ro/health`. Plus variante `deploy-api` / `deploy-web` / `deploy-admin`. |
| `/logs` | Follow logurile remote (toate sau per serviciu: api/web/admin). |
| `/backup` + `/rollback` | Descarcă dump DB local / listează backup-uri prod + restore. |
| `/status` | `docker compose ps` remote + health rapid. |

## 2. Skill-uri de operare (ops) — pentru investigare în producție

Din familia `ops-*` a Manele Cadou (funcționează din container `ops` cu Claude pe abonament, și de pe Mac prin SSH):

| Skill | Ce face |
|---|---|
| `ops-client` | Dosar 360° pe un client (email/telefon/nume/id): user/guest, plăți (inclusiv eșuate), generări cu status, conversații, erori corelate. |
| `ops-payment` | Investigare plată: „mi s-au luat banii", plăți failed, plată reușită fără livrare, reconciliere Stripe vs DB. |
| `ops-regen` | Regenerează/modifică un livrabil (voce greșită, nume greșit, refacere) — adaptat la pipeline-ul produsului. |
| `ops-errors` | Triaj erori recente + corelare cu sesiuni OpenReplay + generări eșuate. |
| `ops-db` | Query/mutate controlat pe DB prod: SELECT liber, UPDATE/DELETE doar cu confirmare + plasă de siguranță. |

## 3. Skill-uri specifice produsului (după caz)

| Skill | Ce face |
|---|---|
| `add-translation` / `add-locale` | Adaugă o limbă nouă (copiază dicționarul, traduce, verifică). |
| `add-email-template` | Adaugă un șablon nou de email (registry + render + i18n) + preview. |
| `improve-ai-chat` | (Dacă proiectul are agent AI) analizează review-urile nerezolvate, implementează fix-uri în prompt + cod, deploy, marchează rezolvate. |
| skill-uri de conținut | CRUD rapid pe liste (ocazii/stiluri/voci/exemple) dacă e mai comod decât din admin. |

> La Manele Cadou există și `/add-site` (multi-tenant). **Nu se portează** la proiecte noi single-site.

---

## 4. Agenți & loop (opțional, din Melodia Ta)

Pentru proiecte unde vreau dezvoltare autonomă pe taskuri, portez și modelul de echipă din Melodia Ta:
- **Agenți:** `orchestrator` (planifică taskuri, nu codează), `implementer` (ia task din backlog, implementează, commit), `documenter`, `tester` (Bruno backend / Chrome MCP UI), `reviewer`.
- **Comenzi:** `/next-task`, `/start-loop` (loop la 30 min cât timp există backlog).
- **Fișiere de coordonare:** `TASKS.md` (index), `tasks/<status>/T-NNN.md`, `docs/<categorie>/`, `docs/sessions/`.

Acest model e opțional per proiect — îl activez pentru proiecte mari cu backlog lung, nu pentru lansări rapide.

---

## 5. Container `ops` (Claude Code în producție) — opțional

Modelul din Manele Cadou (§17 CLAUDE.md): un container `ops` în stiva prod cu Claude Code pe abonamentul Max, accesibil ca terminal web din admin (`/terminal`) + chat mode. Permite operare în producție (psql cu rol limitat `claude_ops`, wrapper `api-admin`, skill-urile ops) fără cost API suplimentar. Se portează la proiectele unde vreau operare asistată direct pe server. Login Claude o singură dată, persistat în volum.

---

## Principiu
Scopul skill-urilor: **să nu ating niciodată manual VPS-ul sau DB-ul pentru rutină.** Orice operațiune recurentă (deploy, logs, backup, investigare client/plată/eroare, regenerare) = o comandă Claude. Fiecare proiect pornește cu setul de bază (§1–§2) și adaugă specificul (§3) la onboarding.
