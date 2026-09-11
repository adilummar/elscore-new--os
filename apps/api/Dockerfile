# =============================================================================
# EL SCORE OS — API Dockerfile (Multi-stage, Production-ready)
# =============================================================================

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate
WORKDIR /app

# ─── Dependency install stage ─────────────────────────────────────────────────
FROM base AS deps
# Copy workspace manifests only (cache layer)
COPY package.json pnpm-workspace.yaml ./
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# ─── Build stage ─────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
# Generate Prisma client first
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter api run build

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs
USER nestjs

EXPOSE 3001

# Run migrations then start (deployment entry point)
CMD ["node", "dist/main"]
