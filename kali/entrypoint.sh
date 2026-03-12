#!/usr/bin/env bash
set -e

mkdir -p /var/run/sshd

# Start SSH — use the daemon directly so we get a clean PID and proper error reporting
/usr/sbin/sshd -D &
SSHD_PID=$!

# Wait briefly and verify sshd is alive
sleep 1
if ! kill -0 "$SSHD_PID" 2>/dev/null; then
    echo "ERROR: sshd failed to start" >&2
    exit 1
fi
echo "sshd running (pid $SSHD_PID)"

# Launch shellinabox on port 4200 (no SSL) for browser-based shell access
shellinaboxd --disable-ssl --port 4200 -s "/:LOGIN" &

# If an OpenVPN configuration exists, start the OpenVPN service
if [ -f /etc/openvpn/server.conf ]; then
    echo "Starting OpenVPN server..."
    openvpn --config /etc/openvpn/server.conf &
fi

# Keep the container running
wait "$SSHD_PID"
