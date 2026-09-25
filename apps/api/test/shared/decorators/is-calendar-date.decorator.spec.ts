import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsCalendarDate } from '../../../src/shared/decorators/is-calendar-date.decorator.js';

class Target {
  @IsCalendarDate()
  date: unknown;
}

async function errorsFor(date: unknown) {
  return validate(plainToInstance(Target, { date }));
}

describe('IsCalendarDate', () => {
  it('passes for a real calendar date', async () => {
    expect(await errorsFor('2026-01-31')).toHaveLength(0);
  });

  it('fails for an impossible date with a readable message', async () => {
    const [error] = await errorsFor('2026-02-30');
    expect(error.constraints).toEqual({
      isCalendarDate: 'date must be a valid date in YYYY-MM-DD format',
    });
  });

  it('fails for a date with time', async () => {
    expect(await errorsFor('2026-01-31T00:00:00Z')).toHaveLength(1);
  });

  it('fails for a non-string value', async () => {
    expect(await errorsFor(20260131)).toHaveLength(1);
  });

  it('fails when missing', async () => {
    expect(await errorsFor(undefined)).toHaveLength(1);
  });
});
