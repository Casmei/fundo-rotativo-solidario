import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '../config/env.js';
import { Role } from '../shared/role.enum.js';
import * as schema from './schema.js';
import {
  assertNoDevFallbackInProduction,
  DEV_FALLBACK_BRUNO_PASSWORD,
  DEV_FALLBACK_LUANA_PASSWORD,
  loadSeedEnv,
} from './seed.env.js';
import { upsertSeedUser } from './upsert-seed-user.js';

async function main() {
  const env = loadEnv();
  const seedEnv = loadSeedEnv();

  assertNoDevFallbackInProduction(process.env.NODE_ENV, seedEnv);

  if (seedEnv.SEED_BRUNO_PASSWORD === DEV_FALLBACK_BRUNO_PASSWORD) {
    console.warn('[seed] SEED_BRUNO_PASSWORD not set, using dev fallback password');
  }
  if (seedEnv.SEED_LUANA_PASSWORD === DEV_FALLBACK_LUANA_PASSWORD) {
    console.warn('[seed] SEED_LUANA_PASSWORD not set, using dev fallback password');
  }

  const queryClient = postgres(env.DATABASE_URL);
  const db = drizzle(queryClient, { schema });

  const bruno = await upsertSeedUser(db, {
    name: 'Bruno',
    phone: seedEnv.SEED_BRUNO_PHONE,
    password: seedEnv.SEED_BRUNO_PASSWORD,
    role: Role.BackOffice,
  });
  console.log(`[seed] Bruno (back_office): ${bruno}`);

  const luana = await upsertSeedUser(db, {
    name: 'Luana',
    phone: seedEnv.SEED_LUANA_PHONE,
    password: seedEnv.SEED_LUANA_PASSWORD,
    role: Role.FieldAgent,
  });
  console.log(`[seed] Luana (field_agent): ${luana}`);

  await queryClient.end();
}

await main();
