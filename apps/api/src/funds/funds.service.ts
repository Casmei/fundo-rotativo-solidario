import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/db.module.js';
import { DRIZZLE } from '../db/db.module.js';
import { type Fund, type FundVersion, funds, fundVersions } from '../db/schema.js';

export interface FundWithCurrentVersion {
  fund: Fund;
  currentVersion: FundVersion | null;
}

@Injectable()
export class FundsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findWithCurrentVersion(fundId: string): Promise<FundWithCurrentVersion> {
    const [fund] = await this.db.select().from(funds).where(eq(funds.id, fundId)).limit(1);
    if (!fund) {
      throw new NotFoundException('Fund not found');
    }
    const [currentVersion] = await this.db
      .select()
      .from(fundVersions)
      .where(eq(fundVersions.fundId, fundId))
      .orderBy(desc(fundVersions.version))
      .limit(1);
    return { fund, currentVersion: currentVersion ?? null };
  }

  async findAllWithCurrentVersion(): Promise<FundWithCurrentVersion[]> {
    const [allFunds, currentVersions] = await Promise.all([
      this.db.select().from(funds).orderBy(asc(funds.name)),
      this.db
        .selectDistinctOn([fundVersions.fundId])
        .from(fundVersions)
        .orderBy(fundVersions.fundId, desc(fundVersions.version)),
    ]);
    const currentByFund = new Map(currentVersions.map((version) => [version.fundId, version]));
    return allFunds.map((fund) => ({ fund, currentVersion: currentByFund.get(fund.id) ?? null }));
  }
}
