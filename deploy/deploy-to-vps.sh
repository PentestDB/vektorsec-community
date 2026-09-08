#!/usr/bin/env bash
# ============================================================================
#  VektorSec — Push the project to a VPS and set it up (run on YOUR machine)
#
#  Windows users: run this from Git Bash or WSL (rsync + ssh required).
#
#  Usage:
#    ./deploy/deploy-to-vps.sh user@vps.example.com
#        First deploy: sync code → install Docker → build → start.
#
#    ./deploy/deploy-to-vps.sh user@vps.example.com --kali
#        Same, but with the built-in Kali container (docker-compose.kali.yml).
#
#    ./deploy/deploy-to-vps.sh user@vps.example.com --update
#        Fast update: sync code, rebuild backend+frontend, restart.
#        Combine with --kali if the VPS runs the Kali stack.
#
#  Optional env:
#    APP_DIR=/opt/vektorsec    remote install folder (default /opt/vektorsec)
#    PUBLIC_URL=https://...    public site URL (only used on first setup)
# ============================================================================
set -euo pipefail

VPS_TARGET="${1:?Usage: $0 user@vps-host [--kali] [--update]}"
shift || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="${APP_DIR:-/opt/vektorsec}"
MODE="setup"
COMPOSE_FILE="docker-compose.yml"

for arg in "$@"; do
  case "$arg" in
    --kali)   COMPOSE_FILE="docker-compose.kali.yml" ;;
    --update|-u) MODE="update" ;;
    *) echo "Unknown arg: $arg (use --kali / --update)"; exit 1 ;;
  esac
done

echo "==> Syncing project → ${VPS_TARGET}:${APP_DIR}  (mode: ${MODE}, compose: ${COMPOSE_FILE})"
echo

# Local secrets / build junk stay local. Remote config.toml, .env and
# model-registry.json are preserved (excluded) so they survive --delete.
rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'backend/dist/' \
  --exclude '*.tsbuildinfo' \
  --exclude '*.log' \
  --exclude '*.zip' \
  --exclude '*.tar.gz' \
  --exclude 'tsc-*.txt' \
  --exclude 'build-*.txt' \
  --exclude 'run-out.txt' \
  --exclude 'admin-login.png' \
  --exclude 'qr-*.png' \
  --exclude 'backend/mptest.js' \
  --exclude 'config.toml' \
  --exclude 'backend/.env' \
  --exclude 'frontend/.env' \
  --exclude 'backend/model-registry.json' \
  --exclude 'ssh-keys/' \
  --exclude 'docker-compose.override.yml' \
  --exclude '.run-state' \
  --exclude '.cursor/' \
  --exclude '.claude/' \
  --exclude '.vscode/' \
  --exclude 'kali-data/' \
  "$ROOT_DIR"/ "${VPS_TARGET}:${APP_DIR}/"

echo
if [[ "$MODE" == "update" ]]; then
  echo "==> Running remote update on ${VPS_TARGET}"
  ssh -t "$VPS_TARGET" "cd $APP_DIR && COMPOSE_FILE=$COMPOSE_FILE bash deploy/vps-update.sh"
else
  echo "==> Running first-time setup on ${VPS_TARGET}"
  ssh -t "$VPS_TARGET" "cd $APP_DIR && COMPOSE_FILE=$COMPOSE_FILE PUBLIC_URL=${PUBLIC_URL:-} bash deploy/vps-setup.sh"
fi
