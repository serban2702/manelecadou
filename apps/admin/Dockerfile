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
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

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
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
EXPOSE 1505
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "start"]
