import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({
    description:
      'Token JWT a ser enviado no header `Authorization: Bearer <token>`. Expira em 7 dias.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1ZjBjMmMxZSJ9.signature',
  })
  accessToken: string;
}
