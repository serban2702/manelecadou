# Pipeline conținut SEO RO — reluare după limită

Stare la 2026-06-11 (sesiunea „sute de pagini SEO"):

- ✅ Master list extins 50 → **286 sluguri** în `apps/api/src/modules/seo-pages/seo-page-templates.ts` (commit `f4de5d9`), deployat pe prod (api + web).
- ✅ Traduceri categorii noi (`nume`, `sarbatori`, `aniversari`) în toate `apps/web/messages/*.json`.
- ✅ **BG + EL**: bulk OpenAI declanșat pe server (2026-06-10 22:45 UTC) — generează singur toate paginile lipsă. Verificare:
  `ssh VPSIonos 'docker exec manele-ops-1 sh -c "TOKEN=$(ops-admin-token); curl -s http://api:3000/api/admin/seo-pages/regenerate-status -H \"Authorization: Bearer $TOKEN\" -H \"x-site-id: <SITE_UUID>\""'`
  (BG `15c74a7b-8253-4b07-a352-f6408d23c153`, EL `cdb2f7a9-b48e-4bc5-8d5e-2e8aad150598`)
- ❌ **RO (manelecadou.ro): cele 236 pagini noi NU au conținut încă** — agenții Claude au murit pe limita de spend înainte să scrie ceva.

## Reluare RO — varianta A: agenți Claude (calitate maximă)

1. `python3 docs/seo-content-pipeline/gen_batches.py` → creează `/tmp/seo-batches/batch-NN.json` (12 batch-uri × ~20 pagini) + `/tmp/seo-content/`.
2. Lansează câte un agent per batch cu promptul:
   > Citește `docs/seo-content-pipeline/BRIEF.md` și `/tmp/seo-batches/batch-NN.json`. Scrie conținutul pentru TOATE paginile conform brief-ului și salvează ca JSON array valid la `/tmp/seo-content/batch-NN.json`. Verifică parsabilitatea la final.
3. `python3 docs/seo-content-pipeline/validate_and_sql.py validate` → rezolvă problemele blocante (re-rulează agentul pe batch-ul stricat).
4. `python3 docs/seo-content-pipeline/validate_and_sql.py sql` → `/tmp/seo_insert.sql`.
5. `scp /tmp/seo_insert.sql VPSIonos:/tmp/ && ssh VPSIonos 'docker exec -i manele-postgres-1 psql -U manelecadou -d manelecadou < /tmp/seo_insert.sql'`
6. Cache-ul se împrospătează singur (hub 10 min, sitemap 30 min; paginile noi sunt live instant).

Notă: INSERT-urile au `source='manual'` ca „Regenerează tot" din admin să NU le suprascrie cu GPT.

## Reluare RO — varianta B: OpenAI (fără limită Claude, calitate ca BG/EL)

O singură comandă — același bulk ca pentru BG/EL, pe site-ul RO (sare automat peste cele 50 cu conținut):

```bash
ssh VPSIonos 'docker exec manele-ops-1 sh -c "TOKEN=\$(ops-admin-token); curl -s -X POST http://api:3000/api/admin/seo-pages/regenerate-all -H \"Authorization: Bearer \$TOKEN\" -H \"x-site-id: 86a6e2b2-6f20-45f2-ba14-e46dbd1c12ea\" -H \"Content-Type: application/json\" -d \"{}\""'
```

Sau din admin: `https://admin.manelecadou.ro/seo-pages` → site manelecadou.ro → Regenerează (fără „regenerate all", doar lipsă).

## Verificare finală (după oricare variantă)

- `https://manelecadou.ro/articole` — hub-ul arată categoriile noi populate
- `https://manelecadou.ro/sitemap.xml` — ~300 URL-uri /articole/
- `SELECT locale, COUNT(*) FROM seo_pages GROUP BY locale;` — ~286 per site
