# Fluxo de login no backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o subsistema de autenticação do `apps/api` — tabela `users` (Drizzle), login por telefone/senha com JWT, guards de autenticação e de papel (`role`), e o seed das duas contas reais (Bruno / Luana) — atendendo RF09/RNF04 do `docs/mvp.md`.

**Architecture:** NestJS com guards globais (`APP_GUARD`) secure-by-default: `JwtAuthGuard` valida o Bearer token em toda rota exceto as marcadas `@Public()`, e `RolesGuard` restringe rotas marcadas com `@Roles(...)`. Acesso ao Postgres via Drizzle ORM, injetado por um token de DI (`DRIZZLE`) para permitir mocks em teste unitário. Validação de env vars via `envalid` (falha rápido no boot); `.env` local carregado via `dotenv`.

**Tech Stack:** NestJS 12, Drizzle ORM + `postgres` (postgres.js), `@nestjs/jwt`, `bcrypt`, `class-validator`/`class-transformer`, `envalid`, `dotenv`, `tsx` (para rodar o seed), Vitest + Supertest (já configurados no projeto).

**Spec:** `docs/superpowers/specs/2026-09-15-auth-login-flow-design.md`

## Global Constraints

- Tudo em inglês no código (tabela, colunas, enum, DTOs, mensagens); documentação de negócio (`mvp.md`) continua em português.
- Autenticação via JWT stateless, access token único, `expiresIn: '7d'`, sem refresh token.
- Login identificado por `phone` + `password` (não `username`/`email`).
- Verificação de token via guard custom com `@nestjs/jwt` — sem Passport.
- `role` enum: `field_agent` (Técnico de Campo) / `back_office` (Administrativo).
- Erros de credencial sempre genéricos: `401 "Invalid credentials"` tanto para telefone inexistente quanto para senha errada — nunca revelar qual dos dois está errado.
- Seed idempotente (pula se o `phone` já existir) e serve tanto dev quanto produção: telefone e senha de Bruno/Luana vêm sempre de env vars, sem PII/segredo hardcoded no git.
- Sem endpoint de cadastro de usuário nesta fase (fora de escopo, ver spec seção 2).

---

## Task 1: Dependências e validação de variáveis de ambiente

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/config/env.ts`
- Test: `apps/api/src/config/env.spec.ts`
- Create: `apps/api/.env.example`

**Interfaces:**
- Produces: `loadEnv(source?: NodeJS.ProcessEnv): { DATABASE_URL: string; JWT_SECRET: string; PORT: number }` — usado por todo o resto do plano para ler configuração.

- [ ] **Step 1: Instalar as dependências**

```bash
pnpm --filter api add drizzle-orm postgres @nestjs/jwt bcrypt class-validator class-transformer envalid dotenv
pnpm --filter api add -D drizzle-kit @types/bcrypt tsx
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `apps/api/src/config/env.spec.ts`:

```ts
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('returns parsed values when all required vars are present', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://frs:frs@localhost:5432/frs', JWT_SECRET: 'test-secret', PORT: '4000' });

    expect(env.DATABASE_URL).toBe('postgresql://frs:frs@localhost:5432/frs');
    expect(env.JWT_SECRET).toBe('test-secret');
    expect(env.PORT).toBe(4000);
  });

  it('defaults PORT to 3000 when not set', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://frs:frs@localhost:5432/frs', JWT_SECRET: 'test-secret' });

    expect(env.PORT).toBe(3000);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadEnv({ JWT_SECRET: 'test-secret' })).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT_SECRET is missing', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgresql://frs:frs@localhost:5432/frs' })).toThrow(/JWT_SECRET/);
  });
});
```

- [ ] **Step 2b: Rodar o teste e confirmar que falha**

Run: `pnpm --filter api test -- env.spec.ts`
Expected: FAIL — `Cannot find module './env.js'` (arquivo ainda não existe).

- [ ] **Step 3: Implementar `loadEnv`**

Criar `apps/api/src/config/env.ts`:

```ts
import 'dotenv/config';
import { cleanEnv, port, str } from 'envalid';

function throwingReporter({ errors }: { errors: Record<string, Error | undefined> }): void {
  const messages = Object.entries(errors)
    .filter(([, err]) => err !== undefined)
    .map(([key, err]) => `${key}: ${err?.message}`);

  if (messages.length > 0) {
    throw new Error(`Invalid environment variables:\n${messages.join('\n')}`);
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  return cleanEnv(
    source,
    {
      DATABASE_URL: str(),
      JWT_SECRET: str(),
      PORT: port({ default: 3000 }),
    },
    { reporter: throwingReporter },
  );
}

export type AppEnv = ReturnType<typeof loadEnv>;
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter api test -- env.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Criar o `.env.example`**

Criar `apps/api/.env.example`:

```bash
# Copie para .env e preencha os valores reais.
DATABASE_URL=postgresql://frs:frs@localhost:5432/frs
JWT_SECRET=change-me-to-a-long-random-string
PORT=3000

# Usados só pelo script de seed (pnpm --filter api db:seed).
SEED_BRUNO_PHONE=
SEED_BRUNO_PASSWORD=
SEED_LUANA_PHONE=
SEED_LUANA_PASSWORD=
```

Copiar localmente para poder rodar a API e os testes fora do Docker:

```bash
cp apps/api/.env.example apps/api/.env
```

(O `.env` já está no `.gitignore` da raiz — nada de segredo vai pro git.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/config/env.ts apps/api/src/config/env.spec.ts apps/api/.env.example
git commit -m "feat(api): add env validation with envalid"
```

---

## Task 2: Schema Drizzle, módulo de DB e migrations

**Files:**
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/db.module.ts`
- Modify: `apps/api/package.json` (scripts `db:generate`, `db:migrate`)
- Modify: `turbo.json` (task `db:migrate`)

**Interfaces:**
- Consumes: `loadEnv` de `../config/env.js` (Task 1).
- Produces: `users` (tabela Drizzle), `roleEnum`, `Role`, `User`, `NewUser` (tipos) de `db/schema.js`; `DRIZZLE` (token de DI) e `Database` (tipo) de `db/db.module.js` — usados por todas as tasks seguintes que tocam o banco.

- [ ] **Step 1: Criar o schema**

Criar `apps/api/src/db/schema.ts`:

```ts
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['field_agent', 'back_office']);
export type Role = (typeof roleEnum.enumValues)[number];

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 2: Criar o módulo de DB**

Criar `apps/api/src/db/db.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '../config/env.js';
import * as schema from './schema.js';

export const DRIZZLE = Symbol('DRIZZLE');
export type Database = PostgresJsDatabase<typeof schema>;

@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: (): Database => {
        const env = loadEnv();
        const queryClient = postgres(env.DATABASE_URL);
        return drizzle(queryClient, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule {}
```

- [ ] **Step 3: Configurar o drizzle-kit**

Criar `apps/api/drizzle.config.ts`:

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
});
```

- [ ] **Step 4: Adicionar scripts no `apps/api/package.json`**

Dentro de `"scripts"`, adicionar:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 5: Adicionar a task no `turbo.json`**

Em `turbo.json`, dentro de `"tasks"`, adicionar:

```json
"db:migrate": {
  "cache": false
}
```

- [ ] **Step 6: Gerar e aplicar a migration (verificação manual)**

Suba o Postgres do `docker-compose.yml` (só o serviço `postgres`, sem subir a API):

```bash
docker compose up -d postgres
```

Gere a migration a partir do schema:

```bash
pnpm --filter api db:generate
```

Expected: um novo arquivo SQL aparece em `apps/api/src/db/migrations/`, criando o `type "role"` e a tabela `users`.

Aplique a migration:

```bash
pnpm --filter api db:migrate
```

Expected: comando termina sem erro. Confirme a tabela existe:

```bash
docker compose exec postgres psql -U frs -d frs -c '\d users'
```

Expected: mostra as colunas `id, name, phone, password_hash, role, created_at`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/drizzle.config.ts apps/api/src/db/schema.ts apps/api/src/db/db.module.ts apps/api/src/db/migrations apps/api/package.json turbo.json
git commit -m "feat(api): add users table via Drizzle and migration tooling"
```

---

## Task 3: Utilitário `normalizePhone`

**Files:**
- Create: `apps/api/src/auth/normalize-phone.ts`
- Test: `apps/api/src/auth/normalize-phone.spec.ts`

**Interfaces:**
- Produces: `normalizePhone(phone: string): string` — usado por `AuthService` (Task 9) e pelo teste e2e de login (Task 14).

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/src/auth/normalize-phone.spec.ts`:

```ts
import { normalizePhone } from './normalize-phone.js';

describe('normalizePhone', () => {
  it('strips formatting characters, keeping only digits', () => {
    expect(normalizePhone('(11) 91234-5678')).toBe('11912345678');
  });

  it('keeps a string that is already digits-only unchanged', () => {
    expect(normalizePhone('11912345678')).toBe('11912345678');
  });

  it('strips a leading plus sign from an international format', () => {
    expect(normalizePhone('+55 11 91234-5678')).toBe('5511912345678');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter api test -- normalize-phone.spec.ts`
Expected: FAIL — `Cannot find module './normalize-phone.js'`

- [ ] **Step 3: Implementar**

Criar `apps/api/src/auth/normalize-phone.ts`:

```ts
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter api test -- normalize-phone.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/normalize-phone.ts apps/api/src/auth/normalize-phone.spec.ts
git commit -m "feat(api): add normalizePhone utility"
```

---

## Task 4: Validação das env vars de seed

**Files:**
- Create: `apps/api/src/db/seed.env.ts`
- Test: `apps/api/src/db/seed.env.spec.ts`

**Interfaces:**
- Produces: `loadSeedEnv(source?): { SEED_BRUNO_PHONE, SEED_BRUNO_PASSWORD, SEED_LUANA_PHONE, SEED_LUANA_PASSWORD }`, `DEV_FALLBACK_BRUNO_PASSWORD`, `DEV_FALLBACK_LUANA_PASSWORD` — usados pelo `seed.ts` (Task 6).

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/src/db/seed.env.spec.ts`:

```ts
import { DEV_FALLBACK_BRUNO_PASSWORD, DEV_FALLBACK_LUANA_PASSWORD, loadSeedEnv } from './seed.env.js';

describe('loadSeedEnv', () => {
  it('returns the provided values when all vars are set', () => {
    const env = loadSeedEnv({
      SEED_BRUNO_PHONE: '5533900000001',
      SEED_BRUNO_PASSWORD: 'bruno-real-password',
      SEED_LUANA_PHONE: '5533900000002',
      SEED_LUANA_PASSWORD: 'luana-real-password',
    });

    expect(env.SEED_BRUNO_PHONE).toBe('5533900000001');
    expect(env.SEED_BRUNO_PASSWORD).toBe('bruno-real-password');
    expect(env.SEED_LUANA_PHONE).toBe('5533900000002');
    expect(env.SEED_LUANA_PASSWORD).toBe('luana-real-password');
  });

  it('falls back to dev passwords when they are not set', () => {
    const env = loadSeedEnv({
      SEED_BRUNO_PHONE: '5533900000001',
      SEED_LUANA_PHONE: '5533900000002',
    });

    expect(env.SEED_BRUNO_PASSWORD).toBe(DEV_FALLBACK_BRUNO_PASSWORD);
    expect(env.SEED_LUANA_PASSWORD).toBe(DEV_FALLBACK_LUANA_PASSWORD);
  });

  it('throws when SEED_BRUNO_PHONE is missing', () => {
    expect(() => loadSeedEnv({ SEED_LUANA_PHONE: '5533900000002' })).toThrow(/SEED_BRUNO_PHONE/);
  });

  it('throws when SEED_LUANA_PHONE is missing', () => {
    expect(() => loadSeedEnv({ SEED_BRUNO_PHONE: '5533900000001' })).toThrow(/SEED_LUANA_PHONE/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter api test -- seed.env.spec.ts`
Expected: FAIL — `Cannot find module './seed.env.js'`

- [ ] **Step 3: Implementar**

Criar `apps/api/src/db/seed.env.ts`:

```ts
import 'dotenv/config';
import { cleanEnv, str } from 'envalid';

export const DEV_FALLBACK_BRUNO_PASSWORD = 'changeme-bruno';
export const DEV_FALLBACK_LUANA_PASSWORD = 'changeme-luana';

function throwingReporter({ errors }: { errors: Record<string, Error | undefined> }): void {
  const messages = Object.entries(errors)
    .filter(([, err]) => err !== undefined)
    .map(([key, err]) => `${key}: ${err?.message}`);

  if (messages.length > 0) {
    throw new Error(`Invalid seed environment variables:\n${messages.join('\n')}`);
  }
}

export function loadSeedEnv(source: NodeJS.ProcessEnv = process.env) {
  return cleanEnv(
    source,
    {
      SEED_BRUNO_PHONE: str(),
      SEED_BRUNO_PASSWORD: str({ default: DEV_FALLBACK_BRUNO_PASSWORD }),
      SEED_LUANA_PHONE: str(),
      SEED_LUANA_PASSWORD: str({ default: DEV_FALLBACK_LUANA_PASSWORD }),
    },
    { reporter: throwingReporter },
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter api test -- seed.env.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/seed.env.ts apps/api/src/db/seed.env.spec.ts
git commit -m "feat(api): add seed env validation"
```

---

## Task 5: `upsertSeedUser`

**Files:**
- Create: `apps/api/src/db/upsert-seed-user.ts`
- Test: `apps/api/src/db/upsert-seed-user.spec.ts`

**Interfaces:**
- Consumes: `Database` de `./db.module.js` (Task 2), `users`/`Role` de `./schema.js` (Task 2).
- Produces: `upsertSeedUser(db: Database, input: SeedUserInput): Promise<'created' | 'skipped'>`, `SeedUserInput` — usados por `seed.ts` (Task 6).

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/src/db/upsert-seed-user.spec.ts`:

```ts
import type { Database } from './db.module.js';
import { upsertSeedUser } from './upsert-seed-user.js';

function createMockDb(existingUser: Record<string, unknown> | undefined) {
  const limit = vi.fn().mockResolvedValue(existingUser ? [existingUser] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });

  return { select, insert } as unknown as Database;
}

describe('upsertSeedUser', () => {
  it('creates a new user when no user with that phone exists', async () => {
    const db = createMockDb(undefined);

    const result = await upsertSeedUser(db, {
      name: 'Bruno',
      phone: '5533900000001',
      password: 'bruno-real-password',
      role: 'back_office',
    });

    expect(result).toBe('created');
    expect(db.insert).toHaveBeenCalled();
  });

  it('skips when a user with that phone already exists', async () => {
    const db = createMockDb({ id: '1', phone: '5533900000001' });

    const result = await upsertSeedUser(db, {
      name: 'Bruno',
      phone: '5533900000001',
      password: 'bruno-real-password',
      role: 'back_office',
    });

    expect(result).toBe('skipped');
    expect(db.insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter api test -- upsert-seed-user.spec.ts`
Expected: FAIL — `Cannot find module './upsert-seed-user.js'`

- [ ] **Step 3: Implementar**

Criar `apps/api/src/db/upsert-seed-user.ts`:

```ts
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { Database } from './db.module.js';
import { users, type Role } from './schema.js';

export interface SeedUserInput {
  name: string;
  phone: string;
  password: string;
  role: Role;
}

export type SeedUserResult = 'created' | 'skipped';

export async function upsertSeedUser(db: Database, input: SeedUserInput): Promise<SeedUserResult> {
  const [existing] = await db.select().from(users).where(eq(users.phone, input.phone)).limit(1);

  if (existing) {
    return 'skipped';
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  await db.insert(users).values({
    name: input.name,
    phone: input.phone,
    passwordHash,
    role: input.role,
  });

  return 'created';
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter api test -- upsert-seed-user.spec.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/upsert-seed-user.ts apps/api/src/db/upsert-seed-user.spec.ts
git commit -m "feat(api): add idempotent upsertSeedUser"
```

---

## Task 6: Script de seed + tasks de turbo/pnpm

**Files:**
- Create: `apps/api/src/db/seed.ts`
- Modify: `apps/api/package.json` (script `db:seed`)
- Modify: `turbo.json` (task `db:seed`)

**Interfaces:**
- Consumes: `loadEnv` (Task 1), `loadSeedEnv`/`DEV_FALLBACK_*` (Task 4), `upsertSeedUser` (Task 5).
- Produces: script executável `pnpm --filter api db:seed` / `pnpm turbo db:seed`.

- [ ] **Step 1: Implementar o script**

Criar `apps/api/src/db/seed.ts`:

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '../config/env.js';
import * as schema from './schema.js';
import { DEV_FALLBACK_BRUNO_PASSWORD, DEV_FALLBACK_LUANA_PASSWORD, loadSeedEnv } from './seed.env.js';
import { upsertSeedUser } from './upsert-seed-user.js';

async function main() {
  const env = loadEnv();
  const seedEnv = loadSeedEnv();

  if (seedEnv.SEED_BRUNO_PASSWORD === DEV_FALLBACK_BRUNO_PASSWORD) {
    console.warn('[seed] SEED_BRUNO_PASSWORD not set, using dev fallback password');
  }
  if (seedEnv.SEED_LUANA_PASSWORD === DEV_FALLBACK_LUANA_PASSWORD) {
    console.warn('[seed] SEED_LUANA_PASSWORD not set, using dev fallback password');
  }

  const queryClient = postgres(env.DATABASE_URL);
  const db = drizzle(queryClient, { schema });

  const bruno = await upsertSeedUser(db, {
    name: 'Bruno',
    phone: seedEnv.SEED_BRUNO_PHONE,
    password: seedEnv.SEED_BRUNO_PASSWORD,
    role: 'back_office',
  });
  console.log(`[seed] Bruno (back_office): ${bruno}`);

  const luana = await upsertSeedUser(db, {
    name: 'Luana',
    phone: seedEnv.SEED_LUANA_PHONE,
    password: seedEnv.SEED_LUANA_PASSWORD,
    role: 'field_agent',
  });
  console.log(`[seed] Luana (field_agent): ${luana}`);

  await queryClient.end();
}

await main();
```

- [ ] **Step 2: Adicionar o script no `apps/api/package.json`**

Dentro de `"scripts"`, adicionar:

```json
"db:seed": "tsx src/db/seed.ts"
```

- [ ] **Step 3: Adicionar a task no `turbo.json`**

Em `turbo.json`, dentro de `"tasks"`, adicionar:

```json
"db:seed": {
  "cache": false
}
```

- [ ] **Step 4: Rodar o seed e verificar (manual)**

Com o Postgres no ar e a migration da Task 2 aplicada, preencha `SEED_BRUNO_PHONE`/`SEED_LUANA_PHONE` no `apps/api/.env` (senhas podem ficar em branco — vão usar o fallback de dev) e rode:

```bash
pnpm --filter api db:seed
```

Expected: log mostra `Bruno (back_office): created` e `Luana (field_agent): created`, com avisos de senha padrão se as env vars de senha estiverem vazias.

Rode de novo:

```bash
pnpm --filter api db:seed
```

Expected: agora mostra `skipped` para os dois (idempotência).

Confirme os dados no banco:

```bash
docker compose exec postgres psql -U frs -d frs -c 'select name, phone, role from users;'
```

Expected: duas linhas, Bruno com `back_office` e Luana com `field_agent`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/seed.ts apps/api/package.json turbo.json
git commit -m "feat(api): add db seed script for Bruno and Luana"
```

---

## Task 7: `LoginDto`

**Files:**
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Test: `apps/api/src/auth/dto/login.dto.spec.ts`

**Interfaces:**
- Produces: `LoginDto` (classe com `phone: string`, `password: string`) — usado por `AuthController` (Task 12).

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/src/auth/dto/login.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto.js';

describe('LoginDto', () => {
  it('passes validation with phone and password', async () => {
    const dto = plainToInstance(LoginDto, { phone: '11912345678', password: 'secret123' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails validation when phone is missing', async () => {
    const dto = plainToInstance(LoginDto, { password: 'secret123' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'phone')).toBe(true);
  });

  it('fails validation when password is missing', async () => {
    const dto = plainToInstance(LoginDto, { phone: '11912345678' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter api test -- login.dto.spec.ts`
Expected: FAIL — `Cannot find module './login.dto.js'`

- [ ] **Step 3: Implementar**

Criar `apps/api/src/auth/dto/login.dto.ts`:

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter api test -- login.dto.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/dto/login.dto.ts apps/api/src/auth/dto/login.dto.spec.ts
git commit -m "feat(api): add LoginDto"
```

---

## Task 8: Decorators `@Public`, `@Roles`, `@CurrentUser`

**Files:**
- Create: `apps/api/src/auth/public.decorator.ts`
- Test: `apps/api/src/auth/public.decorator.spec.ts`
- Create: `apps/api/src/auth/roles.decorator.ts`
- Test: `apps/api/src/auth/roles.decorator.spec.ts`
- Create: `apps/api/src/auth/current-user.decorator.ts`
- Test: `apps/api/src/auth/current-user.decorator.spec.ts`
- Create: `apps/api/src/auth/auth-token-payload.ts`

**Interfaces:**
- Consumes: `Role` de `../db/schema.js` (Task 2).
- Produces: `AuthTokenPayload` (interface `{ sub, phone, role, name }`) de `auth-token-payload.js` — usado por `AuthService` (Task 9), `JwtAuthGuard` (Task 10), `RolesGuard` (Task 11). `IS_PUBLIC_KEY`/`Public` de `public.decorator.js`. `ROLES_KEY`/`Roles` de `roles.decorator.js`. `CurrentUser`/`getCurrentUserFromContext` de `current-user.decorator.js`.

- [ ] **Step 1: Criar o tipo compartilhado do payload**

Criar `apps/api/src/auth/auth-token-payload.ts`:

```ts
import type { Role } from '../db/schema.js';

export interface AuthTokenPayload {
  sub: string;
  phone: string;
  role: Role;
  name: string;
}
```

- [ ] **Step 2: Escrever o teste do `@Public`**

Criar `apps/api/src/auth/public.decorator.spec.ts`:

```ts
import { IS_PUBLIC_KEY, Public } from './public.decorator.js';

describe('Public decorator', () => {
  it('sets the isPublic metadata to true on the decorated method', () => {
    class TestController {
      @Public()
      method() {}
    }

    const value = Reflect.getMetadata(IS_PUBLIC_KEY, TestController.prototype.method);

    expect(value).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha, depois implementar**

Run: `pnpm --filter api test -- public.decorator.spec.ts` → FAIL (módulo não existe)

Criar `apps/api/src/auth/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

Run: `pnpm --filter api test -- public.decorator.spec.ts` → PASS

- [ ] **Step 4: Escrever o teste do `@Roles`**

Criar `apps/api/src/auth/roles.decorator.spec.ts`:

```ts
import { ROLES_KEY, Roles } from './roles.decorator.js';

describe('Roles decorator', () => {
  it('sets the roles metadata on the decorated method', () => {
    class TestController {
      @Roles('back_office', 'field_agent')
      method() {}
    }

    const value = Reflect.getMetadata(ROLES_KEY, TestController.prototype.method);

    expect(value).toEqual(['back_office', 'field_agent']);
  });
});
```

- [ ] **Step 5: Rodar e confirmar que falha, depois implementar**

Run: `pnpm --filter api test -- roles.decorator.spec.ts` → FAIL (módulo não existe)

Criar `apps/api/src/auth/roles.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import type { Role } from '../db/schema.js';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

Run: `pnpm --filter api test -- roles.decorator.spec.ts` → PASS

- [ ] **Step 6: Escrever o teste do `@CurrentUser`**

Criar `apps/api/src/auth/current-user.decorator.spec.ts`:

```ts
import type { ExecutionContext } from '@nestjs/common';
import type { AuthTokenPayload } from './auth-token-payload.js';
import { getCurrentUserFromContext } from './current-user.decorator.js';

describe('getCurrentUserFromContext', () => {
  it('returns the user attached to the request by JwtAuthGuard', () => {
    const user: AuthTokenPayload = { sub: '1', phone: '123', role: 'field_agent', name: 'Luana' };
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;

    expect(getCurrentUserFromContext(context)).toBe(user);
  });
});
```

- [ ] **Step 7: Rodar e confirmar que falha, depois implementar**

Run: `pnpm --filter api test -- current-user.decorator.spec.ts` → FAIL (módulo não existe)

Criar `apps/api/src/auth/current-user.decorator.ts`:

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthTokenPayload } from './auth-token-payload.js';

export function getCurrentUserFromContext(ctx: ExecutionContext): AuthTokenPayload {
  const request = ctx.switchToHttp().getRequest<Request & { user: AuthTokenPayload }>();
  return request.user;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  getCurrentUserFromContext(ctx),
);
```

Run: `pnpm --filter api test -- current-user.decorator.spec.ts` → PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth/auth-token-payload.ts apps/api/src/auth/public.decorator.ts apps/api/src/auth/public.decorator.spec.ts apps/api/src/auth/roles.decorator.ts apps/api/src/auth/roles.decorator.spec.ts apps/api/src/auth/current-user.decorator.ts apps/api/src/auth/current-user.decorator.spec.ts
git commit -m "feat(api): add Public, Roles and CurrentUser decorators"
```

---

## Task 9: `AuthService`

**Files:**
- Create: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `DRIZZLE`/`Database` (Task 2), `users` (Task 2), `normalizePhone` (Task 3), `AuthTokenPayload` (Task 8).
- Produces: `AuthService.login(phone: string, password: string): Promise<{ accessToken: string }>` — usado por `AuthController` (Task 12).

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/src/auth/auth.service.spec.ts`:

```ts
import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import type { Database } from '../db/db.module.js';
import { AuthService } from './auth.service.js';

function createMockDb(user: { id: string; phone: string; passwordHash: string; role: 'field_agent' | 'back_office'; name: string } | undefined) {
  const limit = vi.fn().mockResolvedValue(user ? [user] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  return { select } as unknown as Database;
}

describe('AuthService', () => {
  it('returns an access token for correct credentials', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    const db = createMockDb({ id: '1', phone: '123', passwordHash, role: 'back_office', name: 'Bruno' });
    const jwtService = { signAsync: vi.fn().mockResolvedValue('signed-token') } as unknown as JwtService;
    const service = new AuthService(db, jwtService);

    const result = await service.login('123', 'correct-password');

    expect(result).toEqual({ accessToken: 'signed-token' });
    expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: '1', phone: '123', role: 'back_office', name: 'Bruno' });
  });

  it('throws UnauthorizedException when the phone does not exist', async () => {
    const db = createMockDb(undefined);
    const jwtService = { signAsync: vi.fn() } as unknown as JwtService;
    const service = new AuthService(db, jwtService);

    await expect(service.login('000', 'whatever')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when the password is wrong', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    const db = createMockDb({ id: '1', phone: '123', passwordHash, role: 'field_agent', name: 'Luana' });
    const jwtService = { signAsync: vi.fn() } as unknown as JwtService;
    const service = new AuthService(db, jwtService);

    await expect(service.login('123', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter api test -- auth.service.spec.ts`
Expected: FAIL — `Cannot find module './auth.service.js'`

- [ ] **Step 3: Implementar**

Criar `apps/api/src/auth/auth.service.ts`:

```ts
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../db/db.module.js';
import { users } from '../db/schema.js';
import type { AuthTokenPayload } from './auth-token-payload.js';
import { normalizePhone } from './normalize-phone.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwtService: JwtService,
  ) {}

  async login(phone: string, password: string): Promise<{ accessToken: string }> {
    const normalizedPhone = normalizePhone(phone);
    const [user] = await this.db.select().from(users).where(eq(users.phone, normalizedPhone)).limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: AuthTokenPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken };
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter api test -- auth.service.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat(api): add AuthService.login"
```

---

## Task 10: `JwtAuthGuard`

**Files:**
- Create: `apps/api/src/auth/jwt-auth.guard.ts`
- Test: `apps/api/src/auth/jwt-auth.guard.spec.ts`

**Interfaces:**
- Consumes: `IS_PUBLIC_KEY` (Task 8), `AuthTokenPayload` (Task 8).
- Produces: `JwtAuthGuard` (CanActivate), `extractBearerToken(header?: string): string | undefined` — `JwtAuthGuard` usado por `AuthModule` (Task 12); `extractBearerToken` e `JwtAuthGuard` reusados no teste e2e de guards (Task 13).

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/src/auth/jwt-auth.guard.spec.ts`:

```ts
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { extractBearerToken, JwtAuthGuard } from './jwt-auth.guard.js';

function createContext(request: { headers: Record<string, string | undefined>; user?: unknown }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function createGuard(overrides?: { isPublic?: boolean; verifyAsync?: () => Promise<unknown> }) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(overrides?.isPublic ?? false) } as unknown as Reflector;
  const jwtService = {
    verifyAsync: overrides?.verifyAsync ?? vi.fn().mockResolvedValue({ sub: '1', phone: '123', role: 'field_agent', name: 'Luana' }),
  } as unknown as JwtService;

  return new JwtAuthGuard(jwtService, reflector);
}

describe('extractBearerToken', () => {
  it('returns the token when the header is well formed', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns undefined when the header is missing', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it('returns undefined when the scheme is not Bearer', () => {
    expect(extractBearerToken('Basic abc')).toBeUndefined();
  });
});

describe('JwtAuthGuard', () => {
  it('allows access to public routes without checking the token', async () => {
    const guard = createGuard({ isPublic: true });
    const context = createContext({ headers: {} });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('throws when there is no Authorization header', async () => {
    const guard = createGuard();
    const context = createContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when the token is invalid', async () => {
    const guard = createGuard({ verifyAsync: vi.fn().mockRejectedValue(new Error('bad token')) });
    const context = createContext({ headers: { authorization: 'Bearer bad-token' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the decoded payload to the request and allows access', async () => {
    const guard = createGuard();
    const request = { headers: { authorization: 'Bearer good-token' }, user: undefined as unknown };
    const context = createContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: '1', phone: '123', role: 'field_agent', name: 'Luana' });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter api test -- jwt-auth.guard.spec.ts`
Expected: FAIL — `Cannot find module './jwt-auth.guard.js'`

- [ ] **Step 3: Implementar**

Criar `apps/api/src/auth/jwt-auth.guard.ts`:

```ts
import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthTokenPayload } from './auth-token-payload.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

export function extractBearerToken(header?: string): string | undefined {
  if (!header) {
    return undefined;
  }
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthTokenPayload }>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter api test -- jwt-auth.guard.spec.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/jwt-auth.guard.ts apps/api/src/auth/jwt-auth.guard.spec.ts
git commit -m "feat(api): add JwtAuthGuard"
```

---

## Task 11: `RolesGuard`

**Files:**
- Create: `apps/api/src/auth/roles.guard.ts`
- Test: `apps/api/src/auth/roles.guard.spec.ts`

**Interfaces:**
- Consumes: `ROLES_KEY` (Task 8), `AuthTokenPayload` (Task 8).
- Produces: `RolesGuard` (CanActivate) — usado por `AuthModule` (Task 12) e reusado no teste e2e de guards (Task 13).

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/src/auth/roles.guard.spec.ts`:

```ts
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuthTokenPayload } from './auth-token-payload.js';
import { RolesGuard } from './roles.guard.js';

function createContext(user: AuthTokenPayload | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function createGuard(requiredRoles: AuthTokenPayload['role'][] | undefined) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  const backOfficeUser: AuthTokenPayload = { sub: '1', phone: '1', role: 'back_office', name: 'Bruno' };
  const fieldAgentUser: AuthTokenPayload = { sub: '2', phone: '2', role: 'field_agent', name: 'Luana' };

  it('allows access when no roles are required', () => {
    const guard = createGuard(undefined);

    expect(guard.canActivate(createContext(fieldAgentUser))).toBe(true);
  });

  it('allows access when the user has one of the required roles', () => {
    const guard = createGuard(['back_office']);

    expect(guard.canActivate(createContext(backOfficeUser))).toBe(true);
  });

  it('throws when the user role is not among the required roles', () => {
    const guard = createGuard(['back_office']);

    expect(() => guard.canActivate(createContext(fieldAgentUser))).toThrow(ForbiddenException);
  });

  it('throws when there is no authenticated user', () => {
    const guard = createGuard(['back_office']);

    expect(() => guard.canActivate(createContext(undefined))).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter api test -- roles.guard.spec.ts`
Expected: FAIL — `Cannot find module './roles.guard.js'`

- [ ] **Step 3: Implementar**

Criar `apps/api/src/auth/roles.guard.ts`:

```ts
import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthTokenPayload } from './auth-token-payload.js';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AuthTokenPayload['role'][]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthTokenPayload }>();
    const userRole = request.user?.role;

    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException('Forbidden');
    }

    return true;
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter api test -- roles.guard.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/roles.guard.ts apps/api/src/auth/roles.guard.spec.ts
git commit -m "feat(api): add RolesGuard"
```

---

## Task 12: `AuthController`, `AuthModule` e integração com `AppModule`

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/src/auth/auth.module.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes: `AuthService` (Task 9), `LoginDto` (Task 7), `Public` (Task 8), `DbModule` (Task 2), `JwtAuthGuard` (Task 10), `RolesGuard` (Task 11), `loadEnv` (Task 1).
- Produces: `POST /auth/login` funcional na aplicação completa; guards globais ativos em toda rota da API — usado pelos testes e2e (Tasks 13 e 14).

- [ ] **Step 1: Criar o `AuthController`**

Criar `apps/api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() body: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.login(body.phone, body.password);
  }
}
```

- [ ] **Step 2: Criar o `AuthModule`**

Criar `apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '../config/env.js';
import { DbModule } from '../db/db.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [
    DbModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: loadEnv().JWT_SECRET,
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
```

- [ ] **Step 3: Escrever o smoke test de boot do módulo**

Criar `apps/api/src/auth/auth.module.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { AuthModule } from './auth.module.js';

describe('AuthModule', () => {
  it('resolves its dependency graph without errors', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AuthModule] }).compile();
    const app = moduleRef.createNestApplication();

    await app.init();
    await app.close();
  });
});
```

Este teste precisa de `DATABASE_URL` e `JWT_SECRET` no ambiente — o `apps/api/.env` criado na Task 1 já cobre isso (não precisa de Postgres realmente rodando: a conexão do `postgres.js` é lazy, só a string precisa ser válida).

- [ ] **Step 4: Rodar o teste (ainda vai falhar — módulos não existiam antes deste step)**

Run: `pnpm --filter api test -- auth.module.spec.ts`
Expected: PASS assim que os Steps 1 e 2 estiverem salvos (não há passo "red" isolado aqui, pois este teste depende da implementação completa do controller/módulo já escrita acima — confirme rodando agora).

- [ ] **Step 5: Integrar no `AppModule`**

Editar `apps/api/src/app.module.ts` para:

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 6: Marcar a rota raiz como pública**

Com os guards agora globais, `GET /` (rota de "Hello World" já existente) passaria a exigir token. Editar `apps/api/src/app.controller.ts` para:

```ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './auth/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
```

- [ ] **Step 7: Habilitar validação global e usar `loadEnv` no bootstrap**

Editar `apps/api/src/main.ts` para:

```ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(env.PORT);
}
await bootstrap();
```

- [ ] **Step 8: Confirmar que o teste e2e pré-existente ainda passa**

Run: `pnpm --filter api test:integration -- app.e2e-spec.ts`
Expected: PASS — `GET /` continua público e retornando `"Hello World!"`.

(Precisa do Postgres da Task 2 rodando e do `apps/api/.env` preenchido, já que `AppModule` agora carrega `AuthModule`.)

- [ ] **Step 9: Rodar toda a suíte unitária**

Run: `pnpm --filter api test`
Expected: PASS em todos os arquivos `*.spec.ts` criados até aqui.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.module.ts apps/api/src/auth/auth.module.spec.ts apps/api/src/app.module.ts apps/api/src/app.controller.ts apps/api/src/main.ts
git commit -m "feat(api): wire AuthModule into the app with global guards"
```

---

## Task 13: E2E — encadeamento dos guards

**Files:**
- Test: `apps/api/test/guards.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard` (Task 10), `RolesGuard` (Task 11), `Public`/`Roles`/`CurrentUser` (Task 8), `AuthTokenPayload` (Task 8).

Este teste é autocontido: monta seu próprio módulo Nest de teste com um controller descartável, reaproveitando os guards e decorators reais — não depende de banco de dados.

- [ ] **Step 1: Escrever o teste**

Criar `apps/api/test/guards.e2e-spec.ts`:

```ts
import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AuthTokenPayload } from '../src/auth/auth-token-payload.js';
import { CurrentUser } from '../src/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { Public } from '../src/auth/public.decorator.js';
import { Roles } from '../src/auth/roles.decorator.js';
import { RolesGuard } from '../src/auth/roles.guard.js';

const TEST_JWT_SECRET = 'test-secret';

@Controller('test')
class GuardTestController {
  @Public()
  @Get('public')
  getPublic() {
    return { ok: true };
  }

  @Get('protected')
  getProtected(@CurrentUser() user: AuthTokenPayload) {
    return { phone: user.phone };
  }

  @Roles('back_office')
  @Get('back-office-only')
  getBackOfficeOnly() {
    return { ok: true };
  }
}

@Module({
  imports: [JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '1h' } })],
  controllers: [GuardTestController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
class GuardTestModule {}

describe('Guards (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  const fieldAgentPayload: AuthTokenPayload = { sub: 'user-1', phone: '5533900000001', role: 'field_agent', name: 'Luana' };
  const backOfficePayload: AuthTokenPayload = { sub: 'user-2', phone: '5533900000002', role: 'back_office', name: 'Bruno' };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [GuardTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows a @Public() route without a token', () => {
    return request(app.getHttpServer()).get('/test/public').expect(200);
  });

  it('rejects a protected route without a token', () => {
    return request(app.getHttpServer()).get('/test/protected').expect(401);
  });

  it('allows a protected route with a valid token', async () => {
    const token = await jwtService.signAsync(fieldAgentPayload);

    return request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ phone: fieldAgentPayload.phone });
  });

  it('rejects a role-restricted route for the wrong role', async () => {
    const token = await jwtService.signAsync(fieldAgentPayload);

    return request(app.getHttpServer())
      .get('/test/back-office-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows a role-restricted route for the right role', async () => {
    const token = await jwtService.signAsync(backOfficePayload);

    return request(app.getHttpServer())
      .get('/test/back-office-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run: `pnpm --filter api test:integration -- guards.e2e-spec.ts`
Expected: PASS (5 testes)

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/guards.e2e-spec.ts
git commit -m "test(api): add e2e coverage for the guard chain"
```

---

## Task 14: E2E — fluxo de login

**Files:**
- Test: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `AppModule` (Task 12), `loadEnv` (Task 1), `users`/`schema` (Task 2).

Precisa do Postgres da Task 2 rodando, com a migration aplicada, e do `apps/api/.env` preenchido.

- [ ] **Step 1: Escrever o teste**

Criar `apps/api/test/auth.e2e-spec.ts`:

```ts
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { loadEnv } from '../src/config/env.js';
import * as schema from '../src/db/schema.js';

const TEST_USER = {
  name: 'Teste E2E',
  phone: '5533900009999',
  password: 'correct-password',
  role: 'field_agent' as const,
};

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let queryClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    const env = loadEnv();
    queryClient = postgres(env.DATABASE_URL);
    const db = drizzle(queryClient, { schema });

    const passwordHash = await bcrypt.hash(TEST_USER.password, 10);
    await db.delete(schema.users).where(eq(schema.users.phone, TEST_USER.phone));
    await db.insert(schema.users).values({
      name: TEST_USER.name,
      phone: TEST_USER.phone,
      passwordHash,
      role: TEST_USER.role,
    });
  });

  afterAll(async () => {
    const db = drizzle(queryClient, { schema });
    await db.delete(schema.users).where(eq(schema.users.phone, TEST_USER.phone));
    await queryClient.end();
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns an access token for valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: TEST_USER.phone, password: TEST_USER.password })
      .expect(200);

    expect(typeof response.body.accessToken).toBe('string');
  });

  it('rejects an incorrect password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: TEST_USER.phone, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects a phone number that does not exist', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '5533900000000', password: 'whatever12' })
      .expect(401);
  });

  it('rejects a request missing the password field', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: TEST_USER.phone })
      .expect(400);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que passa**

Com o Postgres da Task 2 no ar e migrado:

```bash
pnpm --filter api test:integration -- auth.e2e-spec.ts
```

Expected: PASS (4 testes)

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/auth.e2e-spec.ts
git commit -m "test(api): add e2e coverage for POST /auth/login"
```

---

## Task 15: Atualizar `docs/mvp.md` e verificação final

**Files:**
- Modify: `docs/mvp.md`

- [ ] **Step 1: Adicionar o mapeamento PT/EN na seção 3 (Atores)**

Em `docs/mvp.md`, no título de cada ator (seção 3), adicionar o identificador de código entre parênteses:

```markdown
### Técnico de Campo (`field_agent`)
```

```markdown
### Administrativo (`back_office`)
```

- [ ] **Step 2: Adicionar a nota na seção 6.1 (ERD) e 6.2 (matriz)**

No bloco `USUARIO` do ERD (seção 6.1), adicionar um comentário logo abaixo do bloco `mermaid` (fora do código do diagrama, já que o Mermaid não aceita comentários inline nesse formato):

```markdown
> `perfil` é armazenado no banco como `role`, com os valores `field_agent` (Técnico de Campo) e `back_office` (Administrativo).
```

Na matriz de permissões (seção 6.2), não é necessário alterar as colunas — a nota acima já documenta o mapeamento para quem for ler o schema.

- [ ] **Step 3: Rodar a suíte completa e o lint**

```bash
pnpm turbo build
pnpm turbo lint
pnpm turbo test
pnpm turbo test:integration
pnpm run lint:fix
```

Expected: tudo passa; `lint:fix` não deixa alterações pendentes (rode `git status` depois para confirmar).

- [ ] **Step 4: Commit**

```bash
git add docs/mvp.md
git commit -m "docs: map role enum values to mvp.md actor names"
```
