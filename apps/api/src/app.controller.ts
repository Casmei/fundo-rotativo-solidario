import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './auth/decorators/public.decorator.js';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Verificar disponibilidade',
    description: 'Rota pública usada para confirmar que a API está no ar.',
  })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description: 'A API está disponível.',
    content: { 'text/plain': { schema: { type: 'string', example: 'Hello World!' } } },
  })
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
