FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install required packages for building native modules
RUN apk add --no-cache openssh make gcc g++ python3

WORKDIR /usr/src/backend

COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN pnpm run build

EXPOSE 8080

CMD ["pnpm", "start"]
