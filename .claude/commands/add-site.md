---
description: Adaugă un site nou în platforma multi-tenant manelecadou (DB + /etc/hosts local + traduceri + verificare DNS pe prod). Folosește când userul cere "adaugă site nou", "site nou pentru <țară>", "creează un site Manele <X>".
---

# Add new site

Skill care creează un site nou în platforma multi-tenant manelecadou. Suportă două moduri: **local** (cu domeniu `.local` + `/etc/hosts`) și **producție** (cu domeniu real + verificare DNS).

## Pas 1 — Colectează parametrii

Întreabă userul (sau folosește valorile dacă le-a dat deja în prompt):

| Param | Exemple |
|---|---|
| **Mod** | `local` sau `prod` |
| **Slug** | `gr`, `hr`, `mk`, `sl`, `ba`, `al` (unic, lowercase, fără spații) |
| **Domain** | local: `manele-gr.local` · prod: `manele-gr.com` |
| **Name** | `Manele Greece` |
| **Locale** | `el` (greacă), `hr`, `sl`, `bs`, `sq` (albaneză), `mk` |
| **Currency** | `EUR`, `RON`, `BGN`, `RSD`, `TRY`, `HRK`, `MKD` |
| **Base price (EUR)** | `19` (se convertește în cents) |
| **Gift price (EUR)** | `49` |
| **Tip muzică locală** | pentru basePrompt Suno (ex. „laiko greacă", „turbofolk sârbă", „čalgija macedoneană") |

Dacă lipsesc, întreabă pe rând. Pe câmpuri opționale (brand, seo) folosește default sensibile.

## Pas 2 — Verificări pre-creare

```bash
# Verifică stack-ul rulează
docker compose -f "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou/docker-compose.yml" ps --format '{{.Name}}\t{{.Status}}' | grep manelecadou

# Verifică slug-ul nu există deja
docker exec manelecadou-postgres-1 psql -U manelecadou -d manelecadou -tA -c \
  "SELECT slug FROM sites WHERE slug = '<SLUG>' OR domain = '<DOMAIN>';"
# Output gol = OK; orice output = abandonează cu eroare clară.
```

## Pas 3 — Traduceri UI (apps/web/messages/<locale>.json)

```bash
ls "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou/apps/web/messages/<LOCALE>.json"
```

- Dacă există → skip.
- Dacă lipsește → copiază din `ro.json` și anunță userul că trebuie tradus manual:
  ```bash
  cp "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou/apps/web/messages/ro.json" \
     "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou/apps/web/messages/<LOCALE>.json"
  ```
  Mesaj clar către user: „Fișierul `<LOCALE>.json` e copiat din `ro.json`. Tradu manual textele înainte de deploy."

## Pas 4 — Creează site-ul în DB (prin SQL direct)

Folosește `INSERT` direct în Postgres. Câmpurile `brand`, `seo`, `analytics`, `stripe`, `suno`, `social`, `companyInfo` sunt jsonb.

```bash
docker exec manelecadou-postgres-1 psql -U manelecadou -d manelecadou <<SQL
INSERT INTO sites (
  slug, domain, name, locale, currency,
  "basePriceCents", "giftPriceCents",
  brand, seo, analytics, stripe, suno, social, "companyInfo",
  "fromEmail", "supportEmail", "adminEmails",
  active, "isDefault", "sslEnabled", "maintenanceMode"
) VALUES (
  '<SLUG>', '<DOMAIN>', '<NAME>', '<LOCALE>', '<CURRENCY>',
  <BASE_CENTS>, <GIFT_CENTS>,
  '{"primaryColor":"#FF6B6B","accentColor":"#4ECDC4","tagline":"<TAGLINE>"}'::jsonb,
  '{"title":"<NAME>","description":"<DESC>","keywords":"manele,<LOCALE>"}'::jsonb,
  '{}'::jsonb,
  '{"productName":"<NAME>","statementDescriptor":"MANELE<UPPER>"}'::jsonb,
  '{"basePrompt":"<MUSIC_PROMPT>","lyricsLocale":"<LOCALE>"}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  NULL, NULL, '{}',
  true, false, <SSL_BOOL>, false
);
SQL
```

Pentru `<MUSIC_PROMPT>` folosește prompturi native populate per țară (vezi reference în `MULTI_SITE_TODO.md`):
- **EL**: `laiko greek pop, bouzouki, oriental scale, melismatic male vocal, Hijaz mode, mid tempo`
- **HR**: `narodno croatian folk-pop, accordion, tamburica, oriental melisma, mid tempo`
- **SL**: `narodno-zabavna slovenian folk pop, accordion, polka rhythm, oriental scale touches`
- **BS**: `sevdah bosnian folk, accordion, oriental scale, melismatic male vocal, slow tempo`
- **SQ**: `tallava albanian roma, frantic clarinet, darbuka, accordion, oriental scale, fast 130 BPM`
- **MK**: `čalgija macedonian roma, oriental scale, kaval flute, tapan drums, melismatic vocal`

`<SSL_BOOL>` = `false` pentru local, `true` pentru prod.

## Pas 5 — Mod LOCAL: mapează /etc/hosts

```bash
# Verifică dacă e mapat deja
grep "<DOMAIN>" /etc/hosts || echo "MISSING"
```

Dacă lipsește, **NU adăuga automat** (necesită sudo). Afișează userului comanda exactă:
```bash
sudo sh -c 'echo "127.0.0.1 <DOMAIN>" >> /etc/hosts'
```

## Pas 6 — Mod PROD: DNS, apoi domeniul în Coolify

**Ordinea contează.** Traefik cere certificatul în clipa în care vede domeniul, nu la
primul request. Dacă adaugi domeniul în Coolify înainte ca DNS-ul să arate spre OVH,
Let's Encrypt validează spre serverul vechi, eșuează, iar Traefik intră în backoff —
site-ul servește `TRAEFIK DEFAULT CERT` chiar și după ce DNS-ul e corect. Exact așa
au picat toate cele 7 domenii la cutover-ul din 28 aug 2026.

**1. Întâi DNS** — A record la Cloudflare, **nor gri (DNS only)**:

```bash
dig +short <DOMAIN>     # trebuie să întoarcă 37.187.159.41
```

Cu norul portocaliu, HTTP-01 nu ajunge la Traefik și certificatul nu se emite
niciodată.

**2. Abia apoi domeniul în Coolify**, pe serviciul **`router`** (nu pe `web`, nu pe
`api` — routerul le împarte pe path). Coolify → resursa `manele-cadou-app` →
serviciul `router` → câmpul Domains, adaugi la lista existentă:

```
https://<DOMAIN>:80,https://www.<DOMAIN>:80
```

Lista completă, gata de lipit, o generezi cu:

```bash
make coolify-domains
```

**3. Dacă domeniul a fost adăugat înainte de DNS** (sau certificatul nu vine în
2-3 minute), scoate Traefik din backoff:

```bash
ssh ovh 'docker restart coolify-proxy'
```

Certificatele se emit apoi în mai puțin de un minut. Verifică:

```bash
curl -sI https://<DOMAIN> | head -1
echo | openssl s_client -connect <DOMAIN>:443 -servername <DOMAIN> 2>/dev/null \
  | openssl x509 -noout -issuer -dates
```

## Pas 7 — Verificare end-to-end

```bash
# 1. Site config răspunde corect
curl -s http://localhost:1501/api/public/site -H 'Host: <DOMAIN>' | head -c 300

# 2. Frontend răspunde (local; pe prod site-ul iese prin Traefik → router)
curl -sI -H 'Host: <DOMAIN>' http://localhost:1500 | head -1

# 3. Admin selector vede site-ul
curl -s http://localhost:1501/api/admin/sites \
  -H 'Authorization: Bearer <ADMIN_TOKEN>' \
  -H 'x-site-id: all' | python3 -c "import sys,json; print([s['slug'] for s in json.load(sys.stdin)])"
```

## Pas 8 — Raport final

Afișează userului:
```
✅ Site creat: <NAME> (<SLUG>)
   Domain: <DOMAIN>
   Locale: <LOCALE>
   Currency: <CURRENCY>
   Base price: <BASE_EUR> EUR

Pași rămași MANUAL:
□ <doar local, dacă lipsește> sudo sh -c 'echo "127.0.0.1 <DOMAIN>" >> /etc/hosts'
□ <doar dacă lipsește traducerea> Tradu apps/web/messages/<LOCALE>.json
□ <prod> A record `<DOMAIN> → 37.187.159.41` la Cloudflare, nor GRI (DNS only)
□ <prod> Adaugă `<DOMAIN>` la câmpul Domains al serviciului `router` din Coolify
□ <prod> Dacă certificatul nu vine în ~3 min: ssh ovh 'docker restart coolify-proxy'
□ <prod> Trimite sitemap la Google Search Console: https://<DOMAIN>/sitemap.xml

Test rapid:
   open http://<DOMAIN>:1500    (local)
   open https://<DOMAIN>        (prod, după DNS propagat)
```

## Note

- Skill-ul **NU restartează stack-ul** — site-ul nou e detectat live (cache 30s în SitesService, sau forțezi refresh prin admin).
- **NU adaugă suno.stylePromptMap** detaliat — doar basePrompt. User-ul îl rafinează din admin `/sites/<id>` dacă vrea override per stil.
- **NU rulează migrații** — schema multi-site există deja, doar inserează rând nou.
- Tutorial complet: vezi `ADD_NEW_SITE.md` din root.
