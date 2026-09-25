import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../shared/role.enum.js';
import { CreateLoanDto } from './dto/create-loan.dto.js';
import {
  type LoanListItem,
  type LoanResponse,
  toLoanListItem,
  toLoanResponse,
} from './loan-response.js';
import { LoansService } from './loans.service.js';

@Controller()
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Roles(Role.BackOffice)
  @Post('loans')
  async create(@Body() body: CreateLoanDto): Promise<LoanResponse> {
    return toLoanResponse(await this.loansService.create(body));
  }

  @Get('loans/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<LoanResponse> {
    return toLoanResponse(await this.loansService.findOne(id));
  }

  @Get('borrowers/:id/loans')
  async findByBorrower(@Param('id', ParseUUIDPipe) id: string): Promise<LoanListItem[]> {
    const loans = await this.loansService.findByBorrower(id);
    return loans.map(toLoanListItem);
  }
}
