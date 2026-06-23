# 13 — Marketing & growth automat (cu AI)

> Layer-ul care îți dă idei de campanii Meta/TikTok, prompturi pentru creative-uri, idei de feature-uri la care nu te-ai gândit, și (mai târziu) creează efectiv campanii — cu cât mai puțin input din partea ta. Trei nivele, de la cel mai ușor (ideation) la cel mai avansat (creare automată de campanii).

---

## Nivel 1 — Ideation engine (ușor, valoare imediată)

Un agent AI care, alimentat cu Product Brief-ul + datele tale reale (funnel din `analytics`, OpenReplay, comenzi, ce s-a vândut), produce periodic:

- **Unghiuri de campanie** — 5-10 angle-uri diferite (emoțional, amuzant, urgență, social proof, ocazie sezonieră) cu public țintă sugerat per platformă (Meta vs TikTok au logici diferite).
- **Variante de copy** — headline-uri + primary text + CTA, în tonul brandului, A/B-ready.
- **Briefuri de creative + prompturi gata de generat** — pentru fiecare angle, un prompt pentru generatorul de imagine/video (descrierea scenei, stil, format vertical pt Reels/TikTok), plus ce hook în primele 2 secunde. Practic: îți dă materialul de intrare pentru a produce creative-uri AI.
- **Idei de feature & produs** — pe baza a ce abandonează userii în funnel, ce întreabă în chat, ce face concurența: feature-uri noi, add-on-uri, ocazii noi, pachete. Exact „idei la care nu te-ai gândit".
- **Calendar sezonier** — sugestii legate de sărbători/evenimente (Crăciun, Valentine's, 8 Martie, Paște, început de școală) cu lead-time.

**Livrare:** rulează ca skill on-demand (`/marketing-ideas`) + ca **agent recurent** (`/schedule` sau cron) care îți trimite săptămânal un digest (email/admin/Notion) cu propuneri. Tu aprobi ce-ți place.

---

## Nivel 2 — Creative production assist (mediu)

- Conectezi prompturile de creative din Nivel 1 la un **generator de imagine/video** (același tip de provider ca produsul, sau dedicat ads) → AI generează variantele de creative, tu alegi.
- **Bibliotecă de creative-uri** în admin: ce s-a generat, ce s-a folosit, ce a performat (legat de ad-spend/ROAS din `04`).
- **Reciclare a ce performează:** agentul vede din `ad_spend` + atribuire ce angle/creative a mers și propune variații pe tema câștigătoare.

---

## Nivel 3 — Creare automată de campanii (avansat, opțional)

- Integrare cu **Meta Marketing API** și **TikTok Marketing API** pentru a **crea efectiv** campanii/adset-uri/ads din admin (sau propuse de agent, aprobate de tine).
- Flux: agent propune campanie completă (audiență + buget + creative + copy) → tu aprobi cu un click → se publică prin API → spend-ul revine în dashboard-ul de ROAS (`04`).
- **Reguli automate:** scale up ce are ROAS bun, pauză la ce pierde bani (cu plafoane și aprobare pentru schimbări mari — vezi „granițele" din brief).
- TikTok necesită cont business verificat; Meta e mai accesibil → încep cu Meta.

> Atenție: crearea automată de campanii cu **buget real** e zona cu cel mai mare risc financiar. Brief-ul (`11` §8) trebuie să spună explicit ce poate face AI-ul singur (ex. propune oricât, dar nu publică buget > X fără aprobarea mea). Pornesc cu „propune, eu aprob", nu „publică singur".

---

## Ce se construiește în platformă pentru asta

- **Modulul de marketing în admin** (extinde ce e deja schițat în `04` — ad-spend, ROAS) cu: pagina de Ideation (digest + istoricul propunerilor), biblioteca de creative-uri, și (Nivel 3) managementul campaniilor.
- **Sursele de date pentru agent:** funnel `wizard_sessions`, evenimente `analytics`, comenzi/venit `orders`, întrebări din chat, `ad_spend` + ROAS. Cu cât are mai mult context real, cu atât ideile sunt mai bune.
- **Skill-uri:** `/marketing-ideas` (on-demand) + agent recurent prin `/schedule`.

---

## Cum se leagă de restul automatizării
Marketing-ul nu e separat de dezvoltare — e parte din aceeași buclă autonomă (`07`/`11`). Agentul care construiește site-ul îi construiește și modulul de marketing; agentul recurent de growth rulează după lansare. Tu rămâi la nivelul deciziilor: aprobi angle-uri, creative-uri, bugete — nu le produci manual.

> **Realist:** Nivelul 1 (ideation) e ușor și aduce valoare din prima. Nivelul 3 (creare automată campanii) e un proiect în sine per platformă — îl fac după ce am 2-3 site-uri live și ideation-ul + ROAS-ul merg solid.
