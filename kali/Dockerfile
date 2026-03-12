FROM kalilinux/kali-rolling

ENV USER=root
ENV DEBIAN_FRONTEND=noninteractive

# ── Layer 1: SSH + services (small, rarely changes) ──
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openssh-server \
      shellinabox \
      openvpn \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Configure SSH for passwordless root login
RUN mkdir -p /var/run/sshd && \
    sed -i 's/^#*\s*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/^#*\s*PermitEmptyPasswords.*/PermitEmptyPasswords yes/' /etc/ssh/sshd_config && \
    sed -i 's/^#*\s*UsePAM.*/UsePAM no/' /etc/ssh/sshd_config && \
    grep -q '^PermitRootLogin' /etc/ssh/sshd_config    || echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config && \
    grep -q '^PermitEmptyPasswords' /etc/ssh/sshd_config || echo 'PermitEmptyPasswords yes' >> /etc/ssh/sshd_config && \
    grep -q '^UsePAM' /etc/ssh/sshd_config              || echo 'UsePAM no' >> /etc/ssh/sshd_config && \
    passwd -d root

EXPOSE 22 4200 1194/udp 9020

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# ── Layer 2: Base utilities + build deps (needed for runtime tool installs) ──
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential curl git wget unzip tar \
      python3 python3-pip python3-venv pipx \
      golang \
      iputils-ping net-tools dnsutils \
      nano bash-completion \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Layer 3: Core pentest tools (the essentials that should be pre-installed) ──
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      nmap masscan \
      sqlmap \
      ffuf gobuster feroxbuster \
      hydra \
      nikto \
      whatweb \
      libpcap-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Layer 4: Desktop / VNC (required for noVNC & GUI access) ──
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      xfce4 xfce4-goodies tightvncserver novnc websockify \
      xterm dbus-x11 fonts-dejavu-core xfonts-base firefox-esr \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Layer 5: Kali core tooling ──
RUN apt-get update && \
    apt-get install -y \
      kali-linux-headless \
      kali-linux-core \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Optional: kali-linux-default (uncomment for the full default tool suite) ──
# WARNING: Adds ~500 extra packages and significant build time on top of core.
# RUN apt-get update && \
#     apt-get install -y kali-linux-default \
#     && apt-get clean && rm -rf /var/lib/apt/lists/*

# Additional security tools (Go-based & Python-based — uncomment to pre-install)
COPY tools.sh /tools.sh
RUN chmod +x /tools.sh
# RUN /tools.sh

ENTRYPOINT ["/entrypoint.sh"]
