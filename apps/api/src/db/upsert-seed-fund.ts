import { eq } from 'drizzle-orm';
import type { LoanPolicy } from '../loans/loan-terms.js';
import type { Database } from './db.module.js';
import { funds, fundVersions } from './schema.js';

export interface SeedFundInput {
  name: string;
  version: number;
  policy: LoanPolicy;
}

export type SeedFundResult = 'created' | 'skipped';

/** Versions are immutable: an existing version number is left untouched. */
export async function upsertSeedFund(db: Database, input: SeedFundInput): Promise<SeedFundResult> {
  await db.insert(funds).values({ name: input.name }).onConflictDoNothing({ target: funds.name });
  const [fund] = await db
    .select({ id: funds.id })
    .from(funds)
    .where(eq(funds.name, input.name))
    .limit(1);

  const created = await db
    .insert(fundVersions)
    .values({ fundId: fund.id, version: input.version, ...input.policy })
    .onConflictDoNothing({ target: [fundVersions.fundId, fundVersions.version] })
    .returning({ id: fundVersions.id });

  return created.length > 0 ? 'created' : 'skipped';
}
