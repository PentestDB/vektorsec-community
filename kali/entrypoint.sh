#!/usr/bin/env bash
set -e

# Start the SSH service.
service ssh start

# Launch shellinabox on port 4200 (without SSL) for browser-based shell access.
shellinaboxd --disable-ssl --port 4200 -s "/:LOGIN" &

# If an OpenVPN configuration exists, start the OpenVPN service.
if [ -f /etc/openvpn/server.conf ]; then
  echo "Found /etc/openvpn/server.conf, starting OpenVPN server..."
  openvpn --config /etc/openvpn/server.conf &
fi

# Keep the container running.
tail -f /dev/null



# Run tightvncserver once to initialize configuration then kill it.
# tightvncserver :1 || true
# tightvncserver -kill :1 || true



# cat << 'EOF' > ~/.vnc/xstartup
# #!/bin/sh
# unset SESSION_MANAGER
# unset DBUS_SESSION_BUS_ADDRESS
# xrdb $HOME/.Xresources
# startxfce4 &
# EOF
# chmod +x ~/.vnc/xstartup


# # Start the VNC server with the desired screen geometry and color depth.
# tightvncserver :1 -geometry 1280x800 -depth 16

# # Launch noVNC (via websockify) to enable browser-based VNC access.
# websockify --web /usr/share/novnc/ 9020 localhost:5901 &