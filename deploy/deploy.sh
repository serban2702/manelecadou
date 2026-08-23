#!/usr/bin/env bash
# Deploy pentru stack-ul nou (Nginx Proxy Manager + R2).
#
# Spre deosebire de `deploy.sh` de pe Ionos, ăsta e în repo, deci se
# actualizează cu `git pull`. Se rulează DIN directorul repo-ului de pe server.
#
#   ./deploy/deploy.sh            # tot stack-ul
#   ./deploy/deploy.sh api        # doar api (web / admin / router / ops la fel)
#
# Face backup DB înainte de orice, apoi build + restart + health check.
set -euo pipefail

TARGET="${1:-full}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.coolify.yml}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/health}"

cd "$(dirname "$0")/.."
say() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# --- 1. backup -------------------------------------------------------------
say "backup Postgres"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
PG_CONTAINER="$(compose ps -q postgres)"
if [ -n "$PG_CONTAINER" ]; then
  # shellcheck disable=SC1091
  set -a; [ -f .env ] && . ./.env; set +a
  docker exec "$PG_CONTAINER" pg_dump -U "${POSTGRES_USER:-manelecadou}" "${POSTGRES_DB:-manelecadou}" \
    | gzip > "$BACKUP_DIR/predeploy_${STAMP}.sql.gz"
  echo "  $BACKUP_DIR/predeploy_${STAMP}.sql.gz ($(du -h "$BACKUP_DIR/predeploy_${STAMP}.sql.gz" | cut -f1))"
else
  echo "  postgres nu rulează — sar peste backup"
fi

# --- 2. cod ----------------------------------------------------------------
say "git fetch + reset"
git fetch origin
git reset --hard origin/main

# --- 3. build + restart ----------------------------------------------------
if [ "$TARGET" = "full" ]; then
  say "build (api web admin)"
  compose build api web admin
  say "restart"
  compose up -d --force-recreate api web admin router
elif [ "$TARGET" = "router" ]; then
  # `router` folosește imaginea oficială nginx — nu are ce construi, doar
  # reîncarcă config-ul din deploy/router/nginx.conf.
  say "restart router (config din repo)"
  compose up -d --force-recreate router
else
  say "build $TARGET"
  compose build "$TARGET"
  say "restart $TARGET"
  compose up -d --force-recreate "$TARGET"
fi

# --- 4. health -------------------------------------------------------------
say "health check"
for i in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "  OK după ${i}0s"
    compose ps
    exit 0
  fi
  sleep 10
done

echo "  health check a picat după 5 minute — loguri:" >&2
compose logs --tail=80 api >&2
exit 1
