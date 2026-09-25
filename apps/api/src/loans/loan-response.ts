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
