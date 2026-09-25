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
    expect(
      violationOf({ ...valid, principalCents: 19, installmentCount: 20 }, policy),
    ).toBeUndefined();
  });

  it('reports the installment count before the grace period', () => {
    const error = violationOf({ ...valid, installmentCount: 11, graceMonths: 7 });
    expect((error as Error).message).toBe('installmentCount must be between 1 and 10');
  });
});
