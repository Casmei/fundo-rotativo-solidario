import { addMonthsClamped } from '../shared/calendar-date.js';

export interface ScheduleInput {
  principalCents: number;
  contributionRateBps: number;
  installmentCount: number;
  disbursedAt: string;
  graceMonths: number;
}

export interface ScheduledInstallment {
  number: number;
  dueDate: string;
  amountCents: number;
}

export interface InstallmentSchedule {
  totalCents: number;
  installments: ScheduledInstallment[];
}

const BASIS_POINTS = 10000;

/** Principal plus the one-time solidarity contribution, rounded half-up to the cent. */
export function calculateTotalCents(principalCents: number, contributionRateBps: number): number {
  const contribution = Math.floor(
    (principalCents * contributionRateBps + BASIS_POINTS / 2) / BASIS_POINTS,
  );
  return principalCents + contribution;
}

export function buildInstallmentSchedule(input: ScheduleInput): InstallmentSchedule {
  const { installmentCount } = input;
  const totalCents = calculateTotalCents(input.principalCents, input.contributionRateBps);
  if (!Number.isInteger(installmentCount) || installmentCount < 1) {
    throw new RangeError(`installmentCount must be a positive integer, got ${installmentCount}`);
  }
  if (totalCents < installmentCount) {
    throw new RangeError(`totalCents (${totalCents}) is smaller than installmentCount`);
  }

  const baseCents = Math.floor(totalCents / installmentCount);
  const remainderCents = totalCents % installmentCount;
  const installments = Array.from({ length: installmentCount }, (_, index) => {
    const number = index + 1;
    return {
      number,
      dueDate: addMonthsClamped(input.disbursedAt, input.graceMonths + number),
      amountCents: number === installmentCount ? baseCents + remainderCents : baseCents,
    };
  });
  return { totalCents, installments };
}
