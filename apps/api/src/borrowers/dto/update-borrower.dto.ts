import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsCpf } from '../../shared/decorators/is-cpf.decorator.js';
import { trim } from '../../shared/transforms/trim.js';

// Unlike @IsOptional, this still validates null, so `{ name: null }` is a 400 instead of a DB error.
const isProvided = (_object: object, value: unknown) => value !== undefined;

export class UpdateBorrowerDto {
  @ValidateIf(isProvided)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ValidateIf(isProvided)
  @IsCpf()
  cpf?: string;
}
