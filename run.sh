#!/bin/bash
# ============================================================
#  Pentest Copilot — All-in-one launcher
#  Configures, builds, and runs the entire stack.
#
#  Commands: start | config | dev | stop | logs | status | help
#  Flags:    --quick / -q   Skip all configuration prompts
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

# ── Paths ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_TOML="$SCRIPT_DIR/config.toml"
CONFIG_TOML_TMPL="$SCRIPT_DIR/config.toml.template"
DYNAMIC_ENV=""  # set by resolve_env_path
DYNAMIC_ENV_TMPL="$SCRIPT_DIR/backend/.env.template"
FRONTEND_ENV="$SCRIPT_DIR/frontend/.env"
FRONTEND_TMPL="$SCRIPT_DIR/frontend/.env.template"
SSH_KEYS_DIR="$SCRIPT_DIR/ssh-keys"
COMPOSE_OVERRIDE="$SCRIPT_DIR/docker-compose.override.yml"

COMPOSE_CMD=""
DEPLOY_MODE=""
COMPOSE_FILE=""
IS_WSL=false
NEED_SSH_KEY_MOUNT=false
DEV_MODE=false
QUICK_MODE=false

resolve_env_path() {
    if [[ "${DEV_MODE:-false}" == true ]]; then
        DYNAMIC_ENV="$SCRIPT_DIR/backend/.env"
    else
        DYNAMIC_ENV=$(mktemp "${TMPDIR:-/tmp}/pentest-copilot-env.XXXXXX")
        trap 'rm -f "$DYNAMIC_ENV" 2>/dev/null' EXIT
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

show_commands() {
    echo -e "   ${BOLD}Commands:${NC}"
    echo -e "     ${CYAN}start${NC}        Guided start: choose normal or developer mode"
    echo -e "     ${CYAN}start -q${NC}     Quick start: skip prompts, use existing config"
    echo -e "     ${CYAN}config${NC}       Update model keys, Google search, tracing, or exploit box settings"
    echo -e "     ${CYAN}dev${NC}          Start directly in developer mode"
    echo -e "     ${CYAN}dev -q${NC}       Quick dev start: skip prompts"
    echo -e "     ${CYAN}stop${NC}         Stop all containers"
    echo -e "     ${CYAN}logs${NC}         Tail container logs"
    echo -e "     ${CYAN}status${NC}       Show container status"
    echo -e "     ${CYAN}help${NC}         Show full help"
    echo
}

info()    { echo -e " ${GREEN}[✓]${NC} $1"; }
warn()    { echo -e " ${YELLOW}[!]${NC} $1"; }
err()     { echo -e " ${RED}[✗]${NC} $1"; }
section() { echo; echo -e " ${CYAN}${BOLD}── $1 ──${NC}"; }
hint()    { echo -e "   ${DIM}$1${NC}"; }
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

mask_key() {
    local key="$1"
    if [[ ${#key} -le 8 ]]; then
        echo "****"
    else
        echo "${key:0:4}...${key: -4}"
    fi
}

# ── Prerequisites ─────────────────────────────────────────
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
        err "Docker Compose not found."
        exit 1
    fi
    info "Compose: $($COMPOSE_CMD version 2>/dev/null | head -1)"
    if ! docker info &>/dev/null 2>&1; then
        err "Docker daemon is not running."
        exit 1
    fi
    info "Docker daemon is running"
}

check_pnpm() {
    if ! command -v pnpm &>/dev/null; then
        err "pnpm is not installed. Install it via: corepack enable && corepack prepare pnpm@latest --activate"
        exit 1
    fi
}

detect_wsl() {
    if grep -qi microsoft /proc/version 2>/dev/null; then
        IS_WSL=true
    fi
}

# ── Ensure config from templates (no prompts) ──────────────
ensure_config_defaults() {
    if [[ ! -f "$CONFIG_TOML_TMPL" ]]; then
        err "Template not found: $CONFIG_TOML_TMPL"
        exit 1
    fi

    if [[ ! -f "$CONFIG_TOML" ]]; then
        cp "$CONFIG_TOML_TMPL" "$CONFIG_TOML"
        info "Created config.toml from template"
    fi

    # Patch mongo/redis for dev mode
    if [[ "${DEV_MODE:-false}" == true ]]; then
        local cur_mongo cur_redis
        cur_mongo=$(get_toml_var "$CONFIG_TOML" "mongo_uri")
        cur_redis=$(get_toml_var "$CONFIG_TOML" "redis_url")
        if [[ "$cur_mongo" == *"mongodb:"* && "$cur_mongo" != *"localhost"* ]]; then
            set_toml_var "$CONFIG_TOML" "mongo_uri" "mongodb://localhost:27017/pentestcopilot"
        fi
        if [[ "$cur_redis" == *"redis:"* && "$cur_redis" != *"localhost"* ]]; then
            set_toml_var "$CONFIG_TOML" "redis_url" "redis://localhost:6379"
        fi
    fi

    # Ensure CORS defaults to frontend URL
    local frontend_url cors_cur
    frontend_url=$(get_toml_var "$CONFIG_TOML" "base_url_frontend")
    frontend_url="${frontend_url:-http://localhost:3000}"
    cors_cur=$(get_toml_var "$CONFIG_TOML" "cors_origins")
    if [[ -z "$cors_cur" ]]; then
        set_toml_var "$CONFIG_TOML" "cors_origins" "$frontend_url"
    fi

    # Ensure session secret
    local secret
    secret=$(get_toml_var "$CONFIG_TOML" "secret")
    if [[ -z "$secret" || "$secret" == "thisismysessionsecret!123" ]]; then
        local generated
        generated=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '/+=' | head -c 64)
        set_toml_var "$CONFIG_TOML" "secret" "$generated"
        info "Generated session secret"
    fi

    # Ensure [tracing] section
    if ! grep -q "^\[tracing\]" "$CONFIG_TOML" 2>/dev/null; then
        echo "" >> "$CONFIG_TOML"
        echo "[tracing]" >> "$CONFIG_TOML"
        echo "enabled = \"false\"" >> "$CONFIG_TOML"
        echo "public_key = \"\"" >> "$CONFIG_TOML"
        echo "secret_key = \"\"" >> "$CONFIG_TOML"
        echo "base_url = \"https://cloud.langfuse.com\"" >> "$CONFIG_TOML"
    fi
}

seed_env_from_container() {
    [[ "${DEV_MODE:-false}" == true ]] && return
    [[ -s "${DYNAMIC_ENV:-}" ]] && return
    local container_id
    container_id=$(compose ps -q backend 2>/dev/null | head -1 || true)
    if [[ -n "$container_id" ]]; then
        docker cp "${container_id}:/srv/data/.env" "$DYNAMIC_ENV" 2>/dev/null && info "Loaded .env from container" || true
    fi
}

ensure_env_defaults() {
    if [[ ! -f "$DYNAMIC_ENV_TMPL" ]]; then
        err "Template not found: $DYNAMIC_ENV_TMPL"
        exit 1
    fi
    seed_env_from_container
    if [[ ! -s "$DYNAMIC_ENV" ]]; then
        cp "$DYNAMIC_ENV_TMPL" "$DYNAMIC_ENV"
        info "Created .env from template"
    fi
}

ensure_frontend_env() {
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
}

configure_dev_mode_choice() {
    DEV_MODE=true
    COMPOSE_FILE="docker-compose.dev.yml"
    DEPLOY_MODE="dev"
}

set_normal_mode() {
    DEV_MODE=false
    COMPOSE_FILE="docker-compose.yml"
    DEPLOY_MODE="core"
}

set_normal_kali_mode() {
    DEV_MODE=false
    COMPOSE_FILE="docker-compose.kali.yml"
    DEPLOY_MODE="kali"
}

select_mode_for_configuration() {
    section "Choose Configuration Target"
    echo
    echo -e "   ${BOLD}1)${NC} ${GREEN}Core Docker settings${NC}"
    echo -e "      ${DIM}Use this if Pentest Copilot runs through Docker without provisioning Kali.${NC}"
    echo
    echo -e "   ${BOLD}2)${NC} ${GREEN}Full Docker + Kali settings${NC}"
    echo -e "      ${DIM}Use this if you provision the built-in Kali container in Docker.${NC}"
    echo
    echo -e "   ${BOLD}3)${NC} ${YELLOW}Developer mode settings${NC}"
    echo -e "      ${DIM}Use this if you run the frontend and backend manually.${NC}"
    echo
    prompt_input "Choose [1/2/3]:"
    read -r mode_choice

    case "$mode_choice" in
        2) set_normal_kali_mode ;;
        3) configure_dev_mode_choice ;;
        *) set_normal_mode ;;
    esac
}

select_mode_for_operations() {
    section "Choose Which Environment To Manage"
    echo
    echo -e "   ${BOLD}1)${NC} ${GREEN}Core Docker mode${NC}"
    echo -e "      ${DIM}Manage containers started by the standard Docker setup.${NC}"
    echo
    echo -e "   ${BOLD}2)${NC} ${GREEN}Full Docker + Kali${NC}"
    echo -e "      ${DIM}Manage the full Docker stack, including the provisioned Kali container.${NC}"
    echo
    echo -e "   ${BOLD}3)${NC} ${YELLOW}Developer mode${NC}"
    echo -e "      ${DIM}Manage support containers used while developing locally.${NC}"
    echo
    prompt_input "Choose [1/2/3]:"
    read -r mode_choice

    case "$mode_choice" in
        2)
            set_normal_kali_mode
            ;;
        3)
            DEV_MODE=true
            COMPOSE_FILE="docker-compose.dev.yml"
            DEPLOY_MODE="dev"
            ;;
        *)
            set_normal_mode
            ;;
    esac
}

select_launch_mode() {
    section "Choose How To Run"
    echo
    echo -e "   ${BOLD}1)${NC} ${GREEN}Normal mode${NC}"
    echo -e "      ${DIM}Best for most people. Pentest Copilot starts the application for you${NC}"
    echo -e "      ${DIM}using Docker with guided questions for the required setup.${NC}"
    echo
    echo -e "   ${BOLD}2)${NC} ${YELLOW}Developer mode${NC}"
    echo -e "      ${DIM}Best for advanced users. Docker starts only the supporting services${NC}"
    echo -e "      ${DIM}(like MongoDB and Redis), and you run the frontend/backend manually.${NC}"
    echo
    prompt_input "Choose [1/2]:"
    read -r mode_choice

    case "$mode_choice" in
        2)
            configure_dev_mode_choice
            ;;
        *)
            set_normal_mode
            info "Selected normal mode"
            ;;
    esac
}

# ── Smart configuration (skip if already configured) ──────

is_model_configured() {
    local key
    key=$(get_env "$DYNAMIC_ENV" "MODEL_API_KEY")
    [[ -n "$key" ]]
}

is_google_configured() {
    local key cx
    key=$(get_env "$DYNAMIC_ENV" "GOOGLE-API-KEY")
    cx=$(get_env "$DYNAMIC_ENV" "CUSTOM-SEARCH-ENGINE-ID")
    [[ -n "$key" && -n "$cx" ]]
}

is_langfuse_configured() {
    local enabled
    enabled=$(get_toml_var "$CONFIG_TOML" "enabled")
    [[ "$enabled" == "true" ]]
}

is_exploit_box_configured() {
    local host
    host=$(get_env "$DYNAMIC_ENV" "SSH_HOST")
    [[ -n "$host" ]]
}

show_current_config_summary() {
    section "Current Configuration"
    echo

    # Model
    local provider model key
    provider=$(get_env "$DYNAMIC_ENV" "MODEL_PROVIDER")
    model=$(get_env "$DYNAMIC_ENV" "MODEL")
    key=$(get_env "$DYNAMIC_ENV" "MODEL_API_KEY")
    if [[ -n "$key" ]]; then
        echo -e "   ${GREEN}●${NC} Model: ${BOLD}${provider:-openai}${NC} / ${model:-gpt-4o}  (key: $(mask_key "$key"))"
    else
        echo -e "   ${RED}●${NC} Model: ${BOLD}not configured${NC}  ${YELLOW}← required${NC}"
    fi

    # Google
    local gkey gcx
    gkey=$(get_env "$DYNAMIC_ENV" "GOOGLE-API-KEY")
    gcx=$(get_env "$DYNAMIC_ENV" "CUSTOM-SEARCH-ENGINE-ID")
    if [[ -n "$gkey" && -n "$gcx" ]]; then
        echo -e "   ${GREEN}●${NC} Google Search: configured"
    else
        echo -e "   ${DIM}○${NC} Google Search: not set  ${DIM}(optional)${NC}"
    fi

    # Langfuse
    local langfuse_on
    langfuse_on=$(get_toml_var "$CONFIG_TOML" "enabled")
    if [[ "$langfuse_on" == "true" ]]; then
        echo -e "   ${GREEN}●${NC} Langfuse Tracing: enabled"
    else
        echo -e "   ${DIM}○${NC} Langfuse Tracing: disabled  ${DIM}(optional)${NC}"
    fi

    # Exploit box
    local ssh_host ssh_user
    ssh_host=$(get_env "$DYNAMIC_ENV" "SSH_HOST")
    ssh_user=$(get_env "$DYNAMIC_ENV" "SSH_USERNAME")
    if [[ -n "$ssh_host" ]]; then
        echo -e "   ${GREEN}●${NC} Exploit Box: ${ssh_user:-root}@${ssh_host}"
    else
        echo -e "   ${DIM}○${NC} Exploit Box: not set  ${DIM}(optional)${NC}"
    fi

    echo
}

configure_required_startup_smart() {
    ensure_env_defaults

    if is_model_configured; then
        show_current_config_summary
        if confirm "Keep current configuration and start?" "y"; then
            info "Using existing configuration"
            return
        fi
        echo
    fi

    # Model keys — always prompt if not configured
    if ! is_model_configured; then
        configure_model_keys
    else
        if confirm "Reconfigure model API keys?" "n"; then
            configure_model_keys
        else
            info "Keeping current model config"
        fi
    fi

    # Google search — optional, skip-friendly
    if ! is_google_configured; then
        echo
        hint "Google Search enables web search during pentesting. (optional, set up later via Settings UI)"
        if confirm "Configure Google Search API now?" "n"; then
            configure_google_search
        else
            info "Skipped — configure anytime via Settings UI or ./run.sh config"
        fi
    fi

    # Langfuse — optional, skip-friendly
    if ! is_langfuse_configured; then
        echo
        hint "Langfuse provides LLM call tracing & observability. (optional, requires restart to change)"
        if confirm "Configure Langfuse tracing now?" "n"; then
            configure_langfuse
        else
            info "Skipped — configure anytime via ./run.sh config (requires restart)"
        fi
    fi

    # Exploit box — essential, always prompt if not configured
    if ! is_exploit_box_configured; then
        echo
        configure_exploit_box
    fi
}

configure_static_full() {
    section "Static Configuration (Developer Mode)"
    hint "These settings require a process restart to take effect."
    ensure_config_defaults
    ensure_frontend_env

    local cur val frontend_url default_mongo default_redis generated_secret frontend_backend_uri frontend_deployment

    section "Server Settings"
    cur=$(get_toml_var "$CONFIG_TOML" "base_url_frontend")
    prompt_input "Frontend URL [${cur:-http://localhost:3000}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_toml_var "$CONFIG_TOML" "base_url_frontend" "$val"
        frontend_url="$val"
    else
        frontend_url="${cur:-http://localhost:3000}"
    fi

    cur=$(get_toml_var "$CONFIG_TOML" "port")
    prompt_input "Backend port [${cur:-8080}]:"
    read -r val
    [[ -n "$val" ]] && set_toml_var "$CONFIG_TOML" "port" "$val"

    cur=$(get_toml_var "$CONFIG_TOML" "deployment")
    prompt_input "Deployment [LOCAL/PROD] [${cur:-LOCAL}]:"
    read -r val
    [[ -n "$val" ]] && set_toml_var "$CONFIG_TOML" "deployment" "$val"

    frontend_backend_uri=$(get_env "$FRONTEND_ENV" "NEXT_PUBLIC_BACKEND_URI")
    prompt_input "Backend URL for the frontend [${frontend_backend_uri:-http://localhost:8080}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_env_var "$FRONTEND_ENV" "NEXT_PUBLIC_BACKEND_URI" "$val"
    elif [[ -z "$frontend_backend_uri" ]]; then
        set_env_var "$FRONTEND_ENV" "NEXT_PUBLIC_BACKEND_URI" "http://localhost:8080"
    fi

    frontend_deployment=$(get_env "$FRONTEND_ENV" "NEXT_PUBLIC_DEPLOYMENT")
    prompt_input "Frontend deployment mode [LOCAL/PRODUCTION] [${frontend_deployment:-LOCAL}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_env_var "$FRONTEND_ENV" "NEXT_PUBLIC_DEPLOYMENT" "$val"
    elif [[ -z "$frontend_deployment" ]]; then
        set_env_var "$FRONTEND_ENV" "NEXT_PUBLIC_DEPLOYMENT" "LOCAL"
    fi

    cur=$(get_toml_var "$CONFIG_TOML" "cors_origins")
    prompt_input "CORS origins [${frontend_url}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_toml_var "$CONFIG_TOML" "cors_origins" "$val"
    else
        set_toml_var "$CONFIG_TOML" "cors_origins" "$frontend_url"
    fi

    section "Database"
    hint "One-time setup. Change only if using external MongoDB/Redis."
    default_mongo="mongodb://localhost:27017/pentestcopilot"
    default_redis="redis://localhost:6379"

    cur=$(get_toml_var "$CONFIG_TOML" "mongo_uri")
    prompt_input "MongoDB URI [${cur:-$default_mongo}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_toml_var "$CONFIG_TOML" "mongo_uri" "$val"
    elif [[ -z "$cur" ]]; then
        set_toml_var "$CONFIG_TOML" "mongo_uri" "$default_mongo"
    fi

    cur=$(get_toml_var "$CONFIG_TOML" "mongo_database")
    prompt_input "MongoDB database [${cur:-pentestcopilot}]:"
    read -r val
    [[ -n "$val" ]] && set_toml_var "$CONFIG_TOML" "mongo_database" "$val"

    cur=$(get_toml_var "$CONFIG_TOML" "redis_url")
    prompt_input "Redis URL [${cur:-$default_redis}]:"
    read -r val
    if [[ -n "$val" ]]; then
        set_toml_var "$CONFIG_TOML" "redis_url" "$val"
    elif [[ -z "$cur" ]]; then
        set_toml_var "$CONFIG_TOML" "redis_url" "$default_redis"
    fi

    info "Developer-mode static config updated"
}

# ── Config options ─────────────────────────────────────────
configure_model_keys() {
    section "Model API Keys"
    hint "You can change this anytime via the Settings UI (no restart needed)."
    ensure_env_defaults
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
        echo -e "   ${BOLD}1)${NC} API Key   ${BOLD}2)${NC} Connect Claude Account (OAuth)"
        prompt_input "Choose [1/2]:"
        read -r auth_choice
        if [[ "$auth_choice" == "2" ]]; then
            configure_claude_oauth
        else
            prompt_input "API key:"
            read -r val
            [[ -n "$val" ]] && set_env_var "$DYNAMIC_ENV" "MODEL_API_KEY" "$val"
        fi
    else
        prompt_input "API key:"
        read -r val
        [[ -n "$val" ]] && set_env_var "$DYNAMIC_ENV" "MODEL_API_KEY" "$val"
    fi

    prompt_input "Base URL override (Enter to skip):"
    read -r val
    [[ -n "$val" ]] && set_env_var "$DYNAMIC_ENV" "MODEL_BASE_PATH" "$val"
    info "Model API keys saved"
}

configure_google_search() {
    section "Google Search"
    hint "Optional. You can set this up later via the Settings UI."
    ensure_env_defaults
    local cur_key cur_cx key_status

    echo
    echo -e "   ${DIM}Required only if you want the Google search tool to work.${NC}"
    echo -e "   ${DIM}You need both a Google API key and a Custom Search Engine ID.${NC}"

    cur_key=$(get_env "$DYNAMIC_ENV" "GOOGLE-API-KEY")
    if [[ -n "$cur_key" ]]; then
        key_status="configured ($(mask_key "$cur_key"))"
    else
        key_status="not set"
    fi
    prompt_input "Google API key [${key_status}]:"
    read -rs val; echo
    [[ -n "$val" ]] && set_env_var "$DYNAMIC_ENV" "GOOGLE-API-KEY" "$val"

    cur_cx=$(get_env "$DYNAMIC_ENV" "CUSTOM-SEARCH-ENGINE-ID")
    prompt_input "Custom Search Engine ID [${cur_cx:-not set}]:"
    read -r val
    [[ -n "$val" ]] && set_env_var "$DYNAMIC_ENV" "CUSTOM-SEARCH-ENGINE-ID" "$val"

    info "Google search settings saved"
}

configure_claude_oauth() {
    section "Claude OAuth (PKCE)"
    if ! command -v openssl &>/dev/null; then
        err "openssl is required for OAuth PKCE."
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
    local auth_params="code=true&client_id=${client_id}&response_type=code"
    auth_params+="&redirect_uri=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${redirect_uri}', safe=''))" 2>/dev/null || echo "${redirect_uri}")"
    auth_params+="&scope=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${scopes}', safe=''))" 2>/dev/null || echo "${scopes// /+}")"
    auth_params+="&code_challenge=${code_challenge}&code_challenge_method=S256&state=${state}"
    echo
    info "Open this URL to authorize Claude:"
    echo -e "   ${CYAN}${auth_url}?${auth_params}${NC}"
    echo
    prompt_input "Paste the authorization code:"
    read -r auth_code
    auth_code="${auth_code%%#*}"
    if [[ -z "$auth_code" ]]; then
        err "No authorization code provided"
        return 1
    fi
    local token_response
    token_response=$(curl -s -X POST "$token_url" -H "Content-Type: application/x-www-form-urlencoded" \
        -d "code=${auth_code}" -d "state=${state}" -d "grant_type=authorization_code" \
        -d "client_id=${client_id}" -d "redirect_uri=${redirect_uri}" -d "code_verifier=${code_verifier}")
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
        err "python3 or jq required to parse token response."
        return 1
    fi
    if [[ -z "$access_token" ]]; then
        err "Failed to get access token"
        return 1
    fi
    local expires_at=$(( $(date +%s) + ${expires_in:-3600} ))
    set_env_var "$DYNAMIC_ENV" "ANTHROPIC_OAUTH_ACCESS_TOKEN"  "$access_token"
    set_env_var "$DYNAMIC_ENV" "ANTHROPIC_OAUTH_REFRESH_TOKEN" "$refresh_token"
    set_env_var "$DYNAMIC_ENV" "ANTHROPIC_OAUTH_EXPIRES_AT"    "$expires_at"
    set_env_var "$DYNAMIC_ENV" "MODEL_API_KEY" ""
    info "Claude account connected via OAuth"
}

configure_langfuse() {
    section "Langfuse Tracing"
    hint "Requires a container restart to take effect. Change via ./run.sh config."
    ensure_config_defaults
    echo
    echo -e "   ${DIM}Langfuse provides LLM observability. Get keys at https://cloud.langfuse.com${NC}"
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
}

configure_exploit_box() {
    section "Exploit Box Connection"
    hint "The exploit box is the SSH target where pentesting commands run. You can change this later via Settings UI."
    ensure_env_defaults
    echo
    echo -e "   ${BOLD}1)${NC} Kali VM exploit box spin up"
    echo -e "   ${BOLD}2)${NC} Connect to external exploit box (any VM via SSH, including your local computer)"
    echo -e "   ${BOLD}3)${NC} ${RED}No exploit box${NC}  ${RED}(reduces Pentest Copilot functionality significantly)${NC}"
    prompt_input "Choose [1/2/3]:"
    read -r ssh_choice

    case "$ssh_choice" in
        1)
            configure_docker_kali
            ;;
        2)
            configure_connect_external_exploit_box
            ;;
        3)
            echo
            warn "No exploit box selected — Pentest Copilot will have reduced functionality (no terminal, shells, or command execution on a target)."
            clear_exploit_box_config
            ;;
        *)
            warn "Invalid choice. Select 1, 2, or 3."
            configure_exploit_box
            ;;
    esac
}

clear_exploit_box_config() {
    if [[ "${DEV_MODE:-false}" == true ]]; then
        DEPLOY_MODE="dev"
    else
        set_normal_mode
    fi
    set_env_var "$DYNAMIC_ENV" "SSH_HOST" ""
    set_env_var "$DYNAMIC_ENV" "SSH_PORT" "22"
    set_env_var "$DYNAMIC_ENV" "SSH_USERNAME" ""
    set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD" ""
    set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY" ""
    set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""
}

configure_connect_external_exploit_box() {
    local default_host default_port default_user cur_host cur_port cur_user
    if [[ "${DEV_MODE:-false}" == true ]]; then
        DEPLOY_MODE="dev"
        default_host="localhost"
    else
        set_normal_mode
        default_host="host.docker.internal"
    fi
    default_port="22"
    default_user="$(id -un 2>/dev/null || whoami 2>/dev/null || echo "root")"

    cur_host=$(get_env "$DYNAMIC_ENV" "SSH_HOST")
    cur_port=$(get_env "$DYNAMIC_ENV" "SSH_PORT")
    cur_user=$(get_env "$DYNAMIC_ENV" "SSH_USERNAME")
    if [[ -n "$cur_host" ]]; then
        case "$cur_host" in
            localhost|host.docker.internal|kali) ;;
            *) default_host="$cur_host"; default_port="${cur_port:-22}"; default_user="${cur_user:-$default_user}" ;;
        esac
    fi

    echo
    hint "Enter host (use ${default_host} for your local machine, or any VM IP/hostname for remote)"
    configure_external_ssh "$default_host" "$default_port" "$default_user"
}

configure_docker_kali() {
    if [[ "${DEV_MODE:-false}" == true ]]; then
        DEPLOY_MODE="dev-kali"
        info "Provisioning Kali in Docker for developer mode"
        set_env_var "$DYNAMIC_ENV" "SSH_HOST" "localhost"
        set_env_var "$DYNAMIC_ENV" "SSH_PORT" "4242"
    else
        set_normal_kali_mode
        info "Provisioning Kali in the full Docker stack"
        set_env_var "$DYNAMIC_ENV" "SSH_HOST" "kali"
        set_env_var "$DYNAMIC_ENV" "SSH_PORT" "22"
    fi
    set_env_var "$DYNAMIC_ENV" "SSH_USERNAME" "root"
    set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD" ""
    set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY" ""
    set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""
    info "Exploit box configured"
}

configure_external_ssh() {
    local default_host="${1:-}"
    local default_port="${2:-22}"
    local default_user="${3:-root}"
    local ssh_host=""

    echo
    if [[ -n "$default_host" ]]; then
        prompt_input "Exploit box host [${default_host}]:"
        read -r ssh_host
        ssh_host="${ssh_host:-$default_host}"
    else
        while [[ -z "$ssh_host" ]]; do
            prompt_input "Exploit box host:"
            read -r ssh_host
            [[ -z "$ssh_host" ]] && warn "Host is required"
        done
    fi

    prompt_input "SSH Port [${default_port}]:"
    read -r ssh_port
    ssh_port="${ssh_port:-$default_port}"
    prompt_input "SSH Username [${default_user}]:"
    read -r ssh_user
    ssh_user="${ssh_user:-$default_user}"
    set_env_var "$DYNAMIC_ENV" "SSH_HOST" "$ssh_host"
    set_env_var "$DYNAMIC_ENV" "SSH_PORT" "$ssh_port"
    set_env_var "$DYNAMIC_ENV" "SSH_USERNAME" "$ssh_user"
    echo
    echo -e "   ${BOLD}1)${NC} Password   ${BOLD}2)${NC} Private key"
    prompt_input "Auth [1/2]:"
    read -r auth
    case "$auth" in
        2)
            prompt_input "Path to private key:"
            read -r key_path
            [[ ! -f "$key_path" ]] && { err "File not found: $key_path"; exit 1; }
            if [[ "${DEV_MODE:-false}" == true ]]; then
                local resolved_path="$(cd "$(dirname "$key_path")" && pwd)/$(basename "$key_path")"
                set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD" ""
                set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY" "$resolved_path"
                set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""
            else
                mkdir -p "$SSH_KEYS_DIR"
                local key_name="$(basename "$key_path")"
                cp "$key_path" "$SSH_KEYS_DIR/$key_name"
                chmod 600 "$SSH_KEYS_DIR/$key_name"
                set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD" ""
                set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY" "/ssh-keys/$key_name"
                prompt_input "Passphrase (Enter if none):"
                read -rs passphrase; echo
                set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" "$passphrase"
                NEED_SSH_KEY_MOUNT=true
            fi
            ;;
        *)
            prompt_input "SSH Password:"
            read -rs ssh_pass; echo
            set_env_var "$DYNAMIC_ENV" "SSH_PASSWORD" "$ssh_pass"
            set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY" ""
            set_env_var "$DYNAMIC_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""
            ;;
    esac
    info "Exploit box configured"
}

# ── Compose wrapper ───────────────────────────────────────
compose() {
    local args=()
    [[ -n "${COMPOSE_FILE:-}" ]] && args+=(-f "$COMPOSE_FILE")
    [[ -f "$COMPOSE_OVERRIDE" ]] && args+=(-f "$COMPOSE_OVERRIDE")
    $COMPOSE_CMD "${args[@]}" "$@"
}

ensure_compose_override() {
    local needs_key_mount=false
    local needs_host_gateway=false
    local ssh_host=""

    if [[ "$NEED_SSH_KEY_MOUNT" == true ]] || \
       { [[ -d "$SSH_KEYS_DIR" ]] && [[ -n "$(ls -A "$SSH_KEYS_DIR" 2>/dev/null)" ]]; }; then
        needs_key_mount=true
    fi

    if [[ -n "${DYNAMIC_ENV:-}" ]] && [[ -f "${DYNAMIC_ENV:-}" ]]; then
        ssh_host=$(get_env "$DYNAMIC_ENV" "SSH_HOST")
    fi
    if [[ "${DEV_MODE:-false}" != true ]] && [[ "$ssh_host" == "host.docker.internal" ]]; then
        needs_host_gateway=true
    fi

    if [[ "$needs_key_mount" == true || "$needs_host_gateway" == true ]]; then
        {
            echo "services:"
            echo "  backend:"
            if [[ "$needs_key_mount" == true ]]; then
                echo "    volumes:"
                echo "      - ./ssh-keys:/ssh-keys:ro"
            fi
            if [[ "$needs_host_gateway" == true ]]; then
                echo "    extra_hosts:"
                echo "      - \"host.docker.internal:host-gateway\""
            fi
        } > "$COMPOSE_OVERRIDE"
    else
        rm -f "$COMPOSE_OVERRIDE"
    fi
}

provision_data_volume() {
    [[ "${DEV_MODE:-false}" == true ]] && return
    local container_id
    container_id=$(compose ps -q backend 2>/dev/null | head -1)
    [[ -z "$container_id" ]] && return
    if [[ -s "$DYNAMIC_ENV" ]]; then
        docker cp "$DYNAMIC_ENV" "${container_id}:/srv/data/.env"
        info "Provisioned .env → container"
        rm -f "$DYNAMIC_ENV" 2>/dev/null
    fi
}

# ── Launch (Docker mode) ──────────────────────────────────
launch() {
    local build_flag="${1:-}"

    if [[ -z "${COMPOSE_FILE:-}" ]]; then
        set_normal_mode
    fi

    if [[ "${DEV_MODE:-false}" == true ]]; then
        launch_dev "$build_flag"
        return
    fi

    section "Launching Pentest Copilot"

    ensure_compose_override
    info "Compose file: $COMPOSE_FILE"

    if [[ "$build_flag" == "--build" ]]; then
        warn "Building images — may take a while on first run..."
    fi

    echo
    compose up ${build_flag} -d
    echo

    provision_data_volume

    section "Pentest Copilot is Running"
    echo
    local frontend_url backend_url
    frontend_url=$(get_toml_var "$CONFIG_TOML" "base_url_frontend" 2>/dev/null)
    backend_url=$(get_env "$FRONTEND_ENV" "NEXT_PUBLIC_BACKEND_URI")
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
    fi

    echo
    hint "Config files: config.toml (restart-required) | .env (hot-reloadable via Settings UI)"
    hint "Additional features (Burp, Browser Agent, VNC) can be configured in the Settings UI."
    echo
    info "Commands: $0 stop | $0 logs | $0 status | $0 config"
}

# ── Launch dev mode ───────────────────────────────────────
launch_dev() {
    local build_flag="${1:-}"

    section "Launching Developer Mode"

    check_pnpm

    info "Installing dependencies (backend + frontend)..."
    (cd "$SCRIPT_DIR/backend" && pnpm install)
    (cd "$SCRIPT_DIR/frontend" && pnpm install)
    info "Dependencies installed"

    local dev_services="mongodb redis"
    [[ "${DEPLOY_MODE:-}" == "dev-kali" ]] && dev_services="mongodb redis kali"

    info "Starting infrastructure: ${BOLD}${dev_services}${NC}"
    echo
    compose up ${build_flag} -d ${dev_services}
    echo

    section "Developer Mode — Infrastructure Running"
    echo
    echo -e "   ${GREEN}MongoDB${NC}    localhost:27017"
    echo -e "   ${GREEN}Redis${NC}      localhost:6379"
    [[ "${DEPLOY_MODE:-}" == "dev-kali" ]] && echo -e "   ${GREEN}Kali SSH${NC}   ssh root@localhost -p 4242"

    echo
    section "Start Frontend & Backend Manually"
    echo
    echo -e "   ${CYAN}Backend${NC} (two terminals):"
    echo -e "     ${DIM}cd backend && pnpm run watch${NC}   ${DIM}# Terminal 1${NC}"
    echo -e "     ${DIM}cd backend && pnpm run dev${NC}      ${DIM}# Terminal 2${NC}"
    echo
    echo -e "   ${CYAN}Frontend:${NC}"
    echo -e "     ${DIM}cd frontend && pnpm run dev${NC}"
    echo
    local frontend_url backend_url
    frontend_url=$(get_toml_var "$CONFIG_TOML" "base_url_frontend" 2>/dev/null)
    backend_url=$(get_env "$FRONTEND_ENV" "NEXT_PUBLIC_BACKEND_URI")
    echo -e "   ${CYAN}Endpoints:${NC} Frontend ${frontend_url:-http://localhost:3000} | Backend ${backend_url:-http://localhost:8080}"
    echo
    hint "Config files: config.toml (restart-required) | backend/.env (hot-reloadable)"
    hint "Additional features (Burp, Browser Agent, VNC) can be configured in the Settings UI."
    echo
}

# ── Commands ───────────────────────────────────────────────
cmd_start() {
    check_prerequisites
    detect_wsl

    if [[ "$QUICK_MODE" == true ]]; then
        set_normal_mode
    else
        select_launch_mode
    fi

    resolve_env_path
    ensure_config_defaults
    ensure_env_defaults
    ensure_frontend_env

    if [[ "$QUICK_MODE" == true ]]; then
        if is_model_configured; then
            show_current_config_summary
            info "Quick start — using existing configuration"
        else
            warn "No model API key configured — you must set this before using the agent."
            hint "Configure via the Settings UI after starting, or re-run without -q."
        fi
    elif [[ "${DEV_MODE:-false}" == true ]]; then
        configure_static_full
        configure_required_startup_smart
    else
        configure_required_startup_smart
    fi

    if [[ -d "$SSH_KEYS_DIR" ]] && [[ -n "$(ls -A "$SSH_KEYS_DIR" 2>/dev/null)" ]]; then
        NEED_SSH_KEY_MOUNT=true
    fi

    launch
}

cmd_config() {
    check_prerequisites
    detect_wsl
    select_mode_for_configuration

    resolve_env_path
    ensure_config_defaults
    ensure_env_defaults
    ensure_frontend_env

    section "Configuration"
    echo
    echo -e "   ${BOLD}1)${NC} Model API keys           ${DIM}(changeable at runtime via Settings UI)${NC}"
    echo -e "   ${BOLD}2)${NC} Google search             ${DIM}(changeable at runtime via Settings UI)${NC}"
    echo -e "   ${BOLD}3)${NC} Langfuse tracing          ${DIM}(requires container restart)${NC}"
    echo -e "   ${BOLD}4)${NC} Exploit box               ${DIM}(changeable at runtime via Settings UI)${NC}"
    echo -e "   ${BOLD}5)${NC} All of the above"
    if [[ "${DEV_MODE:-false}" == true ]]; then
        echo -e "   ${BOLD}6)${NC} Server / Database / CORS  ${DIM}(requires process restart)${NC}"
    fi
    echo
    prompt_input "Choose [1-${DEV_MODE:+6}${DEV_MODE:-5}]:"
    read -r choice

    case "$choice" in
        1) configure_model_keys ;;
        2) configure_google_search ;;
        3) configure_langfuse ;;
        4) configure_exploit_box ;;
        5)
            configure_model_keys
            configure_google_search
            configure_langfuse
            configure_exploit_box
            ;;
        6)
            if [[ "${DEV_MODE:-false}" == true ]]; then
                configure_static_full
            else
                warn "No configuration changed"
            fi
            ;;
        *)
            warn "No configuration changed"
            ;;
    esac

    echo
    if [[ "${DEV_MODE:-false}" != true ]]; then
        if confirm "Restart containers to apply changes?" "y"; then
            ensure_compose_override
            compose restart
            provision_data_volume
            info "Containers restarted"
        else
            hint "Runtime-editable settings (Model, Google, SSH) take effect without restart."
            hint "Langfuse & server settings require a restart: ./run.sh stop && ./run.sh start"
        fi
    else
        info "Config saved."
        hint "Runtime-editable settings take effect immediately. Restart backend for static config changes."
    fi
}

cmd_dev() {
    check_prerequisites
    detect_wsl

    configure_dev_mode_choice

    resolve_env_path
    ensure_config_defaults
    ensure_env_defaults
    ensure_frontend_env

    if [[ "$QUICK_MODE" == true ]]; then
        if is_model_configured; then
            show_current_config_summary
            info "Quick start — using existing configuration"
        else
            warn "No model API key configured — you must set this before using the agent."
            hint "Configure via the Settings UI after starting, or re-run without -q."
        fi
    else
        configure_static_full
        configure_required_startup_smart
    fi

    if [[ -d "$SSH_KEYS_DIR" ]] && [[ -n "$(ls -A "$SSH_KEYS_DIR" 2>/dev/null)" ]]; then
        NEED_SSH_KEY_MOUNT=true
    fi

    launch
}

cmd_stop() {
    check_prerequisites
    select_mode_for_operations
    section "Stopping Pentest Copilot"
    compose down
    info "All containers stopped"
}

cmd_logs() {
    check_prerequisites
    select_mode_for_operations
    compose logs -f "${@}"
}

cmd_status() {
    check_prerequisites
    select_mode_for_operations
    compose ps
}

cmd_help() {
    print_banner
    echo "Usage: $0 [command] [flags]"
    echo
    show_commands
    echo -e " ${BOLD}Flags:${NC}"
    echo -e "   ${CYAN}--quick, -q${NC}   Skip all configuration prompts and use existing config."
    echo -e "                Ideal for subsequent starts after initial setup."
    echo
    echo "Default behavior:"
    echo "  - \`$0\` / \`$0 start\`: guided start with smart prompts (skips already-configured items)"
    echo "  - \`$0 start -q\`: instant start using existing config (no prompts at all)"
    echo "  - Normal mode: guided setup, best for most users"
    echo "  - Developer mode: advanced setup, run frontend/backend manually"
    echo
    echo -e " ${BOLD}Configuration Layers:${NC}"
    echo -e "   ${CYAN}config.toml${NC}    Static settings (server, DB, session, Langfuse)."
    echo -e "                  Changes require a restart."
    echo -e "   ${CYAN}backend/.env${NC}   Dynamic settings (model, SSH, VNC, Burp, Magnitude)."
    echo -e "                  Changes take effect immediately (editable via Settings UI)."
    echo -e "   ${CYAN}frontend/.env${NC}  Frontend build settings (NEXT_PUBLIC_*)."
    echo -e "                  Changes require a frontend rebuild."
    echo
}

# ── Main ──────────────────────────────────────────────────
main() {
    cd "$SCRIPT_DIR"

    # Parse global flags
    local args=()
    for arg in "$@"; do
        case "$arg" in
            --quick|-q) QUICK_MODE=true ;;
            *) args+=("$arg") ;;
        esac
    done
    set -- "${args[@]+"${args[@]}"}"

    print_banner
    show_commands

    case "${1:-start}" in
        start)   cmd_start ;;
        config)  cmd_config ;;
        dev)     cmd_dev ;;
        stop)    cmd_stop ;;
        logs)    shift; cmd_logs "$@" ;;
        status)  cmd_status ;;
        -h|--help|help) cmd_help; return ;;
        *)
            err "Unknown command: $1"
            echo "Run $0 help for usage."
            exit 1
            ;;
    esac
}

main "$@"
