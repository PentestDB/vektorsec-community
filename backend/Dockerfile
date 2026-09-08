# Use Debian-based image: BAML/magnitude-core native bindings require glibc (Alpine/musl incompatible)
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install build deps + Chromium runtime deps + VNC stack for Magnitude browser agent
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client make gcc g++ python3 openvpn iproute2 util-linux ca-certificates libnss3-tools \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 \
    libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    xvfb x11vnc python3-websockify novnc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/backend

COPY package.json pnpm-lock.yaml* ./

# [FIXED] ตั้งค่า registry และ retry ในระดับ global ก่อนรัน install
RUN pnpm config set registry https://registry.npmmirror.com && \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 20000 && \
    pnpm config set fetch-retry-maxtimeout 120000

# [FIXED] ลบ --network-timeout ออกเนื่องจาก pnpm v9 ไม่รองรับ flag นี้
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Install Patchright Chromium for Magnitude browser agent
RUN pnpm exec patchright install chromium

# Docker cannot execute the host's macOS Codex binary. Install the matching
# Linux CLI and let docker-compose mount only the host's file-based login.
ARG CODEX_CLI_VERSION=0.146.0
RUN npm install --global "@openai/codex@${CODEX_CLI_VERSION}" \
    && codex --version

COPY . .

RUN mkdir -p /srv/data

ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV DISPLAY=:99

RUN pnpm run build

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8081 6080

ENTRYPOINT ["entrypoint.sh"]