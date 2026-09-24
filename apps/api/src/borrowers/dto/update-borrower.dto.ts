import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsCpf } from '../../shared/decorators/is-cpf.decorator.js';
import { trim } from '../../shared/transforms/trim.js';
import { BORROWER_CPF_DESCRIPTION, BORROWER_NAME_DESCRIPTION } from './create-borrower.dto.js';

// Unlike @IsOptional, this still validates null, so `{ name: null }` is a 400 instead of a DB error.
const isProvided = (_object: object, value: unknown) => value !== undefined;

export class UpdateBorrowerDto {
  @ApiPropertyOptional({
    description: BORROWER_NAME_DESCRIPTION,
    example: 'Maria da Silva Santos',
    minLength: 1,
    maxLength: 255,
  })
  @ValidateIf(isProvided)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: BORROWER_CPF_DESCRIPTION, example: '111.444.777-35' })
  @ValidateIf(isProvided)
  @IsCpf()
  cpf?: string;
}
