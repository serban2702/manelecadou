# Statistica campanii — Meta vs site vs first-touch viață

**Data:** 17 august 2026  
**Sursă:** producție (`payments` + `analytics_sessions` + `ad_spend`)  
**Doar raport local** — nu e în admin / pe site.

Plăți `paid` analizate: **424** · venit Stripe: **12.917 lei**  
Spend Meta manelecadou (fără Melodia-ta): **9.664 lei**  
Spend Meta tot contul (inclusiv Melodia-ta): **10.528 lei**

---

## Cele 3 lentile

| Lentilă | Ce numără | Fereastră |
|---|---|---|
| **Meta** | Conversii Purchase + valoare din Ads Manager (`ad_spend`) | 7 zile click + 1 zi view (modelul Meta) |
| **Site** | Plăți Stripe cu snapshot înghețat pe rând (`attributionCampaignName`) | Last-touch; Facebook/Instagram câștigă dacă există touch în ultimele **7 zile** |
| **First-touch viață** | Prima campanie care l-a adus pe om; **toate** plățile lui ulterioare (email, direct, chat, Google) rămân pe campania aia | Fără expirare, înainte de fiecare plată |

Persoana la „viață” e legată prin visitor / user / email / guest, plus sesiunile de pe IP-ul plății. Doi oameni pe același Wi‑Fi pot fi lipiți greșit. Nu include view-through (nu avem impresii).

---

## Pe campanie (RON)

| Campanie | Spend | Meta conv | Meta valoare | Site conv | Site venit | Viață conv | Viață venit |
|---|---:|---:|---:|---:|---:|---:|---:|
| **C3 — OCAZII** | 4.676 | **184** | 6.490 | **165** | 5.956 | **195** | **6.843** |
| Manele cadou - vanzari | 1.978 | 40 | 1.200 | 25 | 810 | 41 | 1.310 |
| C2 — RO | 904 | 17 | 630 | 13 | 470 | 13 | 440 |
| CBO_TESTING_CONV_ BROAD simplu | 527 | 15 | 470 | 10 | 311 | 8 | 251 |
| Manele cadou - vanzari – opt. iunie | 245 | 4 | 125 | 5 | 155 | 6 | 185 |
| ABO : broad simplu : Statice | 67 | 4 | 120 | 4 | 120 | 1 | 30 |
| C1 — DIASPORA | 405 | 3 | 90 | 1 | 30 | 2 | 60 |
| CBO : broad simplu : Statice | 76 | 2 | 60 | 2 | 60 | 1 | 30 |
| ABO_TESTING_CONV_ | 254 | 2 | 60 | 2 | 60 | 2 | 60 |
| ABO : interese : Statice | 59 | 2 | 100 | 0 | 0 | 2 | 60 |
| Test – opt. iunie | 143 | 1 | 30 | 1 | 30 | 1 | 30 |
| CBO : Interese : Statice | 54 | 1 | 30 | 1 | 30 | 1 | 30 |
| Manele cadou - nou | 40 | 1 | 0 | 0 | 0 | 0 | 0 |
| Campanii test fără conversii | ~238 | 0 | 0 | 0 | 0 | 0 | 0 |
| **MANELECADOU - SALES (TikTok)** | — | — | — | 8 | 275 | 21 | 665 |
| **Fără campanie** | — | — | — | 187 | 4.610 | 130 | 2.924 |
| Melodia-ta (alt brand, același ad account) | 864 | 9 | 285 | 0 | 0 | 0 | 0 |

Campaniile test fără conversii (spend ars, 0 Purchase): `CBO_TESTING_CONV_ BROAD ADV+`, `CBO _ campania castigatoare (BID CAP)`, `CBO _ campania castigatoare (cost cap)`, `CBO_TESTING_CONV_ adv+`, `CBO_TESTING_CONV_ BROAD simplu v.2`, `Test - Manele cadou - vanzari`.

---

## C3 — OCAZII (campania mare)

Spend: **4.676 lei** · AOV site ~**36 lei** · mix: Standard / Plus / Premium.

| Lentilă | Conv | Venit | CPA (spend / conv) | ROAS (venit / spend) |
|---|---:|---:|---:|---:|
| Meta | 184 | 6.490 | **25,4 lei** | **1,39** |
| Site (7 zile) | 165 | 5.956 | 28,3 lei | 1,27 |
| First-touch viață | 195 | 6.843 | **24,0 lei** | **1,46** |

Viața trage **+30 plăți / +887 lei** față de site: oameni intrați prima dată din C3, care au plătit mai târziu din email, direct sau chat.

E **peste** Meta (195 vs 184) pentru că noi numărăm și comenzile de după fereastra lor de 7 zile, pe viața clientului. Meta se oprește la 7 zile de la click (+ 1 zi view).

**Verdict C3:** profitabilă la toate cele 3 lentile. Plafonul de break-even (cu TVA 21% pe ads, AOV ~36) e ~**28 lei CPA**. C3 e sub plafon.

---

## Cum să citești cifrele

- **Meta** = ce crede Ads Manager că a convertit. Bun pentru CPA de licitat.
- **Site** = ce putem lega de o plată Stripe cu regula de 7 zile. Mai strict, fără view-through.
- **Viață** = LTV al oamenilor a căror **primă** campanie a fost asta. Bun pentru „a meritat C3 pe termen lung?”.

**Manele cadou - vanzari** rămâne pe minus și la viață: 1.310 venit / 1.978 spend = ROAS **0,66** (CPA Meta 49 lei).

---

## De ce Meta și site-ul nu bat 1:1

Fereastra de 7 zile de pe site rezolvă doar: „l-am văzut noi pe Facebook, a plecat, s-a întors în 7 zile”. Meta atribuie și conversii la care **noi n-avem click-ul**.

| | Site | Meta |
|---|---|---|
| De la ce se numără cele 7 zile | o **sesiune** salvată (UTM sau referrer Facebook) | **click-ul lor** (`fbclid`), intern |
| View-through | nu există | **1 zi** |
| Știe campania fără UTM | nu | da |

Alte găuri: tracker pornit târziu (mai 2026), checkout din chat fără cookies (istoric), reclame fără UTM (doar `fbclid`), 9 conversii Melodia-ta în același ad account.

Pe C3, gap-ul Meta 184 vs site 165 (19 conversii) stă în plăți din fereastra campaniei care la noi sunt Facebook-fără-nume, direct sau fără sursă. Nu le mutăm pe C3 fără să inventăm.

---

## Snapshot site — detaliu (424 paid)

| Campanie | Sursă | Conv | Venit | AOV |
|---|---|---:|---:|---:|
| C3 — OCAZII | facebook | 163 | 5.896 | 36,17 |
| C3 — OCAZII | instagram | 2 | 60 | 29,99 |
| Manele cadou - vanzari | facebook | 25 | 810 | 32,39 |
| C2 — RO | facebook | 13 | 470 | 36,14 |
| CBO_TESTING_CONV_ BROAD simplu | facebook | 10 | 311 | 31,09 |
| MANELECADOU - SALES | tiktok | 8 | 275 | 34,37 |
| Manele cadou - vanzari – opt. iunie | facebook | 5 | 155 | 30,99 |
| ABO : broad simplu : Statice | facebook | 4 | 120 | 29,99 |
| CBO : broad simplu : Statice | facebook | 2 | 60 | 29,99 |
| ABO_TESTING_CONV_ | facebook | 2 | 60 | 29,99 |
| Alte campanii (câte 1) | facebook | 4 | 120 | 29,99 |
| (fără campanie) | (fără sursă) | 64 | 788 | 12,32 |
| (fără campanie) | google | 43 | 1.278 | 29,71 |
| (fără campanie) | direct | 39 | 1.247 | 31,96 |
| (fără campanie) | facebook | 23 | 750 | 32,60 |
| (fără campanie) | email | 13 | 458 | 35,22 |
| (fără campanie) | instagram | 4 | 60 | 15,00 |
| (fără campanie) | chatgpt.com | 1 | 30 | 29,99 |

AOV-ul mic de la „fără sursă” (12,32) include plăți 0 lei (promo 100%) și rânduri vechi fără `amountRonCents` complet.

---

## Recalcul CPA / ROAS (formule)

```
CPA  = spend_campanie / conversii
ROAS = venit / spend_campanie
```

Pentru decizie de buget: **CPA = spend Meta / conversii Meta**.  
Pentru „câți bani am încasat de la oamenii ăia”: **venit Stripe** (coloanele Site sau Viață).
