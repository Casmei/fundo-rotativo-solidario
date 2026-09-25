import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { FundsController } from './funds.controller.js';
import { FundsService } from './funds.service.js';

@Module({
  imports: [DbModule],
  controllers: [FundsController],
  providers: [FundsService],
  exports: [FundsService],
})
export class FundsModule {}
