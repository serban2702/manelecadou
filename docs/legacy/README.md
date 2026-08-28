# Documentație istorică

Ce e aici descrie platforma **înainte de 28 august 2026**, când producția rula pe
Ionos, cu Caddy pentru TLS și fișierele pe discul serverului.

**Nu urma pașii de aici.** Serverul Ionos (`212.227.184.215`) mai există ca plasă
de siguranță, dar nu mai primește trafic, iar baza lui e înghețată în ziua mutării:
interogările răspund frumos, cu date vechi, iar scrierile se pierd.

Pentru starea reală: **`CLAUDE.md`** la rădăcina repo-ului. Mutarea, pas cu pas:
`docs/COOLIFY_R2.md`.

Documentele rămân aici fiindcă explică *de ce* arată codul cum arată — deciziile
de multi-tenancy, planul i18n, prima punere în funcțiune — și fiindcă, dacă
vreodată repornim ceva pe Ionos, aici scrie cum era legat.

| Fișier | Ce descrie | Ce l-a înlocuit |
|---|---|---|
| `INITIAL_DEPLOY.md` | prima punere în funcțiune pe un VPS gol | CLAUDE.md §5, `docs/COOLIFY_R2.md` |
| `MULTISITE_DEPLOY.md` | TLS on-demand în Caddy pentru domenii de tenant | CLAUDE.md §5.1, §14 (Traefik) |
| `ADD_NEW_SITE.md` | adăugarea unui domeniu nou | CLAUDE.md §14 + skill-ul `/add-site` |
| `MULTI_SITE_TODO.md` | planul refactorului multi-tenant (livrat) | CLAUDE.md §8 |
| `I18N_PLAN.md` | planul de internaționalizare (livrat) | CLAUDE.md §11.5 |
| `PROJECT_PLAN.md` | planul inițial de dezvoltare | CLAUDE.md, în întregime |
| `OVERNIGHT_JOURNAL.md` | jurnal de lucru automat | — |
