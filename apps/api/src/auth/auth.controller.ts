import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../shared/swagger/api-error-response.decorator.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginResponseDto } from './dto/login-response.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Autenticar usuário',
    description: 'Rota pública. Valida telefone e senha e retorna um token JWT de acesso.',
  })
  @ApiOkResponse({ description: 'Autenticação realizada com sucesso.', type: LoginResponseDto })
  @ApiErrorResponse(400, 'Corpo da requisição inválido.', [
    'phone should not be empty',
    'password must be a string',
  ])
  @ApiErrorResponse(401, 'Telefone ou senha incorretos.', 'Invalid credentials')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() body: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(body.phone, body.password);
  }
}
