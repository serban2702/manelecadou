# -*- coding: utf-8 -*-
"""Regenerează batch-urile de lucru pentru agenții de conținut RO.

Citește slugurile din seo-page-templates.ts (sursa de adevăr), sare peste
primele 50 (originalele, care au deja conținut în DB) și împarte restul în
batch-uri de ~20 cu relatedSlugs precalculate pentru interlinking.

Usage:  python3 docs/seo-content-pipeline/gen_batches.py
Output: /tmp/seo-batches/batch-NN.json + /tmp/seo-content/ (gol, pt. agenți)
        /tmp/new_slugs.txt (lista slugurilor de scris)
"""
import json, os, random, re

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATES_TS = os.path.join(REPO, "apps/api/src/modules/seo-pages/seo-page-templates.ts")
ORIGINAL_COUNT = 50  # primele 50 entries = master list-ul inițial, deja cu conținut
BATCH = 20

HUBS = ["manea-cadou-personalizata", "idei-cadou-original", "manea-zi-nastere",
        "cadou-care-il-da-pe-spate", "manea-de-petrecere", "cum-fac-o-manea-online",
        "manea-demo-gratis", "cat-costa-o-manea-personalizata", "manele-la-comanda",
        "cadou-ultimul-moment", "manea-livrare-rapida", "exemple-manele-personalizate"]

src = open(TEMPLATES_TS, encoding="utf-8").read()
entries = []
for m in re.finditer(
    r"\{\s*slug: '([^']+)',\s*category: '([^']+)',\s*primaryKeyword: '((?:[^'\\]|\\.)*)',\s*intent: '((?:[^'\\]|\\.)*)',",
    src,
):
    entries.append({
        "slug": m.group(1),
        "category": m.group(2),
        "primaryKeyword": m.group(3).replace("\\'", "'"),
        "intent": m.group(4).replace("\\'", "'"),
    })
assert len(entries) > ORIGINAL_COUNT, f"parsate doar {len(entries)} entries"

by_cat = {}
for e in entries:
    by_cat.setdefault(e["category"], []).append(e["slug"])

new_entries = entries[ORIGINAL_COUNT:]
rng = random.Random(42)
for e in new_entries:
    same_cat = [s for s in by_cat.get(e["category"], []) if s != e["slug"]]
    rng.shuffle(same_cat)
    hubs = [h for h in HUBS if h != e["slug"]]
    rng.shuffle(hubs)
    e["relatedSlugs"] = same_cat[:3] + hubs[:2]

os.makedirs("/tmp/seo-batches", exist_ok=True)
os.makedirs("/tmp/seo-content", exist_ok=True)
batches = [new_entries[i:i + BATCH] for i in range(0, len(new_entries), BATCH)]
for i, b in enumerate(batches, 1):
    with open(f"/tmp/seo-batches/batch-{i:02d}.json", "w", encoding="utf-8") as f:
        json.dump(b, f, ensure_ascii=False, indent=1)
with open("/tmp/new_slugs.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(e["slug"] for e in new_entries) + "\n")

print(f"Total entries: {len(entries)} | de scris: {len(new_entries)} | batch-uri: {len(batches)}")
