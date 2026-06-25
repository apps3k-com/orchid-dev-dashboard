# syntax=docker/dockerfile:1
# Lean two-target image for the self-hosted Orchid bundle.
#   target "build"  → full toolchain (used by the compose `migrate` one-shot: prisma CLI present)
#   target "runner" → Next.js standalone server only (small runtime image)
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm run build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Prisma client engine for runtime queries (the traced standalone may omit the binary).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
USER nextjs
EXPOSE 3000
# Liveness/readiness: confirm the server actually serves HTTP, not just that the process is up.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
