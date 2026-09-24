import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsCpf } from '../../shared/decorators/is-cpf.decorator.js';
import { trim } from '../../shared/transforms/trim.js';

export class CreateBorrowerDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsCpf()
  cpf: string;
}
