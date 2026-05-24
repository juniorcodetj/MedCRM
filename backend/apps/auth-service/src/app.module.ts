import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '@core/audit/audit.module';
import { RedisModule } from '@core/cache/redis.module';
import { PrismaModule } from '@core/database/prisma.module';
import { TenancyModule } from '@core/tenancy/tenancy.module';
import { EventsModule } from '@core/events/events.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { PatientCrmModule } from './patient-crm/patient-crm.module';
import { SmartSchedulingModule } from './smart-scheduling/smart-scheduling.module';
import { OrganizationStructureModule } from './organization-structure/organization-structure.module';
import { EmrModule } from './emr/emr.module';
import { FinanceModule } from './finance/finance.module';
import { CommunicationsModule } from './communications/communications.module';
import { IntegrationGatewayModule } from './integration-gateway/integration.module';
import { BusinessIntelligenceModule } from './business-intelligence/bi.module';
import { InventoryModule } from './inventory-warehouse/inventory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule.forRoot(),
    TenancyModule,
    AuditModule,
    EventsModule,
    AuthModule,
    PatientCrmModule,
    SmartSchedulingModule,
    OrganizationStructureModule,
    EmrModule,
    FinanceModule,
    CommunicationsModule,
    IntegrationGatewayModule,
    BusinessIntelligenceModule,
    InventoryModule
  ],
  controllers: [HealthController]
})
export class AppModule implements NestModule {
  configure(_consumer: MiddlewareConsumer): void {}
}
