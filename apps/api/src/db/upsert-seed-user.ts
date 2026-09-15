import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { Database } from './db.module.js';
import { type Role, users } from './schema.js';

export interface SeedUserInput {
  name: string;
  phone: string;
  password: string;
  role: Role;
}

export type SeedUserResult = 'created' | 'skipped';

export async function upsertSeedUser(db: Database, input: SeedUserInput): Promise<SeedUserResult> {
  const [existing] = await db.select().from(users).where(eq(users.phone, input.phone)).limit(1);

  if (existing) {
    return 'skipped';
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  await db.insert(users).values({
    name: input.name,
    phone: input.phone,
    passwordHash,
    role: input.role,
  });

  return 'created';
}
