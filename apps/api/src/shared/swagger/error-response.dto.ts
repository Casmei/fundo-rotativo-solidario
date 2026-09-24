import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ description: 'Código HTTP do erro.', example: 400 })
  statusCode: number;

  @ApiProperty({
    description:
      'Descrição do erro. Em erros de validação, uma lista com uma mensagem por problema.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['cpf must be a valid CPF'],
  })
  message: string | string[];

  @ApiProperty({ description: 'Nome do status HTTP.', example: 'Bad Request' })
  error: string;
}
