import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../shared/decorators/is-calendar-date.decorator.js';
import { IsCalendarDateBetween } from '../../shared/decorators/is-calendar-date-between.decorator.js';

/** R$ 10.000.000,00 — stays inside a Postgres integer even with a contribution rate up to 100% (10000 bps). */
export const MAX_PRINCIPAL_CENTS = 1_000_000_000;

export const MIN_DISBURSED_AT = '2000-01-01';
export const MAX_DISBURSED_AT = '2099-12-31';

export class CreateLoanDto {
  @ApiProperty({
    description: 'Identificador do tomador.',
    format: 'uuid',
    example: '5f0c2c1e-6c5b-4c1a-9a57-2f1d8a1b9c11',
  })
  @IsUUID()
  borrowerId: string;

  @ApiProperty({
    description: 'Identificador do fundo. O fundo precisa ter ao menos uma versão cadastrada.',
    format: 'uuid',
    example: '9d7f1a3e-1111-4a57-9a57-2f1d8a1b9c11',
  })
  @IsUUID()
  fundId: string;

  @ApiProperty({
    description: 'Valor principal emprestado, em centavos (nunca use ponto flutuante).',
    example: 320000,
    minimum: 1,
    maximum: MAX_PRINCIPAL_CENTS,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_PRINCIPAL_CENTS)
  principalCents: number;

  @ApiProperty({
    description:
      'Quantidade de parcelas. Precisa respeitar o intervalo `minInstallments`–`maxInstallments` da versão vigente do fundo.',
    example: 3,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  installmentCount: number;

  @ApiProperty({
    description: `Data de desembolso do empréstimo, no formato 'YYYY-MM-DD'. Deve estar entre ${MIN_DISBURSED_AT} e ${MAX_DISBURSED_AT}.`,
    format: 'date',
    example: '2026-01-31',
  })
  @IsCalendarDate()
  @IsCalendarDateBetween(MIN_DISBURSED_AT, MAX_DISBURSED_AT)
  disbursedAt: string;

  @ApiProperty({
    description:
      'Meses de carência antes do vencimento da primeira parcela. Precisa respeitar o máximo `maxGraceMonths` da versão vigente do fundo.',
    example: 2,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  graceMonths: number;
}
