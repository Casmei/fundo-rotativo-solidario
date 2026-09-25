import type { Fund, FundVersion } from '../../src/db/schema.js';
import { toFundResponse } from '../../src/funds/fund-response.js';

const fund: Fund = {
  id: '9d7f1a3e-1111-4a57-9a57-2f1d8a1b9c11',
  name: 'Fundo Rotativo Solidário do Baixo Jequitinhonha',
  createdAt: new Date('2026-09-01T00:00:00Z'),
};

const version: FundVersion = {
  id: '9d7f1a3e-2222-4a57-9a57-2f1d8a1b9c11',
  fundId: fund.id,
  version: 2,
  minInstallments: 1,
  maxInstallments: 10,
  maxGraceMonths: 6,
  contributionRateBps: 500,
  createdAt: new Date('2026-09-02T00:00:00Z'),
};

describe('toFundResponse', () => {
  it('exposes the fund and the rules of its current version', () => {
    expect(toFundResponse({ fund, currentVersion: version })).toEqual({
      id: fund.id,
      name: fund.name,
      currentVersion: {
        id: version.id,
        version: 2,
        minInstallments: 1,
        maxInstallments: 10,
        maxGraceMonths: 6,
        contributionRateBps: 500,
      },
    });
  });

  it('returns null when the fund has no version', () => {
    expect(toFundResponse({ fund, currentVersion: null })).toEqual({
      id: fund.id,
      name: fund.name,
      currentVersion: null,
    });
  });
});
