import { hasPostgresErrorCode } from './has-postgres-error-code.js';

const FOREIGN_KEY_VIOLATION = '23503';

export function isForeignKeyViolation(error: unknown): boolean {
  return hasPostgresErrorCode(error, FOREIGN_KEY_VIOLATION);
}
