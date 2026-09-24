import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Telefone do usuário. Caracteres não numéricos são ignorados.',
    example: '(11) 98765-4321',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: 'Senha do usuário.', example: 's3nh4-segura', format: 'password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
