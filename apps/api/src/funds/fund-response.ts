import type { FundWithCurrentVersion } from './funds.service.js';

export interface FundVersionResponse {
  id: string;
  version: number;
  minInstallments: number;
  maxInstallments: number;
  maxGraceMonths: number;
  contributionRateBps: number;
}

export interface FundResponse {
  id: string;
  name: string;
  currentVersion: FundVersionResponse | null;
}

export function toFundResponse({ fund, currentVersion }: FundWithCurrentVersion): FundResponse {
  return {
    id: fund.id,
    name: fund.name,
    currentVersion: currentVersion && {
      id: currentVersion.id,
      version: currentVersion.version,
      minInstallments: currentVersion.minInstallments,
      maxInstallments: currentVersion.maxInstallments,
      maxGraceMonths: currentVersion.maxGraceMonths,
      contributionRateBps: currentVersion.contributionRateBps,
    },
  };
}
