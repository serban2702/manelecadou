# -*- coding: utf-8 -*-
"""Validează JSON-urile scrise de agenții de conținut și generează SQL de INSERT.

Usage:
  python3 docs/seo-content-pipeline/validate_and_sql.py validate
  python3 docs/seo-content-pipeline/validate_and_sql.py sql   # scrie /tmp/seo_insert.sql

Premise: gen_batches.py a rulat (există /tmp/new_slugs.txt), agenții au scris
/tmp/seo-content/batch-*.json. SQL-ul folosește dollar-quoting + ON CONFLICT
DO NOTHING (siteId, slug) și source='manual' ca bulk-regenerate să nu suprascrie.

Aplicare pe prod:
  scp /tmp/seo_insert.sql VPSIonos:/tmp/
  ssh VPSIonos 'docker exec -i manele-postgres-1 psql -U manelecadou -d manelecadou < /tmp/seo_insert.sql'
"""
import json, glob, os, re, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATES_TS = os.path.join(REPO, "apps/api/src/modules/seo-pages/seo-page-templates.ts")
BRAND_SUFFIX = " | Manele Cadou"
DOLLAR_TAG = "$SEOQ$"

src = open(TEMPLATES_TS, encoding="utf-8").read()
cat_of = {}
for m in re.finditer(r"slug: '([a-z0-9-]+)',\s*category: '([a-z-]+)'", src):
    cat_of[m.group(1)] = m.group(2)
ALL_SLUGS = set(cat_of)

expected_new = set(open("/tmp/new_slugs.txt").read().split())

problems, warnings, pages = [], [], {}

def wc(text):
    return len(re.findall(r"\S+", text))

for path in sorted(glob.glob("/tmp/seo-content/batch-*.json")):
    try:
        data = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        problems.append(f"{path}: JSON INVALID — {e}")
        continue
    if not isinstance(data, list):
        problems.append(f"{path}: nu e array")
        continue
    for obj in data:
        slug = obj.get("slug", "<lipsă>")
        ctx = f"{os.path.basename(path)}:{slug}"
        if slug not in expected_new:
            problems.append(f"{ctx}: slug necunoscut (nu e în new_slugs.txt)")
            continue
        if slug in pages:
            problems.append(f"{ctx}: slug DUPLICAT între batch-uri")
            continue
        ok = True
        for field in ("title", "metaDescription", "h1", "excerpt", "contentMd"):
            if not isinstance(obj.get(field), str) or not obj.get(field, "").strip():
                problems.append(f"{ctx}: câmp lipsă/gol: {field}")
                ok = False
        if not ok:
            continue
        t, md, h1, ex, cm = obj["title"], obj["metaDescription"], obj["h1"], obj["excerpt"], obj["contentMd"]
        if not (35 <= len(t) <= 70):
            warnings.append(f"{ctx}: title {len(t)} chars (țintă 45-58)")
        if not (110 <= len(md) <= 200):
            warnings.append(f"{ctx}: metaDescription {len(md)} chars (țintă 140-160)")
        if not (30 <= len(h1) <= 110):
            warnings.append(f"{ctx}: h1 {len(h1)} chars")
        if not (80 <= len(ex) <= 240):
            warnings.append(f"{ctx}: excerpt {len(ex)} chars")
        words = wc(cm)
        if not (380 <= words <= 950):
            warnings.append(f"{ctx}: contentMd {words} cuvinte (țintă 550-750)")
        if "29.99" not in cm and "29,99" not in cm:
            warnings.append(f"{ctx}: prețul 29.99 nu apare în contentMd")
        if "/studio" not in cm:
            problems.append(f"{ctx}: lipsește linkul către /studio")
        for link in re.findall(r"\]\(/articole/([a-z0-9-]+)\)", cm):
            if link not in ALL_SLUGS:
                problems.append(f"{ctx}: link intern către slug inexistent: {link}")
        for url in re.findall(r"\]\(([^)]+)\)", cm):
            if not (url.startswith("/articole/") or url in ("/studio", "/asculta", "/")):
                warnings.append(f"{ctx}: link nepermis: {url}")
        if DOLLAR_TAG in cm or DOLLAR_TAG in t:
            problems.append(f"{ctx}: conține tag-ul dollar-quote!")
        if not re.search(r"[ășțâî]", cm):
            problems.append(f"{ctx}: contentMd fără diacritice românești — suspect")
        if "Î:" not in cm:
            warnings.append(f"{ctx}: pare să lipsească mini-FAQ")
        pages[slug] = obj

missing = expected_new - set(pages)
print(f"Pagini valide: {len(pages)}/{len(expected_new)}")
if missing:
    print(f"LIPSESC ({len(missing)}): {sorted(missing)[:20]}{'...' if len(missing) > 20 else ''}")
print(f"\nPROBLEME BLOCANTE ({len(problems)}):")
for p in problems[:40]:
    print("  ✗", p)
print(f"\nAvertismente ({len(warnings)}):")
for w in warnings[:25]:
    print("  ⚠", w)
if len(warnings) > 25:
    print(f"  ... +{len(warnings)-25}")

if len(sys.argv) > 1 and sys.argv[1] == "sql":
    if problems:
        print("\nNU generez SQL — rezolvă problemele blocante întâi.")
        sys.exit(1)

    def q(s):
        assert DOLLAR_TAG not in s
        return f"{DOLLAR_TAG}{s}{DOLLAR_TAG}"

    out = ["BEGIN;"]
    for slug, obj in sorted(pages.items()):
        title = (obj["title"].strip() + BRAND_SUFFIX)[:200]
        md = obj["metaDescription"].strip()[:320]
        h1 = obj["h1"].strip()[:200]
        ex = obj["excerpt"].strip()[:320]
        cm = obj["contentMd"].strip()
        cat = cat_of[slug]
        out.append(
            'INSERT INTO seo_pages ("siteId", slug, "localizedSlug", category, locale, title, "metaDescription", h1, "contentMd", excerpt, source, published)\n'
            f"VALUES ((SELECT id FROM sites WHERE domain = 'manelecadou.ro'), {q(slug)}, {q(slug)}, {q(cat)}, 'ro', {q(title)}, {q(md)}, {q(h1)}, {q(cm)}, {q(ex)}, 'manual', true)\n"
            'ON CONFLICT ("siteId", slug) DO NOTHING;'
        )
    out.append("COMMIT;")
    with open("/tmp/seo_insert.sql", "w", encoding="utf-8") as f:
        f.write("\n\n".join(out) + "\n")
    print(f"\nSQL scris: /tmp/seo_insert.sql ({len(pages)} INSERT-uri)")
