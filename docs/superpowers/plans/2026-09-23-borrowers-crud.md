# Borrowers CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `borrowers` entity (name + CPF) with a role-aware CRUD API, and introduce `src/shared/` (Role enum, phone and CPF utilities) used by every module.

**Architecture:** New NestJS `BorrowersModule` (controller + service over Drizzle) following the `auth/` module layout. CPF visibility is enforced by pure mapper functions called from the controller with the caller's role. Duplicate CPFs are caught by the DB unique constraint and translated to `409`.

**Tech Stack:** NestJS 12, Drizzle ORM 0.45 (postgres.js), class-validator / class-transformer, vitest + supertest, Biome.

**Spec:** `docs/superpowers/specs/2026-09-23-borrowers-crud-design.md`

## Global Constraints

- All code identifiers in English; ESM imports end in `.js` (NodeNext).
- Role values stay exactly `field_agent` and `back_office` — no DB change to the `role` enum.
- CPF stored as exactly 11 digits (normalized); API accepts masked (`529.982.247-25`) or digits-only.
- `GET /borrowers` never returns `cpf`; `GET /borrowers/:id` returns `cpf` only for `Role.BackOffice`.
- Write routes (`POST`, `PATCH`, `DELETE`) restricted with `@Roles(Role.BackOffice)`.
- Hard delete. No pagination. No `tipo`, `integrantes` or `endereço` fields.
- Tests mirror `src/` under `apps/api/test/`. Unit: `*.spec.ts` (`pnpm --filter api test`). E2E: `*.e2e-spec.ts` (`pnpm --filter api test:integration`, needs Postgres).
- Commit messages: conventional commits (`feat(api): ...`, `refactor(api): ...`, `test(api): ...`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- CPF containing letters or other junk (`"abc529.982.247-25"`) → must be `400`, not silently normalized into a valid CPF. Pinned in Task 3.
- CPF sent as a JSON number (`52998224725`) → `400`, no crash. Pinned in Task 3 (decorator) and Task 5 (DTO).
- Name that is only whitespace (`"   "`) → `400` (trim runs before `@IsNotEmpty`). Pinned in Task 5.
- `PATCH` that re-sends the borrower's own current CPF → `200`, not `409`. Pinned in Task 8 (e2e).
- Client-supplied `id` / `createdAt` in body → stripped by `whitelist: true`, never persisted. Pinned in Task 8 (e2e).

## Prerequisites (once, before Task 1)

- [ ] `pnpm install` at repo root.
- [ ] `cp apps/api/.env.example apps/api/.env` (gitignored; unit test `auth.module.spec.ts` needs `DATABASE_URL`/`JWT_SECRET`).
- [ ] Start Postgres: `docker compose up -d postgres` (repo root), then `pnpm --filter api db:migrate`.
- [ ] Baseline: `pnpm --filter api test` → all pass.

---

### Task 1: Shared `Role` enum

**Files:**
- Create: `apps/api/src/shared/role.enum.ts`
- Modify: `apps/api/src/db/schema.ts`, `apps/api/src/auth/auth-token-payload.ts`, `apps/api/src/auth/decorators/roles.decorator.ts`, `apps/api/src/db/upsert-seed-user.ts`, `apps/api/src/db/seed.ts`
- Test: create `apps/api/test/shared/role.enum.spec.ts`; update `test/auth/auth.service.spec.ts`, `test/auth/auth.e2e-spec.ts`, `test/auth/guards.e2e-spec.ts`, `test/auth/decorators/current-user.decorator.spec.ts`, `test/auth/decorators/roles.decorator.spec.ts`, `test/auth/guards/jwt-auth.guard.spec.ts`, `test/auth/guards/roles.guard.spec.ts`, `test/db/upsert-seed-user.spec.ts`

**Interfaces:**
- Produces: `enum Role { FieldAgent = 'field_agent', BackOffice = 'back_office' }` from `src/shared/role.enum.ts`. `db/schema.ts` no longer exports `Role`.

- [ ] **Step 1: Write the failing test** — `test/shared/role.enum.spec.ts`

```ts
import { roleEnum } from '../../src/db/schema.js';
import { Role } from '../../src/shared/role.enum.js';

describe('Role', () => {
  it('maps to the persisted role values', () => {
    expect(Role.FieldAgent).toBe('field_agent');
    expect(Role.BackOffice).toBe('back_office');
  });

  it('is the source of the database role enum', () => {
    expect([...roleEnum.enumValues].sort()).toEqual(['back_office', 'field_agent']);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test test/shared/role.enum.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

`src/shared/role.enum.ts`:
```ts
export enum Role {
  FieldAgent = 'field_agent',
  BackOffice = 'back_office',
}
```

`src/db/schema.ts` — replace the enum lines:
```ts
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { Role } from '../shared/role.enum.js';

export const roleEnum = pgEnum('role', Role);
```
(remove `export type Role = ...`).

Change `import type { Role } from '../db/schema.js'` → `import type { Role } from '../shared/role.enum.js'` in `auth-token-payload.ts`; same in `roles.decorator.ts` (path `../../shared/role.enum.js`). In `upsert-seed-user.ts`: `import { users } from './schema.js';` and `import type { Role } from '../shared/role.enum.js';`.

`seed.ts`: `import { Role } from '../shared/role.enum.js';` and use `role: Role.BackOffice` / `role: Role.FieldAgent`.

In every test file listed above, import `Role` from `src/shared/role.enum.js` and replace `'back_office'` → `Role.BackOffice`, `'field_agent'` → `Role.FieldAgent` (including `'field_agent' as const` → `Role.FieldAgent`, the `role: 'field_agent' | 'back_office'` type in `auth.service.spec.ts` → `role: Role`, `@Roles('back_office')` → `@Roles(Role.BackOffice)`). In `roles.decorator.spec.ts` the expectation stays `['back_office', 'field_agent']` (runtime values) or use `[Role.BackOffice, Role.FieldAgent]`.

- [ ] **Step 4: Verify** `pnpm --filter api test` → all pass. Then `pnpm --filter api db:generate` → must report **no schema changes** (if it generates a file, delete it and fall back to `pgEnum('role', [Role.FieldAgent, Role.BackOffice])`). `pnpm --filter api lint` → clean.

- [ ] **Step 5: Commit** — `refactor(api): replace role string literals with shared Role enum`

---

### Task 2: Move `normalizePhone` to shared

**Files:**
- Create: `apps/api/src/shared/phone.ts`; Delete: `apps/api/src/auth/normalize-phone.ts`
- Modify: `apps/api/src/auth/auth.service.ts`, `apps/api/src/db/upsert-seed-user.ts`
- Test: `git mv apps/api/test/auth/normalize-phone.spec.ts apps/api/test/shared/phone.spec.ts`

**Interfaces:**
- Produces: `normalizePhone(phone: string): string` from `src/shared/phone.ts`.

- [ ] **Step 1:** `git mv` the spec, change its import to `'../../src/shared/phone.js'`.
- [ ] **Step 2: Run** `pnpm --filter api test test/shared/phone.spec.ts` → FAIL (module not found).
- [ ] **Step 3:** `git mv apps/api/src/auth/normalize-phone.ts apps/api/src/shared/phone.ts` (content unchanged). Update imports: `auth.service.ts` → `'../shared/phone.js'`; `upsert-seed-user.ts` → `'../shared/phone.js'`.
- [ ] **Step 4: Verify** `pnpm --filter api test` and `pnpm --filter api lint` → pass.
- [ ] **Step 5: Commit** — `refactor(api): move normalizePhone to shared`

---

### Task 3: CPF utilities and `@IsCpf()` decorator

**Files:**
- Create: `apps/api/src/shared/cpf.ts`, `apps/api/src/shared/decorators/is-cpf.decorator.ts`
- Test: `apps/api/test/shared/cpf.spec.ts`, `apps/api/test/shared/decorators/is-cpf.decorator.spec.ts`

**Interfaces:**
- Produces: `normalizeCpf(cpf: string): string`, `isValidCpf(cpf: string): boolean`, `IsCpf(options?: ValidationOptions): PropertyDecorator`.

Valid CPFs for tests: `52998224725`, `11144477735`, `12345678909`.

- [ ] **Step 1: Write failing tests**

`test/shared/cpf.spec.ts`:
```ts
import { isValidCpf, normalizeCpf } from '../../src/shared/cpf.js';

describe('normalizeCpf', () => {
  it('strips mask characters', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });

  it('keeps digits-only input unchanged', () => {
    expect(normalizeCpf('52998224725')).toBe('52998224725');
  });
});

describe('isValidCpf', () => {
  it.each(['52998224725', '529.982.247-25', '111.444.777-35', '12345678909', ' 529.982.247-25 '])(
    'accepts %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(true);
    },
  );

  it.each(['52998224724', '52998224715'])('rejects wrong check digits: %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  it.each(['00000000000', '11111111111', '999.999.999-99'])('rejects repeated digits: %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  it.each(['5299822472', '529982247250', ''])('rejects wrong length: %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  it('rejects input with non-mask characters', () => {
    expect(isValidCpf('abc529.982.247-25')).toBe(false);
  });
});
```

`test/shared/decorators/is-cpf.decorator.spec.ts`:
```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsCpf } from '../../../src/shared/decorators/is-cpf.decorator.js';

class Target {
  @IsCpf()
  cpf: unknown;
}

async function errorsFor(cpf: unknown) {
  return validate(plainToInstance(Target, { cpf }));
}

describe('IsCpf', () => {
  it('passes for a valid masked CPF', async () => {
    expect(await errorsFor('529.982.247-25')).toHaveLength(0);
  });

  it('fails for an invalid CPF with a readable message', async () => {
    const [error] = await errorsFor('52998224724');
    expect(error.constraints).toEqual({ isCpf: 'cpf must be a valid CPF' });
  });

  it('fails for a non-string value', async () => {
    expect(await errorsFor(52998224725)).toHaveLength(1);
  });

  it('fails when missing', async () => {
    expect(await errorsFor(undefined)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test test/shared` → FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/shared/cpf.ts`:
```ts
const ALLOWED_CHARACTERS = /^[\d.\-\s]+$/;
const REPEATED_DIGITS = /^(\d)\1{10}$/;

export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

function checkDigit(digits: string): number {
  const firstWeight = digits.length + 1;
  const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (firstWeight - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(cpf: string): boolean {
  if (!ALLOWED_CHARACTERS.test(cpf)) {
    return false;
  }

  const digits = normalizeCpf(cpf);
  if (digits.length !== 11 || REPEATED_DIGITS.test(digits)) {
    return false;
  }

  const firstCheck = checkDigit(digits.slice(0, 9));
  const secondCheck = checkDigit(digits.slice(0, 10));
  return firstCheck === Number(digits[9]) && secondCheck === Number(digits[10]);
}
```

`src/shared/decorators/is-cpf.decorator.ts`:
```ts
import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isValidCpf } from '../cpf.js';

export function IsCpf(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isCpf',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: '$property must be a valid CPF', ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidCpf(value),
      },
    });
  };
}
```

- [ ] **Step 4: Verify** `pnpm --filter api test test/shared` → pass; `pnpm --filter api lint` → clean (run `pnpm lint:fix` at root for formatting).
- [ ] **Step 5: Commit** — `feat(api): add shared CPF normalization, validation and @IsCpf decorator`

---

### Task 4: `borrowers` table and migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/migrations/0001_*.sql` (+ updated `meta/`), generated by drizzle-kit

**Interfaces:**
- Produces: `borrowers` table, `type Borrower`, `type NewBorrower` from `src/db/schema.ts`.

- [ ] **Step 1: Add to `src/db/schema.ts`**

```ts
export const borrowers = pgTable('borrowers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  cpf: text('cpf').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Borrower = typeof borrowers.$inferSelect;
export type NewBorrower = typeof borrowers.$inferInsert;
```

- [ ] **Step 2: Generate** `pnpm --filter api db:generate`. Inspect the new SQL: it must contain only `CREATE TABLE "borrowers"` with the unique constraint on `cpf` — nothing about the `role` type.
- [ ] **Step 3: Apply** `pnpm --filter api db:migrate` → succeeds.
- [ ] **Step 4: Verify** `pnpm --filter api test` → pass.
- [ ] **Step 5: Commit** — `feat(api): add borrowers table`

---

### Task 5: Borrower DTOs

**Files:**
- Create: `apps/api/src/borrowers/dto/create-borrower.dto.ts`, `apps/api/src/borrowers/dto/update-borrower.dto.ts`
- Test: `apps/api/test/borrowers/dto/create-borrower.dto.spec.ts`, `apps/api/test/borrowers/dto/update-borrower.dto.spec.ts`

**Interfaces:**
- Consumes: `IsCpf` (Task 3).
- Produces: `class CreateBorrowerDto { name: string; cpf: string }`, `class UpdateBorrowerDto { name?: string; cpf?: string }`.

- [ ] **Step 1: Write failing tests**

`create-borrower.dto.spec.ts`:
```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBorrowerDto } from '../../../src/borrowers/dto/create-borrower.dto.js';

async function errorProperties(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(CreateBorrowerDto, body));
  return errors.map((error) => error.property);
}

describe('CreateBorrowerDto', () => {
  it('accepts a name and a valid CPF', async () => {
    expect(await errorProperties({ name: 'Maria', cpf: '529.982.247-25' })).toEqual([]);
  });

  it('trims the name', () => {
    const dto = plainToInstance(CreateBorrowerDto, { name: '  Maria  ', cpf: '52998224725' });
    expect(dto.name).toBe('Maria');
  });

  it('rejects a whitespace-only name', async () => {
    expect(await errorProperties({ name: '   ', cpf: '52998224725' })).toEqual(['name']);
  });

  it('rejects a missing name', async () => {
    expect(await errorProperties({ cpf: '52998224725' })).toEqual(['name']);
  });

  it('rejects a missing CPF', async () => {
    expect(await errorProperties({ name: 'Maria' })).toEqual(['cpf']);
  });

  it('rejects an invalid CPF', async () => {
    expect(await errorProperties({ name: 'Maria', cpf: '52998224724' })).toEqual(['cpf']);
  });

  it('rejects a numeric CPF', async () => {
    expect(await errorProperties({ name: 'Maria', cpf: 52998224725 })).toEqual(['cpf']);
  });
});
```

`update-borrower.dto.spec.ts`:
```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBorrowerDto } from '../../../src/borrowers/dto/update-borrower.dto.js';

async function errorProperties(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(UpdateBorrowerDto, body));
  return errors.map((error) => error.property);
}

describe('UpdateBorrowerDto', () => {
  it('accepts an empty body', async () => {
    expect(await errorProperties({})).toEqual([]);
  });

  it('accepts only a name', async () => {
    expect(await errorProperties({ name: 'Maria' })).toEqual([]);
  });

  it('accepts only a valid CPF', async () => {
    expect(await errorProperties({ cpf: '111.444.777-35' })).toEqual([]);
  });

  it('rejects a whitespace-only name', async () => {
    expect(await errorProperties({ name: '   ' })).toEqual(['name']);
  });

  it('rejects an invalid CPF', async () => {
    expect(await errorProperties({ cpf: '11144477736' })).toEqual(['cpf']);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test test/borrowers/dto` → FAIL.

- [ ] **Step 3: Implement**

`create-borrower.dto.ts`:
```ts
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsCpf } from '../../shared/decorators/is-cpf.decorator.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBorrowerDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsCpf()
  cpf: string;
}
```

`update-borrower.dto.ts`:
```ts
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsCpf } from '../../shared/decorators/is-cpf.decorator.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateBorrowerDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsCpf()
  cpf?: string;
}
```

- [ ] **Step 4: Verify** `pnpm --filter api test test/borrowers/dto` → pass; lint clean.
- [ ] **Step 5: Commit** — `feat(api): add borrower DTOs`

---

### Task 6: Response mappers

**Files:**
- Create: `apps/api/src/borrowers/borrower-response.ts`
- Test: `apps/api/test/borrowers/borrower-response.spec.ts`

**Interfaces:**
- Consumes: `Borrower` (Task 4), `Role` (Task 1).
- Produces:
  - `interface BorrowerListItem { id: string; name: string }`
  - `interface BorrowerResponse { id: string; name: string; cpf?: string; createdAt: Date; updatedAt: Date }`
  - `toBorrowerListItem(borrower: Borrower): BorrowerListItem`
  - `toBorrowerResponse(borrower: Borrower, role: Role): BorrowerResponse`

- [ ] **Step 1: Write failing test**

```ts
import { toBorrowerListItem, toBorrowerResponse } from '../../src/borrowers/borrower-response.js';
import type { Borrower } from '../../src/db/schema.js';
import { Role } from '../../src/shared/role.enum.js';

const borrower: Borrower = {
  id: '5f0c2c1e-6c5b-4c1a-9a57-2f1d8a1b9c11',
  name: 'Maria',
  cpf: '52998224725',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-02T00:00:00Z'),
};

describe('toBorrowerResponse', () => {
  it('includes the CPF for back office', () => {
    expect(toBorrowerResponse(borrower, Role.BackOffice)).toEqual(borrower);
  });

  it('omits the CPF for field agents', () => {
    const response = toBorrowerResponse(borrower, Role.FieldAgent);
    expect(response).toEqual({
      id: borrower.id,
      name: 'Maria',
      createdAt: borrower.createdAt,
      updatedAt: borrower.updatedAt,
    });
    expect(response).not.toHaveProperty('cpf');
  });
});

describe('toBorrowerListItem', () => {
  it('returns only id and name', () => {
    expect(toBorrowerListItem(borrower)).toEqual({ id: borrower.id, name: 'Maria' });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test test/borrowers/borrower-response.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
import type { Borrower } from '../db/schema.js';
import { Role } from '../shared/role.enum.js';

export interface BorrowerListItem {
  id: string;
  name: string;
}

export interface BorrowerResponse {
  id: string;
  name: string;
  cpf?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toBorrowerListItem(borrower: Borrower): BorrowerListItem {
  return { id: borrower.id, name: borrower.name };
}

export function toBorrowerResponse(borrower: Borrower, role: Role): BorrowerResponse {
  const response: BorrowerResponse = {
    id: borrower.id,
    name: borrower.name,
    createdAt: borrower.createdAt,
    updatedAt: borrower.updatedAt,
  };
  if (role === Role.BackOffice) {
    response.cpf = borrower.cpf;
  }
  return response;
}
```

- [ ] **Step 4: Verify** → pass; lint clean.
- [ ] **Step 5: Commit** — `feat(api): add role-aware borrower response mappers`

---

### Task 7: `BorrowersService`

**Files:**
- Create: `apps/api/src/db/is-unique-violation.ts`, `apps/api/src/borrowers/borrowers.service.ts`
- Test: `apps/api/test/db/is-unique-violation.spec.ts`, `apps/api/test/borrowers/borrowers.service.spec.ts`

**Interfaces:**
- Consumes: `DRIZZLE`, `Database` (`src/db/db.module.ts`), `borrowers`, `Borrower`, `NewBorrower` (Task 4), `normalizeCpf` (Task 3), DTOs (Task 5).
- Produces: `isUniqueViolation(error: unknown): boolean`; `BorrowersService` with
  - `create(input: CreateBorrowerDto): Promise<Borrower>`
  - `findAll(): Promise<Borrower[]>` (ordered by name asc)
  - `findOne(id: string): Promise<Borrower>`
  - `update(id: string, input: UpdateBorrowerDto): Promise<Borrower>`
  - `remove(id: string): Promise<void>`
  - Throws `NotFoundException('Borrower not found')` and `ConflictException('Borrower with this CPF already exists')`.

- [ ] **Step 1: Write failing tests**

`test/db/is-unique-violation.spec.ts`:
```ts
import { isUniqueViolation } from '../../src/db/is-unique-violation.js';

describe('isUniqueViolation', () => {
  it('detects a raw postgres unique violation', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('detects a unique violation wrapped in cause', () => {
    expect(isUniqueViolation(new Error('Failed query', { cause: { code: '23505' } }))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
```

`test/borrowers/borrowers.service.spec.ts`:
```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BorrowersService } from '../../src/borrowers/borrowers.service.js';
import type { Database } from '../../src/db/db.module.js';
import type { Borrower } from '../../src/db/schema.js';

const borrower: Borrower = {
  id: '5f0c2c1e-6c5b-4c1a-9a57-2f1d8a1b9c11',
  name: 'Maria',
  cpf: '52998224725',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const uniqueViolation = new Error('Failed query', { cause: { code: '23505' } });

function createInsertDb(result: Promise<Borrower[]>) {
  const returning = vi.fn().mockReturnValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  return { db: { insert } as unknown as Database, values };
}

function createSelectDb(rows: Borrower[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const orderBy = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where, orderBy });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select } as unknown as Database, orderBy };
}

function createUpdateDb(result: Promise<Borrower[]>) {
  const returning = vi.fn().mockReturnValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return { db: { update } as unknown as Database, update, set };
}

function createDeleteDb(rows: { id: string }[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const del = vi.fn().mockReturnValue({ where });
  return { db: { delete: del } as unknown as Database };
}

describe('BorrowersService', () => {
  describe('create', () => {
    it('stores the normalized CPF and returns the borrower', async () => {
      const { db, values } = createInsertDb(Promise.resolve([borrower]));
      const service = new BorrowersService(db);

      const result = await service.create({ name: 'Maria', cpf: '529.982.247-25' });

      expect(values).toHaveBeenCalledWith({ name: 'Maria', cpf: '52998224725' });
      expect(result).toBe(borrower);
    });

    it('throws ConflictException on duplicate CPF', async () => {
      const { db } = createInsertDb(Promise.reject(uniqueViolation));
      const service = new BorrowersService(db);

      await expect(service.create({ name: 'Maria', cpf: '52998224725' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rethrows unrelated errors', async () => {
      const boom = new Error('boom');
      const { db } = createInsertDb(Promise.reject(boom));
      const service = new BorrowersService(db);

      await expect(service.create({ name: 'Maria', cpf: '52998224725' })).rejects.toBe(boom);
    });
  });

  describe('findAll', () => {
    it('returns borrowers ordered by name', async () => {
      const { db, orderBy } = createSelectDb([borrower]);
      const service = new BorrowersService(db);

      expect(await service.findAll()).toEqual([borrower]);
      expect(orderBy).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the borrower', async () => {
      const service = new BorrowersService(createSelectDb([borrower]).db);
      expect(await service.findOne(borrower.id)).toBe(borrower);
    });

    it('throws NotFoundException when missing', async () => {
      const service = new BorrowersService(createSelectDb([]).db);
      await expect(service.findOne(borrower.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates only the provided fields, normalizing the CPF', async () => {
      const { db, set } = createUpdateDb(Promise.resolve([borrower]));
      const service = new BorrowersService(db);

      await service.update(borrower.id, { cpf: '529.982.247-25' });

      expect(set).toHaveBeenCalledWith({ cpf: '52998224725' });
    });

    it('returns the current borrower without writing when the body is empty', async () => {
      const selectDb = createSelectDb([borrower]);
      const { update } = createUpdateDb(Promise.resolve([]));
      const db = { ...selectDb.db, update } as unknown as Database;
      const service = new BorrowersService(db);

      expect(await service.update(borrower.id, {})).toBe(borrower);
      expect(update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when missing', async () => {
      const service = new BorrowersService(createUpdateDb(Promise.resolve([])).db);
      await expect(service.update(borrower.id, { name: 'Ana' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ConflictException on duplicate CPF', async () => {
      const service = new BorrowersService(createUpdateDb(Promise.reject(uniqueViolation)).db);
      await expect(service.update(borrower.id, { cpf: '52998224725' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('resolves when a row was deleted', async () => {
      const service = new BorrowersService(createDeleteDb([{ id: borrower.id }]).db);
      await expect(service.remove(borrower.id)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when missing', async () => {
      const service = new BorrowersService(createDeleteDb([]).db);
      await expect(service.remove(borrower.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test test/borrowers/borrowers.service.spec.ts test/db/is-unique-violation.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

`src/db/is-unique-violation.ts`:
```ts
const UNIQUE_VIOLATION = '23505';

function hasUniqueViolationCode(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { code?: unknown }).code === UNIQUE_VIOLATION;
}

export function isUniqueViolation(error: unknown): boolean {
  if (hasUniqueViolationCode(error)) {
    return true;
  }
  return error instanceof Error && hasUniqueViolationCode(error.cause);
}
```

`src/borrowers/borrowers.service.ts`:
```ts
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../db/db.module.js';
import { DRIZZLE } from '../db/db.module.js';
import { isUniqueViolation } from '../db/is-unique-violation.js';
import { type Borrower, borrowers, type NewBorrower } from '../db/schema.js';
import { normalizeCpf } from '../shared/cpf.js';
import type { CreateBorrowerDto } from './dto/create-borrower.dto.js';
import type { UpdateBorrowerDto } from './dto/update-borrower.dto.js';

function rethrowAsConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictException('Borrower with this CPF already exists');
  }
  throw error;
}

@Injectable()
export class BorrowersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(input: CreateBorrowerDto): Promise<Borrower> {
    try {
      const [borrower] = await this.db
        .insert(borrowers)
        .values({ name: input.name, cpf: normalizeCpf(input.cpf) })
        .returning();
      return borrower;
    } catch (error) {
      rethrowAsConflict(error);
    }
  }

  findAll(): Promise<Borrower[]> {
    return this.db.select().from(borrowers).orderBy(asc(borrowers.name));
  }

  async findOne(id: string): Promise<Borrower> {
    const [borrower] = await this.db.select().from(borrowers).where(eq(borrowers.id, id)).limit(1);
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }
    return borrower;
  }

  async update(id: string, input: UpdateBorrowerDto): Promise<Borrower> {
    const changes: Partial<NewBorrower> = {};
    if (input.name !== undefined) {
      changes.name = input.name;
    }
    if (input.cpf !== undefined) {
      changes.cpf = normalizeCpf(input.cpf);
    }
    if (Object.keys(changes).length === 0) {
      return this.findOne(id);
    }

    let updated: Borrower | undefined;
    try {
      [updated] = await this.db.update(borrowers).set(changes).where(eq(borrowers.id, id)).returning();
    } catch (error) {
      rethrowAsConflict(error);
    }
    if (!updated) {
      throw new NotFoundException('Borrower not found');
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    const [deleted] = await this.db
      .delete(borrowers)
      .where(eq(borrowers.id, id))
      .returning({ id: borrowers.id });
    if (!deleted) {
      throw new NotFoundException('Borrower not found');
    }
  }
}
```

- [ ] **Step 4: Verify** → pass; lint clean.
- [ ] **Step 5: Commit** — `feat(api): add BorrowersService`

---

### Task 8: Controller, module wiring and e2e

**Files:**
- Create: `apps/api/src/borrowers/borrowers.controller.ts`, `apps/api/src/borrowers/borrowers.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/borrowers/borrowers.e2e-spec.ts`

**Interfaces:**
- Consumes: `BorrowersService` (Task 7), mappers (Task 6), DTOs (Task 5), `Role` (Task 1), `Roles`, `CurrentUser`, `AuthTokenPayload` (auth).
- Produces: HTTP routes per spec §8.

- [ ] **Step 1: Write failing e2e** — `test/borrowers/borrowers.e2e-spec.ts`

```ts
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module.js';
import type { AuthTokenPayload } from '../../src/auth/auth-token-payload.js';
import { loadEnv } from '../../src/config/env.js';
import type { Database } from '../../src/db/db.module.js';
import * as schema from '../../src/db/schema.js';
import { Role } from '../../src/shared/role.enum.js';

const CPF_A = '52998224725';
const CPF_B = '11144477735';
const TEST_CPFS = [CPF_A, CPF_B];
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('BorrowersController (e2e)', () => {
  let app: INestApplication<App>;
  let queryClient: ReturnType<typeof postgres>;
  let db: Database;
  let backOfficeToken: string;
  let fieldAgentToken: string;

  const cleanUp = () => db.delete(schema.borrowers).where(inArray(schema.borrowers.cpf, TEST_CPFS));

  beforeAll(async () => {
    const env = loadEnv();
    queryClient = postgres(env.DATABASE_URL);
    db = drizzle(queryClient, { schema });

    const jwt = new JwtService({ secret: env.JWT_SECRET });
    const payload = (role: Role): AuthTokenPayload => ({ sub: 'e2e', phone: '0', role, name: 'E2E' });
    backOfficeToken = await jwt.signAsync(payload(Role.BackOffice));
    fieldAgentToken = await jwt.signAsync(payload(Role.FieldAgent));
  });

  afterAll(async () => {
    await cleanUp();
    await queryClient.end();
  });

  beforeEach(async () => {
    await cleanUp();
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

  const asBackOffice = (req: request.Test) => req.set('Authorization', `Bearer ${backOfficeToken}`);
  const asFieldAgent = (req: request.Test) => req.set('Authorization', `Bearer ${fieldAgentToken}`);

  async function createBorrower(body: Record<string, unknown> = { name: 'Maria', cpf: '529.982.247-25' }) {
    const response = await asBackOffice(request(app.getHttpServer()).post('/borrowers')).send(body).expect(201);
    return response.body as { id: string; name: string; cpf: string };
  }

  it('creates a borrower with a normalized CPF', async () => {
    const created = await createBorrower();
    expect(created).toMatchObject({ name: 'Maria', cpf: CPF_A });
    expect(typeof created.id).toBe('string');
  });

  it('ignores client-supplied id and createdAt', async () => {
    const created = await createBorrower({ name: 'Maria', cpf: CPF_A, id: MISSING_ID, createdAt: '2000-01-01' });
    expect(created.id).not.toBe(MISSING_ID);
    expect(new Date((created as unknown as { createdAt: string }).createdAt).getFullYear()).not.toBe(2000);
  });

  it('rejects an invalid CPF with 400', async () => {
    await asBackOffice(request(app.getHttpServer()).post('/borrowers'))
      .send({ name: 'Maria', cpf: '52998224724' })
      .expect(400);
  });

  it('rejects a duplicate CPF with 409', async () => {
    await createBorrower();
    await asBackOffice(request(app.getHttpServer()).post('/borrowers'))
      .send({ name: 'Outra', cpf: CPF_A })
      .expect(409);
  });

  it('forbids field agents from creating', async () => {
    await asFieldAgent(request(app.getHttpServer()).post('/borrowers'))
      .send({ name: 'Maria', cpf: CPF_A })
      .expect(403);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/borrowers').expect(401);
  });

  it('lists borrowers without CPF, for both roles', async () => {
    await createBorrower();
    for (const as of [asBackOffice, asFieldAgent]) {
      const response = await as(request(app.getHttpServer()).get('/borrowers')).expect(200);
      const item = response.body.find((b: { name: string }) => b.name === 'Maria');
      expect(Object.keys(item).sort()).toEqual(['id', 'name']);
    }
  });

  it('shows CPF on detail only to back office', async () => {
    const { id } = await createBorrower();

    const backOffice = await asBackOffice(request(app.getHttpServer()).get(`/borrowers/${id}`)).expect(200);
    expect(backOffice.body.cpf).toBe(CPF_A);

    const fieldAgent = await asFieldAgent(request(app.getHttpServer()).get(`/borrowers/${id}`)).expect(200);
    expect(fieldAgent.body).not.toHaveProperty('cpf');
    expect(fieldAgent.body.name).toBe('Maria');
  });

  it('returns 404 for a missing borrower and 400 for a non-UUID id', async () => {
    await asBackOffice(request(app.getHttpServer()).get(`/borrowers/${MISSING_ID}`)).expect(404);
    await asBackOffice(request(app.getHttpServer()).get('/borrowers/not-a-uuid')).expect(400);
  });

  it('updates name and CPF', async () => {
    const { id } = await createBorrower();
    const response = await asBackOffice(request(app.getHttpServer()).patch(`/borrowers/${id}`))
      .send({ name: 'Maria Silva', cpf: '111.444.777-35' })
      .expect(200);
    expect(response.body).toMatchObject({ id, name: 'Maria Silva', cpf: CPF_B });
  });

  it('allows re-sending the same CPF on update', async () => {
    const { id } = await createBorrower();
    await asBackOffice(request(app.getHttpServer()).patch(`/borrowers/${id}`))
      .send({ cpf: '529.982.247-25' })
      .expect(200);
  });

  it('rejects updating to another borrower CPF with 409', async () => {
    await createBorrower();
    const other = await createBorrower({ name: 'Ana', cpf: CPF_B });
    await asBackOffice(request(app.getHttpServer()).patch(`/borrowers/${other.id}`))
      .send({ cpf: CPF_A })
      .expect(409);
  });

  it('forbids field agents from updating and deleting', async () => {
    const { id } = await createBorrower();
    await asFieldAgent(request(app.getHttpServer()).patch(`/borrowers/${id}`)).send({ name: 'X' }).expect(403);
    await asFieldAgent(request(app.getHttpServer()).delete(`/borrowers/${id}`)).expect(403);
  });

  it('deletes a borrower, then returns 404', async () => {
    const { id } = await createBorrower();
    await asBackOffice(request(app.getHttpServer()).delete(`/borrowers/${id}`)).expect(204);
    await asBackOffice(request(app.getHttpServer()).get(`/borrowers/${id}`)).expect(404);
    await asBackOffice(request(app.getHttpServer()).delete(`/borrowers/${id}`)).expect(404);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test:integration test/borrowers` → FAIL (404 on every route).

- [ ] **Step 3: Implement**

`src/borrowers/borrowers.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth-token-payload.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../shared/role.enum.js';
import {
  type BorrowerListItem,
  type BorrowerResponse,
  toBorrowerListItem,
  toBorrowerResponse,
} from './borrower-response.js';
import { BorrowersService } from './borrowers.service.js';
import { CreateBorrowerDto } from './dto/create-borrower.dto.js';
import { UpdateBorrowerDto } from './dto/update-borrower.dto.js';

@Controller('borrowers')
export class BorrowersController {
  constructor(private readonly borrowersService: BorrowersService) {}

  @Roles(Role.BackOffice)
  @Post()
  async create(
    @Body() body: CreateBorrowerDto,
    @CurrentUser() user: AuthTokenPayload,
  ): Promise<BorrowerResponse> {
    return toBorrowerResponse(await this.borrowersService.create(body), user.role);
  }

  @Get()
  async findAll(): Promise<BorrowerListItem[]> {
    const borrowers = await this.borrowersService.findAll();
    return borrowers.map(toBorrowerListItem);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
  ): Promise<BorrowerResponse> {
    return toBorrowerResponse(await this.borrowersService.findOne(id), user.role);
  }

  @Roles(Role.BackOffice)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBorrowerDto,
    @CurrentUser() user: AuthTokenPayload,
  ): Promise<BorrowerResponse> {
    return toBorrowerResponse(await this.borrowersService.update(id, body), user.role);
  }

  @Roles(Role.BackOffice)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.borrowersService.remove(id);
  }
}
```

`src/borrowers/borrowers.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { BorrowersController } from './borrowers.controller.js';
import { BorrowersService } from './borrowers.service.js';

@Module({
  imports: [DbModule],
  controllers: [BorrowersController],
  providers: [BorrowersService],
})
export class BorrowersModule {}
```

`src/app.module.ts`: add `import { BorrowersModule } from './borrowers/borrowers.module.js';` and `imports: [AuthModule, BorrowersModule]`.

- [ ] **Step 4: Verify** `pnpm --filter api test:integration` (all e2e, including auth) → pass; `pnpm --filter api test` → pass; `pnpm --filter api lint` → clean; `pnpm --filter api build` → succeeds.
- [ ] **Step 5: Commit** — `feat(api): add borrowers CRUD endpoints`
