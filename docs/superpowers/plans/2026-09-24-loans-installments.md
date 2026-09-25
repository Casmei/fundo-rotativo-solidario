# Loans & Installments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let back office register a loan for an existing borrower under a fund's current rules, automatically generating its installments, and let both roles read loans and funds.

**Architecture:** Fund rules live in immutable `fund_versions` rows; a loan references the version that was current at creation (the FK is the snapshot). All money/date math is in pure functions (`shared/calendar-date.ts`, `loans/installment-schedule.ts`, `loans/loan-terms.ts`) tested exhaustively without Nest or a DB. `FundsService` / `LoansService` are thin Drizzle orchestration tested against real Postgres; controllers map to response shapes via pure mappers.

**Tech Stack:** NestJS 12, Drizzle ORM 0.45 (postgres.js), class-validator / class-transformer, vitest 4 + supertest, Biome.

**Spec:** `docs/superpowers/specs/2026-09-24-loans-installments-design.md`

## Global Constraints

- Code identifiers and API error messages in English; ESM imports end in `.js` (NodeNext).
- Money is always integer **cents**; rates are integer **basis points** (`500` = 5%); no floats in money math.
- Calendar dates are `'YYYY-MM-DD'` strings end to end (DB `date` in string mode). Never build a JS `Date` from a calendar date.
- Not stored, always derived: loan total (sum of installments), installment count, loan status, `fund_id` on the loan.
- `fund_versions` is insert-only. No route updates or deletes versions.
- Status codes: body malformed `400`; no token `401`; `field_agent` on `POST /loans` `403`; missing borrower/fund/loan `404`; fund rule violation or fund without version `422`; `DELETE /borrowers/:id` with loans `409 "Borrower has loans"`.
- Tests mirror `src/` under `apps/api/test/`. Unit: `*.spec.ts` → `pnpm --filter api test [file]`. Against Postgres: `*.e2e-spec.ts` → `pnpm --filter api test:integration [file]`.
- Integration test files run **in parallel against one shared DB**: every test creates its own rows through `LoanFixtures` (random CPFs, random fund names) and never asserts on whole-table contents.
- Before every commit: `pnpm --filter api exec tsc --noEmit -p tsconfig.json` (vitest does not type-check) and `pnpm --filter api lint` must pass. Use `pnpm --filter api format` to fix formatting.
- Commits: conventional (`feat(api): ...`, `test(api): ...`, `refactor(api): ...`), message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deviations from the spec (decided while planning)

- **Service tests hit real Postgres** (`*.service.e2e-spec.ts`) instead of a mocked `db`. Those services are mostly queries (joins, `DISTINCT ON`, aggregates); chained Drizzle mocks would only restate the implementation. The atomicity test lives at service level, using a proxied transaction that fails on the installments insert — deterministic and not fragile.
- `FundsService.findCurrentVersion(fundId)` is named `findWithCurrentVersion(fundId)` because it returns `{ fund, currentVersion }`.
- `principalCents` also gets `@Max(1_000_000_000)` (R$ 10 milhões) so amounts stay inside Postgres `integer`; without it an absurd value becomes a `500`.
- If the borrower is deleted between the lookup and the insert (FK `23503` on insert), `POST /loans` answers `404 "Borrower not found"` instead of `500`.

## Review Focus

- `principalCents` huge (`1_000_000_001`, or larger than Postgres `integer`) → `400`, not a `500` from an integer overflow. Pinned in Task 8 (DTO) and Task 10 (e2e).
- `disbursedAt` with time/timezone (`"2026-01-31T03:00:00Z"`) → `400`; never silently shifted to another day. Pinned in Task 1 and Task 8.
- Numbers sent as strings (`"320000"`, `"3"`) → `400`; `ValidationPipe` has no implicit conversion. Pinned in Task 8 and Task 10.
- Borrower deleted concurrently while a loan is being created → `404`, no orphan loan, no `500`. Pinned in Task 9.
- Client-supplied `totalCents`, `fundVersionId`, `installments`, `id` in the body → ignored (`whitelist`), values always computed server-side. Pinned in Task 10.

## Prerequisites (once, before Task 1)

- [ ] Postgres running and migrated (the Superset setup already does it): `docker compose -p frs up -d --wait postgres && pnpm --filter api db:migrate`.
- [ ] Baseline green: `pnpm --filter api test` (100 passed), `pnpm --filter api test:integration` (25 passed), `pnpm --filter api exec tsc --noEmit -p tsconfig.json` (no output).

## File map

```
apps/api/src/
  shared/calendar-date.ts                      T1  isCalendarDate, addMonthsClamped
  shared/decorators/is-calendar-date.decorator.ts T1  @IsCalendarDate()
  loans/installment-schedule.ts                T2  calculateTotalCents, buildInstallmentSchedule
  loans/loan-terms.ts                          T3  LoanPolicy, LoanTerms, LoanPolicyViolation, assertTermsWithinPolicy
  db/has-postgres-error-code.ts                T4  hasPostgresErrorCode
  db/is-unique-violation.ts                    T4  (refactored onto the helper)
  db/is-foreign-key-violation.ts               T4  isForeignKeyViolation
  borrowers/borrowers.service.ts               T4  remove(): 23503 → 409
  loans/installment-status.enum.ts             T5  InstallmentStatus
  db/schema.ts                                 T5  funds, fund_versions, loans, installments
  db/migrations/0002_*.sql                     T5  generated
  db/upsert-seed-fund.ts                       T6  upsertSeedFund
  db/seed.ts                                   T6  + FRSBJ fund v1
  funds/{funds.module,funds.service,funds.controller,fund-response}.ts   T7
  loans/dto/create-loan.dto.ts                 T8
  loans/loan-response.ts                       T8  LoanDetails, LoanSummary, mappers
  loans/loans.service.ts                       T9
  loans/{loans.controller,loans.module}.ts     T10
  app.module.ts                                T7, T10
apps/api/test/
  support/test-db.ts, support/loan-fixtures.ts T5  shared integration helpers
  support/e2e-app.ts                           T7  Nest app + JWT tokens for HTTP e2e
```

---

### Task 1: Calendar dates (`shared/calendar-date.ts`) and `@IsCalendarDate()`

**Files:**
- Create: `apps/api/src/shared/calendar-date.ts`
- Create: `apps/api/src/shared/decorators/is-calendar-date.decorator.ts`
- Test: `apps/api/test/shared/calendar-date.spec.ts`
- Test: `apps/api/test/shared/decorators/is-calendar-date.decorator.spec.ts`

**Interfaces:**
- Produces: `isCalendarDate(value: unknown): value is string`; `addMonthsClamped(date: string, months: number): string` (throws `RangeError` on invalid date or months not a non-negative integer); `IsCalendarDate(options?: ValidationOptions): PropertyDecorator` with message `"$property must be a valid date in YYYY-MM-DD format"`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/shared/calendar-date.spec.ts`:
```ts
import { addMonthsClamped, isCalendarDate } from '../../src/shared/calendar-date.js';

describe('isCalendarDate', () => {
  it.each([
    '2026-01-31',
    '2024-02-29',
    '2000-02-29',
    '2026-12-01',
    '0001-01-01',
  ])('accepts %s', (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '0000-01-01',
    '2026-1-01',
    '2026-01-1',
    '26-01-01',
    '2026/01/01',
    '2026-01-31T00:00:00Z',
    '2026-01-31T03:00:00-03:00',
    '2026-01-01 ',
    ' 2026-01-01',
    '',
  ])('rejects %j', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });

  it.each([undefined, null, 20260131, new Date('2026-01-31'), {}])(
    'rejects the non-string %o',
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );
});

describe('addMonthsClamped', () => {
  it.each([
    ['2026-01-15', 0, '2026-01-15'],
    ['2026-01-15', 1, '2026-02-15'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-01-31', 2, '2026-03-31'],
    ['2026-01-31', 3, '2026-04-30'],
    ['2026-01-30', 1, '2026-02-28'],
    ['2026-01-29', 1, '2026-02-28'],
    ['2028-01-29', 1, '2028-02-29'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2026-12-31', 1, '2027-01-31'],
    ['2026-08-31', 6, '2027-02-28'],
    ['2024-02-29', 12, '2025-02-28'],
    ['2024-02-29', 48, '2028-02-29'],
    ['2026-03-10', 25, '2028-04-10'],
  ])('%s + %i months = %s', (date, months, expected) => {
    expect(addMonthsClamped(date, months)).toBe(expected);
  });

  it('anchors on the original day instead of chaining from the clamped month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('throws on an invalid date', () => {
    expect(() => addMonthsClamped('2026-02-30', 1)).toThrow(RangeError);
  });

  it.each([-1, 1.5, Number.NaN])('throws on months = %s', (months) => {
    expect(() => addMonthsClamped('2026-01-31', months)).toThrow(RangeError);
  });
});
```

`apps/api/test/shared/decorators/is-calendar-date.decorator.spec.ts`:
```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsCalendarDate } from '../../../src/shared/decorators/is-calendar-date.decorator.js';

class Target {
  @IsCalendarDate()
  date: unknown;
}

async function errorsFor(date: unknown) {
  return validate(plainToInstance(Target, { date }));
}

describe('IsCalendarDate', () => {
  it('passes for a real calendar date', async () => {
    expect(await errorsFor('2026-01-31')).toHaveLength(0);
  });

  it('fails for an impossible date with a readable message', async () => {
    const [error] = await errorsFor('2026-02-30');
    expect(error.constraints).toEqual({
      isCalendarDate: 'date must be a valid date in YYYY-MM-DD format',
    });
  });

  it('fails for a date with time', async () => {
    expect(await errorsFor('2026-01-31T00:00:00Z')).toHaveLength(1);
  });

  it('fails for a non-string value', async () => {
    expect(await errorsFor(20260131)).toHaveLength(1);
  });

  it('fails when missing', async () => {
    expect(await errorsFor(undefined)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter api test test/shared/calendar-date.spec.ts test/shared/decorators/is-calendar-date.decorator.spec.ts`
Expected: FAIL — cannot resolve `../../src/shared/calendar-date.js`.

- [ ] **Step 3: Implement**

`apps/api/src/shared/calendar-date.ts`:
```ts
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

function parseCalendarDate(value: string): CalendarDateParts | null {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

function formatCalendarDate({ year, month, day }: CalendarDateParts): string {
  const pad = (value: number, length: number) => String(value).padStart(length, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function isCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && parseCalendarDate(value) !== null;
}

export function addMonthsClamped(date: string, months: number): string {
  const parts = parseCalendarDate(date);
  if (!parts) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  if (!Number.isInteger(months) || months < 0) {
    throw new RangeError(`months must be a non-negative integer, got ${months}`);
  }
  const monthIndex = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return formatCalendarDate({ year, month, day: Math.min(parts.day, daysInMonth(year, month)) });
}
```

`apps/api/src/shared/decorators/is-calendar-date.decorator.ts`:
```ts
import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isCalendarDate } from '../calendar-date.js';

export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: '$property must be a valid date in YYYY-MM-DD format', ...options },
      validator: {
        validate: (value: unknown) => isCalendarDate(value),
      },
    });
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter api test test/shared/calendar-date.spec.ts test/shared/decorators/is-calendar-date.decorator.spec.ts`
Expected: PASS.

- [ ] **Step 5: Type-check, lint, commit**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter api lint
git add apps/api/src/shared/calendar-date.ts apps/api/src/shared/decorators/is-calendar-date.decorator.ts apps/api/test/shared/calendar-date.spec.ts apps/api/test/shared/decorators/is-calendar-date.decorator.spec.ts
git commit -m "feat(api): add calendar date helpers and @IsCalendarDate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Installment schedule (`loans/installment-schedule.ts`)

**Files:**
- Create: `apps/api/src/loans/installment-schedule.ts`
- Test: `apps/api/test/loans/installment-schedule.spec.ts`

**Interfaces:**
- Consumes: `addMonthsClamped(date, months)` and `isCalendarDate(value)` from Task 1.
- Produces:
  ```ts
  calculateTotalCents(principalCents: number, contributionRateBps: number): number
  interface ScheduleInput { principalCents: number; contributionRateBps: number; installmentCount: number; disbursedAt: string; graceMonths: number }
  interface ScheduledInstallment { number: number; dueDate: string; amountCents: number }
  interface InstallmentSchedule { totalCents: number; installments: ScheduledInstallment[] }
  buildInstallmentSchedule(input: ScheduleInput): InstallmentSchedule   // RangeError if installmentCount < 1, not integer, or totalCents < installmentCount
  ```

- [ ] **Step 1: Write the failing test**

`apps/api/test/loans/installment-schedule.spec.ts`:
```ts
import {
  buildInstallmentSchedule,
  calculateTotalCents,
  type ScheduleInput,
} from '../../src/loans/installment-schedule.js';
import { addMonthsClamped, isCalendarDate } from '../../src/shared/calendar-date.js';

const FRSBJ_EXAMPLE: ScheduleInput = {
  principalCents: 320000,
  contributionRateBps: 500,
  installmentCount: 3,
  disbursedAt: '2026-01-31',
  graceMonths: 2,
};

describe('calculateTotalCents', () => {
  it.each([
    [320000, 500, 336000],
    [100000, 500, 105000],
    [100001, 500, 105001],
    [123456, 250, 126542],
    [320000, 0, 320000],
    [10, 500, 11],
    [9, 500, 9],
    [30, 500, 32],
    [1, 500, 1],
  ])('principal %i at %i bps = %i', (principal, bps, expected) => {
    expect(calculateTotalCents(principal, bps)).toBe(expected);
  });

  it('rounds half a cent up', () => {
    // 10 cents * 5% = 0.5 cent -> 1 cent
    expect(calculateTotalCents(10, 500) - 10).toBe(1);
    // 9 cents * 5% = 0.45 cent -> 0 cents
    expect(calculateTotalCents(9, 500) - 9).toBe(0);
  });
});

describe('buildInstallmentSchedule', () => {
  it('matches the FRSBJ example: 5% on R$ 3.200,00 in 3 installments after 2 months of grace', () => {
    expect(buildInstallmentSchedule(FRSBJ_EXAMPLE)).toEqual({
      totalCents: 336000,
      installments: [
        { number: 1, dueDate: '2026-04-30', amountCents: 112000 },
        { number: 2, dueDate: '2026-05-31', amountCents: 112000 },
        { number: 3, dueDate: '2026-06-30', amountCents: 112000 },
      ],
    });
  });

  it('puts the rounding remainder on the last installment', () => {
    const { totalCents, installments } = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      principalCents: 100001,
    });
    expect(totalCents).toBe(105001);
    expect(installments.map((i) => i.amountCents)).toEqual([35000, 35000, 35001]);
  });

  it('handles the largest possible remainder (n - 1 cents)', () => {
    const { installments } = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      principalCents: 1009,
      contributionRateBps: 0,
      installmentCount: 10,
    });
    expect(installments.map((i) => i.amountCents)).toEqual([
      100, 100, 100, 100, 100, 100, 100, 100, 100, 109,
    ]);
  });

  it('allows a single installment carrying the whole total', () => {
    const { installments } = buildInstallmentSchedule({ ...FRSBJ_EXAMPLE, installmentCount: 1 });
    expect(installments).toEqual([{ number: 1, dueDate: '2026-04-30', amountCents: 336000 }]);
  });

  it('allows one cent per installment', () => {
    const { installments } = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      principalCents: 10,
      contributionRateBps: 0,
      installmentCount: 10,
    });
    expect(installments.every((i) => i.amountCents === 1)).toBe(true);
  });

  it('with no grace, the first installment is due one month after disbursement', () => {
    const { installments } = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      disbursedAt: '2026-03-10',
      graceMonths: 0,
      installmentCount: 2,
    });
    expect(installments.map((i) => i.dueDate)).toEqual(['2026-04-10', '2026-05-10']);
  });

  it('crosses year boundaries and leap years', () => {
    const { installments } = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      disbursedAt: '2027-08-31',
      graceMonths: 6,
      installmentCount: 3,
    });
    expect(installments.map((i) => i.dueDate)).toEqual(['2028-03-31', '2028-04-30', '2028-05-31']);

    const leap = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      disbursedAt: '2027-11-29',
      graceMonths: 2,
      installmentCount: 1,
    });
    expect(leap.installments[0].dueDate).toBe('2028-02-29');
  });

  it.each([
    [{ installmentCount: 0 }],
    [{ installmentCount: 1.5 }],
    [{ principalCents: 1, contributionRateBps: 0, installmentCount: 2 }],
  ])('throws RangeError for %o', (overrides) => {
    expect(() => buildInstallmentSchedule({ ...FRSBJ_EXAMPLE, ...overrides })).toThrow(RangeError);
  });

  describe('invariants over many generated loans', () => {
    // Deterministic PRNG (mulberry32) so a failure is reproducible.
    function mulberry32(seed: number) {
      let state = seed >>> 0;
      return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    const next = mulberry32(20260924);
    const randomInt = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
    const anchors = ['2026-01-31', '2024-02-29', '2026-03-30', '2026-06-15', '2026-12-31', '2027-11-29'];

    const cases = Array.from({ length: 1000 }, () => {
      const installmentCount = randomInt(1, 12);
      return {
        principalCents: randomInt(installmentCount, 500000),
        contributionRateBps: randomInt(0, 1000),
        installmentCount,
        disbursedAt: anchors[randomInt(0, anchors.length - 1)],
        graceMonths: randomInt(0, 12),
      };
    });

    it('always sums to the total, never produces a zero installment, and keeps dates increasing', () => {
      for (const input of cases) {
        const { totalCents, installments } = buildInstallmentSchedule(input);
        const context = JSON.stringify(input);
        const n = input.installmentCount;
        const base = Math.floor(totalCents / n);

        expect(totalCents, context).toBe(
          calculateTotalCents(input.principalCents, input.contributionRateBps),
        );
        expect(installments.map((i) => i.number), context).toEqual(
          Array.from({ length: n }, (_, index) => index + 1),
        );
        expect(
          installments.reduce((sum, i) => sum + i.amountCents, 0),
          context,
        ).toBe(totalCents);
        expect(
          installments.every((i) => i.amountCents >= 1),
          context,
        ).toBe(true);
        expect(
          installments.slice(0, -1).every((i) => i.amountCents === base),
          context,
        ).toBe(true);
        expect(installments[n - 1].amountCents - base, context).toBeLessThan(n);
        expect(installments[0].dueDate, context).toBe(
          addMonthsClamped(input.disbursedAt, input.graceMonths + 1),
        );
        for (const [index, installment] of installments.entries()) {
          expect(isCalendarDate(installment.dueDate), context).toBe(true);
          if (index > 0) {
            expect(installment.dueDate > installments[index - 1].dueDate, context).toBe(true);
          }
        }
      }
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api test test/loans/installment-schedule.spec.ts`
Expected: FAIL — cannot resolve `../../src/loans/installment-schedule.js`.

- [ ] **Step 3: Implement**

`apps/api/src/loans/installment-schedule.ts`:
```ts
import { addMonthsClamped } from '../shared/calendar-date.js';

export interface ScheduleInput {
  principalCents: number;
  contributionRateBps: number;
  installmentCount: number;
  disbursedAt: string;
  graceMonths: number;
}

export interface ScheduledInstallment {
  number: number;
  dueDate: string;
  amountCents: number;
}

export interface InstallmentSchedule {
  totalCents: number;
  installments: ScheduledInstallment[];
}

const BASIS_POINTS = 10000;

/** Principal plus the one-time solidarity contribution, rounded half-up to the cent. */
export function calculateTotalCents(principalCents: number, contributionRateBps: number): number {
  const contribution = Math.floor(
    (principalCents * contributionRateBps + BASIS_POINTS / 2) / BASIS_POINTS,
  );
  return principalCents + contribution;
}

export function buildInstallmentSchedule(input: ScheduleInput): InstallmentSchedule {
  const { installmentCount } = input;
  const totalCents = calculateTotalCents(input.principalCents, input.contributionRateBps);
  if (!Number.isInteger(installmentCount) || installmentCount < 1) {
    throw new RangeError(`installmentCount must be a positive integer, got ${installmentCount}`);
  }
  if (totalCents < installmentCount) {
    throw new RangeError(`totalCents (${totalCents}) is smaller than installmentCount`);
  }

  const baseCents = Math.floor(totalCents / installmentCount);
  const remainderCents = totalCents % installmentCount;
  const installments = Array.from({ length: installmentCount }, (_, index) => {
    const number = index + 1;
    return {
      number,
      dueDate: addMonthsClamped(input.disbursedAt, input.graceMonths + number),
      amountCents: number === installmentCount ? baseCents + remainderCents : baseCents,
    };
  });
  return { totalCents, installments };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter api test test/loans/installment-schedule.spec.ts`
Expected: PASS.

- [ ] **Step 5: Type-check, lint, commit**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter api lint
git add apps/api/src/loans/installment-schedule.ts apps/api/test/loans/installment-schedule.spec.ts
git commit -m "feat(api): add installment schedule calculation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Fund policy check (`loans/loan-terms.ts`)

**Files:**
- Create: `apps/api/src/loans/loan-terms.ts`
- Test: `apps/api/test/loans/loan-terms.spec.ts`

**Interfaces:**
- Consumes: `calculateTotalCents` from Task 2.
- Produces:
  ```ts
  interface LoanTerms { principalCents: number; installmentCount: number; graceMonths: number }
  interface LoanPolicy { minInstallments: number; maxInstallments: number; maxGraceMonths: number; contributionRateBps: number }
  class LoanPolicyViolation extends Error {}
  assertTermsWithinPolicy(terms: LoanTerms, policy: LoanPolicy): void
  ```
  Messages (exact): `"installmentCount must be between {min} and {max}"`, `"graceMonths must be at most {max}"`, `"principalCents is too small for {n} installments"`. `FundVersion` rows (Task 5) satisfy `LoanPolicy` structurally.

- [ ] **Step 1: Write the failing test**

`apps/api/test/loans/loan-terms.spec.ts`:
```ts
import {
  assertTermsWithinPolicy,
  type LoanPolicy,
  LoanPolicyViolation,
  type LoanTerms,
} from '../../src/loans/loan-terms.js';

const FRSBJ: LoanPolicy = {
  minInstallments: 1,
  maxInstallments: 10,
  maxGraceMonths: 6,
  contributionRateBps: 500,
};

const valid: LoanTerms = { principalCents: 320000, installmentCount: 3, graceMonths: 2 };

function violationOf(terms: LoanTerms, policy: LoanPolicy = FRSBJ): unknown {
  try {
    assertTermsWithinPolicy(terms, policy);
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('assertTermsWithinPolicy', () => {
  it.each([
    [{ installmentCount: 1 }],
    [{ installmentCount: 10 }],
    [{ graceMonths: 0 }],
    [{ graceMonths: 6 }],
    [{ principalCents: 1, installmentCount: 1 }],
  ])('accepts terms on the boundary %o', (overrides) => {
    expect(violationOf({ ...valid, ...overrides })).toBeUndefined();
  });

  it.each([
    [{ installmentCount: 0 }, 'installmentCount must be between 1 and 10'],
    [{ installmentCount: 11 }, 'installmentCount must be between 1 and 10'],
    [{ graceMonths: 7 }, 'graceMonths must be at most 6'],
    [{ principalCents: 1, installmentCount: 2 }, 'principalCents is too small for 2 installments'],
  ])('rejects %o', (overrides, message) => {
    const error = violationOf({ ...valid, ...overrides });
    expect(error).toBeInstanceOf(LoanPolicyViolation);
    expect((error as Error).message).toBe(message);
  });

  it('uses the policy minimum, not a hard-coded one', () => {
    const policy = { ...FRSBJ, minInstallments: 3 };
    expect(violationOf({ ...valid, installmentCount: 3 }, policy)).toBeUndefined();
    expect((violationOf({ ...valid, installmentCount: 2 }, policy) as Error).message).toBe(
      'installmentCount must be between 3 and 10',
    );
  });

  it('counts the contribution when checking that every installment gets a cent', () => {
    // 19 cents + 5% = 20 cents -> 20 installments of 1 cent are possible
    const policy = { ...FRSBJ, maxInstallments: 20 };
    expect(violationOf({ ...valid, principalCents: 19, installmentCount: 20 }, policy)).toBeUndefined();
  });

  it('reports the installment count before the grace period', () => {
    const error = violationOf({ ...valid, installmentCount: 11, graceMonths: 7 });
    expect((error as Error).message).toBe('installmentCount must be between 1 and 10');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api test test/loans/loan-terms.spec.ts`
Expected: FAIL — cannot resolve `../../src/loans/loan-terms.js`.

- [ ] **Step 3: Implement**

`apps/api/src/loans/loan-terms.ts`:
```ts
import { calculateTotalCents } from './installment-schedule.js';

export interface LoanTerms {
  principalCents: number;
  installmentCount: number;
  graceMonths: number;
}

export interface LoanPolicy {
  minInstallments: number;
  maxInstallments: number;
  maxGraceMonths: number;
  contributionRateBps: number;
}

export class LoanPolicyViolation extends Error {
  name = 'LoanPolicyViolation';
}

export function assertTermsWithinPolicy(terms: LoanTerms, policy: LoanPolicy): void {
  const { installmentCount, graceMonths } = terms;
  if (installmentCount < policy.minInstallments || installmentCount > policy.maxInstallments) {
    throw new LoanPolicyViolation(
      `installmentCount must be between ${policy.minInstallments} and ${policy.maxInstallments}`,
    );
  }
  if (graceMonths > policy.maxGraceMonths) {
    throw new LoanPolicyViolation(`graceMonths must be at most ${policy.maxGraceMonths}`);
  }
  if (calculateTotalCents(terms.principalCents, policy.contributionRateBps) < installmentCount) {
    throw new LoanPolicyViolation(
      `principalCents is too small for ${installmentCount} installments`,
    );
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter api test test/loans/loan-terms.spec.ts`
Expected: PASS.

- [ ] **Step 5: Type-check, lint, commit**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter api lint
git add apps/api/src/loans/loan-terms.ts apps/api/test/loans/loan-terms.spec.ts
git commit -m "feat(api): validate loan terms against the fund policy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Postgres error helpers and `409` when deleting a borrower with loans

**Files:**
- Create: `apps/api/src/db/has-postgres-error-code.ts`
- Modify: `apps/api/src/db/is-unique-violation.ts` (whole file)
- Create: `apps/api/src/db/is-foreign-key-violation.ts`
- Modify: `apps/api/src/borrowers/borrowers.service.ts` (`remove`, imports)
- Test: `apps/api/test/db/is-foreign-key-violation.spec.ts` (new), `apps/api/test/db/is-unique-violation.spec.ts` (unchanged, guards the refactor)
- Test: `apps/api/test/borrowers/borrowers.service.spec.ts` (add cases to `describe('remove')`)

**Interfaces:**
- Produces: `hasPostgresErrorCode(error: unknown, code: string): boolean` (checks `error.code` and `error.cause.code`); `isForeignKeyViolation(error: unknown): boolean` (`23503`). `BorrowersService.remove` throws `ConflictException('Borrower has loans')` on FK violation. The e2e proof of the `409` comes in Task 10 (it needs a loan).

- [ ] **Step 1: Write the failing tests**

`apps/api/test/db/is-foreign-key-violation.spec.ts`:
```ts
import { isForeignKeyViolation } from '../../src/db/is-foreign-key-violation.js';

describe('isForeignKeyViolation', () => {
  it('detects a raw postgres foreign key violation', () => {
    expect(isForeignKeyViolation({ code: '23503' })).toBe(true);
  });

  it('detects a foreign key violation wrapped in cause', () => {
    expect(isForeignKeyViolation(new Error('Failed query', { cause: { code: '23503' } }))).toBe(
      true,
    );
  });

  it('ignores other errors', () => {
    expect(isForeignKeyViolation(new Error('boom'))).toBe(false);
    expect(isForeignKeyViolation({ code: '23505' })).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
  });
});
```

In `apps/api/test/borrowers/borrowers.service.spec.ts`, add below `createDeleteDb`:
```ts
function createFailingDeleteDb(error: unknown) {
  const returning = vi.fn().mockRejectedValue(error);
  const where = vi.fn().mockReturnValue({ returning });
  const del = vi.fn().mockReturnValue({ where });
  return { db: { delete: del } as unknown as Database };
}
```
and inside `describe('remove', ...)` add:
```ts
    it('throws ConflictException when the borrower has loans', async () => {
      const foreignKeyViolation = new Error('Failed query', { cause: { code: '23503' } });
      const service = new BorrowersService(createFailingDeleteDb(foreignKeyViolation).db);
      await expect(service.remove(borrower.id)).rejects.toThrow(
        new ConflictException('Borrower has loans'),
      );
    });

    it('rethrows unrelated errors', async () => {
      const boom = new Error('boom');
      const service = new BorrowersService(createFailingDeleteDb(boom).db);
      await expect(service.remove(borrower.id)).rejects.toBe(boom);
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter api test test/db test/borrowers/borrowers.service.spec.ts`
Expected: FAIL — `is-foreign-key-violation.js` not found; the `remove` conflict test fails (rejects with the raw error).

- [ ] **Step 3: Implement**

`apps/api/src/db/has-postgres-error-code.ts`:
```ts
function hasCode(value: unknown, code: string): boolean {
  return (
    typeof value === 'object' && value !== null && (value as { code?: unknown }).code === code
  );
}

export function hasPostgresErrorCode(error: unknown, code: string): boolean {
  if (hasCode(error, code)) {
    return true;
  }
  return error instanceof Error && hasCode(error.cause, code);
}
```

`apps/api/src/db/is-unique-violation.ts` (replace whole file):
```ts
import { hasPostgresErrorCode } from './has-postgres-error-code.js';

const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return hasPostgresErrorCode(error, UNIQUE_VIOLATION);
}
```

`apps/api/src/db/is-foreign-key-violation.ts`:
```ts
import { hasPostgresErrorCode } from './has-postgres-error-code.js';

const FOREIGN_KEY_VIOLATION = '23503';

export function isForeignKeyViolation(error: unknown): boolean {
  return hasPostgresErrorCode(error, FOREIGN_KEY_VIOLATION);
}
```

In `apps/api/src/borrowers/borrowers.service.ts` add the import
```ts
import { isForeignKeyViolation } from '../db/is-foreign-key-violation.js';
```
and replace `remove` with:
```ts
  async remove(id: string): Promise<void> {
    let deleted: { id: string } | undefined;
    try {
      [deleted] = await this.db
        .delete(borrowers)
        .where(eq(borrowers.id, id))
        .returning({ id: borrowers.id });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('Borrower has loans');
      }
      throw error;
    }
    if (!deleted) {
      throw new NotFoundException('Borrower not found');
    }
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS (all unit tests, including the untouched `is-unique-violation.spec.ts`).

- [ ] **Step 5: Type-check, lint, commit**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter api lint
git add apps/api/src/db/has-postgres-error-code.ts apps/api/src/db/is-unique-violation.ts apps/api/src/db/is-foreign-key-violation.ts apps/api/src/borrowers/borrowers.service.ts apps/api/test/db/is-foreign-key-violation.spec.ts apps/api/test/borrowers/borrowers.service.spec.ts
git commit -m "feat(api): answer 409 when deleting a borrower that has loans

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Schema — `funds`, `fund_versions`, `loans`, `installments` + integration test helpers

**Files:**
- Create: `apps/api/src/loans/installment-status.enum.ts`
- Modify: `apps/api/src/db/schema.ts` (imports + append tables)
- Create (generated): `apps/api/src/db/migrations/0002_<random>.sql`, `meta/0002_snapshot.json`, `meta/_journal.json` update
- Create: `apps/api/test/support/test-db.ts`
- Create: `apps/api/test/support/loan-fixtures.ts`
- Test: `apps/api/test/db/loan-schema.e2e-spec.ts`

**Interfaces:**
- Consumes: `LoanPolicy` (Task 3), `hasPostgresErrorCode` (Task 4), `isValidCpf` (existing `src/shared/cpf.ts`).
- Produces:
  - `enum InstallmentStatus { Pending = 'pending', Paid = 'paid' }`.
  - Tables `funds`, `fundVersions`, `loans`, `installments`, enum `installmentStatusEnum`; types `Fund`, `NewFund`, `FundVersion`, `NewFundVersion`, `Loan`, `NewLoan`, `Installment`, `NewInstallment`. `Loan.disbursedAt` and `Installment.dueDate` are `string`.
  - Test helpers: `connectTestDb(): { db: Database; close(): Promise<void> }`; `FRSBJ_POLICY: LoanPolicy`; `randomCpf(): string`; `class LoanFixtures(db)` with `borrower(name?)`, `fund(policies?, name?)` → `{ fund, versions }` (versions numbered 1..n in order), `version(fundId, version, policy)`, `cleanUp()`.

- [ ] **Step 1: Write the helpers and the failing constraint test**

`apps/api/test/support/test-db.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '../../src/config/env.js';
import type { Database } from '../../src/db/db.module.js';
import * as schema from '../../src/db/schema.js';

export function connectTestDb(): { db: Database; close: () => Promise<void> } {
  const client = postgres(loadEnv().DATABASE_URL);
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
```

`apps/api/test/support/loan-fixtures.ts`:
```ts
import { randomInt, randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import type { Database } from '../../src/db/db.module.js';
import {
  type Borrower,
  borrowers,
  type Fund,
  type FundVersion,
  fundVersions,
  funds,
  loans,
} from '../../src/db/schema.js';
import type { LoanPolicy } from '../../src/loans/loan-terms.js';
import { isValidCpf } from '../../src/shared/cpf.js';

export const FRSBJ_POLICY: LoanPolicy = {
  minInstallments: 1,
  maxInstallments: 10,
  maxGraceMonths: 6,
  contributionRateBps: 500,
};

function cpfCheckDigit(digits: number[]): number {
  const firstWeight = digits.length + 1;
  const sum = digits.reduce((total, digit, index) => total + digit * (firstWeight - index), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** A random valid CPF, so parallel test files never collide on the unique constraint. */
export function randomCpf(): string {
  const digits = Array.from({ length: 9 }, () => randomInt(10));
  digits.push(cpfCheckDigit(digits));
  digits.push(cpfCheckDigit(digits));
  const cpf = digits.join('');
  return isValidCpf(cpf) ? cpf : randomCpf();
}

/** Creates rows for one test file and deletes exactly those rows in cleanUp(). */
export class LoanFixtures {
  private readonly borrowerIds: string[] = [];
  private readonly fundIds: string[] = [];

  constructor(private readonly db: Database) {}

  async borrower(name = 'Maria'): Promise<Borrower> {
    const [borrower] = await this.db
      .insert(borrowers)
      .values({ name, cpf: randomCpf() })
      .returning();
    this.borrowerIds.push(borrower.id);
    return borrower;
  }

  async fund(
    policies: LoanPolicy[] = [],
    name = `Test fund ${randomUUID()}`,
  ): Promise<{ fund: Fund; versions: FundVersion[] }> {
    const [fund] = await this.db.insert(funds).values({ name }).returning();
    this.fundIds.push(fund.id);
    const versions: FundVersion[] = [];
    for (const [index, policy] of policies.entries()) {
      versions.push(await this.version(fund.id, index + 1, policy));
    }
    return { fund, versions };
  }

  async version(fundId: string, version: number, policy: LoanPolicy): Promise<FundVersion> {
    const [created] = await this.db
      .insert(fundVersions)
      .values({ fundId, version, ...policy })
      .returning();
    return created;
  }

  async cleanUp(): Promise<void> {
    if (this.borrowerIds.length > 0) {
      await this.db.delete(loans).where(inArray(loans.borrowerId, this.borrowerIds));
      await this.db.delete(borrowers).where(inArray(borrowers.id, this.borrowerIds));
    }
    if (this.fundIds.length > 0) {
      await this.db.delete(fundVersions).where(inArray(fundVersions.fundId, this.fundIds));
      await this.db.delete(funds).where(inArray(funds.id, this.fundIds));
    }
  }
}
```

`apps/api/test/db/loan-schema.e2e-spec.ts`:
```ts
import { eq } from 'drizzle-orm';
import type { Database } from '../../src/db/db.module.js';
import { hasPostgresErrorCode } from '../../src/db/has-postgres-error-code.js';
import {
  type Borrower,
  borrowers,
  type FundVersion,
  fundVersions,
  installments,
  loans,
  type NewLoan,
} from '../../src/db/schema.js';
import { InstallmentStatus } from '../../src/loans/installment-status.enum.js';
import { FRSBJ_POLICY, LoanFixtures } from '../support/loan-fixtures.js';
import { connectTestDb } from '../support/test-db.js';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

async function expectPostgresError(query: PromiseLike<unknown>, code: string) {
  const error = await Promise.resolve(query).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error, `expected Postgres error ${code}`).toBeDefined();
  expect(hasPostgresErrorCode(error, code)).toBe(true);
}

describe('loan schema constraints (db)', () => {
  let connection: ReturnType<typeof connectTestDb>;
  let db: Database;
  let fixtures: LoanFixtures;
  let fundId: string;
  let version: FundVersion;
  let borrower: Borrower;

  beforeAll(async () => {
    connection = connectTestDb();
    db = connection.db;
    fixtures = new LoanFixtures(db);
    const created = await fixtures.fund([FRSBJ_POLICY]);
    fundId = created.fund.id;
    version = created.versions[0];
    borrower = await fixtures.borrower();
  });

  afterAll(async () => {
    await fixtures.cleanUp();
    await connection.close();
  });

  async function insertLoan(overrides: Partial<NewLoan> = {}) {
    const [loan] = await db
      .insert(loans)
      .values({
        borrowerId: borrower.id,
        fundVersionId: version.id,
        principalCents: 100000,
        disbursedAt: '2026-01-31',
        graceMonths: 0,
        ...overrides,
      })
      .returning();
    return loan;
  }

  describe('fund_versions', () => {
    it.each([
      [{ version: 0 }],
      [{ minInstallments: 0 }],
      [{ minInstallments: 5, maxInstallments: 4 }],
      [{ maxGraceMonths: -1 }],
      [{ contributionRateBps: -1 }],
    ])('rejects %o', async (overrides) => {
      await expectPostgresError(
        db.insert(fundVersions).values({ fundId, version: 99, ...FRSBJ_POLICY, ...overrides }),
        CHECK_VIOLATION,
      );
    });

    it('rejects a duplicate version number for the same fund', async () => {
      await expectPostgresError(
        db.insert(fundVersions).values({ fundId, version: 1, ...FRSBJ_POLICY }),
        UNIQUE_VIOLATION,
      );
    });

    it('cannot be deleted while a loan references it', async () => {
      await insertLoan();
      await expectPostgresError(
        db.delete(fundVersions).where(eq(fundVersions.id, version.id)),
        FOREIGN_KEY_VIOLATION,
      );
    });
  });

  describe('loans', () => {
    it.each([[{ principalCents: 0 }], [{ graceMonths: -1 }]])('rejects %o', async (overrides) => {
      await expectPostgresError(insertLoan(overrides), CHECK_VIOLATION);
    });

    it('stores disbursedAt as a plain calendar date string', async () => {
      const loan = await insertLoan({ disbursedAt: '2026-02-28' });
      expect(loan.disbursedAt).toBe('2026-02-28');
    });

    it('keeps a borrower with loans from being deleted', async () => {
      await insertLoan();
      await expectPostgresError(
        db.delete(borrowers).where(eq(borrowers.id, borrower.id)),
        FOREIGN_KEY_VIOLATION,
      );
    });
  });

  describe('installments', () => {
    it('defaults to pending and is deleted together with its loan', async () => {
      const loan = await insertLoan();
      const [installment] = await db
        .insert(installments)
        .values({ loanId: loan.id, number: 1, dueDate: '2026-02-28', amountCents: 105000 })
        .returning();
      expect(installment.status).toBe(InstallmentStatus.Pending);
      expect(installment.dueDate).toBe('2026-02-28');

      await db.delete(loans).where(eq(loans.id, loan.id));
      expect(
        await db.select().from(installments).where(eq(installments.loanId, loan.id)),
      ).toEqual([]);
    });

    it.each([[{ number: 0 }], [{ amountCents: 0 }]])('rejects %o', async (overrides) => {
      const loan = await insertLoan();
      await expectPostgresError(
        db.insert(installments).values({
          loanId: loan.id,
          number: 1,
          dueDate: '2026-02-28',
          amountCents: 100,
          ...overrides,
        }),
        CHECK_VIOLATION,
      );
    });

    it('rejects a duplicate installment number within a loan', async () => {
      const loan = await insertLoan();
      const row = { loanId: loan.id, number: 1, dueDate: '2026-02-28', amountCents: 100 };
      await db.insert(installments).values(row);
      await expectPostgresError(db.insert(installments).values(row), UNIQUE_VIOLATION);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api test:integration test/db/loan-schema.e2e-spec.ts`
Expected: FAIL — `fundVersions` / `loans` / `installments` are not exported from `schema.js`, and `installment-status.enum.js` does not exist.

- [ ] **Step 3: Implement the schema**

`apps/api/src/loans/installment-status.enum.ts`:
```ts
export enum InstallmentStatus {
  Pending = 'pending',
  Paid = 'paid',
}
```

In `apps/api/src/db/schema.ts` replace the imports with:
```ts
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { InstallmentStatus } from '../loans/installment-status.enum.js';
import { Role } from '../shared/role.enum.js';
```
and append at the end of the file:
```ts
export const installmentStatusEnum = pgEnum('installment_status', InstallmentStatus);

export const funds = pgTable('funds', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Fund = typeof funds.$inferSelect;
export type NewFund = typeof funds.$inferInsert;

export const fundVersions = pgTable(
  'fund_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fundId: uuid('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    minInstallments: integer('min_installments').notNull(),
    maxInstallments: integer('max_installments').notNull(),
    maxGraceMonths: integer('max_grace_months').notNull(),
    contributionRateBps: integer('contribution_rate_bps').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('fund_versions_fund_id_version_unique').on(table.fundId, table.version),
    check('fund_versions_version_positive', sql`${table.version} >= 1`),
    check('fund_versions_min_installments_positive', sql`${table.minInstallments} >= 1`),
    check(
      'fund_versions_max_installments_gte_min',
      sql`${table.maxInstallments} >= ${table.minInstallments}`,
    ),
    check('fund_versions_max_grace_non_negative', sql`${table.maxGraceMonths} >= 0`),
    check('fund_versions_rate_non_negative', sql`${table.contributionRateBps} >= 0`),
  ],
);

export type FundVersion = typeof fundVersions.$inferSelect;
export type NewFundVersion = typeof fundVersions.$inferInsert;

export const loans = pgTable(
  'loans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    borrowerId: uuid('borrower_id')
      .notNull()
      .references(() => borrowers.id, { onDelete: 'restrict' }),
    fundVersionId: uuid('fund_version_id')
      .notNull()
      .references(() => fundVersions.id, { onDelete: 'restrict' }),
    principalCents: integer('principal_cents').notNull(),
    disbursedAt: date('disbursed_at').notNull(),
    graceMonths: integer('grace_months').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('loans_borrower_id_idx').on(table.borrowerId),
    check('loans_principal_positive', sql`${table.principalCents} > 0`),
    check('loans_grace_non_negative', sql`${table.graceMonths} >= 0`),
  ],
);

export type Loan = typeof loans.$inferSelect;
export type NewLoan = typeof loans.$inferInsert;

export const installments = pgTable(
  'installments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loanId: uuid('loan_id')
      .notNull()
      .references(() => loans.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    dueDate: date('due_date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: installmentStatusEnum('status').notNull().default(InstallmentStatus.Pending),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('installments_loan_id_number_unique').on(table.loanId, table.number),
    check('installments_number_positive', sql`${table.number} >= 1`),
    check('installments_amount_positive', sql`${table.amountCents} > 0`),
  ],
);

export type Installment = typeof installments.$inferSelect;
export type NewInstallment = typeof installments.$inferInsert;
```

- [ ] **Step 4: Generate, review and apply the migration**

Run: `pnpm --filter api db:generate`
Expected: creates `apps/api/src/db/migrations/0002_<random>.sql`. Open it and confirm it contains **only**: `CREATE TYPE "public"."installment_status" AS ENUM('pending', 'paid')`, `CREATE TABLE` for `funds`, `fund_versions`, `loans`, `installments` with the named `UNIQUE`/`CHECK` constraints, the four foreign keys (`restrict`, `restrict`, `restrict`, `cascade`), and `CREATE INDEX "loans_borrower_id_idx"`. Nothing touching `users`, `borrowers` or the `role` enum.

Run: `pnpm --filter api format` (formats the generated `meta/*.json`, like the borrowers migration commit did).

Run: `pnpm --filter api db:migrate`
Expected: exits 0.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter api test:integration test/db/loan-schema.e2e-spec.ts`
Expected: PASS.

Run: `pnpm --filter api test && pnpm --filter api test:integration`
Expected: PASS (existing suites unaffected).

- [ ] **Step 6: Type-check, lint, commit**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter api lint
git add apps/api/src/loans/installment-status.enum.ts apps/api/src/db/schema.ts apps/api/src/db/migrations apps/api/test/support apps/api/test/db/loan-schema.e2e-spec.ts
git commit -m "feat(api): add funds, fund versions, loans and installments tables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Seed the FRSBJ fund (version 1)

**Files:**
- Create: `apps/api/src/db/upsert-seed-fund.ts`
- Modify: `apps/api/src/db/seed.ts` (import + constant + call before `queryClient.end()`)
- Test: `apps/api/test/db/upsert-seed-fund.e2e-spec.ts`

**Interfaces:**
- Consumes: `funds`, `fundVersions` (Task 5), `LoanPolicy` (Task 3), `connectTestDb`, `FRSBJ_POLICY` (Task 5 helpers).
- Produces: `upsertSeedFund(db: Database, input: SeedFundInput): Promise<'created' | 'skipped'>` with `interface SeedFundInput { name: string; version: number; policy: LoanPolicy }`. Never modifies an existing version.

- [ ] **Step 1: Write the failing test**

`apps/api/test/db/upsert-seed-fund.e2e-spec.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../../src/db/db.module.js';
import { fundVersions, funds } from '../../src/db/schema.js';
import { upsertSeedFund } from '../../src/db/upsert-seed-fund.js';
import { FRSBJ_POLICY } from '../support/loan-fixtures.js';
import { connectTestDb } from '../support/test-db.js';

describe('upsertSeedFund (db)', () => {
  let connection: ReturnType<typeof connectTestDb>;
  let db: Database;
  const name = `Seed fund ${randomUUID()}`;

  const storedVersions = async () => {
    const [fund] = await db.select().from(funds).where(eq(funds.name, name));
    return db
      .select()
      .from(fundVersions)
      .where(eq(fundVersions.fundId, fund.id))
      .orderBy(asc(fundVersions.version));
  };

  beforeAll(() => {
    connection = connectTestDb();
    db = connection.db;
  });

  afterAll(async () => {
    const [fund] = await db.select().from(funds).where(eq(funds.name, name));
    if (fund) {
      await db.delete(fundVersions).where(eq(fundVersions.fundId, fund.id));
      await db.delete(funds).where(eq(funds.id, fund.id));
    }
    await connection.close();
  });

  it('creates the fund and its version, then skips on re-run without changing it', async () => {
    expect(await upsertSeedFund(db, { name, version: 1, policy: FRSBJ_POLICY })).toBe('created');
    expect(
      await upsertSeedFund(db, {
        name,
        version: 1,
        policy: { ...FRSBJ_POLICY, maxInstallments: 99 },
      }),
    ).toBe('skipped');

    expect(await db.select().from(funds).where(eq(funds.name, name))).toHaveLength(1);
    const versions = await storedVersions();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, ...FRSBJ_POLICY });
  });

  it('adds a new version to the existing fund', async () => {
    const policy = { ...FRSBJ_POLICY, maxGraceMonths: 3 };
    expect(await upsertSeedFund(db, { name, version: 2, policy })).toBe('created');

    const versions = await storedVersions();
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[1]).toMatchObject(policy);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api test:integration test/db/upsert-seed-fund.e2e-spec.ts`
Expected: FAIL — cannot resolve `../../src/db/upsert-seed-fund.js`.

- [ ] **Step 3: Implement**

`apps/api/src/db/upsert-seed-fund.ts`:
```ts
import { eq } from 'drizzle-orm';
import type { LoanPolicy } from '../loans/loan-terms.js';
import type { Database } from './db.module.js';
import { fundVersions, funds } from './schema.js';

export interface SeedFundInput {
  name: string;
  version: number;
  policy: LoanPolicy;
}

export type SeedFundResult = 'created' | 'skipped';

/** Versions are immutable: an existing version number is left untouched. */
export async function upsertSeedFund(db: Database, input: SeedFundInput): Promise<SeedFundResult> {
  await db.insert(funds).values({ name: input.name }).onConflictDoNothing({ target: funds.name });
  const [fund] = await db
    .select({ id: funds.id })
    .from(funds)
    .where(eq(funds.name, input.name))
    .limit(1);

  const created = await db
    .insert(fundVersions)
    .values({ fundId: fund.id, version: input.version, ...input.policy })
    .onConflictDoNothing({ target: [fundVersions.fundId, fundVersions.version] })
    .returning({ id: fundVersions.id });

  return created.length > 0 ? 'created' : 'skipped';
}
```

In `apps/api/src/db/seed.ts` add the import next to `upsertSeedUser`:
```ts
import { upsertSeedFund } from './upsert-seed-fund.js';
```
add above `async function main()`:
```ts
const FRSBJ_FUND = {
  name: 'Fundo Rotativo Solidário do Baixo Jequitinhonha',
  version: 1,
  policy: { minInstallments: 1, maxInstallments: 10, maxGraceMonths: 6, contributionRateBps: 500 },
};
```
and right before `await queryClient.end();`:
```ts
  const frsbj = await upsertSeedFund(db, FRSBJ_FUND);
  console.log(`[seed] ${FRSBJ_FUND.name} v${FRSBJ_FUND.version}: ${frsbj}`);
```

- [ ] **Step 4: Run to verify it passes, and run the real seed twice**

Run: `pnpm --filter api test:integration test/db/upsert-seed-fund.e2e-spec.ts`
Expected: PASS.

Run: `pnpm --filter api db:seed` twice.
Expected: the first run prints `[seed] Fundo Rotativo Solidário do Baixo Jequitinhonha v1: created` (or `skipped` if it was already seeded), and the second run prints `... v1: skipped`.

- [ ] **Step 5: Type-check, lint, commit**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter api lint
git add apps/api/src/db/upsert-seed-fund.ts apps/api/src/db/seed.ts apps/api/test/db/upsert-seed-fund.e2e-spec.ts
git commit -m "feat(api): seed the FRSBJ fund with its first version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Funds module — `FundsService` and `GET /funds`

**Files:**
- Create: `apps/api/src/funds/funds.service.ts`
- Create: `apps/api/src/funds/fund-response.ts`
- Create: `apps/api/src/funds/funds.controller.ts`
- Create: `apps/api/src/funds/funds.module.ts`
- Modify: `apps/api/src/app.module.ts` (import `FundsModule`)
- Create: `apps/api/test/support/e2e-app.ts`
- Test: `apps/api/test/funds/fund-response.spec.ts`
- Test: `apps/api/test/funds/funds.service.e2e-spec.ts`
- Test: `apps/api/test/funds/funds.e2e-spec.ts`

**Interfaces:**
- Consumes: `funds`, `fundVersions`, `Fund`, `FundVersion` (Task 5); `LoanFixtures`, `FRSBJ_POLICY`, `connectTestDb` (Task 5).
- Produces:
  ```ts
  interface FundWithCurrentVersion { fund: Fund; currentVersion: FundVersion | null }
  class FundsService {
    findWithCurrentVersion(fundId: string): Promise<FundWithCurrentVersion> // NotFoundException('Fund not found')
    findAllWithCurrentVersion(): Promise<FundWithCurrentVersion[]>          // ordered by name asc
  }
  interface FundVersionResponse { id; version; minInstallments; maxInstallments; maxGraceMonths; contributionRateBps }
  interface FundResponse { id: string; name: string; currentVersion: FundVersionResponse | null }
  toFundResponse(value: FundWithCurrentVersion): FundResponse
  FundsModule exports FundsService.
  // test/support/e2e-app.ts
  createTestApp(): Promise<INestApplication<App>>
  signTestTokens(): Promise<Record<Role, string>>
  ```

- [ ] **Step 1: Write the failing tests**

`apps/api/test/support/e2e-app.ts`:
```ts
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import type { AuthTokenPayload } from '../../src/auth/auth-token-payload.js';
import { loadEnv } from '../../src/config/env.js';
import { Role } from '../../src/shared/role.enum.js';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export async function signTestTokens(): Promise<Record<Role, string>> {
  const jwt = new JwtService({ secret: loadEnv().JWT_SECRET });
  const payload = (role: Role): AuthTokenPayload => ({ sub: 'e2e', phone: '0', role, name: 'E2E' });
  return {
    [Role.BackOffice]: await jwt.signAsync(payload(Role.BackOffice)),
    [Role.FieldAgent]: await jwt.signAsync(payload(Role.FieldAgent)),
  };
}
```

`apps/api/test/funds/fund-response.spec.ts`:
```ts
import type { Fund, FundVersion } from '../../src/db/schema.js';
import { toFundResponse } from '../../src/funds/fund-response.js';

const fund: Fund = {
  id: '9d7f1a3e-1111-4a57-9a57-2f1d8a1b9c11',
  name: 'Fundo Rotativo Solidário do Baixo Jequitinhonha',
  createdAt: new Date('2026-09-01T00:00:00Z'),
};

const version: FundVersion = {
  id: '9d7f1a3e-2222-4a57-9a57-2f1d8a1b9c11',
  fundId: fund.id,
  version: 2,
  minInstallments: 1,
  maxInstallments: 10,
  maxGraceMonths: 6,
  contributionRateBps: 500,
  createdAt: new Date('2026-09-02T00:00:00Z'),
};

describe('toFundResponse', () => {
  it('exposes the fund and the rules of its current version', () => {
    expect(toFundResponse({ fund, currentVersion: version })).toEqual({
      id: fund.id,
      name: fund.name,
      currentVersion: {
        id: version.id,
        version: 2,
        minInstallments: 1,
        maxInstallments: 10,
        maxGraceMonths: 6,
        contributionRateBps: 500,
      },
    });
  });

  it('returns null when the fund has no version', () => {
    expect(toFundResponse({ fund, currentVersion: null })).toEqual({
      id: fund.id,
      name: fund.name,
      currentVersion: null,
    });
  });
});
```

`apps/api/test/funds/funds.service.e2e-spec.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { FundsService } from '../../src/funds/funds.service.js';
import { FRSBJ_POLICY, LoanFixtures } from '../support/loan-fixtures.js';
import { connectTestDb } from '../support/test-db.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const OLD_POLICY = { minInstallments: 2, maxInstallments: 4, maxGraceMonths: 0, contributionRateBps: 1000 };

describe('FundsService (db)', () => {
  let connection: ReturnType<typeof connectTestDb>;
  let fixtures: LoanFixtures;
  let service: FundsService;

  beforeAll(() => {
    connection = connectTestDb();
    fixtures = new LoanFixtures(connection.db);
    service = new FundsService(connection.db);
  });

  afterAll(async () => {
    await fixtures.cleanUp();
    await connection.close();
  });

  describe('findWithCurrentVersion', () => {
    it('returns the highest version number, not the last inserted one', async () => {
      const { fund } = await fixtures.fund();
      const v2 = await fixtures.version(fund.id, 2, FRSBJ_POLICY);
      await fixtures.version(fund.id, 1, OLD_POLICY);

      expect(await service.findWithCurrentVersion(fund.id)).toEqual({ fund, currentVersion: v2 });
    });

    it('returns a null current version for a fund without versions', async () => {
      const { fund } = await fixtures.fund();
      expect(await service.findWithCurrentVersion(fund.id)).toEqual({
        fund,
        currentVersion: null,
      });
    });

    it('throws NotFoundException for a missing fund', async () => {
      await expect(service.findWithCurrentVersion(MISSING_ID)).rejects.toThrow(
        new NotFoundException('Fund not found'),
      );
    });
  });

  describe('findAllWithCurrentVersion', () => {
    it('lists funds by name, each with its own current version', async () => {
      const prefix = `Test fund ${randomUUID()}`;
      const b = await fixtures.fund([OLD_POLICY, FRSBJ_POLICY], `${prefix} B`);
      const a = await fixtures.fund([], `${prefix} A`);

      const result = await service.findAllWithCurrentVersion();
      const ids = result.map((item) => item.fund.id);

      expect(ids.indexOf(a.fund.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(a.fund.id)).toBeLessThan(ids.indexOf(b.fund.id));
      expect(result.find((item) => item.fund.id === a.fund.id)?.currentVersion).toBeNull();
      expect(result.find((item) => item.fund.id === b.fund.id)?.currentVersion).toEqual(
        b.versions[1],
      );
    });
  });
});
```

`apps/api/test/funds/funds.e2e-spec.ts`:
```ts
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Role } from '../../src/shared/role.enum.js';
import { createTestApp, signTestTokens } from '../support/e2e-app.js';
import { FRSBJ_POLICY, LoanFixtures } from '../support/loan-fixtures.js';
import { connectTestDb } from '../support/test-db.js';

describe('GET /funds (e2e)', () => {
  let app: INestApplication<App>;
  let connection: ReturnType<typeof connectTestDb>;
  let fixtures: LoanFixtures;
  let tokens: Record<Role, string>;

  beforeAll(async () => {
    connection = connectTestDb();
    fixtures = new LoanFixtures(connection.db);
    tokens = await signTestTokens();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await fixtures.cleanUp();
    await connection.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/funds').expect(401);
  });

  it.each([Role.BackOffice, Role.FieldAgent])(
    'lists funds with their current rules for %s',
    async (role) => {
      const withVersions = await fixtures.fund([
        { ...FRSBJ_POLICY, maxInstallments: 4 },
        FRSBJ_POLICY,
      ]);
      const withoutVersion = await fixtures.fund();

      const response = await request(app.getHttpServer())
        .get('/funds')
        .set('Authorization', `Bearer ${tokens[role]}`)
        .expect(200);

      const byId = new Map(response.body.map((fund: { id: string }) => [fund.id, fund]));
      expect(byId.get(withVersions.fund.id)).toEqual({
        id: withVersions.fund.id,
        name: withVersions.fund.name,
        currentVersion: { id: withVersions.versions[1].id, version: 2, ...FRSBJ_POLICY },
      });
      expect(byId.get(withoutVersion.fund.id)).toEqual({
        id: withoutVersion.fund.id,
        name: withoutVersion.fund.name,
        currentVersion: null,
      });
    },
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter api test test/funds && pnpm --filter api test:integration test/funds`
Expected: FAIL — `src/funds/*` modules not found.

- [ ] **Step 3: Implement**

`apps/api/src/funds/funds.service.ts`:
```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/db.module.js';
import { DRIZZLE } from '../db/db.module.js';
import { type Fund, type FundVersion, fundVersions, funds } from '../db/schema.js';

export interface FundWithCurrentVersion {
  fund: Fund;
  currentVersion: FundVersion | null;
}

@Injectable()
export class FundsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findWithCurrentVersion(fundId: string): Promise<FundWithCurrentVersion> {
    const [fund] = await this.db.select().from(funds).where(eq(funds.id, fundId)).limit(1);
    if (!fund) {
      throw new NotFoundException('Fund not found');
    }
    const [currentVersion] = await this.db
      .select()
      .from(fundVersions)
      .where(eq(fundVersions.fundId, fundId))
      .orderBy(desc(fundVersions.version))
      .limit(1);
    return { fund, currentVersion: currentVersion ?? null };
  }

  async findAllWithCurrentVersion(): Promise<FundWithCurrentVersion[]> {
    const [allFunds, currentVersions] = await Promise.all([
      this.db.select().from(funds).orderBy(asc(funds.name)),
      this.db
        .selectDistinctOn([fundVersions.fundId])
        .from(fundVersions)
        .orderBy(fundVersions.fundId, desc(fundVersions.version)),
    ]);
    const currentByFund = new Map(currentVersions.map((version) => [version.fundId, version]));
    return allFunds.map((fund) => ({ fund, currentVersion: currentByFund.get(fund.id) ?? null }));
  }
}
```

`apps/api/src/funds/fund-response.ts`:
```ts
import type { FundWithCurrentVersion } from './funds.service.js';

export interface FundVersionResponse {
  id: string;
  version: number;
  minInstallments: number;
  maxInstallments: number;
  maxGraceMonths: number;
  contributionRateBps: number;
}

export interface FundResponse {
  id: string;
  name: string;
  currentVersion: FundVersionResponse | null;
}

export function toFundResponse({ fund, currentVersion }: FundWithCurrentVersion): FundResponse {
  return {
    id: fund.id,
    name: fund.name,
    currentVersion: currentVersion && {
      id: currentVersion.id,
      version: currentVersion.version,
      minInstallments: currentVersion.minInstallments,
      maxInstallments: currentVersion.maxInstallments,
      maxGraceMonths: currentVersion.maxGraceMonths,
      contributionRateBps: currentVersion.contributionRateBps,
    },
  };
}
```

`apps/api/src/funds/funds.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { type FundResponse, toFundResponse } from './fund-response.js';
import { FundsService } from './funds.service.js';

@Controller('funds')
export class FundsController {
  constructor(private readonly fundsService: FundsService) {}

  @Get()
  async findAll(): Promise<FundResponse[]> {
    const funds = await this.fundsService.findAllWithCurrentVersion();
    return funds.map(toFundResponse);
  }
}
```

`apps/api/src/funds/funds.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { FundsController } from './funds.controller.js';
import { FundsService } from './funds.service.js';

@Module({
  imports: [DbModule],
  controllers: [FundsController],
  providers: [FundsService],
  exports: [FundsService],
})
export class FundsModule {}
```

`apps/api/src/app.module.ts`: add `import { FundsModule } from './funds/funds.module.js';` and change `imports` to `[AuthModule, BorrowersModule, FundsModule]`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter api test test/funds && pnpm --filter api test:integration test/funds`
Expected: PASS.

- [ ] **Step 5: Type-check, lint, commit**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter api lint
git add apps/api/src/funds apps/api/src/app.module.ts apps/api/test/support/e2e-app.ts apps/api/test/funds
git commit -m "feat(api): add funds module with GET /funds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Loan API contract — `CreateLoanDto` and response mappers

**Files:**
- Create: `apps/api/src/loans/dto/create-loan.dto.ts`
- Create: `apps/api/src/loans/loan-response.ts`
- Test: `apps/api/test/loans/dto/create-loan.dto.spec.ts`
- Test: `apps/api/test/loans/loan-response.spec.ts`

**Interfaces:**
- Consumes: `IsCalendarDate` (Task 1); `Borrower`, `Fund`, `FundVersion`, `Loan`, `Installment` (Task 5); `InstallmentStatus` (Task 5).
- Produces:
  ```ts
  const MAX_PRINCIPAL_CENTS = 1_000_000_000
  class CreateLoanDto { borrowerId: string; fundId: string; principalCents: number; installmentCount: number; disbursedAt: string; graceMonths: number }
  interface LoanDetails { loan: Loan; borrower: Pick<Borrower,'id'|'name'>; fund: Pick<Fund,'id'|'name'>; fundVersion: FundVersion; installments: Installment[] }
  interface LoanSummary { loan: Loan; fund: Pick<Fund,'id'|'name'>; totalCents: number; installmentCount: number }
  interface LoanResponse { id; borrower: {id,name}; fund: {id,name}; fundVersion: {id,version,contributionRateBps}; principalCents; totalCents; installmentCount; disbursedAt; graceMonths; createdAt; updatedAt; installments: InstallmentResponse[] }
  interface InstallmentResponse { id; number; dueDate; amountCents; status: InstallmentStatus }
  interface LoanListItem { id; fund: {id,name}; principalCents; totalCents; installmentCount; disbursedAt; createdAt }
  toLoanResponse(details: LoanDetails): LoanResponse
  toLoanListItem(summary: LoanSummary): LoanListItem
  ```

- [ ] **Step 1: Write the failing tests**

`apps/api/test/loans/dto/create-loan.dto.spec.ts`:
```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLoanDto, MAX_PRINCIPAL_CENTS } from '../../../src/loans/dto/create-loan.dto.js';

const valid = {
  borrowerId: '5f0c2c1e-6c5b-4c1a-9a57-2f1d8a1b9c11',
  fundId: '9d7f1a3e-1111-4a57-9a57-2f1d8a1b9c11',
  principalCents: 320000,
  installmentCount: 3,
  disbursedAt: '2026-01-31',
  graceMonths: 2,
};

async function errorProperties(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(CreateLoanDto, body));
  return errors.map((error) => error.property);
}

describe('CreateLoanDto', () => {
  it('accepts a valid body', async () => {
    expect(await errorProperties(valid)).toEqual([]);
  });

  it('accepts the boundaries', async () => {
    expect(
      await errorProperties({
        ...valid,
        principalCents: MAX_PRINCIPAL_CENTS,
        installmentCount: 1,
        graceMonths: 0,
      }),
    ).toEqual([]);
    expect(await errorProperties({ ...valid, principalCents: 1 })).toEqual([]);
  });

  it.each(Object.keys(valid))('rejects a missing %s', async (field) => {
    const body = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));
    expect(await errorProperties(body)).toEqual([field]);
  });

  it.each([
    ['borrowerId', 'abc'],
    ['borrowerId', 123],
    ['fundId', 'not-a-uuid'],
    ['principalCents', 0],
    ['principalCents', -1],
    ['principalCents', 3200.5],
    ['principalCents', '320000'],
    ['principalCents', MAX_PRINCIPAL_CENTS + 1],
    ['principalCents', null],
    ['installmentCount', 0],
    ['installmentCount', 2.5],
    ['installmentCount', '3'],
    ['graceMonths', -1],
    ['graceMonths', 0.5],
    ['graceMonths', '2'],
    ['disbursedAt', '2026-02-30'],
    ['disbursedAt', '2026-01-31T00:00:00Z'],
    ['disbursedAt', 20260131],
    ['disbursedAt', ''],
  ])('rejects %s = %j', async (field, value) => {
    expect(await errorProperties({ ...valid, [field]: value })).toEqual([field]);
  });
});
```

`apps/api/test/loans/loan-response.spec.ts`:
```ts
import type { Borrower, Fund, FundVersion, Installment, Loan } from '../../src/db/schema.js';
import { InstallmentStatus } from '../../src/loans/installment-status.enum.js';
import { toLoanListItem, toLoanResponse } from '../../src/loans/loan-response.js';

const createdAt = new Date('2026-09-24T12:00:00Z');
const updatedAt = new Date('2026-09-24T12:30:00Z');

const borrower: Borrower = {
  id: '5f0c2c1e-6c5b-4c1a-9a57-2f1d8a1b9c11',
  name: 'Maria',
  cpf: '52998224725',
  createdAt,
  updatedAt,
};
const fund: Fund = { id: '9d7f1a3e-1111-4a57-9a57-2f1d8a1b9c11', name: 'FRSBJ', createdAt };
const fundVersion: FundVersion = {
  id: '9d7f1a3e-2222-4a57-9a57-2f1d8a1b9c11',
  fundId: fund.id,
  version: 2,
  minInstallments: 1,
  maxInstallments: 10,
  maxGraceMonths: 6,
  contributionRateBps: 500,
  createdAt,
};
const loan: Loan = {
  id: '7a1b2c3d-3333-4a57-9a57-2f1d8a1b9c11',
  borrowerId: borrower.id,
  fundVersionId: fundVersion.id,
  principalCents: 100001,
  disbursedAt: '2026-01-31',
  graceMonths: 2,
  createdAt,
  updatedAt,
};

function installment(number: number, dueDate: string, amountCents: number): Installment {
  return {
    id: `7a1b2c3d-444${number}-4a57-9a57-2f1d8a1b9c11`,
    loanId: loan.id,
    number,
    dueDate,
    amountCents,
    status: InstallmentStatus.Pending,
    createdAt,
    updatedAt,
  };
}

const installments = [
  installment(3, '2026-06-30', 35001),
  installment(1, '2026-04-30', 35000),
  installment(2, '2026-05-31', 35000),
];

describe('toLoanResponse', () => {
  const response = toLoanResponse({ loan, borrower, fund, fundVersion, installments });

  it('derives the total and count from the installments, ordered by number', () => {
    expect(response).toEqual({
      id: loan.id,
      borrower: { id: borrower.id, name: 'Maria' },
      fund: { id: fund.id, name: 'FRSBJ' },
      fundVersion: { id: fundVersion.id, version: 2, contributionRateBps: 500 },
      principalCents: 100001,
      totalCents: 105001,
      installmentCount: 3,
      disbursedAt: '2026-01-31',
      graceMonths: 2,
      createdAt,
      updatedAt,
      installments: [
        { id: installments[1].id, number: 1, dueDate: '2026-04-30', amountCents: 35000, status: 'pending' },
        { id: installments[2].id, number: 2, dueDate: '2026-05-31', amountCents: 35000, status: 'pending' },
        { id: installments[0].id, number: 3, dueDate: '2026-06-30', amountCents: 35001, status: 'pending' },
      ],
    });
  });

  it('never exposes the borrower CPF, even when the borrower row carries it', () => {
    expect(JSON.stringify(response)).not.toContain(borrower.cpf);
  });

  it('does not mutate the given installments array', () => {
    expect(installments.map((i) => i.number)).toEqual([3, 1, 2]);
  });
});

describe('toLoanListItem', () => {
  it('returns the summary fields only', () => {
    expect(toLoanListItem({ loan, fund, totalCents: 105001, installmentCount: 3 })).toEqual({
      id: loan.id,
      fund: { id: fund.id, name: 'FRSBJ' },
      principalCents: 100001,
      totalCents: 105001,
      installmentCount: 3,
      disbursedAt: '2026-01-31',
      createdAt,
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter api test test/loans/dto test/loans/loan-response.spec.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/api/src/loans/dto/create-loan.dto.ts`:
```ts
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../shared/decorators/is-calendar-date.decorator.js';

/** R$ 10.000.000,00 — keeps every amount inside a Postgres integer. */
export const MAX_PRINCIPAL_CENTS = 1_000_000_000;

export class CreateLoanDto {
  @IsUUID()
  borrowerId: string;

  @IsUUID()
  fundId: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PRINCIPAL_CENTS)
  principalCents: number;

  @IsInt()
  @Min(1)
  installmentCount: number;

  @IsCalendarDate()
  disbursedAt: string;

  @IsInt()
  @Min(0)
  graceMonths: number;
}
```

`apps/api/src/loans/loan-response.ts`:
```ts
import type { Borrower, Fund, FundVersion, Installment, Loan } from '../db/schema.js';
import type { InstallmentStatus } from './installment-status.enum.js';

export interface LoanDetails {
  loan: Loan;
  borrower: Pick<Borrower, 'id' | 'name'>;
  fund: Pick<Fund, 'id' | 'name'>;
  fundVersion: FundVersion;
  installments: Installment[];
}

export interface LoanSummary {
  loan: Loan;
  fund: Pick<Fund, 'id' | 'name'>;
  totalCents: number;
  installmentCount: number;
}

export interface InstallmentResponse {
  id: string;
  number: number;
  dueDate: string;
  amountCents: number;
  status: InstallmentStatus;
}

export interface LoanResponse {
  id: string;
  borrower: { id: string; name: string };
  fund: { id: string; name: string };
  fundVersion: { id: string; version: number; contributionRateBps: number };
  principalCents: number;
  totalCents: number;
  installmentCount: number;
  disbursedAt: string;
  graceMonths: number;
  createdAt: Date;
  updatedAt: Date;
  installments: InstallmentResponse[];
}

export interface LoanListItem {
  id: string;
  fund: { id: string; name: string };
  principalCents: number;
  totalCents: number;
  installmentCount: number;
  disbursedAt: string;
  createdAt: Date;
}

export function toLoanResponse(details: LoanDetails): LoanResponse {
  const { loan, borrower, fund, fundVersion } = details;
  const installments = [...details.installments].sort((a, b) => a.number - b.number);
  return {
    id: loan.id,
    borrower: { id: borrower.id, name: borrower.name },
    fund: { id: fund.id, name: fund.name },
    fundVersion: {
      id: fundVersion.id,
      version: fundVersion.version,
      contributionRateBps: fundVersion.contributionRateBps,
    },
    principalCents: loan.principalCents,
    totalCents: installments.reduce((total, installment) => total + installment.amountCents, 0),
    installmentCount: installments.length,
    disbursedAt: loan.disbursedAt,
    graceMonths: loan.graceMonths,
    createdAt: loan.createdAt,
    updatedAt: loan.updatedAt,
    installments: installments.map((installment) => ({
      id: installment.id,
      number: installment.number,
      dueDate: installment.dueDate,
      amountCents: installment.amountCents,
      status: installment.status,
    })),
  };
}

export function toLoanListItem(summary: LoanSummary): LoanListItem {
  const { loan, fund } = summary;
  return {
    id: loan.id,
    fund: { id: fund.id, name: fund.name },
    principalCents: loan.principalCents,
    totalCents: summary.totalCents,
    installmentCount: summary.installmentCount,
    disbursedAt: loan.disbursedAt,
    createdAt: loan.createdAt,
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter api test test/loans/dto test/loans/loan-response.spec.ts`
Expected: PASS.

- [ ] **Step 5: Type-check, lint, commit**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter api lint
git add apps/api/src/loans/dto apps/api/src/loans/loan-response.ts apps/api/test/loans/dto apps/api/test/loans/loan-response.spec.ts
git commit -m "feat(api): add loan request DTO and response mappers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `LoansService` — create (transactional), findOne, findByBorrower

**Files:**
- Create: `apps/api/src/loans/loans.service.ts`
- Test: `apps/api/test/loans/loans.service.e2e-spec.ts`

**Interfaces:**
- Consumes: `FundsService.findWithCurrentVersion` (Task 7); `buildInstallmentSchedule` (Task 2); `assertTermsWithinPolicy`, `LoanPolicyViolation` (Task 3); `isForeignKeyViolation` (Task 4); tables (Task 5); `CreateLoanDto`, `LoanDetails`, `LoanSummary` (Task 8); `LoanFixtures`, `FRSBJ_POLICY`, `connectTestDb` (Task 5).
- Produces:
  ```ts
  class LoansService {
    constructor(db: Database /* @Inject(DRIZZLE) */, fundsService: FundsService)
    create(input: CreateLoanDto): Promise<LoanDetails>   // 404 'Borrower not found' | 'Fund not found'; 422 'Fund has no version' | policy message
    findOne(id: string): Promise<LoanDetails>           // 404 'Loan not found'; installments ordered by number
    findByBorrower(borrowerId: string): Promise<LoanSummary[]> // 404 'Borrower not found'; disbursedAt desc, createdAt desc
  }
  ```

- [ ] **Step 1: Write the failing test**

`apps/api/test/loans/loans.service.e2e-spec.ts`:
```ts
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../../src/db/db.module.js';
import {
  borrowers,
  type Fund,
  type FundVersion,
  installments,
  loans,
} from '../../src/db/schema.js';
import { FundsService } from '../../src/funds/funds.service.js';
import type { CreateLoanDto } from '../../src/loans/dto/create-loan.dto.js';
import { InstallmentStatus } from '../../src/loans/installment-status.enum.js';
import { LoansService } from '../../src/loans/loans.service.js';
import { FRSBJ_POLICY, LoanFixtures } from '../support/loan-fixtures.js';
import { connectTestDb } from '../support/test-db.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const OLD_POLICY = { minInstallments: 2, maxInstallments: 4, maxGraceMonths: 0, contributionRateBps: 1000 };

type TransactionCallback = Parameters<Database['transaction']>[0];

/** Proxy that overrides some members and forwards the rest, bound to the real object. */
function proxyWith<T extends object>(target: T, overrides: Record<string, unknown>): T {
  return new Proxy(target, {
    get(object, property) {
      if (typeof property === 'string' && property in overrides) {
        return overrides[property];
      }
      const value = Reflect.get(object, property, object);
      return typeof value === 'function' ? value.bind(object) : value;
    },
  });
}

/** Transactions fail on the installments insert, after the loan row was inserted. */
function failingInstallmentsDb(db: Database): Database {
  return proxyWith(db, {
    transaction: (callback: TransactionCallback) =>
      db.transaction((tx) =>
        callback(
          proxyWith(tx, {
            insert: (table: Parameters<typeof tx.insert>[0]) => {
              if (table === installments) {
                throw new Error('forced installments failure');
              }
              return tx.insert(table);
            },
          }),
        ),
      ),
  });
}

/** Simulates DELETE /borrowers/:id landing between the borrower lookup and the insert. */
function borrowerDeletedBeforeInsertDb(db: Database, borrowerId: string): Database {
  return proxyWith(db, {
    transaction: async (callback: TransactionCallback) => {
      await db.delete(borrowers).where(eq(borrowers.id, borrowerId));
      return db.transaction(callback);
    },
  });
}

describe('LoansService (db)', () => {
  let connection: ReturnType<typeof connectTestDb>;
  let db: Database;
  let fixtures: LoanFixtures;
  let fundsService: FundsService;
  let service: LoansService;
  let fund: Fund;
  let currentVersion: FundVersion;

  beforeAll(async () => {
    connection = connectTestDb();
    db = connection.db;
    fixtures = new LoanFixtures(db);
    fundsService = new FundsService(db);
    service = new LoansService(db, fundsService);
    const created = await fixtures.fund([OLD_POLICY, FRSBJ_POLICY]);
    fund = created.fund;
    currentVersion = created.versions[1];
  });

  afterAll(async () => {
    await fixtures.cleanUp();
    await connection.close();
  });

  const input = (borrowerId: string, overrides: Partial<CreateLoanDto> = {}): CreateLoanDto => ({
    borrowerId,
    fundId: fund.id,
    principalCents: 320000,
    installmentCount: 3,
    disbursedAt: '2026-01-31',
    graceMonths: 2,
    ...overrides,
  });

  const storedLoans = (borrowerId: string) =>
    db.select().from(loans).where(eq(loans.borrowerId, borrowerId));

  const storedInstallments = async (loanId: string) =>
    (
      await db
        .select()
        .from(installments)
        .where(eq(installments.loanId, loanId))
        .orderBy(asc(installments.number))
    ).map(({ number, dueDate, amountCents, status }) => ({ number, dueDate, amountCents, status }));

  describe('create', () => {
    it('persists the loan on the current fund version together with its installments', async () => {
      const borrower = await fixtures.borrower();

      const details = await service.create(input(borrower.id));

      expect(details.borrower).toEqual({ id: borrower.id, name: borrower.name });
      expect(details.fund).toEqual(fund);
      expect(details.fundVersion).toEqual(currentVersion);
      expect(await storedLoans(borrower.id)).toEqual([details.loan]);
      expect(details.loan).toMatchObject({
        borrowerId: borrower.id,
        fundVersionId: currentVersion.id,
        principalCents: 320000,
        disbursedAt: '2026-01-31',
        graceMonths: 2,
      });
      expect(await storedInstallments(details.loan.id)).toEqual([
        { number: 1, dueDate: '2026-04-30', amountCents: 112000, status: InstallmentStatus.Pending },
        { number: 2, dueDate: '2026-05-31', amountCents: 112000, status: InstallmentStatus.Pending },
        { number: 3, dueDate: '2026-06-30', amountCents: 112000, status: InstallmentStatus.Pending },
      ]);
      expect(details.installments.map((i) => i.loanId)).toEqual([
        details.loan.id,
        details.loan.id,
        details.loan.id,
      ]);
    });

    it('puts the rounding remainder on the last stored installment', async () => {
      const borrower = await fixtures.borrower();
      const { loan } = await service.create(input(borrower.id, { principalCents: 100001 }));
      expect((await storedInstallments(loan.id)).map((i) => i.amountCents)).toEqual([
        35000, 35000, 35001,
      ]);
    });

    it('keeps existing loans on their version when the fund gets a new one', async () => {
      const own = await fixtures.fund([FRSBJ_POLICY]);
      const borrower = await fixtures.borrower();
      const before = await service.create(input(borrower.id, { fundId: own.fund.id }));

      const v2 = await fixtures.version(own.fund.id, 2, {
        ...FRSBJ_POLICY,
        maxInstallments: 12,
        contributionRateBps: 0,
      });

      const reread = await service.findOne(before.loan.id);
      expect(reread.fundVersion).toEqual(own.versions[0]);
      expect(reread.installments.map((i) => i.amountCents)).toEqual([112000, 112000, 112000]);

      const after = await service.create(
        input(borrower.id, { fundId: own.fund.id, installmentCount: 12 }),
      );
      expect(after.fundVersion).toEqual(v2);
      expect(after.installments.reduce((sum, i) => sum + i.amountCents, 0)).toBe(320000);
    });

    it('throws 404 for a missing borrower', async () => {
      await expect(service.create(input(MISSING_ID))).rejects.toThrow(
        new NotFoundException('Borrower not found'),
      );
    });

    it('throws 404 for a missing fund', async () => {
      const borrower = await fixtures.borrower();
      await expect(service.create(input(borrower.id, { fundId: MISSING_ID }))).rejects.toThrow(
        new NotFoundException('Fund not found'),
      );
    });

    it('throws 422 for a fund without versions', async () => {
      const { fund: empty } = await fixtures.fund();
      const borrower = await fixtures.borrower();
      await expect(service.create(input(borrower.id, { fundId: empty.id }))).rejects.toThrow(
        new UnprocessableEntityException('Fund has no version'),
      );
      expect(await storedLoans(borrower.id)).toEqual([]);
    });

    it.each([
      [{ installmentCount: 11 }, 'installmentCount must be between 1 and 10'],
      [{ installmentCount: 0 }, 'installmentCount must be between 1 and 10'],
      [{ graceMonths: 7 }, 'graceMonths must be at most 6'],
      [{ principalCents: 1, installmentCount: 2 }, 'principalCents is too small for 2 installments'],
    ])('throws 422 and stores nothing for %o', async (overrides, message) => {
      const borrower = await fixtures.borrower();
      await expect(service.create(input(borrower.id, overrides))).rejects.toThrow(
        new UnprocessableEntityException(message),
      );
      expect(await storedLoans(borrower.id)).toEqual([]);
    });

    it('rolls back the loan when inserting installments fails', async () => {
      const borrower = await fixtures.borrower();
      const failing = new LoansService(failingInstallmentsDb(db), fundsService);

      await expect(failing.create(input(borrower.id))).rejects.toThrow(
        'forced installments failure',
      );
      expect(await storedLoans(borrower.id)).toEqual([]);
    });

    it('throws 404 when the borrower is deleted between the lookup and the insert', async () => {
      const borrower = await fixtures.borrower();
      const racing = new LoansService(borrowerDeletedBeforeInsertDb(db, borrower.id), fundsService);

      await expect(racing.create(input(borrower.id))).rejects.toThrow(
        new NotFoundException('Borrower not found'),
      );
      expect(await storedLoans(borrower.id)).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the same details as create, installments ordered by number', async () => {
      const borrower = await fixtures.borrower();
      const created = await service.create(input(borrower.id));

      const found = await service.findOne(created.loan.id);

      expect(found).toEqual({
        ...created,
        installments: [...created.installments].sort((a, b) => a.number - b.number),
      });
    });

    it('throws 404 for a missing loan', async () => {
      await expect(service.findOne(MISSING_ID)).rejects.toThrow(
        new NotFoundException('Loan not found'),
      );
    });
  });

  describe('findByBorrower', () => {
    it('throws 404 for a missing borrower', async () => {
      await expect(service.findByBorrower(MISSING_ID)).rejects.toThrow(
        new NotFoundException('Borrower not found'),
      );
    });

    it('returns an empty list for a borrower without loans', async () => {
      const borrower = await fixtures.borrower();
      expect(await service.findByBorrower(borrower.id)).toEqual([]);
    });

    it('lists the borrower loans newest disbursement first, with derived totals', async () => {
      const borrower = await fixtures.borrower();
      const older = await service.create(input(borrower.id));
      const newer = await service.create(
        input(borrower.id, { disbursedAt: '2026-03-10', principalCents: 100000, installmentCount: 2 }),
      );
      const sameDayLater = await service.create(
        input(borrower.id, { disbursedAt: '2026-03-10', principalCents: 50000, installmentCount: 1 }),
      );

      expect(await service.findByBorrower(borrower.id)).toEqual([
        { loan: sameDayLater.loan, fund: { id: fund.id, name: fund.name }, totalCents: 52500, installmentCount: 1 },
        { loan: newer.loan, fund: { id: fund.id, name: fund.name }, totalCents: 105000, installmentCount: 2 },
        { loan: older.loan, fund: { id: fund.id, name: fund.name }, totalCents: 336000, installmentCount: 3 },
      ]);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api test:integration test/loans/loans.service.e2e-spec.ts`
Expected: FAIL — cannot resolve `../../src/loans/loans.service.js`.

- [ ] **Step 3: Implement**

`apps/api/src/loans/loans.service.ts`:
```ts
import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/db.module.js';
import { DRIZZLE } from '../db/db.module.js';
import { isForeignKeyViolation } from '../db/is-foreign-key-violation.js';
import {
  type Borrower,
  borrowers,
  fundVersions,
  funds,
  installments,
  loans,
} from '../db/schema.js';
import { FundsService } from '../funds/funds.service.js';
import type { CreateLoanDto } from './dto/create-loan.dto.js';
import { buildInstallmentSchedule } from './installment-schedule.js';
import type { LoanDetails, LoanSummary } from './loan-response.js';
import {
  assertTermsWithinPolicy,
  type LoanPolicy,
  LoanPolicyViolation,
  type LoanTerms,
} from './loan-terms.js';

function assertWithinPolicy(terms: LoanTerms, policy: LoanPolicy): void {
  try {
    assertTermsWithinPolicy(terms, policy);
  } catch (error) {
    if (error instanceof LoanPolicyViolation) {
      throw new UnprocessableEntityException(error.message);
    }
    throw error;
  }
}

@Injectable()
export class LoansService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly fundsService: FundsService,
  ) {}

  async create(input: CreateLoanDto): Promise<LoanDetails> {
    const borrower = await this.findBorrower(input.borrowerId);
    const { fund, currentVersion } = await this.fundsService.findWithCurrentVersion(input.fundId);
    if (!currentVersion) {
      throw new UnprocessableEntityException('Fund has no version');
    }
    assertWithinPolicy(input, currentVersion);

    const schedule = buildInstallmentSchedule({
      principalCents: input.principalCents,
      contributionRateBps: currentVersion.contributionRateBps,
      installmentCount: input.installmentCount,
      disbursedAt: input.disbursedAt,
      graceMonths: input.graceMonths,
    });

    try {
      return await this.db.transaction(async (tx) => {
        const [loan] = await tx
          .insert(loans)
          .values({
            borrowerId: borrower.id,
            fundVersionId: currentVersion.id,
            principalCents: input.principalCents,
            disbursedAt: input.disbursedAt,
            graceMonths: input.graceMonths,
          })
          .returning();
        const createdInstallments = await tx
          .insert(installments)
          .values(schedule.installments.map((installment) => ({ ...installment, loanId: loan.id })))
          .returning();
        return { loan, borrower, fund, fundVersion: currentVersion, installments: createdInstallments };
      });
    } catch (error) {
      // The borrower was deleted between the lookup above and the insert.
      if (isForeignKeyViolation(error)) {
        throw new NotFoundException('Borrower not found');
      }
      throw error;
    }
  }

  async findOne(id: string): Promise<LoanDetails> {
    const [row] = await this.db
      .select({
        loan: loans,
        borrower: { id: borrowers.id, name: borrowers.name },
        fund: funds,
        fundVersion: fundVersions,
      })
      .from(loans)
      .innerJoin(borrowers, eq(borrowers.id, loans.borrowerId))
      .innerJoin(fundVersions, eq(fundVersions.id, loans.fundVersionId))
      .innerJoin(funds, eq(funds.id, fundVersions.fundId))
      .where(eq(loans.id, id))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Loan not found');
    }
    const loanInstallments = await this.db
      .select()
      .from(installments)
      .where(eq(installments.loanId, id))
      .orderBy(asc(installments.number));
    return { ...row, installments: loanInstallments };
  }

  async findByBorrower(borrowerId: string): Promise<LoanSummary[]> {
    await this.findBorrower(borrowerId);
    return this.db
      .select({
        loan: loans,
        fund: { id: funds.id, name: funds.name },
        totalCents: sql<number>`coalesce(sum(${installments.amountCents}), 0)`.mapWith(Number),
        installmentCount: sql<number>`count(${installments.id})`.mapWith(Number),
      })
      .from(loans)
      .innerJoin(fundVersions, eq(fundVersions.id, loans.fundVersionId))
      .innerJoin(funds, eq(funds.id, fundVersions.fundId))
      .leftJoin(installments, eq(installments.loanId, loans.id))
      .where(eq(loans.borrowerId, borrowerId))
      .groupBy(loans.id, funds.id)
      .orderBy(desc(loans.disbursedAt), desc(loans.createdAt));
  }

  private async findBorrower(id: string): Promise<Pick<Borrower, 'id' | 'name'>> {
    const [borrower] = await this.db
      .select({ id: borrowers.id, name: borrowers.name })
      .from(borrowers)
      .where(eq(borrowers.id, id))
      .limit(1);
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }
    return borrower;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter api test:integration test/loans/loans.service.e2e-spec.ts`
Expected: PASS. If the `findOne` equality test fails only on `fund` (the join returns the full row, `create` returns the full row too — both come from `funds`), inspect rather than loosen the assertion.

- [ ] **Step 5: Type-check, lint, commit**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter api lint
git add apps/api/src/loans/loans.service.ts apps/api/test/loans/loans.service.e2e-spec.ts
git commit -m "feat(api): add LoansService creating loans with installments atomically

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Loans HTTP API — controller, module, e2e

**Files:**
- Create: `apps/api/src/loans/loans.controller.ts`
- Create: `apps/api/src/loans/loans.module.ts`
- Modify: `apps/api/src/app.module.ts` (import `LoansModule`)
- Test: `apps/api/test/loans/loans.e2e-spec.ts`

**Interfaces:**
- Consumes: `LoansService` (Task 9), `FundsModule` (Task 7), `CreateLoanDto`, `toLoanResponse`, `toLoanListItem`, `LoanResponse`, `LoanListItem` (Task 8), `createTestApp`, `signTestTokens` (Task 7), `LoanFixtures` (Task 5).
- Produces: `POST /loans` (back office, 201), `GET /loans/:id`, `GET /borrowers/:id/loans` (both roles).

- [ ] **Step 1: Write the failing test**

`apps/api/test/loans/loans.e2e-spec.ts`:
```ts
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Borrower, Fund, FundVersion } from '../../src/db/schema.js';
import { MAX_PRINCIPAL_CENTS } from '../../src/loans/dto/create-loan.dto.js';
import { Role } from '../../src/shared/role.enum.js';
import { createTestApp, signTestTokens } from '../support/e2e-app.js';
import { FRSBJ_POLICY, LoanFixtures } from '../support/loan-fixtures.js';
import { connectTestDb } from '../support/test-db.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Loans (e2e)', () => {
  let app: INestApplication<App>;
  let connection: ReturnType<typeof connectTestDb>;
  let fixtures: LoanFixtures;
  let tokens: Record<Role, string>;
  let fund: Fund;
  let oldVersion: FundVersion;
  let currentVersion: FundVersion;
  let borrower: Borrower;

  beforeAll(async () => {
    connection = connectTestDb();
    fixtures = new LoanFixtures(connection.db);
    tokens = await signTestTokens();
    app = await createTestApp();
    const created = await fixtures.fund([{ ...FRSBJ_POLICY, maxInstallments: 4 }, FRSBJ_POLICY]);
    fund = created.fund;
    [oldVersion, currentVersion] = created.versions;
    borrower = await fixtures.borrower();
  });

  afterAll(async () => {
    await app.close();
    await fixtures.cleanUp();
    await connection.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (role: Role, req: request.Test) => req.set('Authorization', `Bearer ${tokens[role]}`);

  const validBody = (borrowerId = borrower.id): Record<string, unknown> => ({
    borrowerId,
    fundId: fund.id,
    principalCents: 320000,
    installmentCount: 3,
    disbursedAt: '2026-01-31',
    graceMonths: 2,
  });

  async function createLoan(body: Record<string, unknown> = validBody()) {
    const response = await as(Role.BackOffice, http().post('/loans')).send(body).expect(201);
    return response.body;
  }

  describe('POST /loans', () => {
    it('creates a loan with its installments', async () => {
      const body = await createLoan();

      expect(body).toEqual({
        id: expect.any(String),
        borrower: { id: borrower.id, name: borrower.name },
        fund: { id: fund.id, name: fund.name },
        fundVersion: { id: currentVersion.id, version: 2, contributionRateBps: 500 },
        principalCents: 320000,
        totalCents: 336000,
        installmentCount: 3,
        disbursedAt: '2026-01-31',
        graceMonths: 2,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        installments: [
          { id: expect.any(String), number: 1, dueDate: '2026-04-30', amountCents: 112000, status: 'pending' },
          { id: expect.any(String), number: 2, dueDate: '2026-05-31', amountCents: 112000, status: 'pending' },
          { id: expect.any(String), number: 3, dueDate: '2026-06-30', amountCents: 112000, status: 'pending' },
        ],
      });
      expect(JSON.stringify(body)).not.toContain(borrower.cpf);
    });

    it('ignores client-supplied computed fields', async () => {
      const body = await createLoan({
        ...validBody(),
        id: MISSING_ID,
        totalCents: 1,
        fundVersionId: oldVersion.id,
        installments: [{ number: 1, amountCents: 1 }],
      });

      expect(body.id).not.toBe(MISSING_ID);
      expect(body.totalCents).toBe(336000);
      expect(body.fundVersion.id).toBe(currentVersion.id);
      expect(body.installments).toHaveLength(3);
    });

    it.each([
      ['missing borrowerId', { borrowerId: undefined }],
      ['non-UUID borrowerId', { borrowerId: 'abc' }],
      ['missing fundId', { fundId: undefined }],
      ['principalCents as a string', { principalCents: '320000' }],
      ['principalCents zero', { principalCents: 0 }],
      ['principalCents with fraction', { principalCents: 3200.5 }],
      ['principalCents above the maximum', { principalCents: MAX_PRINCIPAL_CENTS + 1 }],
      ['principalCents beyond a Postgres integer', { principalCents: 3_000_000_000 }],
      ['installmentCount zero', { installmentCount: 0 }],
      ['installmentCount as a string', { installmentCount: '3' }],
      ['graceMonths negative', { graceMonths: -1 }],
      ['impossible disbursedAt', { disbursedAt: '2026-02-30' }],
      ['disbursedAt with time', { disbursedAt: '2026-01-31T03:00:00Z' }],
    ])('rejects %s with 400', async (_, overrides) => {
      await as(Role.BackOffice, http().post('/loans'))
        .send({ ...validBody(), ...overrides })
        .expect(400);
    });

    it('requires authentication', async () => {
      await http().post('/loans').send(validBody()).expect(401);
    });

    it('forbids field agents', async () => {
      await as(Role.FieldAgent, http().post('/loans')).send(validBody()).expect(403);
    });

    it.each([
      ['borrower', { borrowerId: MISSING_ID }, 'Borrower not found'],
      ['fund', { fundId: MISSING_ID }, 'Fund not found'],
    ])('returns 404 for a missing %s', async (_, overrides, message) => {
      const response = await as(Role.BackOffice, http().post('/loans'))
        .send({ ...validBody(), ...overrides })
        .expect(404);
      expect(response.body.message).toBe(message);
    });

    it.each([
      [{ installmentCount: 11 }, 'installmentCount must be between 1 and 10'],
      [{ graceMonths: 7 }, 'graceMonths must be at most 6'],
      [{ principalCents: 1, installmentCount: 2 }, 'principalCents is too small for 2 installments'],
    ])('returns 422 for %o', async (overrides, message) => {
      const response = await as(Role.BackOffice, http().post('/loans'))
        .send({ ...validBody(), ...overrides })
        .expect(422);
      expect(response.body.message).toBe(message);
    });

    it('returns 422 for a fund without versions', async () => {
      const { fund: empty } = await fixtures.fund();
      const response = await as(Role.BackOffice, http().post('/loans'))
        .send({ ...validBody(), fundId: empty.id })
        .expect(422);
      expect(response.body.message).toBe('Fund has no version');
    });
  });

  describe('GET /loans/:id', () => {
    it.each([Role.BackOffice, Role.FieldAgent])('returns the loan to %s', async (role) => {
      const created = await createLoan();
      const response = await as(role, http().get(`/loans/${created.id}`)).expect(200);
      expect(response.body).toEqual(created);
    });

    it('returns 404 for a missing loan and 400 for a non-UUID id', async () => {
      await as(Role.BackOffice, http().get(`/loans/${MISSING_ID}`)).expect(404);
      await as(Role.BackOffice, http().get('/loans/not-a-uuid')).expect(400);
    });

    it('requires authentication', async () => {
      await http().get(`/loans/${MISSING_ID}`).expect(401);
    });
  });

  describe('GET /borrowers/:id/loans', () => {
    it.each([Role.BackOffice, Role.FieldAgent])(
      'lists the borrower loans to %s, newest disbursement first',
      async (role) => {
        const own = await fixtures.borrower('Ana');
        const older = await createLoan(validBody(own.id));
        const newer = await createLoan({
          ...validBody(own.id),
          disbursedAt: '2026-03-10',
          principalCents: 100000,
          installmentCount: 2,
        });

        const response = await as(role, http().get(`/borrowers/${own.id}/loans`)).expect(200);

        expect(response.body).toEqual([
          {
            id: newer.id,
            fund: { id: fund.id, name: fund.name },
            principalCents: 100000,
            totalCents: 105000,
            installmentCount: 2,
            disbursedAt: '2026-03-10',
            createdAt: newer.createdAt,
          },
          {
            id: older.id,
            fund: { id: fund.id, name: fund.name },
            principalCents: 320000,
            totalCents: 336000,
            installmentCount: 3,
            disbursedAt: '2026-01-31',
            createdAt: older.createdAt,
          },
        ]);
      },
    );

    it('returns 404 for a missing borrower and 400 for a non-UUID id', async () => {
      await as(Role.BackOffice, http().get(`/borrowers/${MISSING_ID}/loans`)).expect(404);
      await as(Role.BackOffice, http().get('/borrowers/not-a-uuid/loans')).expect(400);
    });

    it('requires authentication', async () => {
      await http().get(`/borrowers/${borrower.id}/loans`).expect(401);
    });
  });

  describe('DELETE /borrowers/:id', () => {
    it('returns 409 when the borrower has loans, keeping the borrower', async () => {
      const own = await fixtures.borrower('Joana');
      await createLoan(validBody(own.id));

      const response = await as(Role.BackOffice, http().delete(`/borrowers/${own.id}`)).expect(409);
      expect(response.body.message).toBe('Borrower has loans');
      await as(Role.BackOffice, http().get(`/borrowers/${own.id}`)).expect(200);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api test:integration test/loans/loans.e2e-spec.ts`
Expected: FAIL — `POST /loans` returns 404 (route does not exist).

- [ ] **Step 3: Implement**

`apps/api/src/loans/loans.controller.ts`:
```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../shared/role.enum.js';
import { CreateLoanDto } from './dto/create-loan.dto.js';
import {
  type LoanListItem,
  type LoanResponse,
  toLoanListItem,
  toLoanResponse,
} from './loan-response.js';
import { LoansService } from './loans.service.js';

@Controller()
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Roles(Role.BackOffice)
  @Post('loans')
  async create(@Body() body: CreateLoanDto): Promise<LoanResponse> {
    return toLoanResponse(await this.loansService.create(body));
  }

  @Get('loans/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<LoanResponse> {
    return toLoanResponse(await this.loansService.findOne(id));
  }

  @Get('borrowers/:id/loans')
  async findByBorrower(@Param('id', ParseUUIDPipe) id: string): Promise<LoanListItem[]> {
    const loans = await this.loansService.findByBorrower(id);
    return loans.map(toLoanListItem);
  }
}
```

`apps/api/src/loans/loans.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { FundsModule } from '../funds/funds.module.js';
import { LoansController } from './loans.controller.js';
import { LoansService } from './loans.service.js';

@Module({
  imports: [DbModule, FundsModule],
  controllers: [LoansController],
  providers: [LoansService],
})
export class LoansModule {}
```

`apps/api/src/app.module.ts`: add `import { LoansModule } from './loans/loans.module.js';` and change `imports` to `[AuthModule, BorrowersModule, FundsModule, LoansModule]`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter api test:integration test/loans/loans.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Type-check, lint, commit**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter api lint
git add apps/api/src/loans/loans.controller.ts apps/api/src/loans/loans.module.ts apps/api/src/app.module.ts apps/api/test/loans/loans.e2e-spec.ts
git commit -m "feat(api): expose loans endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Final verification

**Files:** none new (fix whatever the checks surface, in the task that owns it).

- [ ] **Step 1: Full suite, twice for the integration tests** (the second run proves the suites clean up after themselves and do not collide)

```bash
pnpm --filter api lint
pnpm --filter api exec tsc --noEmit -p tsconfig.json
pnpm --filter api build
pnpm --filter api test
pnpm --filter api test:integration
pnpm --filter api test:integration
```
Expected: all green; unit count > 100, integration count > 25.

- [ ] **Step 2: Migration is in sync with the schema**

Run: `pnpm --filter api db:generate`
Expected: `No schema changes, nothing to migrate` and `git status` shows no new migration file.

- [ ] **Step 3: Smoke test against the running API**

```bash
pnpm --filter api db:seed
pnpm --filter api start:dev   # in another terminal
```
Log in as the back office seed user (`POST /auth/login`), then `GET /funds` → the FRSBJ fund with `currentVersion.version = 1`, `maxInstallments = 10`, `maxGraceMonths = 6`, `contributionRateBps = 500`. Create a borrower, then `POST /loans` with `{ principalCents: 320000, installmentCount: 3, disbursedAt: "2026-01-31", graceMonths: 2 }` → `totalCents: 336000` and due dates `2026-04-30`, `2026-05-31`, `2026-06-30`. Clean up those rows afterwards (`DELETE` the loan rows via SQL, then `DELETE /borrowers/:id`).

- [ ] **Step 4: Commit any fixes** (only if Steps 1–3 needed changes), with a message describing the fix.
