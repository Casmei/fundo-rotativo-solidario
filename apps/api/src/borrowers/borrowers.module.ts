import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { BorrowersController } from './borrowers.controller.js';
import { BorrowersService } from './borrowers.service.js';

@Module({
  imports: [DbModule],
  controllers: [BorrowersController],
  providers: [BorrowersService],
})
export class BorrowersModule {}
