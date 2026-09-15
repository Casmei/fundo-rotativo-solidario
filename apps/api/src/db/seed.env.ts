import 'dotenv/config';
import { cleanEnv, str } from 'envalid';
import { createThrowingReporter } from '../config/throwing-reporter.js';

export const DEV_FALLBACK_BRUNO_PASSWORD = 'changeme-bruno';
export const DEV_FALLBACK_LUANA_PASSWORD = 'changeme-luana';

export function loadSeedEnv(source: NodeJS.ProcessEnv = process.env) {
  const sanitized = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));

  return cleanEnv(
    sanitized,
    {
      SEED_BRUNO_PHONE: str(),
      SEED_BRUNO_PASSWORD: str({ default: DEV_FALLBACK_BRUNO_PASSWORD }),
      SEED_LUANA_PHONE: str(),
      SEED_LUANA_PASSWORD: str({ default: DEV_FALLBACK_LUANA_PASSWORD }),
    },
    { reporter: createThrowingReporter('Invalid seed environment variables') },
  );
}

export function assertNoDevFallbackInProduction(
  nodeEnv: string | undefined,
  seedEnv: ReturnType<typeof loadSeedEnv>,
): void {
  if (nodeEnv !== 'production') {
    return;
  }

  if (seedEnv.SEED_BRUNO_PASSWORD === DEV_FALLBACK_BRUNO_PASSWORD) {
    throw new Error(
      'SEED_BRUNO_PASSWORD must be set explicitly in production; refusing to seed with the dev fallback password',
    );
  }

  if (seedEnv.SEED_LUANA_PASSWORD === DEV_FALLBACK_LUANA_PASSWORD) {
    throw new Error(
      'SEED_LUANA_PASSWORD must be set explicitly in production; refusing to seed with the dev fallback password',
    );
  }
}
