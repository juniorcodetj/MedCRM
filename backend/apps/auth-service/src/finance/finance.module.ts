import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { SmartSchedulingModule } from '../smart-scheduling/smart-scheduling.module';

@Module({
  imports: [SmartSchedulingModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService]
})
export class FinanceModule {}
