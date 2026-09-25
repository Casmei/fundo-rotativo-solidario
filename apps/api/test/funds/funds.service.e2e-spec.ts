import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { FundsService } from '../../src/funds/funds.service.js';
import { FRSBJ_POLICY, LoanFixtures } from '../support/loan-fixtures.js';
import { connectTestDb } from '../support/test-db.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const OLD_POLICY = {
  minInstallments: 2,
  maxInstallments: 4,
  maxGraceMonths: 0,
  contributionRateBps: 1000,
};

describe('FundsService (db)', () => {
  let connection: ReturnType<typeof connectTestDb>;
  let fixtures: LoanFixtures;
  let service: FundsService;

  beforeAll(() => {
    connection = connectTestDb();
    fixtures = new LoanFixtures(connection.db);
    service = new FundsService(connection.db);
  });

  afterAll(async () => {
    await fixtures.cleanUp();
    await connection.close();
  });

  describe('findWithCurrentVersion', () => {
    it('returns the highest version number, not the last inserted one', async () => {
      const { fund } = await fixtures.fund();
      const v2 = await fixtures.version(fund.id, 2, FRSBJ_POLICY);
      await fixtures.version(fund.id, 1, OLD_POLICY);

      expect(await service.findWithCurrentVersion(fund.id)).toEqual({ fund, currentVersion: v2 });
    });

    it('returns a null current version for a fund without versions', async () => {
      const { fund } = await fixtures.fund();
      expect(await service.findWithCurrentVersion(fund.id)).toEqual({
        fund,
        currentVersion: null,
      });
    });

    it('throws NotFoundException for a missing fund', async () => {
      await expect(service.findWithCurrentVersion(MISSING_ID)).rejects.toThrow(
        new NotFoundException('Fund not found'),
      );
    });
  });

  describe('findAllWithCurrentVersion', () => {
    it('lists funds by name, each with its own current version', async () => {
      const prefix = `Test fund ${randomUUID()}`;
      const b = await fixtures.fund([OLD_POLICY, FRSBJ_POLICY], `${prefix} B`);
      const a = await fixtures.fund([], `${prefix} A`);

      const result = await service.findAllWithCurrentVersion();
      const ids = result.map((item) => item.fund.id);

      expect(ids.indexOf(a.fund.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(a.fund.id)).toBeLessThan(ids.indexOf(b.fund.id));
      expect(result.find((item) => item.fund.id === a.fund.id)?.currentVersion).toBeNull();
      expect(result.find((item) => item.fund.id === b.fund.id)?.currentVersion).toEqual(
        b.versions[1],
      );
    });
  });
});
