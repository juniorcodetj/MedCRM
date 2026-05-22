import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@core/database/prisma.service';
import { TenantContextService } from '@core/tenancy/tenant-context.service';

export type AuditEventInput = {
  tenantId: string;
  branchId?: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValuesJson?: Prisma.InputJsonValue;
  newValuesJson?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger(AuditLoggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService
  ) {}

  async log(input: AuditEventInput): Promise<void> {
    const context = this.tenantContext.get();
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          userId: input.userId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          oldValuesJson: input.oldValuesJson ?? undefined,
          newValuesJson: input.newValuesJson ?? undefined,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          requestId: context.requestId
        }
      });
    } catch (error) {
      this.logger.error(`Failed to write audit event ${input.action}`, error instanceof Error ? error.stack : undefined);
    }
  }
}

