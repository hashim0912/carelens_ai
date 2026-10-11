FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --filter @carelens/api... --frozen-lockfile
RUN pnpm --filter @carelens/api exec prisma generate
RUN pnpm --filter @carelens/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
