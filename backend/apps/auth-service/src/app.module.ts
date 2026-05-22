import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '@core/audit/audit.module';
import { RedisModule } from '@core/cache/redis.module';
import { PrismaModule } from '@core/database/prisma.module';
import { TenancyModule } from '@core/tenancy/tenancy.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { PatientCrmModule } from './patient-crm/patient-crm.module';
import { SmartSchedulingModule } from './smart-scheduling/smart-scheduling.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule.forRoot(),
    TenancyModule,
    AuditModule,
    AuthModule,
    PatientCrmModule,
    SmartSchedulingModule
  ],
  controllers: [HealthController]
})
export class AppModule implements NestModule {
  configure(_consumer: MiddlewareConsumer): void {}
}
