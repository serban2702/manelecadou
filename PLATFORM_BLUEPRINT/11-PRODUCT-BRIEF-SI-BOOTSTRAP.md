# 11 — Product Brief (vision-lock) & skill de bootstrap

> Cele două piese care fac automatizarea posibilă fără să-ți pierzi viziunea: (1) **Product Brief** = ancora ideii tale, scrisă o singură dată, pe care AI-ul nu o contrazice niciodată; (2) **`create-project`** = skill-ul care transformă brief-ul + rețeta în schelet rulabil. Cu astea două, input-ul tău uman se reduce la 3 momente: aprobi brief-ul, prototipezi în Claude Design, dai check-ul final.

---

## Partea 1 — Product Brief (șablon)

Un singur fișier `PRODUCT-BRIEF.md` la rădăcina fiecărui proiect. Scurt (1-2 pagini), dar **autoritate supremă** — în caz de conflict între ce zice agentul și brief, brief-ul câștigă. Agentul îl citește primul și nu deviază de la el.

### Secțiuni (completezi tu, ajutat de Grok/AI):

**1. Esența (1 frază).** Ce e produsul și pentru cine. Ex: „Clipuri amuzante în care animalul tău vorbește, de dat cadou sau postat."

**2. Emoția vândută.** Ce simte clientul. Ex: „surpriză + râs + «trebuie să-l arăt tuturor»". Asta dictează tonul întregului site.

**3. Publicul țintă.** Cine cumpără, de pe ce canal (TikTok/Meta), vârstă, context.

**4. Poziționare & diferențiere.** De ce de la mine, nu de la altul. Ce promitem.

**5. Brand.** Nume, domeniu, tonul vocii (cald/hazliu/solemn), 3-5 cuvinte de stil vizual, paletă orientativă, ce NU vrem (anti-exemple).

**6. Produsul & livrabilul.** Ce primește exact clientul (format, durată, câte variante).

**7. Prețuri & pachete.** Cu valută. Ce e gratuit/teaser (dacă e).

**8. Granițele (ce NU facem).** Critic pentru autonomie: feature-uri excluse, conținut interzis, ton interzis, decizii pe care AI-ul NU le ia singur (ex. „nu schimbă prețul", „nu lansează campanii cu buget fără aprobare").

**9. Ce las la latitudinea AI-ului.** Explicit ce poate decide singur (copy, micro-UX, structura tehnică, ideile de marketing pe care le propune) vs ce cere aprobare.

**10. Metrici de succes.** Ce înseamnă „merge" (conversie țintă, cost/achiziție max, marjă min per comandă).

> Regula de aur: orice nu e în brief și nu e în blueprint → agentul **întreabă**, nu presupune. Brief-ul + rețeta + blueprint = tot contextul de care are nevoie ca să lucreze singur fără să-ți trădeze ideea.

---

## Partea 2 — Skill `create-project` (bootstrap)

Skill Claude Code care, pornind de la răspunsurile de onboarding + rețetă + brief, generează scheletul rulabil. Practic: fiecare proiect pornește de la ~90% gata.

### Ce face, pas cu pas:
1. **Citește** brief-ul + rețeta tipului de produs + blueprint-ul.
2. **Pune întrebările deschise** rămase (din rețetă + `08`) — doar ce nu e deja decis.
3. **Generează structura de repo** (`01` §3): monorepo pnpm cu frontend/admin/backend, scripts, docs, `.claude/`.
4. **Copiază baza comună** din proiectul-șablon (Melodia Ta ca sursă): modulele core backend, shell-ul de admin (axios + `.api.ts` + auth Better Auth), shell-ul de frontend (wizard engine + i18n + analytics provider + OpenReplay), docker-compose dev+prod, scripts/deploy.sh, skill-urile din `09`.
5. **Aplică prefixul de port** ales peste tot (compose, `.env.example`, scripts, nume containere).
6. **Generează `CLAUDE.md` + `CONVENTIONS.md`** ale proiectului, derivate din blueprint + brief (context specific proiectului pentru agenții viitori).
7. **Schelet ProductPlugin** pentru `kind`-ul produsului (schema wizard goală, stub de pipeline pentru providerul ales, componenta de preview).
8. **Setează `.env`** cu bootstrap-ul + locuri pentru cheile pe care le dau (ghidat: de unde le iau).
9. **Pornește stack-ul local** și confirmă boot + health.
10. **Predă** un backlog de taskuri (`tasks/backlog/`) pentru restul implementării specifice, pe care bucla autonomă (`12`/`07`) le execută.

### Sursa șablonului
Două abordări (aleg una):
- **Template repo** — un repo „starter" cu baza comună, pe care `create-project` îl clonează și îl curăță. Cel mai curat; întrețin un singur loc baza comună.
- **Copiere din Melodia Ta** — `create-project` extrage modulele core dintr-un proiect existent. Mai simplu de pornit, dar baza comună „driftează" între proiecte.

Recomandare: pe termen scurt copiez din Melodia Ta; după 2-3 proiecte, extrag un **template repo** dedicat (sau chiar pachete npm interne pentru module cu adevărat stabile).

### Decizia deschisă importantă
Cât din baza comună e **copiată** (fiecare proiect are propria copie, evoluează independent) vs **partajată** (pachet/lib comun, fix într-un loc → toate proiectele). Recomandare: copiată la început (simplu, izolat), partajată doar pentru piesele foarte stabile (HttpClient admin, analytics provider, OpenReplay, bot-detection) când durerea de a le ține sincronizate devine reală.
