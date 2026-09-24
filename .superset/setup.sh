#!/usr/bin/env bash
# Superset workspace setup: runs inside every new worktree. Must stay idempotent.
set -euo pipefail

ROOT="${SUPERSET_ROOT_PATH:-$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")}"
ENV_FILE=apps/api/.env
MAIN_ENV_FILE="$ROOT/apps/api/.env"

echo "[setup] Installing dependencies"
pnpm install --frozen-lockfile

set_env_value() {
  local key="$1" value="$2"
  KEY="$key" VALUE="$value" perl -pi -e 's/^\Q$ENV{KEY}\E=.*/$ENV{KEY}=$ENV{VALUE}/' "$ENV_FILE"
}

if [ -f "$ENV_FILE" ]; then
  echo "[setup] $ENV_FILE already exists, keeping it"
else
  echo "[setup] Creating $ENV_FILE from .env.example"
  cp apps/api/.env.example "$ENV_FILE"
  set_env_value JWT_SECRET "$(openssl rand -hex 32)"

  # Seed credentials are real accounts: reuse them from the main checkout when present.
  if [ -f "$MAIN_ENV_FILE" ]; then
    for key in SEED_BRUNO_PHONE SEED_BRUNO_PASSWORD SEED_LUANA_PHONE SEED_LUANA_PASSWORD; do
      value="$(grep -E "^${key}=" "$MAIN_ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
      if [ -n "$value" ]; then
        set_env_value "$key" "$value"
      fi
    done
  fi
fi

# One Postgres shared by every worktree (same compose project as the main checkout),
# so worktrees don't fight over port 5432.
if docker info >/dev/null 2>&1; then
  echo "[setup] Starting shared Postgres"
  docker compose -p frs up -d --wait postgres
  echo "[setup] Applying migrations"
  pnpm --filter api db:migrate
else
  echo "[setup] Docker is not running: skipped Postgres and migrations."
  echo "[setup] Start Docker, then run: docker compose -p frs up -d --wait postgres && pnpm --filter api db:migrate"
fi

echo "[setup] Done"
