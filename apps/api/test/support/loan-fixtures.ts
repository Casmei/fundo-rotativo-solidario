import { randomInt, randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import type { Database } from '../../src/db/db.module.js';
import {
  type Borrower,
  borrowers,
  type Fund,
  type FundVersion,
  funds,
  fundVersions,
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
