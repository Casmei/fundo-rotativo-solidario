import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '../../src/config/env.js';
import type { Database } from '../../src/db/db.module.js';
import * as schema from '../../src/db/schema.js';

export function connectTestDb(): { db: Database; close: () => Promise<void> } {
  const client = postgres(loadEnv().DATABASE_URL);
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
