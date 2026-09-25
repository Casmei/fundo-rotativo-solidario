import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../shared/decorators/is-calendar-date.decorator.js';
import { IsCalendarDateBetween } from '../../shared/decorators/is-calendar-date-between.decorator.js';

/** R$ 10.000.000,00 — stays inside a Postgres integer even with a contribution rate up to 100% (10000 bps). */
export const MAX_PRINCIPAL_CENTS = 1_000_000_000;

export const MIN_DISBURSED_AT = '2000-01-01';
export const MAX_DISBURSED_AT = '2099-12-31';

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
  @IsCalendarDateBetween(MIN_DISBURSED_AT, MAX_DISBURSED_AT)
  disbursedAt: string;

  @IsInt()
  @Min(0)
  graceMonths: number;
}
