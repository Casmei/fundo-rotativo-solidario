function hasCode(value: unknown, code: string): boolean {
  return typeof value === 'object' && value !== null && (value as { code?: unknown }).code === code;
}

export function hasPostgresErrorCode(error: unknown, code: string): boolean {
  if (hasCode(error, code)) {
    return true;
  }
  return error instanceof Error && hasCode(error.cause, code);
}
