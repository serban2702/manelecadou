# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# `--prod=false`: instalează ÎNTOTDEAUNA devDependencies, indiferent de NODE_ENV.
# Fără el, o platformă care injectează `NODE_ENV=production` ca build arg (Coolify
# o face pentru toate variabilele, în toate stage-urile) face pnpm să sară peste
# devDeps, iar build-ul pică pe lipsa lui nest/next/typescript.
RUN pnpm install --frozen-lockfile --prod=false

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22-alpine AS runner
# fonts pentru ffmpeg drawtext (video overlay) + resvg system fonts (social images)
RUN apk add --no-cache postgresql16-client tini wget ffmpeg font-noto ttf-dejavu fontconfig \
    && fc-cache -f
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
# Scripturile de operare (migrare R2, migrare date prod, sincronizare NPM) —
# se rulează cu `docker exec <api> node scripts/<nume>.mjs`. Fără linia asta nu
# există în imagine și nu-și găsesc dependențele (`pg`, `@aws-sdk/client-s3`).
COPY scripts ./scripts
RUN mkdir -p /app/uploads /app/backups /app/mail-attach
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
