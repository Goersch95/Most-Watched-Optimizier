FROM node:20-slim AS deps
WORKDIR /app
# python3/make/g++: better-sqlite3 kompiliert sein natives Addon beim Install
# immer selbst (kein Prebuild-Download). Debian-Slim statt Alpine, weil
# better-sqlite3 auf musl-libc (Alpine) zur Laufzeit abstürzte (SIGSEGV/502),
# auf glibc (Debian) ist das der dokumentierte, stabile Pfad.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
