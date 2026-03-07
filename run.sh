#!/bin/bash
# ============================================================
#  Pentest Copilot — All-in-one launcher
#  Configures, builds, and runs the entire stack.
#  Re-run at any time to start, reconfigure, or manage.
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
BACKEND_ENV="$SCRIPT_DIR/backend/.env"
BACKEND_TMPL="$SCRIPT_DIR/backend/.env.template"
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

set_env_var() {
    local file="$1" var="$2" val="$3"
    local tmp="${file}.tmp.$$"
    if grep -q "^${var}=" "$file" 2>/dev/null; then
        grep -v "^${var}=" "$file" > "$tmp"
        mv "$tmp" "$file"
    fi
    echo "${var}=${val}" >> "$file"
}

get_env_var() {
    grep "^${1##*/}" "$1" 2>/dev/null | head -1 | cut -d'=' -f2-
    :
}
# Overloaded: get_env_var FILE VAR
get_env() {
    local file="$1" var="$2"
    grep "^${var}=" "$file" 2>/dev/null | head -1 | cut -d'=' -f2- || true
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
    [[ -f "$BACKEND_ENV" || -f "$FRONTEND_ENV" ]]
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

    if [[ -f "$BACKEND_ENV" ]]; then
        local ml ms kl ks sh sp su
        ml=$(get_env "$BACKEND_ENV" "MODEL_LARGE")
        ms=$(get_env "$BACKEND_ENV" "MODEL_SMALL")
        kl=$(get_env "$BACKEND_ENV" "MODEL_API_KEY_LARGE")
        ks=$(get_env "$BACKEND_ENV" "MODEL_API_KEY_SMALL")
        sh=$(get_env "$BACKEND_ENV" "SSH_HOST")
        sp=$(get_env "$BACKEND_ENV" "SSH_PORT")
        su=$(get_env "$BACKEND_ENV" "SSH_USERNAME")

        echo -e "   Large Model : ${BOLD}${ml:-not set}${NC}  (key: $(mask_key "$kl"))"
        echo -e "   Small Model : ${BOLD}${ms:-not set}${NC}  (key: $(mask_key "$ks"))"
        echo -e "   SSH Target  : ${BOLD}${su:-?}@${sh:-?}:${sp:-?}${NC}"
    else
        warn "No backend .env found"
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

# ── Backend .env configuration ────────────────────────────
configure_backend() {
    section "Backend Environment"

    if [[ ! -f "$BACKEND_TMPL" ]]; then
        err "Template not found: $BACKEND_TMPL"
        exit 1
    fi

    # Start from template only if no .env exists yet
    if [[ ! -f "$BACKEND_ENV" ]]; then
        cp "$BACKEND_TMPL" "$BACKEND_ENV"
        info "Created backend/.env from template"
    fi

    if [[ "$IS_WSL" == true ]]; then
        sed -i 's/127\.0\.0\.1/localhost/g' "$BACKEND_ENV"
    fi

    # ── Large model ──────────────────────────────────
    section "Large Model  (reasoning, complex analysis)"
    local cur
    cur=$(get_env "$BACKEND_ENV" "MODEL_LARGE")
    prompt_input "Model name [${cur:-gpt-4-1106-preview}]:"
    read -r val
    [[ -n "$val" ]] && set_env_var "$BACKEND_ENV" "MODEL_LARGE" "$val"

    prompt_input "API key (Enter to keep existing):"
    read -r val
    [[ -n "$val" ]] && set_env_var "$BACKEND_ENV" "MODEL_API_KEY_LARGE" "$val"

    prompt_input "Base URL override (Enter to skip):"
    read -r val
    [[ -n "$val" ]] && set_env_var "$BACKEND_ENV" "MODEL_BASE_PATH_LARGE" "$val"

    # ── Small model ──────────────────────────────────
    section "Small Model  (summarization, quick tasks)"
    cur=$(get_env "$BACKEND_ENV" "MODEL_SMALL")
    prompt_input "Model name [${cur:-gpt-3.5-turbo-1106}]:"
    read -r val
    [[ -n "$val" ]] && set_env_var "$BACKEND_ENV" "MODEL_SMALL" "$val"

    prompt_input "API key (Enter to keep existing):"
    read -r val
    [[ -n "$val" ]] && set_env_var "$BACKEND_ENV" "MODEL_API_KEY_SMALL" "$val"

    prompt_input "Base URL override (Enter to skip):"
    read -r val
    [[ -n "$val" ]] && set_env_var "$BACKEND_ENV" "MODEL_BASE_PATH_SMALL" "$val"

    info "Model configuration saved"
}

# ── SSH / exploit-box configuration ───────────────────────
configure_ssh() {
    section "SSH / Exploit Box"

    # ── Kali container (Docker mode): use well-known defaults ──────
    if [[ "$DEPLOY_MODE" == "kali" ]]; then
        info "Using built-in Kali container defaults (root@kali:22, no password)"
        set_env_var "$BACKEND_ENV" "SSH_HOST"                   "kali"
        set_env_var "$BACKEND_ENV" "SSH_PORT"                   "22"
        set_env_var "$BACKEND_ENV" "SSH_USERNAME"               "root"
        set_env_var "$BACKEND_ENV" "SSH_PASSWORD"               ""
        set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY"            ""
        set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""

        if confirm "Do you also want to configure SSH to an external box instead?"; then
            configure_external_ssh
        fi
        return
    fi

    # ── Dev mode with Kali container: backend runs on host, Kali in Docker ──
    if [[ "$DEPLOY_MODE" == "dev-kali" ]]; then
        info "Using Kali container via localhost:4242 (backend runs on host)"
        set_env_var "$BACKEND_ENV" "SSH_HOST"                   "localhost"
        set_env_var "$BACKEND_ENV" "SSH_PORT"                   "4242"
        set_env_var "$BACKEND_ENV" "SSH_USERNAME"               "root"
        set_env_var "$BACKEND_ENV" "SSH_PASSWORD"               ""
        set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY"            ""
        set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""

        if confirm "Do you also want to configure SSH to an external box instead?"; then
            configure_external_ssh
        fi
        return
    fi

    # ── Dev mode without Kali or Core mode: optional external exploit box ──
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
            set_env_var "$BACKEND_ENV" "SSH_HOST"                   ""
            set_env_var "$BACKEND_ENV" "SSH_PORT"                   "22"
            set_env_var "$BACKEND_ENV" "SSH_USERNAME"               ""
            set_env_var "$BACKEND_ENV" "SSH_PASSWORD"               ""
            set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY"            ""
            set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""
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

    set_env_var "$BACKEND_ENV" "SSH_HOST"     "$ssh_host"
    set_env_var "$BACKEND_ENV" "SSH_PORT"     "$ssh_port"
    set_env_var "$BACKEND_ENV" "SSH_USERNAME" "$ssh_user"

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
                # Dev mode: backend runs on host, use the key path directly
                local resolved_path
                resolved_path="$(cd "$(dirname "$key_path")" && pwd)/$(basename "$key_path")"

                set_env_var "$BACKEND_ENV" "SSH_PASSWORD"               ""
                set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY"            "$resolved_path"
                set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""

                prompt_input "Passphrase for this key (Enter if none):"
                read -rs passphrase; echo
                [[ -n "$passphrase" ]] && set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" "$passphrase"

                info "Private key auth configured (host path: $resolved_path)"
            else
                # Docker mode: copy key into ssh-keys/ and use container mount path
                mkdir -p "$SSH_KEYS_DIR"
                local key_name
                key_name="$(basename "$key_path")"
                cp "$key_path" "$SSH_KEYS_DIR/$key_name"
                chmod 600 "$SSH_KEYS_DIR/$key_name"
                info "Copied key → ssh-keys/$key_name"

                local container_path="/ssh-keys/$key_name"

                prompt_input "Passphrase for this key (Enter if none):"
                read -rs passphrase; echo

                set_env_var "$BACKEND_ENV" "SSH_PASSWORD"               ""
                set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY"            "$container_path"
                set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" "$passphrase"
                NEED_SSH_KEY_MOUNT=true

                info "Private key auth configured"
                warn "The key will be mounted at ${BOLD}$container_path${NC} inside the backend container"
            fi
            ;;
        *)
            prompt_input "SSH Password:"
            read -rs ssh_pass; echo

            set_env_var "$BACKEND_ENV" "SSH_PASSWORD"               "$ssh_pass"
            set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY"            ""
            set_env_var "$BACKEND_ENV" "SSH_PRIVATE_KEY_PASSPHRASE" ""

            info "Password auth configured"
            ;;
    esac
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

    if confirm "Configure Google Tag Manager?"; then
        prompt_input "GTM ID (e.g. GTM-XXXXXXX):"
        read -r gtm_id
        [[ -n "$gtm_id" ]] && set_env_var "$FRONTEND_ENV" "NEXT_PUBLIC_GTM_ID" "$gtm_id"
    else
        info "Skipping GTM"
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

    section "Pentest Copilot is Running"
    echo
    echo -e "   ${GREEN}Frontend${NC}   http://localhost:3000"
    echo -e "   ${GREEN}Backend${NC}    http://localhost:8080"
    echo -e "   ${GREEN}MongoDB${NC}    localhost:27017"
    echo -e "   ${GREEN}Redis${NC}      localhost:6379"

    if [[ "${DEPLOY_MODE:-}" == "kali" ]]; then
        echo
        echo -e "   ${GREEN}Kali SSH${NC}   ssh root@localhost -p 4242"
        echo -e "   ${GREEN}Kali noVNC${NC} http://localhost:4200"
        echo -e "   ${GREEN}Kali VPN${NC}   localhost:1194/udp"
    fi

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

    local dev_services="mongodb redis"
    if [[ "${DEPLOY_MODE:-}" == "dev-kali" ]]; then
        dev_services="mongodb redis kali"
    fi

    info "Starting infrastructure: ${BOLD}${dev_services}${NC}"
    echo
    compose up ${build_flag} -d ${dev_services}
    echo

    section "Configuring Backend for Local Development"
    local mongo_db
    mongo_db=$(get_env "$BACKEND_ENV" "MONGO_DATABASE" 2>/dev/null || echo "pentestcopilot")
    if [[ ! -f "$BACKEND_ENV" ]]; then
        [[ -f "$BACKEND_TMPL" ]] && cp "$BACKEND_TMPL" "$BACKEND_ENV"
    fi
    set_env_var "$BACKEND_ENV" "MONGO_URI" "mongodb://localhost:27017/${mongo_db}"
    set_env_var "$BACKEND_ENV" "REDIS_URL" "redis://localhost:6379"
    info "Set MONGO_URI and REDIS_URL to localhost (backend runs outside Docker)"
    echo

    section "Installing Dependencies"
    info "Installing backend dependencies..."
    (cd "$SCRIPT_DIR/backend" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
    info "Installing frontend dependencies..."
    (cd "$SCRIPT_DIR/frontend" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
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
    section "Start Frontend & Backend Manually"
    echo
    echo -e "   ${CYAN}Backend:${NC}"
    echo -e "     ${DIM}cd backend${NC}"
    echo -e "     ${DIM}pnpm run build   ${NC}${DIM}# compile TypeScript (first time / after changes)${NC}"
    echo -e "     ${DIM}pnpm run dev     ${NC}${DIM}# start with nodemon (watches dist/)${NC}"
    echo
    echo -e "   ${CYAN}Frontend:${NC}"
    echo -e "     ${DIM}cd frontend${NC}"
    echo -e "     ${DIM}pnpm run dev     ${NC}${DIM}# start Next.js dev server with Turbopack${NC}"
    echo
    echo -e "   ${CYAN}Endpoints when running:${NC}"
    echo -e "     ${GREEN}Frontend${NC}   http://localhost:3000"
    echo -e "     ${GREEN}Backend${NC}    http://localhost:8080"
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
    configure_backend
    configure_ssh
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

    if [[ ! -f "$BACKEND_ENV" ]] || [[ ! -f "$FRONTEND_ENV" ]]; then
        configure_backend
        configure_ssh
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
    configure_backend
    configure_ssh
    configure_frontend
    ensure_compose_override
    echo
    info "Configuration updated. Files changed:"
    echo -e "   ${DIM}backend/.env${NC}"
    echo -e "   ${DIM}frontend/.env${NC}"
    [[ -f "$COMPOSE_OVERRIDE" ]] && echo -e "   ${DIM}docker-compose.override.yml${NC}"
    echo
    if confirm "Restart running containers to apply changes?" "y"; then
        if [[ -d "$SSH_KEYS_DIR" ]] && [[ -n "$(ls -A "$SSH_KEYS_DIR" 2>/dev/null)" ]]; then
            NEED_SSH_KEY_MOUNT=true
        fi
        compose restart
        echo
        info "Containers restarted with updated config"
    else
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
        echo -e "   ${BOLD}3)${NC} Update configuration only ${DIM}(edit .env files, no build/start)${NC}"
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
                detect_wsl
                if ! load_run_conf 2>/dev/null; then
                    select_deploy_mode
                    save_run_conf
                fi
                configure_backend
                configure_ssh
                configure_frontend
                ensure_compose_override
                echo
                info "Configuration updated. Files changed:"
                echo -e "   ${DIM}backend/.env${NC}"
                echo -e "   ${DIM}frontend/.env${NC}"
                [[ -f "$COMPOSE_OVERRIDE" ]] && echo -e "   ${DIM}docker-compose.override.yml${NC}"
                echo
                if confirm "Restart running containers to apply changes?" "y"; then
                    if [[ -d "$SSH_KEYS_DIR" ]] && [[ -n "$(ls -A "$SSH_KEYS_DIR" 2>/dev/null)" ]]; then
                        NEED_SSH_KEY_MOUNT=true
                    fi
                    compose restart
                    echo
                    info "Containers restarted with updated config"
                else
                    info "Done. Restart containers manually when ready:"
                    echo -e "   ${DIM}$0${NC}       (option 1 to start)"
                    echo -e "   ${DIM}$0 stop${NC}  then ${DIM}$0${NC} to do a full restart"
                fi
                ;;
            2)
                load_run_conf 2>/dev/null || select_deploy_mode
                if [[ -d "$SSH_KEYS_DIR" ]] && [[ -n "$(ls -A "$SSH_KEYS_DIR" 2>/dev/null)" ]]; then
                    NEED_SSH_KEY_MOUNT=true
                fi
                launch --build
                ;;
            *)
                load_run_conf 2>/dev/null || select_deploy_mode
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
