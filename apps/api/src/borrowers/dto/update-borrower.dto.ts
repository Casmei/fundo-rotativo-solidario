import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsCpf } from '../../shared/decorators/is-cpf.decorator.js';
import { trim } from '../../shared/transforms/trim.js';

export class UpdateBorrowerDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsCpf()
  cpf?: string;
}
