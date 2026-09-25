import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticated } from '../shared/swagger/api-authenticated.decorator.js';
import { FundResponse, toFundResponse } from './fund-response.js';
import { FundsService } from './funds.service.js';

@ApiTags('Funds')
@ApiAuthenticated()
@Controller('funds')
export class FundsController {
  constructor(private readonly fundsService: FundsService) {}

  @ApiOperation({
    summary: 'Listar fundos',
    description:
      'Retorna todos os fundos com as regras da sua versão vigente. Disponível para todos os perfis.',
  })
  @ApiOkResponse({ description: 'Lista de fundos.', type: [FundResponse] })
  @Get()
  async findAll(): Promise<FundResponse[]> {
    const funds = await this.fundsService.findAllWithCurrentVersion();
    return funds.map(toFundResponse);
  }
}
