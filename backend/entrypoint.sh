#!/usr/bin/env bash
# Supervises the Browser Agent VNC stack (Xvfb -> x11vnc -> websockify) and runs
# the Node server as a child. Deliberately does NOT use `set -e`: a transient
# failure in one VNC component must not take down the whole container, and the
# watchdog below is responsible for bringing pieces back.
set -uo pipefail

DISPLAY="${DISPLAY:-:99}"
VNC_RFB_PORT="${BROWSER_AGENT_VNC_RFB_PORT:-5999}"
NOVNC_PORT="${BROWSER_AGENT_NOVNC_PORT:-6080}"
SCREEN_GEOMETRY="${BROWSER_AGENT_SCREEN:-1280x800x24}"
WATCHDOG_INTERVAL="${BROWSER_AGENT_WATCHDOG_INTERVAL:-5}"

DISPLAY_NUM="${DISPLAY#:}"
DISPLAY_NUM="${DISPLAY_NUM%%.*}"

XVFB_PID=""
X11VNC_PID=""
WEBSOCKIFY_PID=""

log() { echo "[vnc-supervisor] $*"; }

# OpenVPN on a local work host needs a tun device. Docker Desktop supplies the
# kernel support, but minimal containers may not have the device node yet.
if [ ! -e /dev/net/tun ]; then
  mkdir -p /dev/net
  mknod /dev/net/tun c 10 200 2>/dev/null || true
fi

# A container restart (e.g. after the Node process crashes) reuses the same
# filesystem, so the previous run's X lock and socket survive. Xvfb then refuses
# to start with "Server is already active for display N", x11vnc cannot open the
# display, and websockify is left serving a noVNC page with nothing behind it.
# Clear the orphans whenever no live X server is actually holding the display.
reap_stale_display() {
  local lock="/tmp/.X${DISPLAY_NUM}-lock"
  local sock="/tmp/.X11-unix/X${DISPLAY_NUM}"

  if [ ! -e "$lock" ] && [ ! -e "$sock" ]; then
    return 0
  fi

  # The lock file holds the PID of the X server that created it. If that process
  # is still alive the display is genuinely in use and must not be touched.
  if [ -f "$lock" ]; then
    local owner
    owner="$(tr -d ' \n' < "$lock" 2>/dev/null)"
    if [ -n "$owner" ] && [ -d "/proc/$owner" ]; then
      log "display $DISPLAY held by live X server (pid $owner); leaving lock intact"
      return 0
    fi
  fi

  log "clearing stale X lock/socket for display $DISPLAY"
  rm -f "$lock" "$sock"
}

# Bash's /dev/tcp keeps this dependency-free: the image has no ps/netstat/nc.
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }

wait_for() {
  # wait_for <description> <pid-to-watch> <timeout-seconds> <command...>
  # Aborts early if the process being waited on dies, so a component that exits
  # immediately is reported as failed in ~1s instead of burning the full timeout.
  local what="$1" pid="$2" timeout="$3"; shift 3
  local waited=0
  while [ "$waited" -lt "$timeout" ]; do
    if "$@"; then
      return 0
    fi
    if ! alive "$pid"; then
      log "$what exited during startup"
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  log "timed out after ${timeout}s waiting for $what"
  return 1
}

display_socket_ready() { [ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; }

# An X socket left behind by a *different* X server would make a failed Xvfb
# look healthy, which previously sent the watchdog into a respawn loop. The
# lock file records the owning server's PID, so require it to be ours.
xvfb_owns_display() {
  local lock="/tmp/.X${DISPLAY_NUM}-lock" owner
  [ -f "$lock" ] || return 1
  owner="$(tr -d ' \n' < "$lock" 2>/dev/null)"
  [ "$owner" = "$XVFB_PID" ]
}

xvfb_ready() { alive "$XVFB_PID" && display_socket_ready && xvfb_owns_display; }
x11vnc_ready() { alive "$X11VNC_PID" && port_open "$VNC_RFB_PORT"; }
websockify_ready() { alive "$WEBSOCKIFY_PID" && port_open "$NOVNC_PORT"; }

start_xvfb() {
  reap_stale_display
  Xvfb "$DISPLAY" -screen 0 "$SCREEN_GEOMETRY" -ac +extension GLX +render -noreset &
  XVFB_PID=$!
  if wait_for "Xvfb on $DISPLAY" "$XVFB_PID" 15 xvfb_ready; then
    log "Xvfb up on $DISPLAY (pid $XVFB_PID, screen $SCREEN_GEOMETRY)"
    return 0
  fi
  log "Xvfb failed to come up on $DISPLAY"
  kill "$XVFB_PID" 2>/dev/null
  XVFB_PID=""
  return 1
}

start_x11vnc() {
  # Only meaningful once the framebuffer exists, otherwise x11vnc exits at once.
  if ! xvfb_ready; then
    log "skipping x11vnc: display $DISPLAY not ready"
    return 1
  fi
  x11vnc -display "$DISPLAY" -rfbport "$VNC_RFB_PORT" -nopw -forever -shared -noxdamage &
  X11VNC_PID=$!
  if wait_for "x11vnc on :$VNC_RFB_PORT" "$X11VNC_PID" 15 x11vnc_ready; then
    log "x11vnc up on :$VNC_RFB_PORT (pid $X11VNC_PID)"
    return 0
  fi
  log "x11vnc failed to bind :$VNC_RFB_PORT"
  kill "$X11VNC_PID" 2>/dev/null
  X11VNC_PID=""
  return 1
}

start_websockify() {
  websockify --web /usr/share/novnc/ "$NOVNC_PORT" "localhost:$VNC_RFB_PORT" &
  WEBSOCKIFY_PID=$!
  if wait_for "websockify on :$NOVNC_PORT" "$WEBSOCKIFY_PID" 15 websockify_ready; then
    log "websockify up on :$NOVNC_PORT (pid $WEBSOCKIFY_PID)"
    return 0
  fi
  log "websockify failed to bind :$NOVNC_PORT"
  kill "$WEBSOCKIFY_PID" 2>/dev/null
  WEBSOCKIFY_PID=""
  return 1
}

# Bring the stack up once at boot. Failures are logged but never fatal — the
# backend API must still start, and the watchdog keeps retrying underneath it.
start_xvfb && start_x11vnc
start_websockify

# Watchdog: restart any component that dies. Xvfb dying invalidates everything
# above it, so its restart cascades down to x11vnc.
#
# Restarts are backed off exponentially per component (capped at BACKOFF_MAX).
# Without this, a component that can never start — a permanently held display,
# a port taken by something else — would be respawned every interval forever.
BACKOFF_MAX="${BROWSER_AGENT_BACKOFF_MAX:-60}"

watchdog() {
  local xvfb_fails=0 x11vnc_fails=0 websockify_fails=0
  local xvfb_wait=0 x11vnc_wait=0 websockify_wait=0

  backoff_for() {
    # 2^failures * interval, capped. Echoes the delay in seconds.
    local fails="$1" delay="$WATCHDOG_INTERVAL" i=0
    while [ "$i" -lt "$fails" ] && [ "$delay" -lt "$BACKOFF_MAX" ]; do
      delay=$((delay * 2))
      i=$((i + 1))
    done
    [ "$delay" -gt "$BACKOFF_MAX" ] && delay="$BACKOFF_MAX"
    echo "$delay"
  }

  while true; do
    sleep "$WATCHDOG_INTERVAL"

    [ "$xvfb_wait" -gt 0 ] && xvfb_wait=$((xvfb_wait - WATCHDOG_INTERVAL))
    [ "$x11vnc_wait" -gt 0 ] && x11vnc_wait=$((x11vnc_wait - WATCHDOG_INTERVAL))
    [ "$websockify_wait" -gt 0 ] && websockify_wait=$((websockify_wait - WATCHDOG_INTERVAL))

    if ! alive "$XVFB_PID"; then
      if [ "$xvfb_wait" -le 0 ]; then
        log "Xvfb is down; restarting (attempt $((xvfb_fails + 1)))"
        # x11vnc is useless without the framebuffer — tear it down so it is
        # rebuilt against the new display rather than left pointing at a corpse.
        if alive "$X11VNC_PID"; then
          kill "$X11VNC_PID" 2>/dev/null
          X11VNC_PID=""
        fi
        if start_xvfb; then
          xvfb_fails=0
          x11vnc_fails=0
          start_x11vnc || x11vnc_fails=1
        else
          xvfb_fails=$((xvfb_fails + 1))
          xvfb_wait="$(backoff_for "$xvfb_fails")"
          log "Xvfb restart failed; next attempt in ${xvfb_wait}s"
        fi
      fi
      continue
    fi

    if ! alive "$X11VNC_PID"; then
      if [ "$x11vnc_wait" -le 0 ]; then
        log "x11vnc is down; restarting (attempt $((x11vnc_fails + 1)))"
        if start_x11vnc; then
          x11vnc_fails=0
        else
          x11vnc_fails=$((x11vnc_fails + 1))
          x11vnc_wait="$(backoff_for "$x11vnc_fails")"
          log "x11vnc restart failed; next attempt in ${x11vnc_wait}s"
        fi
      fi
    fi

    if ! alive "$WEBSOCKIFY_PID"; then
      if [ "$websockify_wait" -le 0 ]; then
        log "websockify is down; restarting (attempt $((websockify_fails + 1)))"
        if start_websockify; then
          websockify_fails=0
        else
          websockify_fails=$((websockify_fails + 1))
          websockify_wait="$(backoff_for "$websockify_fails")"
          log "websockify restart failed; next attempt in ${websockify_wait}s"
        fi
      fi
    fi
  done
}

watchdog &
WATCHDOG_PID=$!

SERVER_PID=""

shutdown() {
  trap - EXIT INT TERM
  kill "$WATCHDOG_PID" 2>/dev/null
  kill "$SERVER_PID" 2>/dev/null
  kill "$X11VNC_PID" "$WEBSOCKIFY_PID" "$XVFB_PID" 2>/dev/null
}
trap shutdown EXIT INT TERM

log "Browser Agent VNC stack started (display=$DISPLAY, rfb=:$VNC_RFB_PORT, noVNC=:$NOVNC_PORT)"

# Run the server as a background child + `wait` rather than `exec`, so this shell
# stays alive to supervise the VNC stack and can still service signals while the
# server runs (bash defers traps during a foreground command, which would break
# graceful `docker stop`). Node's exit code is propagated so Docker's restart
# policy still sees a crash as a crash.
pnpm start &
SERVER_PID=$!
wait "$SERVER_PID"
exit $?
