import { addMonthsClamped, isCalendarDate } from '../../src/shared/calendar-date.js';

describe('isCalendarDate', () => {
  it.each(['2026-01-31', '2024-02-29', '2000-02-29', '2026-12-01', '0001-01-01'])(
    'accepts %s',
    (value) => {
      expect(isCalendarDate(value)).toBe(true);
    },
  );

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '0000-01-01',
    '2026-1-01',
    '2026-01-1',
    '26-01-01',
    '2026/01/01',
    '2026-01-31T00:00:00Z',
    '2026-01-31T03:00:00-03:00',
    '2026-01-01 ',
    ' 2026-01-01',
    '',
  ])('rejects %j', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });

  it.each([undefined, null, 20260131, new Date('2026-01-31'), {}])(
    'rejects the non-string %o',
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );
});

describe('addMonthsClamped', () => {
  it.each([
    ['2026-01-15', 0, '2026-01-15'],
    ['2026-01-15', 1, '2026-02-15'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-01-31', 2, '2026-03-31'],
    ['2026-01-31', 3, '2026-04-30'],
    ['2026-01-30', 1, '2026-02-28'],
    ['2026-01-29', 1, '2026-02-28'],
    ['2028-01-29', 1, '2028-02-29'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2026-12-31', 1, '2027-01-31'],
    ['2026-08-31', 6, '2027-02-28'],
    ['2024-02-29', 12, '2025-02-28'],
    ['2024-02-29', 48, '2028-02-29'],
    ['2026-03-10', 25, '2028-04-10'],
  ])('%s + %i months = %s', (date, months, expected) => {
    expect(addMonthsClamped(date, months)).toBe(expected);
  });

  it('anchors on the original day instead of chaining from the clamped month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('throws on an invalid date', () => {
    expect(() => addMonthsClamped('2026-02-30', 1)).toThrow(RangeError);
  });

  it.each([-1, 1.5, Number.NaN])('throws on months = %s', (months) => {
    expect(() => addMonthsClamped('2026-01-31', months)).toThrow(RangeError);
  });

  it('throws when the resulting year exceeds 9999', () => {
    expect(() => addMonthsClamped('9999-12-31', 1)).toThrow(RangeError);
  });

  it('does not throw when the resulting year is still 9999', () => {
    expect(addMonthsClamped('9999-11-30', 1)).toBe('9999-12-30');
  });
});
