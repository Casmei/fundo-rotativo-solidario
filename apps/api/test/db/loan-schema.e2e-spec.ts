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
      expect(await db.select().from(installments).where(eq(installments.loanId, loan.id))).toEqual(
        [],
      );
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
