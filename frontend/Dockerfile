# Build stage
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml* ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

# Standard production build: Next.js minify + source maps off
# (productionBrowserSourceMaps: false in next.config.js).
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build

# Runtime stage
FROM base AS runner
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/pnpm-lock.yaml ./
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/next.config.js ./
# Black-box gateway (custom server + response filter)
COPY --from=builder /usr/src/app/server.js ./
COPY --from=builder /usr/src/app/gateway ./gateway

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

EXPOSE 3001

# The gateway is the single entry point (HTTP + WebSocket proxy to backend).
CMD ["node", "server.js"]
