#!/usr/bin/env bash
# ============================================================================
#  VektorSec — One-time VPS setup (run ON the VPS)
#
#  - Installs Docker Engine + Compose plugin when missing
#  - Generates config.toml / backend/.env / frontend/.env from templates
#  - Builds images and starts the stack
#
#  Optional env:
#    COMPOSE_FILE=docker-compose.kali.yml   # also spin up the built-in Kali box
#    PUBLIC_URL=https://vektor.example.com  # public site URL (CORS/OAuth/SEO)
#
#  Normally invoked by deploy/deploy-to-vps.sh, or run manually on the VPS:
#    bash deploy/vps-setup.sh
# ============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# DB credentials for docker-compose interpolation (MONGO_USER / MONGO_PASSWORD /
# REDIS_PASSWORD). Copy deploy/secrets.env.example -> deploy/secrets.env and
# fill in real passwords BEFORE the first `docker compose up`. docker compose
# also auto-loads a root `.env` if you prefer that instead.
if [[ -f deploy/secrets.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source deploy/secrets.env
  set +a
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PUBLIC_URL="${PUBLIC_URL:-}"

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  SUDO="sudo"
fi

# ── helpers ────────────────────────────────────────────────────────────────
info() { echo -e " \033[0;32m[✓]\033[0m $*"; }
warn() { echo -e " \033[1;33m[!]\033[0m $*"; }
err()  { echo -e " \033[0;31m[✗]\033[0m $*"; }

set_toml() {
  local key="$1" val="$2"
  if grep -q "^${key} " config.toml 2>/dev/null; then
    sed -i "s|^${key} *=.*|${key} = \"${val}\"|" config.toml
  else
    printf '\n%s = "%s"\n' "$key" "$val" >> config.toml
  fi
}

get_toml() {
  grep "^$1 " config.toml 2>/dev/null | head -1 \
    | sed 's/[^=]*= *//; s/ *#.*//; s/^"//; s/"$//'
}

get_env() {
  grep "^$1=" backend/.env 2>/dev/null | head -1 \
    | sed 's/^[^=]*=//; s/ *#.*//; s/^"//; s/"$//'
}

set_env() {
  local var="$1" val="$2"
  if grep -q "^${var}=" backend/.env 2>/dev/null; then
    sed -i "s|^${var}=.*|${var}=\"${val}\"|" backend/.env
  else
    printf '%s="%s"\n' "$var" "$val" >> backend/.env
  fi
}

# ── 1. Docker ──────────────────────────────────────────────────────────────
install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    info "Docker + Compose plugin already installed"
    return
  fi

  warn "Installing Docker Engine + Compose plugin (needs internet)..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | $SUDO sh
  else
    err "curl not found — install Docker manually first (https://docs.docker.com/engine/install/)"
    exit 1
  fi
  $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
  if ! $SUDO docker compose version >/dev/null 2>&1; then
    warn "Compose plugin missing — installing docker-compose-plugin"
    $SUDO apt-get update -y >/dev/null
    $SUDO apt-get install -y docker-compose-plugin
  fi
  info "Docker ready: $($SUDO docker --version)"
}

# ── 2. Runtime configs (never overwrite existing) ──────────────────────────
create_configs() {
  [[ -f config.toml ]]              || cp config.example.toml config.toml
  [[ -f backend/.env ]]             || cp backend/.env.example backend/.env
  [[ -f frontend/.env ]]            || cp frontend/.env.example frontend/.env
  if [[ ! -f backend/model-registry.json ]]; then
    printf '{\n  "models": [],\n  "assignments": {\n    "racerModelIds": []\n  }\n}\n' > backend/model-registry.json
  fi
  info "Runtime configs ensured (config.toml, backend/.env, frontend/.env)"
}

configure() {
  # Backend runs inside Docker → talk to mongo/redis by service name.
  sed -i 's|mongodb://localhost:27017|mongodb://mongodb:27017|g' config.toml
  sed -i 's|redis://localhost:6379|redis://redis:6379|g' config.toml

  local frontend_url
  frontend_url="${PUBLIC_URL:-$(get_toml base_url_frontend)}"
  frontend_url="${frontend_url:-http://localhost:3001}"
  set_toml base_url_frontend "$frontend_url"
  if [[ -z "$(get_toml cors_origins)" ]]; then
    set_toml cors_origins "$frontend_url"
  fi

  local secret
  secret="$(get_toml secret)"
  if [[ -z "$secret" || "$secret" == "thisismysessionsecret!123" || "$secret" == *"CHANGE_ME"* ]]; then
    secret="$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '/+=' | head -c 64)"
    set_toml secret "$secret"
    info "Generated new session secret"
  fi

  if [[ -n "$PUBLIC_URL" ]]; then
    # Public deployment: CORS + deployment mode point at the real URL.
    set_toml cors_origins "$PUBLIC_URL"
    set_toml deployment "PROD"
    sed -i "s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=${PUBLIC_URL}|" frontend/.env
    sed -i "s|^DEPLOYMENT=.*|DEPLOYMENT=PRODUCTION|" frontend/.env
    sed -i "s|^NEXT_PUBLIC_DEPLOYMENT=.*|NEXT_PUBLIC_DEPLOYMENT=PRODUCTION|" frontend/.env
    set_env OOB_BASE_URL "${PUBLIC_URL}/api"
    set_env FRONTEND_URL "$PUBLIC_URL"
    info "Configured public URL: $PUBLIC_URL"
  fi

  if [[ "$COMPOSE_FILE" == *kali* ]] && [[ -z "$(get_env SSH_HOST)" ]]; then
    # Built-in Kali box: the backend reaches it over the compose network by
    # service name "kali" on its internal port 22. The template leaves
    # SSH_HOST empty and buildSSHConfig falls back to localhost, which only
    # works on a developer machine — never inside a container.
    set_env SSH_HOST "kali"
    set_env SSH_PORT "22"
    info "SSH: defaulted SSH_HOST=kali (port 22) for the built-in Kali box"
  fi

  info "Config: base_url_frontend=$(get_toml base_url_frontend)"
}

# ── 2.5 Host bind-mount sources ───────────────────────────────────────────
# docker-compose bind-mounts ${HOME}/.codex/auth.json, ${HOME}/.ssh and
# ${HOME}/keys. If the source file/dir does not exist, Docker creates a
# DIRECTORY in its place (breaking CODEX_HOME / SSH mounts), so create them.
ensure_host_mounts() {
  local dir
  for dir in /root/.codex /root/.ssh /root/keys; do
    if [[ "$(id -u)" -eq 0 ]]; then
      mkdir -p "$dir"
    elif $SUDO mkdir -p "$dir" 2>/dev/null; then
      :
    else
      warn "Could not create $dir (needs root). If you don't run docker as root, ignore this."
      return
    fi
  done
  if [[ ! -f /root/.codex/auth.json ]]; then
    if [[ "$(id -u)" -eq 0 ]]; then
      echo '{}' > /root/.codex/auth.json
    else
      $SUDO sh -c 'echo "{}" > /root/.codex/auth.json' 2>/dev/null || true
    fi
  fi
  info "Host mount sources ensured (/root/.codex, /root/.ssh, /root/keys)"
}

# ── 3. Build & start ───────────────────────────────────────────────────────
build_and_start() {
  warn "Building images with $COMPOSE_FILE (first build can take 10-30 min)..."
  $SUDO docker compose -f "$COMPOSE_FILE" build
  $SUDO docker compose -f "$COMPOSE_FILE" up -d
  info "Stack started"
  $SUDO docker compose -f "$COMPOSE_FILE" ps
}

install_docker
create_configs
configure
ensure_host_mounts
build_and_start

echo
info "Done."
info "  Frontend : ${PUBLIC_URL:-http://<VPS-IP>:3001}"
info "  Backend  : hidden behind the frontend gateway"
warn "Open Settings → Models in the UI and add your model API key (no model is configured yet)."
warn "Don't open ports 8081 / 27017 / 6379 to the internet."
