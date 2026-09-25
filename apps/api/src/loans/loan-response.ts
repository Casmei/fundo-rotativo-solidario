import { ApiProperty } from '@nestjs/swagger';
import type { Borrower, Fund, FundVersion, Installment, Loan } from '../db/schema.js';
import { InstallmentStatus } from './installment-status.enum.js';

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

export class LoanBorrowerSummary {
  @ApiProperty({
    description: 'Identificador do tomador.',
    format: 'uuid',
    example: '5f0c2c1e-6c5b-4c1a-9a57-2f1d8a1b9c11',
  })
  id: string;

  @ApiProperty({ description: 'Nome do tomador.', example: 'Maria da Silva' })
  name: string;
}

export class LoanFundSummary {
  @ApiProperty({
    description: 'Identificador do fundo.',
    format: 'uuid',
    example: '9d7f1a3e-1111-4a57-9a57-2f1d8a1b9c11',
  })
  id: string;

  @ApiProperty({
    description: 'Nome do fundo.',
    example: 'Fundo Rotativo Solidário do Baixo Jequitinhonha',
  })
  name: string;
}

export class LoanFundVersionSummary {
  @ApiProperty({
    description: 'Identificador da versão do fundo usada para calcular o empréstimo.',
    format: 'uuid',
    example: '9d7f1a3e-2222-4a57-9a57-2f1d8a1b9c11',
  })
  id: string;

  @ApiProperty({ description: 'Número sequencial da versão, começando em 1.', example: 2 })
  version: number;

  @ApiProperty({
    description: 'Taxa de contribuição aplicada, em pontos-base (`500` = 5%).',
    example: 500,
  })
  contributionRateBps: number;
}

export class InstallmentResponse {
  @ApiProperty({
    description: 'Identificador da parcela.',
    format: 'uuid',
    example: '7a1b2c3d-4441-4a57-9a57-2f1d8a1b9c11',
  })
  id: string;

  @ApiProperty({ description: 'Número da parcela, começando em 1.', example: 1 })
  number: number;

  @ApiProperty({
    description: 'Data de vencimento da parcela.',
    format: 'date',
    example: '2026-04-30',
  })
  dueDate: string;

  @ApiProperty({ description: 'Valor da parcela, em centavos.', example: 112000 })
  amountCents: number;

  @ApiProperty({
    description: 'Situação da parcela.',
    enum: InstallmentStatus,
    example: InstallmentStatus.Pending,
  })
  status: InstallmentStatus;
}

export class LoanResponse {
  @ApiProperty({
    description: 'Identificador do empréstimo.',
    format: 'uuid',
    example: '7a1b2c3d-3333-4a57-9a57-2f1d8a1b9c11',
  })
  id: string;

  @ApiProperty({ description: 'Tomador do empréstimo.', type: LoanBorrowerSummary })
  borrower: LoanBorrowerSummary;

  @ApiProperty({ description: 'Fundo de onde o empréstimo saiu.', type: LoanFundSummary })
  fund: LoanFundSummary;

  @ApiProperty({
    description: 'Versão do fundo usada para calcular o empréstimo.',
    type: LoanFundVersionSummary,
  })
  fundVersion: LoanFundVersionSummary;

  @ApiProperty({ description: 'Valor principal emprestado, em centavos.', example: 320000 })
  principalCents: number;

  @ApiProperty({
    description: 'Valor total a pagar (principal + contribuição), em centavos. Soma das parcelas.',
    example: 336000,
  })
  totalCents: number;

  @ApiProperty({ description: 'Quantidade de parcelas.', example: 3 })
  installmentCount: number;

  @ApiProperty({
    description: 'Data de desembolso do empréstimo.',
    format: 'date',
    example: '2026-01-31',
  })
  disbursedAt: string;

  @ApiProperty({
    description: 'Meses de carência antes do vencimento da primeira parcela.',
    example: 2,
  })
  graceMonths: number;

  @ApiProperty({ description: 'Data de criação.', format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ description: 'Data da última atualização.', format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({
    description: 'Parcelas do empréstimo, ordenadas por número.',
    type: [InstallmentResponse],
  })
  installments: InstallmentResponse[];
}

export class LoanListItem {
  @ApiProperty({
    description: 'Identificador do empréstimo.',
    format: 'uuid',
    example: '7a1b2c3d-3333-4a57-9a57-2f1d8a1b9c11',
  })
  id: string;

  @ApiProperty({ description: 'Fundo de onde o empréstimo saiu.', type: LoanFundSummary })
  fund: LoanFundSummary;

  @ApiProperty({ description: 'Valor principal emprestado, em centavos.', example: 320000 })
  principalCents: number;

  @ApiProperty({
    description: 'Valor total a pagar (principal + contribuição), em centavos. Soma das parcelas.',
    example: 336000,
  })
  totalCents: number;

  @ApiProperty({ description: 'Quantidade de parcelas.', example: 3 })
  installmentCount: number;

  @ApiProperty({
    description: 'Data de desembolso do empréstimo.',
    format: 'date',
    example: '2026-01-31',
  })
  disbursedAt: string;

  @ApiProperty({ description: 'Data de criação.', format: 'date-time' })
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
