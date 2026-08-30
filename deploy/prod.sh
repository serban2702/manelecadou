#!/usr/bin/env bash
#
# Acces la producție (Coolify / OVH) — un singur loc pentru „cum ajung la baza
# de date și la API-ul de admin al producției".
#
# Există pentru că răspunsul s-a schimbat la cutover-ul din 28 aug 2026 și era
# copiat, în variante ușor diferite, în șapte skill-uri. Toate arătau spre Ionos,
# adică spre baza înghețată în ziua mutării: interogările răspundeau frumos, cu
# date vechi, iar un UPDATE ar fi „reparat" o comandă pe care n-o mai citește
# nimeni. Un singur helper, corect, e mai ușor de ținut corect.
#
#   deploy/prod.sh psql "SELECT count(*) FROM generations"
#   deploy/prod.sh psql-tsv "SELECT id, email FROM users LIMIT 5"
#   deploy/prod.sh sql-file ./query.sql
#   deploy/prod.sh api GET  /api/admin/sites
#   deploy/prod.sh api POST /api/admin/chat/conversations/ID/ai-mode '{"mode":"manual"}'
#   deploy/prod.sh logs api 200
#   deploy/prod.sh shell api
#   deploy/prod.sh ps
#   deploy/prod.sh domains         # lista pentru câmpul Domains al lui `router`
#   deploy/prod.sh dump            # dump gzip descărcat local
#
# Merge de pe Mac (prin `ssh ovh`) și de pe server (detectează singur).
set -euo pipefail

SSH_HOST="${PROD_SSH_HOST:-ovh}"
# Numele de proiect Docker Compose = UUID-ul resursei din Coolify. E stabil;
# numele containerelor NU sunt (au sufixul deploy-ului), deci nu te lega de ele.
PROJECT="${COOLIFY_RESOURCE_UUID:-tzjg60mashnbuojrjdffa5e7}"

# Preambul rulat pe server: rezolvă containerele din etichete, nu din nume.
read -r -d '' PREAMBLE <<PRE || true
set -euo pipefail
svc() {
  local id
  id=\$(docker ps -q \
        --filter "label=com.docker.compose.project=$PROJECT" \
        --filter "label=com.docker.compose.service=\$1" | head -1)
  if [ -z "\$id" ]; then
    echo "Nu găsesc containerul '\$1' în proiectul $PROJECT." >&2
    echo "Rulează 'deploy/prod.sh ps' ca să vezi ce e pornit." >&2
    exit 1
  fi
  printf '%s' "\$id"
}
# Postgres e resursă gestionată de Coolify, în afara compose-ului aplicației.
pgc() {
  local id
  id=\$(docker ps -q \
        --filter "label=coolify.type=database" \
        --filter "label=coolify.resourceName=postgresql-manelecadou" | head -1)
  if [ -z "\$id" ]; then
    echo "Nu găsesc baza de producție (postgresql-manelecadou)." >&2
    exit 1
  fi
  printf '%s' "\$id"
}
PGU=manelecadou
PGD=manelecadou
PRE

run_remote() {
  local payload; payload=$(printf '%s\n%s' "$PREAMBLE" "$1" | base64 | tr -d '\n')
  if [ -f /.dockerenv ] || [ -d /data/coolify ]; then
    printf '%s' "$payload" | base64 -d | bash
  else
    ssh "$SSH_HOST" "printf '%s' '$payload' | base64 -d | bash"
  fi
}

# SQL trece prin base64 ca să nu-l mutileze niciun strat de ghilimele.
psql_run() {
  local flags="$1" sql="$2"
  local b64; b64=$(printf '%s' "$sql" | base64 | tr -d '\n')
  run_remote "PG=\$(pgc); printf '%s' '$b64' | base64 -d | docker exec -i \$PG psql -U \$PGU -d \$PGD $flags"
}

# JWT semnat înăuntrul containerului api (acolo e JWT_SECRET) + fetch nativ.
# Nu folosi curl: imaginea nu-l are. AdminGuard cere doar role=admin.
api_call() {
  local method="$1" path="$2" body="${3:-}"
  local b64_body; b64_body=$(printf '%s' "$body" | base64 | tr -d '\n')
  run_remote "API_ID=\$(svc api); docker exec \
      -e OPS_METHOD='$method' -e OPS_PATH='$path' -e OPS_BODY_B64='$b64_body' \
      -e OPS_SITE='${PROD_SITE_ID:-all}' \
      \$API_ID node -e '
    const c = require(\"crypto\");
    const enc = o => Buffer.from(JSON.stringify(o)).toString(\"base64url\");
    const now = Math.floor(Date.now() / 1000);
    const h = enc({ alg: \"HS256\", typ: \"JWT\" });
    const p = enc({
      sub: process.env.OPS_ADMIN_USER_ID || \"ops-cli\",
      role: \"admin\", email: \"ops@manelecadou.ro\",
      iat: now, exp: now + 300,
    });
    const sig = c.createHmac(\"sha256\", process.env.JWT_SECRET)
                 .update(h + \".\" + p).digest(\"base64url\");
    const body = Buffer.from(process.env.OPS_BODY_B64 || \"\", \"base64\").toString();
    const headers = {
      Authorization: \"Bearer \" + h + \".\" + p + \".\" + sig,
      \"x-site-id\": process.env.OPS_SITE,
    };
    if (body) headers[\"Content-Type\"] = \"application/json\";
    (async () => {
      const r = await fetch(\"http://127.0.0.1:3000\" + process.env.OPS_PATH, {
        method: process.env.OPS_METHOD, headers, body: body || undefined,
      });
      process.stderr.write(\"HTTP \" + r.status + \"\\n\");
      process.stdout.write(await r.text());
      process.stdout.write(\"\\n\");
      if (!r.ok) process.exit(1);
    })();
  '"
}

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; }

cmd="${1:-}"; shift || true
case "$cmd" in
  psql)     psql_run ""            "${1:?SQL lipsă}" ;;
  psql-tsv) psql_run "-t -A -F'|'" "${1:?SQL lipsă}" ;;
  sql-file) psql_run ""            "$(cat "${1:?fișier lipsă}")" ;;
  api)      api_call "${1:?metodă lipsă}" "${2:?cale lipsă}" "${3:-}" ;;
  logs)     run_remote "ID=\$(svc ${1:?serviciu lipsă}); docker logs --tail ${2:-100} -f \$ID" ;;
  shell)    ssh -t "$SSH_HOST" "docker exec -it \$(docker ps -q \
                --filter label=com.docker.compose.project=$PROJECT \
                --filter label=com.docker.compose.service=${1:?serviciu lipsă} | head -1) sh" ;;
  domains)  run_remote "docker exec \$(svc api) sh -c 'ADMIN_DOMAIN=\$(printf \"%s\" \"\$ADMIN_URL\" | sed -E \"s#^https?://##; s#/.*##\") node scripts/coolify-domains.mjs'" ;;
  ps)       run_remote 'docker ps --filter "label=coolify.projectName=manelecadou" \
                --format "table {{.Label \"com.docker.compose.service\"}}\t{{.Status}}\t{{.Names}}"' ;;
  dump)     out="${1:-prod_$(date +%Y%m%d_%H%M%S).sql.gz}"
            run_remote 'PG=$(pgc); docker exec $PG pg_dump -U $PGU $PGD | gzip -9' > "$out"
            echo "→ $out ($(du -h "$out" | cut -f1))" ;;
  ""|-h|--help|help) usage ;;
  *) echo "Comandă necunoscută: $cmd" >&2; usage >&2; exit 1 ;;
esac
