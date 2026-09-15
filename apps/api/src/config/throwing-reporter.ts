export function createThrowingReporter(context: string) {
  return function throwingReporter({
    errors,
  }: {
    errors: Record<string, Error | undefined>;
  }): void {
    const messages = Object.entries(errors)
      .filter(([, err]) => err !== undefined)
      .map(([key, err]) => `${key}: ${err?.message}`);

    if (messages.length > 0) {
      throw new Error(`${context}:\n${messages.join('\n')}`);
    }
  };
}
