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
const OLD_POLICY = {
  minInstallments: 2,
  maxInstallments: 4,
  maxGraceMonths: 0,
  contributionRateBps: 1000,
};

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
        {
          number: 1,
          dueDate: '2026-04-30',
          amountCents: 112000,
          status: InstallmentStatus.Pending,
        },
        {
          number: 2,
          dueDate: '2026-05-31',
          amountCents: 112000,
          status: InstallmentStatus.Pending,
        },
        {
          number: 3,
          dueDate: '2026-06-30',
          amountCents: 112000,
          status: InstallmentStatus.Pending,
        },
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
      [
        { principalCents: 1, installmentCount: 2 },
        'principalCents is too small for 2 installments',
      ],
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
        input(borrower.id, {
          disbursedAt: '2026-03-10',
          principalCents: 100000,
          installmentCount: 2,
        }),
      );
      const sameDayLater = await service.create(
        input(borrower.id, {
          disbursedAt: '2026-03-10',
          principalCents: 50000,
          installmentCount: 1,
        }),
      );

      expect(await service.findByBorrower(borrower.id)).toEqual([
        {
          loan: sameDayLater.loan,
          fund: { id: fund.id, name: fund.name },
          totalCents: 52500,
          installmentCount: 1,
        },
        {
          loan: newer.loan,
          fund: { id: fund.id, name: fund.name },
          totalCents: 105000,
          installmentCount: 2,
        },
        {
          loan: older.loan,
          fund: { id: fund.id, name: fund.name },
          totalCents: 336000,
          installmentCount: 3,
        },
      ]);
    });
  });
});
