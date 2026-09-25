import {
  buildInstallmentSchedule,
  calculateTotalCents,
  type ScheduleInput,
} from '../../src/loans/installment-schedule.js';
import { addMonthsClamped, isCalendarDate } from '../../src/shared/calendar-date.js';

const FRSBJ_EXAMPLE: ScheduleInput = {
  principalCents: 320000,
  contributionRateBps: 500,
  installmentCount: 3,
  disbursedAt: '2026-01-31',
  graceMonths: 2,
};

describe('calculateTotalCents', () => {
  it.each([
    [320000, 500, 336000],
    [100000, 500, 105000],
    [100001, 500, 105001],
    [123456, 250, 126542],
    [320000, 0, 320000],
    [10, 500, 11],
    [9, 500, 9],
    [30, 500, 32],
    [1, 500, 1],
  ])('principal %i at %i bps = %i', (principal, bps, expected) => {
    expect(calculateTotalCents(principal, bps)).toBe(expected);
  });

  it('rounds half a cent up', () => {
    // 10 cents * 5% = 0.5 cent -> 1 cent
    expect(calculateTotalCents(10, 500) - 10).toBe(1);
    // 9 cents * 5% = 0.45 cent -> 0 cents
    expect(calculateTotalCents(9, 500) - 9).toBe(0);
  });
});

describe('buildInstallmentSchedule', () => {
  it('matches the FRSBJ example: 5% on R$ 3.200,00 in 3 installments after 2 months of grace', () => {
    expect(buildInstallmentSchedule(FRSBJ_EXAMPLE)).toEqual({
      totalCents: 336000,
      installments: [
        { number: 1, dueDate: '2026-04-30', amountCents: 112000 },
        { number: 2, dueDate: '2026-05-31', amountCents: 112000 },
        { number: 3, dueDate: '2026-06-30', amountCents: 112000 },
      ],
    });
  });

  it('puts the rounding remainder on the last installment', () => {
    const { totalCents, installments } = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      principalCents: 100001,
    });
    expect(totalCents).toBe(105001);
    expect(installments.map((i) => i.amountCents)).toEqual([35000, 35000, 35001]);
  });

  it('handles the largest possible remainder (n - 1 cents)', () => {
    const { installments } = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      principalCents: 1009,
      contributionRateBps: 0,
      installmentCount: 10,
    });
    expect(installments.map((i) => i.amountCents)).toEqual([
      100, 100, 100, 100, 100, 100, 100, 100, 100, 109,
    ]);
  });

  it('allows a single installment carrying the whole total', () => {
    const { installments } = buildInstallmentSchedule({ ...FRSBJ_EXAMPLE, installmentCount: 1 });
    expect(installments).toEqual([{ number: 1, dueDate: '2026-04-30', amountCents: 336000 }]);
  });

  it('allows one cent per installment', () => {
    const { installments } = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      principalCents: 10,
      contributionRateBps: 0,
      installmentCount: 10,
    });
    expect(installments.every((i) => i.amountCents === 1)).toBe(true);
  });

  it('with no grace, the first installment is due one month after disbursement', () => {
    const { installments } = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      disbursedAt: '2026-03-10',
      graceMonths: 0,
      installmentCount: 2,
    });
    expect(installments.map((i) => i.dueDate)).toEqual(['2026-04-10', '2026-05-10']);
  });

  it('crosses year boundaries and leap years', () => {
    const { installments } = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      disbursedAt: '2027-08-31',
      graceMonths: 6,
      installmentCount: 3,
    });
    expect(installments.map((i) => i.dueDate)).toEqual(['2028-03-31', '2028-04-30', '2028-05-31']);

    const leap = buildInstallmentSchedule({
      ...FRSBJ_EXAMPLE,
      disbursedAt: '2027-11-29',
      graceMonths: 2,
      installmentCount: 1,
    });
    expect(leap.installments[0].dueDate).toBe('2028-02-29');
  });

  it.each([
    [{ installmentCount: 0 }],
    [{ installmentCount: 1.5 }],
    [{ principalCents: 1, contributionRateBps: 0, installmentCount: 2 }],
  ])('throws RangeError for %o', (overrides) => {
    expect(() => buildInstallmentSchedule({ ...FRSBJ_EXAMPLE, ...overrides })).toThrow(RangeError);
  });

  describe('invariants over many generated loans', () => {
    // Deterministic PRNG (mulberry32) so a failure is reproducible.
    function mulberry32(seed: number) {
      let state = seed >>> 0;
      return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    const next = mulberry32(20260924);
    const randomInt = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
    const anchors = [
      '2026-01-31',
      '2024-02-29',
      '2026-03-30',
      '2026-06-15',
      '2026-12-31',
      '2027-11-29',
    ];

    const cases = Array.from({ length: 1000 }, () => {
      const installmentCount = randomInt(1, 12);
      return {
        principalCents: randomInt(installmentCount, 500000),
        contributionRateBps: randomInt(0, 1000),
        installmentCount,
        disbursedAt: anchors[randomInt(0, anchors.length - 1)],
        graceMonths: randomInt(0, 12),
      };
    });

    it('always sums to the total, never produces a zero installment, and keeps dates increasing', () => {
      for (const input of cases) {
        const { totalCents, installments } = buildInstallmentSchedule(input);
        const context = JSON.stringify(input);
        const n = input.installmentCount;
        const base = Math.floor(totalCents / n);

        expect(totalCents, context).toBe(
          calculateTotalCents(input.principalCents, input.contributionRateBps),
        );
        expect(
          installments.map((i) => i.number),
          context,
        ).toEqual(Array.from({ length: n }, (_, index) => index + 1));
        expect(
          installments.reduce((sum, i) => sum + i.amountCents, 0),
          context,
        ).toBe(totalCents);
        expect(
          installments.every((i) => i.amountCents >= 1),
          context,
        ).toBe(true);
        expect(
          installments.slice(0, -1).every((i) => i.amountCents === base),
          context,
        ).toBe(true);
        expect(installments[n - 1].amountCents - base, context).toBeLessThan(n);
        expect(installments[0].dueDate, context).toBe(
          addMonthsClamped(input.disbursedAt, input.graceMonths + 1),
        );
        for (const [index, installment] of installments.entries()) {
          expect(isCalendarDate(installment.dueDate), context).toBe(true);
          if (index > 0) {
            expect(installment.dueDate > installments[index - 1].dueDate, context).toBe(true);
          }
        }
      }
    });
  });
});
