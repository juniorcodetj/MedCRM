import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { AuthenticatedUser } from '@core/security/jwt-payload';

const BOARD_STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

@Injectable()
export class ReceptionService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user: AuthenticatedUser, branchId?: string) {
    const targetBranchId = branchId ?? user.branchIds[0];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const appointments = await this.prisma.appointment.findMany({
      where: { tenantId: user.tenantId, branchId: targetBranchId, startAt: { gte: start, lt: end } },
      include: { patient: { include: { contacts: true } }, service: true },
      orderBy: { startAt: 'asc' }
    });

    const columns = Object.fromEntries(BOARD_STATUSES.map((status) => [status, appointments.filter((item) => item.status === status)]));
    return { branchId: targetBranchId, date: start.toISOString().slice(0, 10), columns, queue: appointments.filter((item) => ['CONFIRMED', 'CHECKED_IN'].includes(item.status)) };
  }
}

