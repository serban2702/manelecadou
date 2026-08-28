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
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_GA_ID=""
ARG NEXT_PUBLIC_META_PIXEL_ID=""
ARG NEXT_PUBLIC_TIKTOK_PIXEL_ID=""
ARG NEXT_PUBLIC_DEFAULT_LOCALE="ro"
ARG NEXT_PUBLIC_SHOW_LANG_SWITCHER="false"
ARG NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY=""
ARG NEXT_PUBLIC_OPENREPLAY_INGEST_POINT=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID \
    NEXT_PUBLIC_TIKTOK_PIXEL_ID=$NEXT_PUBLIC_TIKTOK_PIXEL_ID \
    NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE \
    NEXT_PUBLIC_SHOW_LANG_SWITCHER=$NEXT_PUBLIC_SHOW_LANG_SWITCHER \
    NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY=$NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY \
    NEXT_PUBLIC_OPENREPLAY_INGEST_POINT=$NEXT_PUBLIC_OPENREPLAY_INGEST_POINT

RUN pnpm run build
RUN pnpm prune --prod

FROM node:22-alpine AS runner
RUN apk add --no-cache tini wget
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/i18n ./i18n
COPY --from=builder /app/messages ./messages
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
EXPOSE 1500
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "start"]
