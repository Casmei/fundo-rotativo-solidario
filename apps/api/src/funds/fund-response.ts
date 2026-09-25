import { ApiProperty } from '@nestjs/swagger';
import type { FundWithCurrentVersion } from './funds.service.js';

export class FundVersionResponse {
  @ApiProperty({
    description: 'Identificador da versão do fundo.',
    format: 'uuid',
    example: '9d7f1a3e-2222-4a57-9a57-2f1d8a1b9c11',
  })
  id: string;

  @ApiProperty({
    description: 'Número sequencial da versão, começando em 1.',
    example: 2,
  })
  version: number;

  @ApiProperty({ description: 'Quantidade mínima de parcelas permitida.', example: 1 })
  minInstallments: number;

  @ApiProperty({ description: 'Quantidade máxima de parcelas permitida.', example: 10 })
  maxInstallments: number;

  @ApiProperty({ description: 'Quantidade máxima de meses de carência permitida.', example: 6 })
  maxGraceMonths: number;

  @ApiProperty({
    description: 'Taxa de contribuição, em pontos-base (`500` = 5%).',
    example: 500,
  })
  contributionRateBps: number;
}

export class FundResponse {
  @ApiProperty({
    description: 'Identificador do fundo.',
    format: 'uuid',
    example: '9d7f1a3e-1111-4a57-9a57-2f1d8a1b9c11',
  })
  id: string;

  @ApiProperty({
    description: 'Nome do fundo.',
    example: 'Fundo Rotativo Solidário do Baixo Jequitinhonha',
  })
  name: string;

  @ApiProperty({
    description:
      'Regras vigentes do fundo (a versão mais recente). `null` quando o fundo ainda não tem nenhuma versão cadastrada.',
    type: FundVersionResponse,
    nullable: true,
  })
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
