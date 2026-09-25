import { isForeignKeyViolation } from '../../src/db/is-foreign-key-violation.js';

describe('isForeignKeyViolation', () => {
  it('detects a raw postgres foreign key violation', () => {
    expect(isForeignKeyViolation({ code: '23503' })).toBe(true);
  });

  it('detects a foreign key violation wrapped in cause', () => {
    expect(isForeignKeyViolation(new Error('Failed query', { cause: { code: '23503' } }))).toBe(
      true,
    );
  });

  it('ignores other errors', () => {
    expect(isForeignKeyViolation(new Error('boom'))).toBe(false);
    expect(isForeignKeyViolation({ code: '23505' })).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
  });
});
