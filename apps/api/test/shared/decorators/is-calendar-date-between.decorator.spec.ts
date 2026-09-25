import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsCalendarDateBetween } from '../../../src/shared/decorators/is-calendar-date-between.decorator.js';

class Target {
  @IsCalendarDateBetween('2000-01-01', '2099-12-31')
  date: unknown;
}

async function errorsFor(date: unknown) {
  return validate(plainToInstance(Target, { date }));
}

describe('IsCalendarDateBetween', () => {
  it('passes for a date inside the range', async () => {
    expect(await errorsFor('2026-01-31')).toHaveLength(0);
  });

  it('passes for the min bound', async () => {
    expect(await errorsFor('2000-01-01')).toHaveLength(0);
  });

  it('passes for the max bound', async () => {
    expect(await errorsFor('2099-12-31')).toHaveLength(0);
  });

  it('fails for one day before the min bound', async () => {
    const [error] = await errorsFor('1999-12-31');
    expect(error.constraints).toEqual({
      isCalendarDateBetween: 'date must be between 2000-01-01 and 2099-12-31',
    });
  });

  it('fails for one day after the max bound', async () => {
    const [error] = await errorsFor('2100-01-01');
    expect(error.constraints).toEqual({
      isCalendarDateBetween: 'date must be between 2000-01-01 and 2099-12-31',
    });
  });

  it('fails for a malformed date', async () => {
    expect(await errorsFor('2026-02-30')).toHaveLength(1);
  });

  it('fails for a non-string value', async () => {
    expect(await errorsFor(20260131)).toHaveLength(1);
  });
});
