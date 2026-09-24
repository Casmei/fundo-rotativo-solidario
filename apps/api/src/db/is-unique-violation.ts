const UNIQUE_VIOLATION = '23505';

function hasUniqueViolationCode(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export function isUniqueViolation(error: unknown): boolean {
  if (hasUniqueViolationCode(error)) {
    return true;
  }
  return error instanceof Error && hasUniqueViolationCode(error.cause);
}
