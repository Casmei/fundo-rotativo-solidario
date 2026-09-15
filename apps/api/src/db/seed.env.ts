import 'dotenv/config';
import { cleanEnv, str } from 'envalid';

export const DEV_FALLBACK_BRUNO_PASSWORD = 'changeme-bruno';
export const DEV_FALLBACK_LUANA_PASSWORD = 'changeme-luana';

function throwingReporter({ errors }: { errors: Record<string, Error | undefined> }): void {
  const messages = Object.entries(errors)
    .filter(([, err]) => err !== undefined)
    .map(([key, err]) => `${key}: ${err?.message}`);

  if (messages.length > 0) {
    throw new Error(`Invalid seed environment variables:\n${messages.join('\n')}`);
  }
}

export function loadSeedEnv(source: NodeJS.ProcessEnv = process.env) {
  return cleanEnv(
    source,
    {
      SEED_BRUNO_PHONE: str(),
      SEED_BRUNO_PASSWORD: str({ default: DEV_FALLBACK_BRUNO_PASSWORD }),
      SEED_LUANA_PHONE: str(),
      SEED_LUANA_PASSWORD: str({ default: DEV_FALLBACK_LUANA_PASSWORD }),
    },
    { reporter: throwingReporter },
  );
}
