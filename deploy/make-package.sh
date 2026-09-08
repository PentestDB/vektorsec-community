#!/usr/bin/env bash
# ============================================================================
#  VektorSec — Build a clean source package to upload to a VPS
#
#  Creates ./vektorsec-vps.tar.gz in the project root. Local secrets, build
#  junk and git history are excluded. Upload it with scp / sftp / any file
#  manager, extract on the VPS and run:
#
#      tar xzf vektorsec-vps.tar.gz
#      cd vektorsec
#      bash deploy/vps-setup.sh
#
#  (Prefer deploy/deploy-to-vps.sh when rsync is available — it is faster
#   for repeat deploys because it only transfers changed files.)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

OUT="vektorsec-vps.tar.gz"

echo "==> Creating $OUT (excludes local secrets / build junk)..."
tar -czf "$OUT" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='backend/dist' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.log' \
  --exclude='*.zip' \
  --exclude='tsc-*.txt' \
  --exclude='build-*.txt' \
  --exclude='run-out.txt' \
  --exclude='admin-login.png' \
  --exclude='qr-*.png' \
  --exclude='backend/mptest.js' \
  --exclude='config.toml' \
  --exclude='backend/.env' \
  --exclude='frontend/.env' \
  --exclude='backend/model-registry.json' \
  --exclude='ssh-keys' \
  --exclude='docker-compose.override.yml' \
  --exclude='.run-state' \
  --exclude='.cursor' \
  --exclude='.claude' \
  --exclude='.vscode' \
  --exclude='kali-data' \
  --exclude="$OUT" \
  .

echo "==> Done: $ROOT_DIR/$OUT ($(du -h "$OUT" | cut -f1))"
echo "    Upload it, then on the VPS:"
echo "      tar xzf vektorsec-vps.tar.gz && cd vektorsec && bash deploy/vps-setup.sh"
