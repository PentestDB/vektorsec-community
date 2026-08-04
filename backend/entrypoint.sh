#!/usr/bin/env bash
set -e

DISPLAY="${DISPLAY:-:99}"
VNC_RFB_PORT="${BROWSER_AGENT_VNC_RFB_PORT:-5999}"
NOVNC_PORT="${BROWSER_AGENT_NOVNC_PORT:-6080}"

# OpenVPN on a local work host needs a tun device. Docker Desktop supplies the
# kernel support, but minimal containers may not have the device node yet.
if [ ! -e /dev/net/tun ]; then
  mkdir -p /dev/net
  mknod /dev/net/tun c 10 200 2>/dev/null || true
fi

# Start virtual framebuffer
Xvfb "$DISPLAY" -screen 0 1280x800x24 -ac +extension GLX +render -noreset &
sleep 1

# Start x11vnc attached to the virtual display
x11vnc -display "$DISPLAY" -rfbport "$VNC_RFB_PORT" -nopw -forever -shared -noxdamage &
sleep 0.5

# Start websockify serving the noVNC HTML client
websockify --web /usr/share/novnc/ "$NOVNC_PORT" "localhost:$VNC_RFB_PORT" &

echo "Browser Agent VNC stack started (display=$DISPLAY, noVNC=:$NOVNC_PORT)"

exec pnpm start
