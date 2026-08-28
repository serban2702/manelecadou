# AGENTS.md

Instrucțiuni pentru agenți care lucrează pe acest repo.

**Referința completă e [CLAUDE.md](CLAUDE.md)** — stack, deploy, acces la
producție, convenții de cod, capcane. Citește-o înainte de orice modificare
non-trivială. Ce urmează sunt regulile care nu se negociază.

## Producția

- Producția e pe **Coolify (OVH `37.187.159.41`)** din 28 august 2026.
- **Ionos (`212.227.184.215`) nu mai e producția.** Mai rulează, dar nu primește
  trafic, iar baza lui e înghețată în ziua mutării. Interogările pe el răspund
  frumos, cu date vechi de luni de zile; scrierile se pierd. Nu folosi
  `ssh VPSIonos` pentru nimic real.
- Accesul la producție (bază, API de admin, loguri, dump) trece prin
  **`deploy/prod.sh`**. Vezi CLAUDE.md §7.
- **`git push` nu deployează.** Deploy-ul se pornește explicit cu
  `make deploy-coolify`. Fără el, codul rămâne nedeployat, tăcut.

## Cod

- Verifică înainte de commit:
  ```bash
  cd apps/api   && pnpm typecheck && pnpm test
  cd apps/web   && pnpm typecheck && pnpm run check:messages
  cd apps/admin && pnpm typecheck
  ```
- **Commit doar fișierele pe care le-ai atins.** Working tree-ul are frecvent
  modificări străine, necommise — `git add -A` le-ar trimite în producție odată
  cu ale tale.
- Repo-ul nu e pnpm workspace: rulează `pnpm` din directorul appului.
- Orice tabel cu date de client are `siteId` indexat. Îl omiți ⇒ ai făcut un
  tabel cross-tenant fără să vrei, iar datele unui site apar pe altul.
- Orice scrie fișiere trece prin `StorageService`. Un `fs.writeFile` direct
  produce un fișier care există doar pe containerul curent și dispare la
  următorul deploy.
- Schema se schimbă prin `@Entity` + deploy (`synchronize: true` în prod).
  Aditiv e sigur; redenumirile și schimbările de tip **șterg date, tăcut** —
  vezi tabelul din CLAUDE.md §6.4 și fă-le manual.
- `apps/web/messages/ro.json` e sursa de adevăr pentru texte. Cheile lipsă cad pe
  română, deci o traducere uitată se vede ca o frază în altă limbă, nu ca eroare.

## Scriere

- Limba de lucru, în cod și în documentație, e **româna, cu diacritice**.
- Comentariile explică *de ce*, nu *ce*. Dacă un comentariu descrie o decizie sau
  o capcană, păstrează-l când atingi codul din jur.

## Când schimbi infrastructura

Verifică dacă mai spun adevărul: `.claude/skills/`, comentariile din cod care
referă căi sau servere, `CLAUDE.md`. La mutarea pe Coolify, toate cele șapte
skill-uri de operare au rămas să interogheze serverul vechi — continuau să
„funcționeze", pe date moarte. E cel mai prost fel de a greși, fiindcă nimic nu
dă eroare.
