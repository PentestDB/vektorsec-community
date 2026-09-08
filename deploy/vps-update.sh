#!/usr/bin/env bash
# ============================================================================
#  VektorSec — Fast VPS update (run ON the VPS)
#
#  Rebuilds the backend/frontend images and recreates the containers.
#  MongoDB/Redis data and your config files are NOT touched.
#
#  Optional env: COMPOSE_FILE=docker-compose.kali.yml
# ============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# DB credentials for docker-compose interpolation (see deploy/secrets.env.example)
if [[ -f deploy/secrets.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source deploy/secrets.env
  set +a
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
SUDO=""
[[ "$(id -u)" -ne 0 ]] && SUDO="sudo"

info() { echo -e " \033[0;32m[✓]\033[0m $*"; }
warn() { echo -e " \033[1;33m[!]\033[0m $*"; }

# Ensure runtime configs still exist (in case the folder was rsynced manually).
[[ -f config.toml ]]              || cp config.example.toml config.toml
[[ -f backend/.env ]]             || cp backend/.env.example backend/.env
[[ -f frontend/.env ]]            || cp frontend/.env.example frontend/.env
[[ -f backend/model-registry.json ]] || printf '{\n  "models": [],\n  "assignments": {\n    "racerModelIds": []\n  }\n}\n' > backend/model-registry.json

warn "Rebuilding backend + frontend with $COMPOSE_FILE..."
$SUDO docker compose -f "$COMPOSE_FILE" up -d --build

info "Updated. Status:"
$SUDO docker compose -f "$COMPOSE_FILE" ps
