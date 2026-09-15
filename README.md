# frs

Monorepo (pnpm workspaces + Turborepo). Apenas scaffold por enquanto, sem lógica de negócio.

## Estrutura

- `apps/api` — backend em NestJS
- `packages/` — reservado para código compartilhado futuro (ainda vazio)

## Requisitos

- Node.js >= 22
- pnpm 10.29.3 (`corepack enable`)
- Docker + Docker Compose (para subir Postgres e a API em container)

## Comandos

```bash
pnpm install

pnpm turbo build            # build de todos os apps
pnpm turbo lint             # lint com Biome
pnpm turbo test             # teste unitário (vitest, gerado pelo Nest CLI)
pnpm turbo test:integration # teste e2e/supertest (vitest, gerado pelo Nest CLI)
```

## Lint e format

O lint e a formatação são feitos pelo [Biome](https://biomejs.dev), com configuração única em `biome.json` na raiz, compartilhada por todos os pacotes do monorepo.

```bash
pnpm run lint:fix   # aplica correções automáticas em todo o repositório
pnpm run format     # apenas formatação
```

## Docker

```bash
docker compose up --build
```

Sobe a API (NestJS, modo dev com hot reload) na porta `3000` e o Postgres na porta `5432`.
