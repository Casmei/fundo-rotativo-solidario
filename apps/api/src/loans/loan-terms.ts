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
