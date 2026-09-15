import 'dotenv/config';
import { cleanEnv, port, str } from 'envalid';
import { createThrowingReporter } from './throwing-reporter.js';

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const sanitized = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));

  return cleanEnv(
    sanitized,
    {
      DATABASE_URL: str(),
      JWT_SECRET: str(),
      PORT: port({ default: 3000 }),
    },
    { reporter: createThrowingReporter('Invalid environment variables') },
  );
}

export type AppEnv = ReturnType<typeof loadEnv>;
