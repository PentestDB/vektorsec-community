#!/usr/bin/env bash
#
# VektorSec — restore a backup created by deploy/backup.sh
#
# Usage:
#   bash deploy/restore.sh <backup-dir> [--force] [--yes]
#
#   <backup-dir>  directory produced by backup.sh (contains *.tgz + MANIFEST.txt)
#   --force       extract over volumes that already contain data
#   --yes         do not ask for confirmation (for scripted restores)
#
# The application containers are stopped first and started again at the end.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${1:-}"
FORCE=0
ASSUME_YES=0

if [[ -z "$BACKUP_DIR" ]]; then
  sed -n '2,12p' "$0"
  exit 1
fi
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Backup directory not found: $BACKUP_DIR" >&2
  exit 1
fi

PROJECT_NAME="$(docker compose config --format json 2>/dev/null | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1 || true)"
PROJECT_NAME="${PROJECT_NAME:-vektorsec}"

echo "==> VektorSec restore"
echo "    project : $PROJECT_NAME"
echo "    backup  : $BACKUP_DIR"
[[ -f "$BACKUP_DIR/MANIFEST.txt" ]] && cat "$BACKUP_DIR/MANIFEST.txt"

if [[ $ASSUME_YES -eq 0 ]]; then
  read -r -p "This overwrites the current database/volumes. Continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

echo "==> Stopping the stack"
docker compose down --remove-orphans || true

volume_has_data() {
  local volume="$1"
  docker volume create "$volume" >/dev/null
  local count
  count="$(docker run --rm -v "$volume":/data:ro alpine:3 sh -c 'ls -A /data 2>/dev/null | wc -l')"
  [[ "$count" -gt 0 ]]
}

restore_volume() {
  local volume="$1" archive="$2" label="$3"
  if [[ ! -f "$archive" ]]; then
    echo "    [skip] $label — no archive in the backup"
    return
  fi
  if [[ $FORCE -eq 0 ]] && volume_has_data "$volume"; then
    echo "    [skip] $label — volume $volume already has data (use --force to overwrite)"
    return
  fi
  echo "    [restore] $label -> $volume"
  docker run --rm \
    -v "$volume":/data \
    -v "$(cd "$BACKUP_DIR" && pwd)":/backup:ro \
    alpine:3 \
    sh -c "rm -rf /data/* /data/.* 2>/dev/null || true; tar xzf /backup/$(basename "$archive") -C /data"
}

echo "==> Restoring Docker volumes"
restore_volume "${PROJECT_NAME}_mongodb-data" "$BACKUP_DIR/mongodb-data.tgz" "mongodb-data"
restore_volume "${PROJECT_NAME}_redis-data" "$BACKUP_DIR/redis-data.tgz" "redis-data"
restore_volume "${PROJECT_NAME}_backend-data" "$BACKUP_DIR/backend-data.tgz" "backend-data"

if [[ -f "$BACKUP_DIR/kali-data.tgz" ]]; then
  echo "==> Restoring ./kali-data"
  if [[ $FORCE -eq 0 && -n "$(ls -A "$ROOT_DIR/kali-data" 2>/dev/null || true)" ]]; then
    echo "    [skip] ./kali-data already has files (use --force to overwrite)"
  else
    rm -rf "$ROOT_DIR/kali-data"
    tar xzf "$BACKUP_DIR/kali-data.tgz" -C "$ROOT_DIR"
  fi
fi

echo "==> Starting the stack"
docker compose up -d

echo "==> Done. Check health with: docker compose ps && curl -s localhost:8081/api/ready"
