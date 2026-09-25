import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Borrower } from '../db/schema.js';
import { Role } from '../shared/role.enum.js';

export class BorrowerListItem {
  @ApiProperty({
    description: 'Identificador do tomador.',
    format: 'uuid',
    example: '5f0c2c1e-6c5b-4c1a-9a57-2f1d8a1b9c11',
  })
  id: string;

  @ApiProperty({ description: 'Nome do tomador.', example: 'Maria da Silva' })
  name: string;
}

export class BorrowerResponse extends BorrowerListItem {
  @ApiPropertyOptional({
    description: 'CPF normalizado (somente dígitos). Retornado apenas para o perfil `back_office`.',
    example: '52998224725',
    pattern: '^\\d{11}$',
  })
  cpf?: string;

  @ApiProperty({ description: 'Data de criação.', format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ description: 'Data da última atualização.', format: 'date-time' })
  updatedAt: Date;
}

export function toBorrowerListItem(borrower: Borrower): BorrowerListItem {
  return { id: borrower.id, name: borrower.name };
}

export function toBorrowerResponse(borrower: Borrower, role: Role): BorrowerResponse {
  const response: BorrowerResponse = {
    id: borrower.id,
    name: borrower.name,
    createdAt: borrower.createdAt,
    updatedAt: borrower.updatedAt,
  };
  if (role === Role.BackOffice) {
    response.cpf = borrower.cpf;
  }
  return response;
}
