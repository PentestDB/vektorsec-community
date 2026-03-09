#!/bin/bash
# ============================================================
#  Pentest Copilot — All-in-one launcher
#  Configures, builds, and runs the entire stack.
#  Re-run at any time to start, reconfigure, or manage.
#
#  Configuration is split into two files:
#    config.toml  — static infrastructure: server, DB, CORS, session (set once)
#    .env         — dynamic config: model providers, API keys, SSH, OAuth
# ============================================================

set -euo pipefail

# ── Colors & formatting ───────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Paths (always relative to this script, not $PWD) ──────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_TOML="$SCRIPT_DIR/config.toml"
CONFIG_TOML_TMPL="$SCRIPT_DIR/config.toml.template"
DYNAMIC_ENV=""  # set by resolve_env_path after mode is known
DYNAMIC_ENV_TMPL="$SCRIPT_DIR/backend/.env.template"
FRONTEND_ENV="$SCRIPT_DIR/frontend/.env"
FRONTEND_TMPL="$SCRIPT_DIR/frontend/.env.template"
RUN_CONF="$SCRIPT_DIR/.run.conf"
SSH_KEYS_DIR="$SCRIPT_DIR/ssh-keys"
COMPOSE_OVERRIDE="$SCRIPT_DIR/docker-compose.override.yml"

COMPOSE_CMD=""
DEPLOY_MODE=""
COMPOSE_FILE=""
IS_WSL=false
NEED_SSH_KEY_MOUNT=false
DEV_MODE=false

resolve_env_path() {
    if [[ "${DEV_MODE:-false}" == true ]]; then
        DYNAMIC_ENV="$SCRIPT_DIR/backend/.env"
    else
        DYNAMIC_ENV=$(mktemp "${TMPDIR:-/tmp}/pentest-copilot-env.XXXXXX")
        trap 'rm -f "$DYNAMIC_ENV" 2>/dev/null' EXIT
    fi
}

# When reconfiguring in Docker mode, pull the existing .env from the container
# so the user sees current values as defaults
seed_env_from_container() {
    if [[ "${DEV_MODE:-false}" == true ]]; then
        return
    fi

    local container_id
    container_id=$(compose ps -q backend 2>/dev/null | head -1 || true)
    if [[ -n "$container_id" ]]; then
        docker cp "${container_id}:/srv/data/.env" "$DYNAMIC_ENV" 2>/dev/null && \
            info "Loaded current .env from container" || true
    fi

    # If nothing was pulled, seed from template
    if [[ ! -s "$DYNAMIC_ENV" ]]; then
        cp "$DYNAMIC_ENV_TMPL" "$DYNAMIC_ENV"
    fi
}

# ── Helpers ────────────────────────────────────────────────
print_banner() {
    echo
    echo -e "${BLUE}${BOLD}╔══════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}${BOLD}║        Pentest Copilot  ·  Launcher      ║${NC}"
    echo -e "${BLUE}${BOLD}╚══════════════════════════════════════════╝${NC}"
    echo
}

info()    { echo -e " ${GREEN}[✓]${NC} $1"; }
warn()    { echo -e " ${YELLOW}[!]${NC} $1"; }
err()     { echo -e " ${RED}[✗]${NC} $1"; }
section() { echo; echo -e " ${CYAN}${BOLD}── $1 ──${NC}"; }
prompt_input() { echo -en " ${CYAN}$1${NC} "; }

confirm() {
    local msg="$1" default="${2:-n}"
    if [[ "$default" == "y" ]]; then
        prompt_input "$msg [Y/n]:"
        read -r resp
        [[ -z "$resp" || "$resp" =~ ^[Yy] ]]
    else
        prompt_input "$msg [y/N]:"
        read -r resp
        [[ "$resp" =~ ^[Yy] ]]
    fi
}

# Escape value for .env: wrap in double quotes, escape \ and " inside
escape_env_val() {
    local val="$1"
    printf '%s' "$val" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

set_env_var() {
    local file="$1" var="$2" val="$3"
    local tmp="${file}.tmp.$$"
    local escaped
    escaped=$(escape_env_val "$val")
    if grep -q "^${var}=" "$file" 2>/dev/null; then
        grep -v "^${var}=" "$file" > "$tmp"
        mv "$tmp" "$file"
    fi
    echo "${var}=\"${escaped}\"" >> "$file"
}

get_env() {
    local file="$1" var="$2"
    local raw
    raw=$(grep "^${var}=" "$file" 2>/dev/null | head -1 | cut -d'=' -f2- || true)
    # Strip surrounding double quotes (from set_env_var) for display
    if [[ "$raw" =~ ^\"(.*)\"$ ]]; then
        echo "${BASH_REMATCH[1]}" | sed 's/\\"/"/g; s/\\\\/\\/g'
    else
        echo "$raw"
    fi
}

set_toml_var() {
    local file="$1" key="$2" val="$3"
    if grep -q "^${key} " "$file" 2>/dev/null || grep -q "^${key}=" "$file" 2>/dev/null; then
        local tmp="${file}.tmp.$$"
        sed "s|^${key} *=.*|${key} = \"${val}\"|" "$file" > "$tmp"
        mv "$tmp" "$file"
    elif grep -q "^# *${key} " "$file" 2>/dev/null || grep -q "^# *${key}=" "$file" 2>/dev/null; then
        local tmp="${file}.tmp.$$"
        sed "s|^# *${key} *=.*|${key} = \"${val}\"|" "$file" > "$tmp"
        mv "$tmp" "$file"
    else
        echo "${key} = \"${val}\"" >> "$file"
    fi
}

get_toml_var() {
    local file="$1" key="$2"
    grep "^${key} " "$file" 2>/dev/null | head -1 \
        | sed 's/[^=]*= *//; s/ *#.*//; s/^"//; s/"$//' || true
}

# ── Prerequisite checks ───────────────────────────────────
check_prerequisites() {
    section "Checking Prerequisites"

    if ! command -v docker &>/dev/null; then
        err "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
        exit 1
    fi
    info "Docker: $(docker --version 2>/dev/null | head -1)"

    if docker compose version &>/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        err "Docker Compose not found. Install it from https://docs.docker.com/compose/install/"
        exit 1
    fi
    info "Compose: $($COMPOSE_CMD version 2>/dev/null | head -1)"

    if ! docker info &>/dev/null 2>&1; then
        err "Docker daemon is not running — please start Docker first."
        exit 1
    fi
    info "Docker daemon is running"
}

# ── WSL detection ─────────────────────────────────────────
detect_wsl() {
    if grep -qi microsoft /proc/version 2>/dev/null; then
        IS_WSL=true
        info "WSL environment detected — hostnames will use 'localhost'"
    fi
}

# ── Existing-config helpers ───────────────────────────────
has_existing_config() {
    [[ -f "$CONFIG_TOML" ]] && return 0
    # In dev mode, check for local .env
    [[ -f "$SCRIPT_DIR/backend/.env" ]] && return 0
    # In Docker mode, check if container has config
    if [[ -n "${COMPOSE_CMD:-}" ]]; then
        local cid
        cid=$(compose ps -q backend 2>/dev/null | head -1 || true)
        if [[ -n "$cid" ]]; then
            docker exec "$cid" test -f /srv/data/.env 2>/dev/null && return 0
        fi
    fi
    return 1
}

mask_key() {
    local k="$1"
    if [[ ${#k} -gt 8 ]]; then
        echo "${k:0:4}****${k: -4}"
    elif [[ -n "$k" ]]; then
        echo "****"
    else
        echo "${DIM}not set${NC}"
    fi
}

show_config_summary() {
    section "Current Configuration"

    # Try to read .env -- from host in dev mode, from container in Docker mode
    local env_content=""
    if [[ -f "$SCRIPT_DIR/backend/.env" ]]; then
        env_content="$SCRIPT_DIR/backend/.env"
    else
        local cid
        cid=$(compose ps -q backend 2>/dev/null | head -1 || true)
        if [[ -n "$cid" ]]; then
            local tmp_summary
            tmp_summary=$(mktemp "${TMPDIR:-/tmp}/pentest-env-summary.XXXXXX")
            if docker cp "${cid}:/srv/data/.env" "$tmp_summary" 2>/dev/null; then
                env_content="$tmp_summary"
            fi
        fi
    fi

    if [[ -n "$env_content" && -f "$env_content" ]]; then
        local m k oauth
        m=$(get_env "$env_content" "MODEL")
        k=$(get_env "$env_content" "MODEL_API_KEY")
        oauth=$(get_env "$env_content" "ANTHROPIC_OAUTH_ACCESS_TOKEN")

        echo -e "   Model       : ${BOLD}${m:-not set}${NC}  (key: $(mask_key "$k"))"
        if [[ -n "$oauth" ]]; then
            echo -e "   Claude OAuth: ${GREEN}connected${NC}"
        fi

        local sh sp su
        sh=$(get_env "$env_content" "SSH_HOST")
        sp=$(get_env "$env_content" "SSH_PORT")
        su=$(get_env "$env_content" "SSH_USERNAME")
        if [[ -n "$sh" ]]; then
            echo -e "   SSH Target  : ${BOLD}${su:-?}@${sh}:${sp:-22}${NC}"
        else
            echo -e "   SSH Target  : ${DIM}not configured${NC}"
        fi

        # Clean up temp file if we created one
        [[ "$env_content" != "$SCRIPT_DIR/backend/.env" ]] && rm -f "$env_content" 2>/dev/null
    else
        warn "No .env found (dynamic config)"
    fi

    if [[ -f "$RUN_CONF" ]]; then
        source "$RUN_CONF"
        local mode_label="${DEPLOY_MODE:-unknown}"
        if [[ "${DEV_MODE:-false}" == true ]]; then
            mode_label="${mode_label} ${YELLOW}(developer — frontend & backend run manually)${NC}"
        fi
        echo -e "   Deploy Mode : ${BOLD}${mode_label}${NC}  (${COMPOSE_FILE:-?})"
    else
        warn "No saved deploy mode (.run.conf missing)"
    fi
}

# ── Deploy-mode selection ─────────────────────────────────
select_deploy_mode() {
    section "Deployment Mode"
    echo
    echo -e "   ${BOLD}1)${NC} Full Stack ${YELLOW}with${NC} Kali container   ${DIM}(~30 min first build, includes pentesting tools)${NC}"
    echo -e "   ${BOLD}2)${NC} Core Services only              ${DIM}(~12-15 min build, bring your own exploit box)${NC}"
    echo -e "   ${BOLD}3)${NC} Developer Mode                  ${DIM}(infra only: MongoDB + Redis [+ Kali], run frontend & backend manually)${NC}"
    echo
    prompt_input "Choose [1/2/3]:"
    read -r choice

    case "$choice" in
        1)
            DEPLOY_MODE="kali"
            COMPOSE_FILE="docker-compose.kali.yml"
            DEV_MODE=false
            info "Selected: Full Stack with Kali container"
            ;;
        3)
            DEV_MODE=true
            COMPOSE_FILE="docker-compose.dev.yml"
            if confirm "Include Kali container?" "y"; then
                DEPLOY_MODE="dev-kali"
                info "Selected: Developer Mode (MongoDB + Redis + Kali)"
            else
                DEPLOY_MODE="dev"
                info "Selected: Developer Mode (MongoDB + Redis only)"
            fi
            ;;
        *)
            DEPLOY_MODE="core"
            COMPOSE_FILE="docker-compose.yml"
            DEV_MODE=false
            info "Selected: Core Services only"
            ;;
    esac
}

# ── Static configuration (config.toml) ────────────────────
configure_static() {
    section "Static Configuration (config.toml)"

    if [[ ! -f "$CONFIG_TOML_TMPL" ]]; then
        err "Template not found: $CONFIG_TOML_TMPL"
        exit 1
    fi

    if [[ ! -f "$CONFIG_TOML" ]]; then
        cp "$CONFIG_TOML_TMPL" "$CONFIG_TOML"
        info "Created config.toml from template"
    fi

    # ── Server settings ──
    section "Server Settings"
    local cur
    cur=$(get_toml_var "$CONFIG_TOML" "base_url_frontend")
    local default_url="http://localhost:3000"
    [[ "$IS_WSL" == true ]] && default_url="http://localhost:3000"
    prompt_input "Frontend URL [${cur:-$default_url}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_toml_var "$CONFIG_TOML" "base_url_frontend" "$val"
        cur="$val"
    fi
    local frontend_url="${cur:-$default_url}"

    cur=$(get_toml_var "$CONFIG_TOML" "deployment")
    prompt_input "Deployment mode [${cur:-LOCAL}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_toml_var "$CONFIG_TOML" "deployment" "$val"
    fi

    cur=$(get_toml_var "$CONFIG_TOML" "cors_origins")
    echo
    echo -e "   ${DIM}CORS origins (comma-separated). Default: frontend URL. Add extra origins if needed.${NC}"
    prompt_input "CORS origins [${cur:-$frontend_url}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_toml_var "$CONFIG_TOML" "cors_origins" "$val"
    elif [[ -z "$cur" ]]; then
        set_toml_var "$CONFIG_TOML" "cors_origins" "$frontend_url"
    fi

    # ── Database ──
    section "Database"
    cur=$(get_toml_var "$CONFIG_TOML" "mongo_uri")
    local default_mongo="mongodb://mongodb:27017/pentestcopilot"
    if [[ "${DEV_MODE:-false}" == true ]]; then
        default_mongo="mongodb://localhost:27017/pentestcopilot"
        if [[ "$cur" == *"mongodb://"* && "$cur" != *"localhost"* ]]; then
            cur="$default_mongo"
            set_toml_var "$CONFIG_TOML" "mongo_uri" "$cur"
        fi
    else
        if [[ "$cur" == *"localhost"* ]]; then
            cur="$default_mongo"
            set_toml_var "$CONFIG_TOML" "mongo_uri" "$cur"
        fi
    fi
    prompt_input "MongoDB URI [${cur:-$default_mongo}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_toml_var "$CONFIG_TOML" "mongo_uri" "$val"
    elif [[ -z "$cur" ]]; then
        set_toml_var "$CONFIG_TOML" "mongo_uri" "$default_mongo"
    fi

    cur=$(get_toml_var "$CONFIG_TOML" "redis_url")
    local default_redis="redis://redis:6379"
    if [[ "${DEV_MODE:-false}" == true ]]; then
        default_redis="redis://localhost:6379"
        if [[ "$cur" == *"redis://"* && "$cur" != *"localhost"* ]]; then
            cur="$default_redis"
            set_toml_var "$CONFIG_TOML" "redis_url" "$cur"
        fi
    else
        if [[ "$cur" == *"localhost"* ]]; then
            cur="$default_redis"
            set_toml_var "$CONFIG_TOML" "redis_url" "$cur"
        fi
    fi
    prompt_input "Redis URL [${cur:-$default_redis}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_toml_var "$CONFIG_TOML" "redis_url" "$val"
    elif [[ -z "$cur" ]]; then
        set_toml_var "$CONFIG_TOML" "redis_url" "$default_redis"
    fi

    # ── Tracing (Langfuse) ──
    section "Tracing (Langfuse)"
    if ! grep -q "^\[tracing\]" "$CONFIG_TOML" 2>/dev/null; then
        echo "" >> "$CONFIG_TOML"
        echo "[tracing]" >> "$CONFIG_TOML"
        echo "enabled = \"false\"" >> "$CONFIG_TOML"
        echo "public_key = \"\"" >> "$CONFIG_TOML"
        echo "secret_key = \"\"" >> "$CONFIG_TOML"
        echo "base_url = \"https://cloud.langfuse.com\"" >> "$CONFIG_TOML"
    fi
    echo
    echo -e "   ${DIM}Langfuse provides LLM observability: traces, token usage, costs.${NC}"
    echo -e "   ${DIM}Get keys at https://cloud.langfuse.com${NC}"
    echo
    if confirm "Enable Langfuse tracing?" "n"; then
        set_toml_var "$CONFIG_TOML" "enabled" "true"
        cur=$(get_toml_var "$CONFIG_TOML" "public_key")
        prompt_input "Langfuse Public Key (pk-lf-...) [${cur:-not set}]:"
        read -r val
        [[ -n "$val" ]] && set_toml_var "$CONFIG_TOML" "public_key" "$val"
        cur=$(get_toml_var "$CONFIG_TOML" "secret_key")
        prompt_input "Langfuse Secret Key (sk-lf-...) [${cur:-not set}]:"
        read -rs val; echo
        [[ -n "$val" ]] && set_toml_var "$CONFIG_TOML" "secret_key" "$val"
        cur=$(get_toml_var "$CONFIG_TOML" "base_url")
        prompt_input "Langfuse Base URL [${cur:-https://cloud.langfuse.com}]:"
        read -r val
        [[ -n "$val" ]] && set_toml_var "$CONFIG_TOML" "base_url" "$val"
        info "Langfuse tracing enabled"
    else
        set_toml_var "$CONFIG_TOML" "enabled" "false"
        info "Langfuse tracing disabled"
    fi

    # ── Session ──
    section "Session"
    cur=$(get_toml_var "$CONFIG_TOML" "secret")
    if [[ -z "$cur" || "$cur" == "thisismysessionsecret!123" ]]; then
        local generated
        generated=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '/+=' | head -c 64)
        set_toml_var "$CONFIG_TOML" "secret" "$generated"
        info "Generated random session secret"
    else
        info "Session secret already configured"
    fi

    info "Static configuration saved → config.toml"
}

# ── SSH / exploit-box configuration (writes to .env) ──
configure_ssh() {
    section "SSH / Exploit Box"

    if [[ "$DEPLOY_MODE" == "kali" ]]; then
        info "Using built-in Kali container defaults (root@kali:22, no password)"
        set_env_var "$DYNAMIC_ENV" "SSH_HOST"                   "kali"
        set_env_var "$DYNAMIC_ENV" "SSH_PORT"                   "22"
        set_env_var "$DYNAMIC_ENV" "SSH_USERNAME"               "root"
        set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD"               ""
        set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY"            ""
        set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""

        if confirm "Do you also want to configure SSH to an external box instead?"; then
            configure_external_ssh
        fi
        return
    fi

    if [[ "$DEPLOY_MODE" == "dev-kali" ]]; then
        info "Using Kali container via localhost:4242 (backend runs on host)"
        set_env_var "$DYNAMIC_ENV" "SSH_HOST"                   "localhost"
        set_env_var "$DYNAMIC_ENV" "SSH_PORT"                   "4242"
        set_env_var "$DYNAMIC_ENV" "SSH_USERNAME"               "root"
        set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD"               ""
        set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY"            ""
        set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""

        if confirm "Do you also want to configure SSH to an external box instead?"; then
            configure_external_ssh
        fi
        return
    fi

    echo
    echo -e "   ${BOLD}1)${NC} Configure SSH to an external exploit box"
    echo -e "   ${BOLD}2)${NC} Skip SSH for now ${DIM}(backend will start without an exploit box)${NC}"
    prompt_input "Choose [1/2]:"
    read -r ssh_choice

    case "$ssh_choice" in
        1)
            configure_external_ssh
            ;;
        *)
            info "Skipping SSH configuration — no exploit box configured"
            set_env_var "$DYNAMIC_ENV" "SSH_HOST"                   ""
            set_env_var "$DYNAMIC_ENV" "SSH_PORT"                   "22"
            set_env_var "$DYNAMIC_ENV" "SSH_USERNAME"               ""
            set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD"               ""
            set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY"            ""
            set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""
            warn "You can configure SSH later with: $0 config"
            ;;
    esac
}

configure_external_ssh() {
    echo
    prompt_input "SSH Host:"
    read -r ssh_host
    if [[ -z "$ssh_host" ]]; then
        err "SSH host is required"; exit 1
    fi

    prompt_input "SSH Port [22]:"
    read -r ssh_port
    ssh_port="${ssh_port:-22}"

    prompt_input "SSH Username [root]:"
    read -r ssh_user
    ssh_user="${ssh_user:-root}"

    set_env_var "$DYNAMIC_ENV" "SSH_HOST"     "$ssh_host"
    set_env_var "$DYNAMIC_ENV" "SSH_PORT"     "$ssh_port"
    set_env_var "$DYNAMIC_ENV" "SSH_USERNAME" "$ssh_user"

    echo
    echo -e "   ${BOLD}1)${NC} Password authentication"
    echo -e "   ${BOLD}2)${NC} Private key authentication"
    prompt_input "Choose [1/2]:"
    read -r auth

    case "$auth" in
        2)
            prompt_input "Path to private key file (on this machine):"
            read -r key_path

            if [[ ! -f "$key_path" ]]; then
                err "File not found: $key_path"; exit 1
            fi

            if [[ "${DEV_MODE:-false}" == true ]]; then
                local resolved_path
                resolved_path="$(cd "$(dirname "$key_path")" && pwd)/$(basename "$key_path")"

                set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD"               ""
                set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY"            "$resolved_path"
                set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""

                prompt_input "Passphrase for this key (Enter if none):"
                read -rs passphrase; echo
                [[ -n "$passphrase" ]] && set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" "$passphrase"

                info "Private key auth configured (host path: $resolved_path)"
            else
                mkdir -p "$SSH_KEYS_DIR"
                local key_name
                key_name="$(basename "$key_path")"
                cp "$key_path" "$SSH_KEYS_DIR/$key_name"
                chmod 600 "$SSH_KEYS_DIR/$key_name"
                info "Copied key → ssh-keys/$key_name"

                local container_path="/ssh-keys/$key_name"

                prompt_input "Passphrase for this key (Enter if none):"
                read -rs passphrase; echo

                set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD"               ""
                set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY"            "$container_path"
                set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" "$passphrase"
                NEED_SSH_KEY_MOUNT=true

                info "Private key auth configured"
                warn "The key will be mounted at ${BOLD}$container_path${NC} inside the backend container"
            fi
            ;;
        *)
            prompt_input "SSH Password:"
            read -rs ssh_pass; echo

            set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD"               "$ssh_pass"
            set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY"            ""
            set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""

            info "Password auth configured"
            ;;
    esac
}

# ── Dynamic model configuration (.env) ────────────────────
configure_models() {
    section "Model Configuration (.env — dynamic)"

    if [[ ! -f "$DYNAMIC_ENV_TMPL" ]]; then
        err "Template not found: $DYNAMIC_ENV_TMPL"
        exit 1
    fi

    if [[ ! -s "$DYNAMIC_ENV" ]]; then
        cp "$DYNAMIC_ENV_TMPL" "$DYNAMIC_ENV"
        if [[ "${DEV_MODE:-false}" == true ]]; then
            info "Created backend/.env from template"
        fi
    fi

    section "Model Configuration"
    local cur
    cur=$(get_env "$DYNAMIC_ENV" "MODEL_PROVIDER")
    echo
    echo -e "   ${BOLD}Providers:${NC} openai, anthropic, openai-compatible"
    prompt_input "Provider [${cur:-openai}]:"
    read -r val
    [[ -n "$val" ]] && set_env_var "$DYNAMIC_ENV" "MODEL_PROVIDER" "$val"
    local model_provider="${val:-${cur:-openai}}"

    cur=$(get_env "$DYNAMIC_ENV" "MODEL")
    prompt_input "Model name [${cur:-gpt-4o}]:"
    read -r val
    [[ -n "$val" ]] && set_env_var "$DYNAMIC_ENV" "MODEL" "$val"

    if [[ "$model_provider" == "anthropic" ]]; then
        echo
        echo -e "   ${BOLD}Authentication:${NC}"
        echo -e "   ${BOLD}1)${NC} API Key"
        echo -e "   ${BOLD}2)${NC} Connect Claude Account (OAuth)"
        prompt_input "Choose [1/2]:"
        read -r auth_choice

        if [[ "$auth_choice" == "2" ]]; then
            configure_claude_oauth
        else
            prompt_input "API key (Enter to keep existing):"
            read -r val
            [[ -n "$val" ]] && set_env_var "$DYNAMIC_ENV" "MODEL_API_KEY" "$val"
        fi
    else
        prompt_input "API key (Enter to keep existing):"
        read -r val
        [[ -n "$val" ]] && set_env_var "$DYNAMIC_ENV" "MODEL_API_KEY" "$val"
    fi

    prompt_input "Base URL override (Enter to skip):"
    read -r val
    [[ -n "$val" ]] && set_env_var "$DYNAMIC_ENV" "MODEL_BASE_PATH" "$val"

    if [[ "${DEV_MODE:-false}" == true ]]; then
        info "Model configuration saved → backend/.env"
    else
        info "Model configuration saved (will be provisioned into container)"
    fi
}

# ── Claude OAuth PKCE flow ────────────────────────────────
configure_claude_oauth() {
    section "Claude OAuth (PKCE)"

    if ! command -v openssl &>/dev/null; then
        err "openssl is required for OAuth PKCE. Please install it."
        return 1
    fi

    local client_id="9d1c250a-e61b-44d9-88ed-5944d1962f5e"
    local auth_url="https://claude.ai/oauth/authorize"
    local token_url="https://console.anthropic.com/v1/oauth/token"
    local redirect_uri="https://console.anthropic.com/oauth/code/callback"
    local scopes="org:create_api_key user:profile user:inference"

    local code_verifier
    code_verifier=$(openssl rand 32 | openssl base64 -A | tr '+/' '-_' | tr -d '=')

    local code_challenge
    code_challenge=$(printf '%s' "$code_verifier" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')

    local state
    state=$(openssl rand -hex 16)

    local auth_params="code=true"
    auth_params+="&client_id=${client_id}"
    auth_params+="&response_type=code"
    auth_params+="&redirect_uri=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${redirect_uri}', safe=''))" 2>/dev/null || echo "${redirect_uri}")"
    auth_params+="&scope=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${scopes}', safe=''))" 2>/dev/null || echo "${scopes// /+}")"
    auth_params+="&code_challenge=${code_challenge}"
    auth_params+="&code_challenge_method=S256"
    auth_params+="&state=${state}"

    local full_url="${auth_url}?${auth_params}"

    echo
    info "Open this URL in your browser to authorize Claude:"
    echo
    echo -e "   ${CYAN}${full_url}${NC}"
    echo
    echo -e "   After authorizing, you'll be redirected to a page showing an authorization code."
    echo -e "   Copy the full code and paste it below."
    echo
    prompt_input "Paste the authorization code here:"
    read -r auth_code

    if [[ -z "$auth_code" ]]; then
        err "No authorization code provided"
        return 1
    fi

    auth_code="${auth_code%%#*}"

    info "Exchanging authorization code for tokens..."

    if ! command -v curl &>/dev/null; then
        err "curl is required for token exchange. Please install it."
        return 1
    fi

    local token_response
    token_response=$(curl -s -X POST "$token_url" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "code=${auth_code}" \
        -d "state=${state}" \
        -d "grant_type=authorization_code" \
        -d "client_id=${client_id}" \
        -d "redirect_uri=${redirect_uri}" \
        -d "code_verifier=${code_verifier}")

    local access_token refresh_token expires_in

    if command -v python3 &>/dev/null; then
        access_token=$(echo "$token_response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || true)
        refresh_token=$(echo "$token_response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('refresh_token',''))" 2>/dev/null || true)
        expires_in=$(echo "$token_response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('expires_in',3600))" 2>/dev/null || echo "3600")
    elif command -v jq &>/dev/null; then
        access_token=$(echo "$token_response" | jq -r '.access_token // empty')
        refresh_token=$(echo "$token_response" | jq -r '.refresh_token // empty')
        expires_in=$(echo "$token_response" | jq -r '.expires_in // 3600')
    else
        err "Neither python3 nor jq found. Cannot parse token response."
        echo -e "   ${DIM}Raw response: ${token_response}${NC}"
        return 1
    fi

    if [[ -z "$access_token" ]]; then
        err "Failed to get access token from Claude OAuth"
        echo -e "   ${DIM}Response: ${token_response}${NC}"
        return 1
    fi

    local expires_at
    expires_at=$(( $(date +%s) + ${expires_in:-3600} ))

    set_env_var "$DYNAMIC_ENV" "ANTHROPIC_OAUTH_ACCESS_TOKEN"  "$access_token"
    set_env_var "$DYNAMIC_ENV" "ANTHROPIC_OAUTH_REFRESH_TOKEN" "$refresh_token"
    set_env_var "$DYNAMIC_ENV" "ANTHROPIC_OAUTH_EXPIRES_AT"    "$expires_at"

    set_env_var "$DYNAMIC_ENV" "MODEL_API_KEY" ""

    info "Claude account connected via OAuth"
}

# ── Frontend .env configuration ───────────────────────────
configure_frontend() {
    section "Frontend Environment"

    if [[ ! -f "$FRONTEND_TMPL" ]]; then
        err "Template not found: $FRONTEND_TMPL"
        exit 1
    fi

    if [[ ! -f "$FRONTEND_ENV" ]]; then
        cp "$FRONTEND_TMPL" "$FRONTEND_ENV"
        info "Created frontend/.env from template"
    fi

    if [[ "$IS_WSL" == true ]]; then
        sed -i 's/127\.0\.0\.1/localhost/g' "$FRONTEND_ENV"
    fi

    info "Frontend configuration saved"
}

# ── docker-compose.override.yml (SSH key volume) ─────────
ensure_compose_override() {
    if [[ "$NEED_SSH_KEY_MOUNT" == true ]] || \
       { [[ -d "$SSH_KEYS_DIR" ]] && [[ -n "$(ls -A "$SSH_KEYS_DIR" 2>/dev/null)" ]]; }; then
        cat > "$COMPOSE_OVERRIDE" <<'EOF'
services:
  backend:
    volumes:
      - ./ssh-keys:/ssh-keys:ro
EOF
        info "Created docker-compose.override.yml (SSH key mount)"
    else
        rm -f "$COMPOSE_OVERRIDE"
    fi
}

# ── Persist / load deploy preference ─────────────────────
save_run_conf() {
    cat > "$RUN_CONF" <<EOF
DEPLOY_MODE=${DEPLOY_MODE}
COMPOSE_FILE=${COMPOSE_FILE}
DEV_MODE=${DEV_MODE}
EOF
    info "Saved deploy preferences → .run.conf"
}

load_run_conf() {
    if [[ -f "$RUN_CONF" ]]; then
        source "$RUN_CONF"
        return 0
    fi
    return 1
}

# ── Compose wrapper ───────────────────────────────────────
compose() {
    local args=()
    [[ -n "${COMPOSE_FILE:-}" ]] && args+=(-f "$COMPOSE_FILE")
    [[ -f "$COMPOSE_OVERRIDE" ]] && args+=(-f "$COMPOSE_OVERRIDE")
    $COMPOSE_CMD "${args[@]}" "$@"
}

# ── Copy .env into data volume (config.toml is bind-mounted) ──
provision_data_volume() {
    if [[ "${DEV_MODE:-false}" == true ]]; then
        return
    fi

    section "Provisioning Data Volume"

    local container_id
    container_id=$(compose ps -q backend 2>/dev/null | head -1)

    if [[ -z "$container_id" ]]; then
        warn "Backend container not running — skipping volume provisioning"
        return
    fi

    if [[ -s "$DYNAMIC_ENV" ]]; then
        docker cp "$DYNAMIC_ENV" "${container_id}:/srv/data/.env"
        info "Provisioned .env → container /srv/data/.env"
        rm -f "$DYNAMIC_ENV" 2>/dev/null
    fi
}

# ── Check pnpm is available ───────────────────────────────
check_pnpm() {
    if ! command -v pnpm &>/dev/null; then
        err "pnpm is not installed. Install it via: corepack enable && corepack prepare pnpm@latest --activate"
        exit 1
    fi
}

# ── Launch ────────────────────────────────────────────────
launch() {
    local build_flag="${1:-}"

    if [[ -z "${COMPOSE_FILE:-}" ]]; then
        if ! load_run_conf; then
            COMPOSE_FILE="docker-compose.yml"
            DEPLOY_MODE="core"
        fi
    fi

    if [[ "${DEV_MODE:-false}" == true ]]; then
        launch_dev "$build_flag"
        return
    fi

    section "Launching Pentest Copilot"

    ensure_compose_override

    info "Compose file : $COMPOSE_FILE"
    [[ -f "$COMPOSE_OVERRIDE" ]] && info "Override      : docker-compose.override.yml"

    if [[ "$build_flag" == "--build" ]]; then
        warn "Building images — this may take a while on the first run..."
    fi

    echo
    compose up ${build_flag} -d
    echo

    provision_data_volume

    section "Pentest Copilot is Running"
    echo
    local frontend_url backend_url
    frontend_url=$(get_toml_var "$CONFIG_TOML" "base_url_frontend" 2>/dev/null)
    backend_url=$(get_toml_var "$CONFIG_TOML" "backend_uri" 2>/dev/null)
    frontend_url="${frontend_url:-http://localhost:3000}"
    backend_url="${backend_url:-http://localhost:8080}"
    echo -e "   ${GREEN}Frontend${NC}   ${frontend_url}"
    echo -e "   ${GREEN}Backend${NC}    ${backend_url}"
    echo -e "   ${GREEN}MongoDB${NC}    localhost:27017"
    echo -e "   ${GREEN}Redis${NC}      localhost:6379"

    if [[ "${DEPLOY_MODE:-}" == "kali" ]]; then
        echo
        echo -e "   ${GREEN}Kali SSH${NC}   ssh root@localhost -p 4242"
        echo -e "   ${GREEN}Kali noVNC${NC} http://localhost:4200"
        echo -e "   ${GREEN}Kali VPN${NC}   localhost:1194/udp"
    fi

    echo
    info "Config files:"
    echo -e "   ${DIM}config.toml${NC}          Static infrastructure (edit & restart)"
    echo -e "   ${DIM}/srv/data/.env${NC}      Dynamic model config (inside container, editable via Settings UI)"
    echo
    info "Useful commands:"
    echo -e "   ${DIM}$0 stop${NC}     Stop all containers"
    echo -e "   ${DIM}$0 logs${NC}     Tail container logs"
    echo -e "   ${DIM}$0 status${NC}   Show container status"
    echo -e "   ${DIM}$0${NC}          Reconfigure or restart"
}

# ── Launch dev mode (infra only, frontend & backend run manually) ──
launch_dev() {
    local build_flag="${1:-}"

    section "Launching Developer Mode"

    check_pnpm

    info "Installing dependencies (backend + frontend)..."
    (cd "$SCRIPT_DIR/backend" && pnpm install)
    (cd "$SCRIPT_DIR/frontend" && pnpm install)
    info "Dependencies installed"

    local dev_services="mongodb redis"
    if [[ "${DEPLOY_MODE:-}" == "dev-kali" ]]; then
        dev_services="mongodb redis kali"
    fi

    info "Starting infrastructure: ${BOLD}${dev_services}${NC}"
    echo
    compose up ${build_flag} -d ${dev_services}
    echo

    section "Developer Mode — Infrastructure Running"
    echo
    echo -e "   ${GREEN}MongoDB${NC}    localhost:27017"
    echo -e "   ${GREEN}Redis${NC}      localhost:6379"

    if [[ "${DEPLOY_MODE:-}" == "dev-kali" ]]; then
        echo
        echo -e "   ${GREEN}Kali SSH${NC}   ssh root@localhost -p 4242"
        echo -e "   ${GREEN}Kali noVNC${NC} http://localhost:4200"
        echo -e "   ${GREEN}Kali VPN${NC}   localhost:1194/udp"
    fi

    echo
    info "Config files:"
    echo -e "   ${DIM}config.toml${NC}    Static infrastructure"
    echo -e "   ${DIM}backend/.env${NC}   Dynamic model config"
    echo
    section "Start Frontend & Backend Manually"
    echo
    echo -e "   ${CYAN}Backend${NC} (run in ${BOLD}two separate terminals${NC}):"
    echo -e "     ${DIM}cd backend${NC}"
    echo -e "     ${DIM}pnpm run watch${NC}   ${DIM}# Terminal 1: compile TypeScript on changes${NC}"
    echo -e "     ${DIM}pnpm run dev${NC}     ${DIM}# Terminal 2: start with nodemon${NC}"
    echo
    echo -e "   ${CYAN}Frontend:${NC}"
    echo -e "     ${DIM}cd frontend${NC}"
    echo -e "     ${DIM}pnpm run dev     ${NC}${DIM}# start Next.js dev server with Turbopack${NC}"
    echo
    local frontend_url backend_url
    frontend_url=$(get_toml_var "$CONFIG_TOML" "base_url_frontend" 2>/dev/null)
    backend_url=$(get_toml_var "$CONFIG_TOML" "backend_uri" 2>/dev/null)
    frontend_url="${frontend_url:-http://localhost:3000}"
    backend_url="${backend_url:-http://localhost:8080}"
    echo -e "   ${CYAN}Endpoints when running:${NC}"
    echo -e "     ${GREEN}Frontend${NC}   ${frontend_url}"
    echo -e "     ${GREEN}Backend${NC}    ${backend_url}"
    echo
    info "Useful commands:"
    echo -e "   ${DIM}$0 stop${NC}     Stop infrastructure containers"
    echo -e "   ${DIM}$0 logs${NC}     Tail container logs"
    echo -e "   ${DIM}$0 status${NC}   Show container status"
    echo -e "   ${DIM}$0 dev${NC}      Restart developer mode"
    echo -e "   ${DIM}$0${NC}          Reconfigure or restart"
}

# ── Full first-time configure ─────────────────────────────
full_configure() {
    detect_wsl
    select_deploy_mode
    resolve_env_path
    configure_static
    configure_ssh
    configure_models
    configure_frontend
    save_run_conf
}

# ── Sub-commands ──────────────────────────────────────────
cmd_stop() {
    check_prerequisites
    load_run_conf 2>/dev/null || true
    section "Stopping Pentest Copilot"
    compose down
    info "All containers stopped"
}

cmd_logs() {
    check_prerequisites
    load_run_conf 2>/dev/null || true
    compose logs -f "${@}"
}

cmd_status() {
    check_prerequisites
    load_run_conf 2>/dev/null || true
    compose ps
}

cmd_dev() {
    check_prerequisites
    detect_wsl

    if load_run_conf 2>/dev/null && [[ "${DEV_MODE:-false}" == true ]]; then
        info "Reusing saved developer mode config"
    else
        DEV_MODE=true
        COMPOSE_FILE="docker-compose.dev.yml"
        if confirm "Include Kali container?" "y"; then
            DEPLOY_MODE="dev-kali"
        else
            DEPLOY_MODE="dev"
        fi
        save_run_conf
    fi

    resolve_env_path

    if [[ ! -f "$CONFIG_TOML" ]] || [[ ! -f "$DYNAMIC_ENV" ]] || [[ ! -f "$FRONTEND_ENV" ]]; then
        configure_static
        configure_ssh
        configure_models
        configure_frontend
    fi

    launch
}

cmd_config() {
    check_prerequisites
    detect_wsl
    if ! load_run_conf 2>/dev/null; then
        select_deploy_mode
        save_run_conf
    fi
    resolve_env_path
    seed_env_from_container
    configure_static
    configure_ssh
    configure_models
    configure_frontend
    ensure_compose_override
    echo
    info "Configuration updated."
    echo
    if confirm "Restart running containers to apply changes?" "y"; then
        if [[ -d "$SSH_KEYS_DIR" ]] && [[ -n "$(ls -A "$SSH_KEYS_DIR" 2>/dev/null)" ]]; then
            NEED_SSH_KEY_MOUNT=true
        fi
        compose restart
        provision_data_volume
        echo
        info "Containers restarted with updated config"
    else
        if [[ "${DEV_MODE:-false}" != true ]]; then
            provision_data_volume
        fi
        info "Done. Run '$0' to start containers when ready."
    fi
}

cmd_help() {
    print_banner
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  (none)    Interactive setup & start"
    echo "  dev       Developer mode (infra containers only, run frontend & backend manually)"
    echo "  config    Update configuration only (no rebuild)"
    echo "  stop      Stop all containers"
    echo "  logs      Tail logs (optionally: $0 logs backend)"
    echo "  status    Show running containers"
    echo "  -h|--help This help message"
    echo
    echo "Configuration Files:"
    echo "  config.toml      Static infrastructure (server, DB, CORS, session)"
    echo "  .env             Dynamic config (model providers, API keys, SSH, OAuth)"
    echo "                   Dev mode: backend/.env | Docker: /srv/data/.env (inside container)"
    echo "  frontend/.env    Frontend environment variables"
    echo
}

# ── Main ──────────────────────────────────────────────────
main() {
    cd "$SCRIPT_DIR"
    print_banner

    case "${1:-}" in
        stop)            cmd_stop;            return ;;
        logs)            shift; cmd_logs "$@"; return ;;
        status)          cmd_status;          return ;;
        config)          cmd_config;          return ;;
        dev)             cmd_dev;             return ;;
        -h|--help|help)  cmd_help;            return ;;
    esac

    check_prerequisites

    if has_existing_config; then
        show_config_summary
        echo
        echo -e "   ${BOLD}1)${NC} Start with existing configuration"
        echo -e "   ${BOLD}2)${NC} Rebuild images & start (existing config)"
        echo -e "   ${BOLD}3)${NC} Update configuration only ${DIM}(edit config files, no build/start)${NC}"
        echo -e "   ${BOLD}4)${NC} Reconfigure everything from scratch"
        echo -e "   ${BOLD}5)${NC} Developer mode ${DIM}(infra only, run frontend & backend manually with pnpm)${NC}"
        echo
        prompt_input "Choose [1/2/3/4/5]:"
        read -r choice

        case "$choice" in
            5)
                cmd_dev
                ;;
            4)
                full_configure
                launch --build
                ;;
            3)
                cmd_config
                ;;
            2)
                load_run_conf 2>/dev/null || select_deploy_mode
                resolve_env_path
                if [[ -d "$SSH_KEYS_DIR" ]] && [[ -n "$(ls -A "$SSH_KEYS_DIR" 2>/dev/null)" ]]; then
                    NEED_SSH_KEY_MOUNT=true
                fi
                launch --build
                ;;
            *)
                load_run_conf 2>/dev/null || select_deploy_mode
                resolve_env_path
                if [[ -d "$SSH_KEYS_DIR" ]] && [[ -n "$(ls -A "$SSH_KEYS_DIR" 2>/dev/null)" ]]; then
                    NEED_SSH_KEY_MOUNT=true
                fi
                launch
                ;;
        esac
    else
        info "No existing configuration found — starting fresh setup..."
        full_configure
        launch --build
    fi
}

main "$@"
