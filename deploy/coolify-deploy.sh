#!/usr/bin/env bash
# Declanșează un deploy în Coolify și așteaptă să se termine.
#
# Pe setup-ul actual NU e opțional: repo-ul e conectat prin deploy key, deci
# Coolify n-a putut crea webhook în GitHub și un `git push` nu declanșează nimic.
# Fără scriptul ăsta (sau fără butonul Deploy din UI), codul rămâne nedeployat.
#
#   COOLIFY_URL=https://coolify.freevox.ro \
#   COOLIFY_TOKEN=... \
#   COOLIFY_RESOURCE_UUID=... \
#   ./deploy/coolify-deploy.sh
#
# Token-ul: Coolify → Keys & Tokens → API tokens.
# UUID-ul resursei: din URL-ul resursei în Coolify.
#
# Calea prin SSH (fără token) a fost rulată împotriva instanței reale la cutover.
# Calea prin API token nu — dacă API-ul răspunde altfel decât se așteaptă,
# scriptul afișează răspunsul brut și iese cu eroare, nu raportează succes fals.
set -euo pipefail

RESOURCE="${COOLIFY_RESOURCE_UUID:-tzjg60mashnbuojrjdffa5e7}"

# Fără token API? Pornim deploy-ul direct din aplicația Coolify, prin SSH.
# `queue_application_deployment` e exact ce apelează și butonul din UI
# (bootstrap/helpers/applications.php), deci rezultatul e identic. Metoda asta a
# fost verificată pe instanța reală la cutover-ul din 28 aug 2026 — spre
# deosebire de calea cu API token, care cerea un token pe care nu-l aveam.
if [ -z "${COOLIFY_TOKEN:-}" ]; then
  SSH_HOST="${COOLIFY_SSH_HOST:-ovh}"
  echo "→ fără COOLIFY_TOKEN: pornesc deploy-ul prin SSH pe $SSH_HOST"
  ssh "$SSH_HOST" "docker exec coolify php artisan tinker --execute='
    \$app = \App\Models\Application::where(\"uuid\",\"$RESOURCE\")->firstOrFail();
    \$uuid = (string) new \Visus\Cuid2\Cuid2();
    queue_application_deployment(application: \$app, deployment_uuid: \$uuid, is_api: true);
    echo \"deployment_uuid=\".\$uuid.PHP_EOL;
  '"
  echo "  urmărește progresul în Coolify → Deployment Logs"
  exit 0
fi

: "${COOLIFY_URL:?Setează COOLIFY_URL (ex. https://coolify.freevox.ro)}"
COOLIFY_RESOURCE_UUID="$RESOURCE"

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
