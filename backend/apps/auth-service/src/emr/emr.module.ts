import { Module } from '@nestjs/common';
import { EmrService } from './emr.service';
import { EmrController } from './emr.controller';
import { InventoryModule } from '../inventory-warehouse/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [EmrController],
  providers: [EmrService],
  exports: [EmrService]
})
export class EmrModule {}
