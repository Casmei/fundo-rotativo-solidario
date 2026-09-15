# api

API em NestJS deste monorepo. Ainda é apenas scaffold, sem lógica de negócio.

## Scripts

```bash
pnpm --filter api run start:dev       # desenvolvimento com hot reload
pnpm --filter api run build           # build de produção (dist/)
pnpm --filter api run lint            # Biome (config em ../../biome.json)
pnpm --filter api run test            # teste unitário (vitest)
pnpm --filter api run test:integration # teste e2e/supertest (vitest)
```

Esses mesmos comandos também rodam via Turborepo a partir da raiz do monorepo (`pnpm turbo build|lint|test|test:integration`).
