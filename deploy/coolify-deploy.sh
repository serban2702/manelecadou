#!/usr/bin/env bash
# Declanșează un deploy în Coolify și așteaptă să se termine.
#
# Nu e obligatoriu: dacă ai „Auto Deploy" pornit pe resursă, un `git push` face
# același lucru. Scriptul e pentru cazurile în care vrei să forțezi deploy-ul
# din terminal sau dintr-un pipeline.
#
#   COOLIFY_URL=https://coolify.exemplu.ro \
#   COOLIFY_TOKEN=... \
#   COOLIFY_RESOURCE_UUID=... \
#   ./deploy/coolify-deploy.sh
#
# Token-ul: Coolify → Keys & Tokens → API tokens.
# UUID-ul resursei: din URL-ul resursei în Coolify.
#
# ATENȚIE: nu a fost rulat împotriva unei instanțe reale de Coolify. Dacă API-ul
# răspunde altfel decât se așteaptă, scriptul afișează răspunsul brut și iese cu
# eroare, în loc să raporteze un succes fals.
set -euo pipefail

: "${COOLIFY_URL:?Setează COOLIFY_URL (ex. https://coolify.exemplu.ro)}"
: "${COOLIFY_TOKEN:?Setează COOLIFY_TOKEN}"
: "${COOLIFY_RESOURCE_UUID:?Setează COOLIFY_RESOURCE_UUID}"

BASE="${COOLIFY_URL%/}"
FORCE="${COOLIFY_FORCE:-false}"

say() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }

say "pornesc deploy pentru $COOLIFY_RESOURCE_UUID"
RESP="$(curl -fsS -X GET \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "$BASE/api/v1/deploy?uuid=$COOLIFY_RESOURCE_UUID&force=$FORCE")" || {
    echo "Apelul de deploy a eșuat. Verifică COOLIFY_URL / COOLIFY_TOKEN / UUID." >&2
    exit 1
  }

echo "$RESP"

DEPLOY_UUID="$(printf '%s' "$RESP" | sed -n 's/.*"deployment_uuid"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
if [ -z "$DEPLOY_UUID" ]; then
  echo "Nu am găsit deployment_uuid în răspuns — nu pot urmări progresul." >&2
  echo "Deploy-ul poate fi totuși pornit; verifică în UI." >&2
  exit 1
fi

say "urmăresc deployment $DEPLOY_UUID"
for i in $(seq 1 120); do
  STATUS_JSON="$(curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" \
    "$BASE/api/v1/deployments/$DEPLOY_UUID" 2>/dev/null || true)"
  STATUS="$(printf '%s' "$STATUS_JSON" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  case "$STATUS" in
    finished|success)  echo "  gata după ~$((i * 10))s"; exit 0 ;;
    failed|cancelled)  echo "  deploy $STATUS" >&2; echo "$STATUS_JSON" >&2; exit 1 ;;
    "")                printf '.' ;;
    *)                 printf '%s ' "$STATUS" ;;
  esac
  sleep 10
done

echo "" >&2
echo "20 de minute fără verdict — verifică în UI-ul Coolify." >&2
exit 1
