import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsCpf } from '../../shared/decorators/is-cpf.decorator.js';
import { trim } from '../../shared/transforms/trim.js';

export const BORROWER_NAME_DESCRIPTION =
  'Nome do tomador. Espaços nas extremidades são removidos antes da validação.';
export const BORROWER_CPF_DESCRIPTION =
  'CPF válido, com ou sem pontuação. É armazenado apenas com os dígitos e deve ser único.';

export class CreateBorrowerDto {
  @ApiProperty({
    description: BORROWER_NAME_DESCRIPTION,
    example: 'Maria da Silva',
    minLength: 1,
    maxLength: 255,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: BORROWER_CPF_DESCRIPTION, example: '529.982.247-25' })
  @IsCpf()
  cpf: string;
}
