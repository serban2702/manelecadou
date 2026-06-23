# 07 — Workflow: de la design la site live (proiect nou)

> Procedura completă după care vreau să funcționeze dezvoltarea fiecărui site nou. Pe scurt: eu fac design-ul în Claude Design, încarc prototipul, agentul îmi pune întrebările din `08`, îmi cere cheile, apoi își construiește un workflow Claude și finalizează singur backend + admin + Docker + deployment, testându-se cu Chrome MCP. Eu dau doar check-ul final.

---

## Faza 0 — Design în Claude Design (eu)
Prototipez UI-ul site-ului public (și, opțional, schițe de admin) în Claude Design. Export design-ul / prototipul. Acesta e singurul input creativ pe care îl dau la început — restul îl conduce agentul prin întrebări.

## Faza 1 — Inițializare & context (agentul)
1. Pornesc Claude Code în repo-ul nou (gol) și îi dau: acest set `PLATFORM_BLUEPRINT/` + design-ul exportat.
2. Agentul citește blueprint-ul și design-ul, apoi **îmi pune întrebările din `08-CHESTIONAR-ONBOARDING.md`** — toate aspectele: tip produs, provideri AI + de unde iau cheile, prețuri, pași wizard, limbi, ce chat vreau (direcția din `05`), sub-domenii, prefix de port, email/SMS, facturare, pixeli, GHCR vs rsync etc.
3. **NU scrie cod până nu are răspunsurile.** Întrebările vin grupate, clar, una după alta sau într-un bloc, ca să pot răspunde rapid.

## Faza 2 — Chei & secrete (eu, ghidat de agent)
- Pentru fiecare integrare, agentul îmi spune **exact de unde iau cheia** (Stripe Dashboard → API keys; OpenAI → platform; provider video → consola lui; Cloudflare → token scoped; Meta → Events Manager + Marketing API; etc.) și ce scope minim trebuie.
- Folosesc **Grok** pentru a genera prompturile AI (writer/critic/system prompt) și orice text de care e nevoie; i le dau agentului.
- Agentul pune cheile în settings-DB (criptate) sau în `.env` (bootstrap), conform `02`/`06`. Niciun secret în repo.

## Faza 3 — Scaffolding (agentul)
Agentul inițializează structura din `01` §3: monorepo pnpm (frontend/admin/backend), docker-compose dev+prod cu **prefixul de port** ales, `.env.example`, `CLAUDE.md` + `CONVENTIONS.md` derivate din acest blueprint, skill-urile din `09`. Pornește stack-ul local și confirmă că boot-ează.

## Faza 4 — Implementare prin workflow Claude (agentul, autonom)
Agentul își construiește un **workflow** (orchestrare multi-agent) și implementează în ordinea logică:
1. **Fundația backend:** auth (Better Auth), settings-DB, users/guests, storage, health, audit.
2. **Comandă & plată:** orders (cu email **și** telefon), checkout, stripe-events + webhook.
3. **Generarea (specific):** modulul de provider AI + pipeline BullMQ (submit async → poll cron → finalizare → livrare) + `ai_provider_calls` cu cost.
4. **Frontend public:** shell + wizard (cu toate standardele UX din `03`) + checkout inline + i18n + guest sessions.
5. **Analytics & pixeli:** AnalyticsProvider, OpenReplay, landing tracker, meta-capi/tiktok-events, wizard_sessions funnel.
6. **Admin:** modulele core din `02` §6 (Overview, Orders, Payments, AI Monitor, Analytics, Ads, Customers, Settings, Content, System) + Chat dacă e cazul.
7. **Recovery + email/SMS + newsletter.**
8. **Chat & agent AI** conform direcției din `05` (dacă proiectul are).
9. **Deployment:** Dockerfile-uri, compose prod, scripts/deploy.sh, skill `/deploy`, config NPM + Cloudflare.

La fiecare pas, respectă convențiile (`.api.ts` în admin, fără migrations, observabilitate, mobile-first).

## Faza 5 — Self-test cu Chrome MCP (agentul)
Agentul **se testează singur** cu Chrome MCP, iterativ (zeci/sute de ori), pe golden-path și edge-cases:
- Landing → wizard pas-cu-pas → review → checkout (card test 4242...) → success → livrare.
- Mobile viewport: scroll-to-top la schimbare pas, sticky CTA, validare soft, focus.
- Funnel events ajung în GA4/pixeli; OpenReplay capturează sesiunea; webhook Stripe procesat; comanda apare în admin cu status corect; emailul de livrare pleacă.
- Chat (dacă e): conversație, presence, link de plată, escaladare.
- Repară ce găsește, re-testează, până e verde. Backend testat și cu colecție Bruno.

## Faza 6 — Check final (eu)
Agentul îmi predă un site **deja testat de el**. Eu îl testez la rândul meu și dau feedback prin chat-uri ulterioare (sugestii, ajustări de copy, design, flux). Agentul aplică și re-deploy.

---

## Principii ale workflow-ului
- **Întreabă întâi, codează după.** Niciun assumption neclarificat — orice ambiguitate devine o întrebare din `08`.
- **Agentul se testează pe el, eu validez la final** — nu invers. Vreau să primesc ceva care merge, nu un schelet de depanat.
- **Reutilizează blueprint-ul, nu reinventa.** 90% e deja decis aici; agentul scrie doar specificul + integrarea.
- **Documentează pe parcurs** în `docs/<categorie>/` (ca la Melodia Ta) — pentru mine peste 3 luni și pentru agenții viitori.
- **Commit-uri mici, deploy des** după ce golden-path-ul e verde.
