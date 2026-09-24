import { isUniqueViolation } from '../../src/db/is-unique-violation.js';

describe('isUniqueViolation', () => {
  it('detects a raw postgres unique violation', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('detects a unique violation wrapped in cause', () => {
    expect(isUniqueViolation(new Error('Failed query', { cause: { code: '23505' } }))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
