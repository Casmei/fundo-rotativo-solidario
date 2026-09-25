import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../shared/decorators/is-calendar-date.decorator.js';

/** R$ 10.000.000,00 — keeps every amount inside a Postgres integer. */
export const MAX_PRINCIPAL_CENTS = 1_000_000_000;

export class CreateLoanDto {
  @IsUUID()
  borrowerId: string;

  @IsUUID()
  fundId: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PRINCIPAL_CENTS)
  principalCents: number;

  @IsInt()
  @Min(1)
  installmentCount: number;

  @IsCalendarDate()
  disbursedAt: string;

  @IsInt()
  @Min(0)
  graceMonths: number;
}
