import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BorrowersModule } from './borrowers/borrowers.module.js';
import { FundsModule } from './funds/funds.module.js';

@Module({
  imports: [AuthModule, BorrowersModule, FundsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
