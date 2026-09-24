import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsCpf } from '../../shared/decorators/is-cpf.decorator.js';
import { trim } from '../../shared/transforms/trim.js';

export class CreateBorrowerDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsCpf()
  cpf: string;
}
