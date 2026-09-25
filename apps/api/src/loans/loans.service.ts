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
  funds,
  fundVersions,
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
    // Lookups run outside the transaction on purpose: fund versions are insert-only,
    // and the borrower FK is re-checked by the insert below (mapped to 404 on failure).
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
        return {
          loan,
          borrower,
          fund,
          fundVersion: currentVersion,
          installments: createdInstallments,
        };
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
