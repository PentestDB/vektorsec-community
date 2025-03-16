FROM kalilinux/kali-rolling

ENV USER=root

# Install core services and additional desktop packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openssh-server \
      shellinabox \
      openvpn \
      xfce4 \
      xfce4-goodies \
      tightvncserver \
      novnc \
      websockify \
      xterm \
      dbus-x11 \
      fonts-dejavu-core \
      xfonts-base \
      nano \
      firefox-esr && \
      apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Configure SSH: create runtime directory, enable root login and empty passwords, and remove root password.
RUN mkdir /var/run/sshd && \
    sed -i 's/^#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/^#PermitEmptyPasswords.*/PermitEmptyPasswords yes/' /etc/ssh/sshd_config && \
    passwd -d root

# Expose required ports: SSH (22), shellinabox (4200), OpenVPN (1194/udp) and noVNC (9020)
EXPOSE 22 4200 1194/udp 9020

# Copy and set executable permissions for the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY tools.sh /tools.sh
RUN chmod +x /tools.sh
# RUN /tools.sh

ENTRYPOINT ["/entrypoint.sh"]
