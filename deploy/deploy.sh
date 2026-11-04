#!/usr/bin/env bash
# Run on the server for each release: bash deploy/deploy.sh
# Stops at the first failure, so a bad migration or build never gets restarted into.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/replypilot}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4000/api/v1/health}"

cd "$APP_DIR"

echo "==> Pulling $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Checking the migration against the database"
pnpm db:generate
# Take a database snapshot first (see docs/deploy.md). Migrations only move forward.
(cd apps/api && set -a && . ./.env && set +a && pnpm exec prisma migrate deploy)

echo "==> Building"
pnpm build

echo "==> Restarting"
pm2 startOrReload deploy/ecosystem.config.cjs
pm2 save

echo "==> Checking health"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    echo "Healthy after ${attempt} check(s)."
    exit 0
  fi
  sleep 3
done
echo "The app did not become healthy. Check: pm2 logs replypilot-api" >&2
exit 1
