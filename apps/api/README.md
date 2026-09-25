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

## Documentação da API (Swagger)

Todas as rotas ficam sob o prefixo global `/api` (definido em `src/configure-app.ts`).

Com a API rodando, a documentação interativa fica em:

- `http://localhost:3000/api/docs`: Swagger UI (use **Authorize** com o token de `POST /api/auth/login`)
- `http://localhost:3000/api/docs-json`: especificação OpenAPI em JSON

A especificação é gerada a partir dos decorators `@nestjs/swagger` nos controllers e DTOs (setup em `src/swagger.ts`). Ao criar ou alterar uma rota, documente-a junto e atualize `test/swagger.e2e-spec.ts`.
