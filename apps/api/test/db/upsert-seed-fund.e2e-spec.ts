import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../../src/db/db.module.js';
import { funds, fundVersions } from '../../src/db/schema.js';
import { upsertSeedFund } from '../../src/db/upsert-seed-fund.js';
import { FRSBJ_POLICY } from '../support/loan-fixtures.js';
import { connectTestDb } from '../support/test-db.js';

describe('upsertSeedFund (db)', () => {
  let connection: ReturnType<typeof connectTestDb>;
  let db: Database;
  const name = `Seed fund ${randomUUID()}`;

  const storedVersions = async () => {
    const [fund] = await db.select().from(funds).where(eq(funds.name, name));
    return db
      .select()
      .from(fundVersions)
      .where(eq(fundVersions.fundId, fund.id))
      .orderBy(asc(fundVersions.version));
  };

  beforeAll(() => {
    connection = connectTestDb();
    db = connection.db;
  });

  afterAll(async () => {
    const [fund] = await db.select().from(funds).where(eq(funds.name, name));
    if (fund) {
      await db.delete(fundVersions).where(eq(fundVersions.fundId, fund.id));
      await db.delete(funds).where(eq(funds.id, fund.id));
    }
    await connection.close();
  });

  it('creates the fund and its version, then skips on re-run without changing it', async () => {
    expect(await upsertSeedFund(db, { name, version: 1, policy: FRSBJ_POLICY })).toBe('created');
    expect(
      await upsertSeedFund(db, {
        name,
        version: 1,
        policy: { ...FRSBJ_POLICY, maxInstallments: 99 },
      }),
    ).toBe('skipped');

    expect(await db.select().from(funds).where(eq(funds.name, name))).toHaveLength(1);
    const versions = await storedVersions();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, ...FRSBJ_POLICY });
  });

  it('adds a new version to the existing fund', async () => {
    const policy = { ...FRSBJ_POLICY, maxGraceMonths: 3 };
    expect(await upsertSeedFund(db, { name, version: 2, policy })).toBe('created');

    const versions = await storedVersions();
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[1]).toMatchObject(policy);
  });
});
