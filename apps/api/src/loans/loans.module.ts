import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { FundsModule } from '../funds/funds.module.js';
import { LoansController } from './loans.controller.js';
import { LoansService } from './loans.service.js';

@Module({
  imports: [DbModule, FundsModule],
  controllers: [LoansController],
  providers: [LoansService],
})
export class LoansModule {}
