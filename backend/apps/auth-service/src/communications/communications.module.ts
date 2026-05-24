import { Module } from '@nestjs/common';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { SmartSchedulingModule } from '../smart-scheduling/smart-scheduling.module';

@Module({
  imports: [SmartSchedulingModule],
  controllers: [CommunicationsController],
  providers: [CommunicationsService],
  exports: [CommunicationsService]
})
export class CommunicationsModule {}
