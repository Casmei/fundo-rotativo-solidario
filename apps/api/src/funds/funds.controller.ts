import { Controller, Get } from '@nestjs/common';
import { type FundResponse, toFundResponse } from './fund-response.js';
import { FundsService } from './funds.service.js';

@Controller('funds')
export class FundsController {
  constructor(private readonly fundsService: FundsService) {}

  @Get()
  async findAll(): Promise<FundResponse[]> {
    const funds = await this.fundsService.findAllWithCurrentVersion();
    return funds.map(toFundResponse);
  }
}
