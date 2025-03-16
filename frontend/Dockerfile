# Build stage
FROM node:20 AS builder

WORKDIR /usr/src/app

COPY package*.json ./

ARG NEXT_PUBLIC_BACKEND_URI
ARG NEXT_PUBLIC_DEPLOYMENT
ARG NEXT_PUBLIC_GTM_ID

ENV NEXT_PUBLIC_BACKEND_URI=$NEXT_PUBLIC_BACKEND_URI
ENV NEXT_PUBLIC_DEPLOYMENT=$NEXT_PUBLIC_DEPLOYMENT
ENV NEXT_PUBLIC_GTM_ID=$NEXT_PUBLIC_GTM_ID

# Update browserslist and install dependencies
RUN npx browserslist@latest --update-db
RUN npm install --silent
# Install optional WebSocket dependencies
RUN npm install bufferutil utf-8-validate --save-optional

COPY . .

# Build with increased memory and optimized settings
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Runtime stage
FROM node:20 AS runner

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/next.config.js ./

RUN npm install --production --silent

EXPOSE 3000

CMD ["npm", "start"]