import 'dotenv/config';
import { cleanEnv, port, str } from 'envalid';

function throwingReporter({ errors }: { errors: Record<string, Error | undefined> }): void {
  const messages = Object.entries(errors)
    .filter(([, err]) => err !== undefined)
    .map(([key, err]) => `${key}: ${err?.message}`);

  if (messages.length > 0) {
    throw new Error(`Invalid environment variables:\n${messages.join('\n')}`);
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  return cleanEnv(
    source,
    {
      DATABASE_URL: str(),
      JWT_SECRET: str(),
      PORT: port({ default: 3000 }),
    },
    { reporter: throwingReporter },
  );
}

export type AppEnv = ReturnType<typeof loadEnv>;
