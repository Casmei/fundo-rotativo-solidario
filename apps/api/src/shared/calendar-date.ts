const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

function parseCalendarDate(value: string): CalendarDateParts | null {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

function formatCalendarDate({ year, month, day }: CalendarDateParts): string {
  const pad = (value: number, length: number) => String(value).padStart(length, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function isCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && parseCalendarDate(value) !== null;
}

export function addMonthsClamped(date: string, months: number): string {
  const parts = parseCalendarDate(date);
  if (!parts) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  if (!Number.isInteger(months) || months < 0) {
    throw new RangeError(`months must be a non-negative integer, got ${months}`);
  }
  const monthIndex = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(monthIndex / 12);
  if (year > 9999) {
    throw new RangeError(`addMonthsClamped result year exceeds 9999: ${year}`);
  }
  const month = (monthIndex % 12) + 1;
  return formatCalendarDate({ year, month, day: Math.min(parts.day, daysInMonth(year, month)) });
}
