# syntax=docker/dockerfile:1
# Build a partir da raiz do monorepo (contexto = raiz do repositório).

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable
WORKDIR /app

# ---- deps: instala todas as dependências do workspace ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

# ---- dev: ambiente de desenvolvimento com hot reload ----
FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "api", "run", "start:dev"]

# ---- build: compila o apps/api ----
FROM deps AS build
COPY . .
RUN pnpm --filter api run build

# ---- production: apenas dependências de produção + build final ----
FROM base AS production
ENV NODE_ENV=production
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/apps/api/dist ./apps/api/dist
EXPOSE 3000
CMD ["node", "apps/api/dist/main"]
