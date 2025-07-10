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
RUN mkdir -p /var/run/sshd && \
    sed -i 's/^#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/^#PermitEmptyPasswords.*/PermitEmptyPasswords yes/' /etc/ssh/sshd_config && \
    passwd -d root

# Expose required ports: SSH (22), shellinabox (4200), OpenVPN (1194/udp) and noVNC (9020)
EXPOSE 22 4200 1194/udp 9020

# Copy and set executable permissions for the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# install just core tooling first (so this layer can cache)
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential curl git wget \
      libpcap-dev \
      ffuf wfuzz gobuster hydra patator crowbar nmap masscan \
      amass whatweb wpscan sqlmap \
      golang \
      kali-linux-core \
      kali-linux-default \
      && apt-get clean \
      && rm -rf /var/lib/apt/lists/*

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
      iputils-ping \
      && apt-get clean \
      && rm -rf /var/lib/apt/lists/*

# install your security tools in a second layer
COPY tools.sh /tools.sh
RUN chmod +x /tools.sh
# RUN DEBIAN_FRONTEND=noninteractive /tools.sh

ENTRYPOINT ["/entrypoint.sh"]
