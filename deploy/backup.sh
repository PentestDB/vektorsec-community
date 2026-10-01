#!/usr/bin/env bash
#
# VektorSec — backup MongoDB, Redis and agent workspaces.
#
# Usage:
#   bash deploy/backup.sh [--out DIR] [--no-stop]
#
# Defaults:
#   --out  ./backups/<timestamp>     (kept outside git; see .gitignore)
#   The stack keeps running unless you pass --no-stop (default stops the app
#   containers so the volumes are consistent; MongoDB/Redis are stopped too).
#
# Restore with:  bash deploy/restore.sh <backup-dir>

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR=""
STOP_STACK=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    --no-stop) STOP_STACK=0; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/backups/$STAMP}"
mkdir -p "$OUT_DIR"

# Discover the compose project name so volume names are correct
# (docker compose names volumes "<project>_<volume>").
PROJECT_NAME="$(docker compose config --format json 2>/dev/null | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1 || true)"
PROJECT_NAME="${PROJECT_NAME:-vektorsec}"

echo "==> VektorSec backup"
echo "    project : $PROJECT_NAME"
echo "    output  : $OUT_DIR"

if [[ $STOP_STACK -eq 1 ]]; then
  echo "==> Stopping application containers for a consistent snapshot"
  docker compose stop backend frontend || true
fi

backup_volume() {
  local volume="$1" name="$2"
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    echo "    [skip] volume $volume does not exist"
    return
  fi
  echo "    [dump] $volume -> $name"
  docker run --rm \
    -v "$volume":/data:ro \
    -v "$OUT_DIR":/backup \
    alpine:3 \
    tar czf "/backup/$name.tgz" -C /data .
}

echo "==> Archiving Docker volumes"
backup_volume "${PROJECT_NAME}_mongodb-data" "mongodb-data"
backup_volume "${PROJECT_NAME}_redis-data" "redis-data"
backup_volume "${PROJECT_NAME}_backend-data" "backend-data"

# Workspaces / agent output on the host (bind mount, not a volume)
if [[ -d "$ROOT_DIR/kali-data" ]]; then
  echo "==> Archiving ./kali-data"
  mkdir -p "$OUT_DIR/kali-data"
  tar czf "$OUT_DIR/kali-data.tgz" -C "$ROOT_DIR" kali-data
fi

# Configuration is small but painful to recreate: keep the .example files and
# any real (non-secret) config the operator wants. Secrets are NOT copied
# automatically — add them yourself if your backup medium is trusted.
echo "==> Copying configuration templates"
cp -f config.example.toml "$OUT_DIR/" 2>/dev/null || true
cp -f deploy/nginx.example.conf "$OUT_DIR/" 2>/dev/null || true
cp -f Caddyfile.example "$OUT_DIR/" 2>/dev/null || true
{
  echo "VektorSec backup $STAMP"
  echo "project: $PROJECT_NAME"
  echo "compose image tags:"
  docker compose images 2>/dev/null || true
} > "$OUT_DIR/MANIFEST.txt"

if [[ $STOP_STACK -eq 1 ]]; then
  echo "==> Restarting the stack"
  docker compose up -d
fi

echo "==> Done: $OUT_DIR"
ls -lh "$OUT_DIR"
