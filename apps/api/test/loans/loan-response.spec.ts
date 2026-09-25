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
        {
          id: installments[1].id,
          number: 1,
          dueDate: '2026-04-30',
          amountCents: 35000,
          status: 'pending',
        },
        {
          id: installments[2].id,
          number: 2,
          dueDate: '2026-05-31',
          amountCents: 35000,
          status: 'pending',
        },
        {
          id: installments[0].id,
          number: 3,
          dueDate: '2026-06-30',
          amountCents: 35001,
          status: 'pending',
        },
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
