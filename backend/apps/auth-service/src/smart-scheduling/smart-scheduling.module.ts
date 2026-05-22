import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SmartSchedulingController } from './smart-scheduling.controller';
import { SmartSchedulingService } from './smart-scheduling.service';
import { RealtimeGateway } from './realtime.gateway';
import { RemindersService } from './reminders.service';
import { ReceptionController } from '../reception/reception.controller';
import { ReceptionService } from '../reception/reception.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [SmartSchedulingController, ReceptionController],
  providers: [SmartSchedulingService, RealtimeGateway, RemindersService, ReceptionService],
  exports: [SmartSchedulingService, RealtimeGateway]
})
export class SmartSchedulingModule {}

