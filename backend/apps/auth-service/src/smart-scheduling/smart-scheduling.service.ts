import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLoggerService } from '@core/audit/audit-logger.service';
import { PrismaService } from '@core/database/prisma.service';
import { AuthenticatedUser } from '@core/security/jwt-payload';
import { AppointmentListQuery, CreateAppointmentDto, ReserveSlotDto, UpdateAppointmentDto } from './dto/appointment.schemas';
import { RealtimeGateway } from './realtime.gateway';
import { RemindersService } from './reminders.service';

const ACTIVE_STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'];

@Injectable()
export class SmartSchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggerService,
    private readonly realtime: RealtimeGateway,
    private readonly reminders: RemindersService
  ) {}

  async list(user: AuthenticatedUser, query: AppointmentListQuery) {
    const where = this.buildWhere(user, query);
    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: { patient: { include: { contacts: true } }, service: true, branch: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 3 } },
        orderBy: { startAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.prisma.appointment.count({ where })
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async create(user: AuthenticatedUser, dto: CreateAppointmentDto) {
    this.assertBranchAccess(user, dto.branchId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new BadRequestException('endAt must be after startAt');
    await this.assertPatientAccess(user, dto.patientId, dto.branchId);
    await this.assertNoConflict(user.tenantId, dto.employeeId, startAt, endAt);

    const number = await this.nextAppointmentNumber(user.tenantId);
    const appointment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          tenantId: user.tenantId,
          branchId: dto.branchId,
          patientId: dto.patientId,
          employeeId: dto.employeeId,
          serviceId: dto.serviceId,
          appointmentNumber: number,
          bookingSource: dto.bookingSource,
          appointmentType: dto.appointmentType,
          startAt,
          endAt,
          durationMinutes: Math.round((endAt.getTime() - startAt.getTime()) / 60000),
          notes: dto.notes,
          createdBy: user.userId,
          resources: {
            create: [{ tenantId: user.tenantId, resourceType: 'EMPLOYEE', resourceId: dto.employeeId, reservedFrom: startAt, reservedTo: endAt }]
          },
          statusHistory: {
            create: [{ tenantId: user.tenantId, newStatus: 'SCHEDULED', changedBy: user.userId, reason: 'Created' }]
          }
        },
        include: { patient: { include: { contacts: true } }, service: true, branch: true }
      });
      return created;
    });

    await this.reminders.scheduleAppointmentReminder(appointment.id, appointment.startAt);
    await this.audit.log({
      tenantId: user.tenantId,
      branchId: appointment.branchId,
      userId: user.userId,
      action: 'appointment.created',
      entityType: 'appointment',
      entityId: appointment.id,
      newValuesJson: appointment
    });
    this.realtime.emitAppointmentEvent('appointment.created', user.tenantId, appointment.branchId, appointment);
    return appointment;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateAppointmentDto) {
    const current = await this.getForUser(user, id);
    const branchId = dto.branchId ?? current.branchId;
    this.assertBranchAccess(user, branchId);
    const startAt = dto.startAt ? new Date(dto.startAt) : current.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : current.endAt;
    const employeeId = dto.employeeId ?? current.employeeId;
    if (startAt >= endAt) throw new BadRequestException('endAt must be after startAt');
    await this.assertNoConflict(user.tenantId, employeeId, startAt, endAt, id);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.appointmentResource.deleteMany({ where: { appointmentId: id, resourceType: 'EMPLOYEE' } });
      const appointment = await tx.appointment.update({
        where: { id },
        data: {
          branchId,
          patientId: dto.patientId,
          employeeId,
          serviceId: dto.serviceId,
          bookingSource: dto.bookingSource,
          appointmentType: dto.appointmentType,
          startAt,
          endAt,
          durationMinutes: Math.round((endAt.getTime() - startAt.getTime()) / 60000),
          notes: dto.notes,
          status: dto.status,
          cancellationReason: dto.cancellationReason,
          resources: {
            create: [{ tenantId: user.tenantId, resourceType: 'EMPLOYEE', resourceId: employeeId, reservedFrom: startAt, reservedTo: endAt }]
          }
        },
        include: { patient: { include: { contacts: true } }, service: true, branch: true }
      });
      return appointment;
    });
    await this.audit.log({ tenantId: user.tenantId, branchId, userId: user.userId, action: 'appointment.updated', entityType: 'appointment', entityId: id, oldValuesJson: current, newValuesJson: updated });
    this.realtime.emitAppointmentEvent('appointment.updated', user.tenantId, branchId, updated);
    return updated;
  }

  async transition(user: AuthenticatedUser, id: string, status: string, reason?: string) {
    const current = await this.getForUser(user, id);
    this.assertBranchAccess(user, current.branchId);
    const data: Record<string, Date | string | null> = { status };
    if (status === 'CONFIRMED') data.confirmedAt = new Date();
    if (status === 'CHECKED_IN') data.checkedInAt = new Date();
    if (status === 'COMPLETED') data.completedAt = new Date();
    if (status === 'CANCELLED') {
      data.cancelledAt = new Date();
      data.cancellationReason = reason ?? null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.update({
        where: { id },
        data,
        include: { patient: { include: { contacts: true } }, service: true, branch: true }
      });
      await tx.appointmentStatusHistory.create({
        data: { tenantId: user.tenantId, appointmentId: id, oldStatus: current.status, newStatus: status, changedBy: user.userId, reason }
      });
      return appointment;
    });
    await this.audit.log({ tenantId: user.tenantId, branchId: updated.branchId, userId: user.userId, action: `appointment.${status.toLowerCase()}`, entityType: 'appointment', entityId: id, oldValuesJson: current, newValuesJson: updated });
    const event = status === 'CHECKED_IN' ? 'appointment.checked_in' : 'appointment.updated';
    this.realtime.emitAppointmentEvent(event, user.tenantId, updated.branchId, updated);
    return updated;
  }

  async availability(user: AuthenticatedUser, query: AppointmentListQuery) {
    const where = this.buildWhere(user, query);
    const appointments = await this.prisma.appointment.findMany({ where, select: { employeeId: true, startAt: true, endAt: true, status: true } });
    return { busy: appointments.filter((item) => ACTIVE_STATUSES.includes(item.status)) };
  }

  async reserveSlot(user: AuthenticatedUser, dto: ReserveSlotDto) {
    this.assertBranchAccess(user, dto.branchId);
    const slotKey = `${dto.branchId}:${dto.employeeId}:${dto.startAt}:${dto.endAt}`;
    return this.prisma.appointmentReservation.create({
      data: {
        tenantId: user.tenantId,
        slotKey,
        reservedBy: user.userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });
  }

  services(user: AuthenticatedUser) {
    return this.prisma.service.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { name: 'asc' } });
  }

  async doctors(user: AuthenticatedUser) {
    const assignments = await this.prisma.userBranchRole.findMany({
      where: { tenantId: user.tenantId, branchId: { in: user.branchIds }, activeTo: null },
      include: { user: true, branch: true, role: true }
    });
    return assignments.map((item) => ({ id: item.user.id, name: `${item.user.lastName} ${item.user.firstName}`, branchId: item.branchId, branchName: item.branch.name, role: item.role.code }));
  }

  private buildWhere(user: AuthenticatedUser, query: AppointmentListQuery) {
    if (query.branchId) this.assertBranchAccess(user, query.branchId);
    return {
      tenantId: user.tenantId,
      branchId: query.branchId ?? { in: user.branchIds },
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo
        ? { startAt: { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}) } }
        : {})
    };
  }

  private async getForUser(user: AuthenticatedUser, id: string) {
    const appointment = await this.prisma.appointment.findFirst({ where: { id, tenantId: user.tenantId, branchId: { in: user.branchIds } } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  private async assertPatientAccess(user: AuthenticatedUser, patientId: string, branchId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId: user.tenantId, OR: [{ registrationBranchId: null }, { registrationBranchId: branchId }] } });
    if (!patient) throw new BadRequestException('Patient is not available in this branch');
  }

  private async assertNoConflict(tenantId: string, employeeId: string, startAt: Date, endAt: Date, excludeAppointmentId?: string) {
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        employeeId,
        status: { in: ACTIVE_STATUSES },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        startAt: { lt: endAt },
        endAt: { gt: startAt }
      }
    });
    if (conflict) throw new BadRequestException('Employee has an appointment conflict for this slot');
  }

  private async nextAppointmentNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.appointment.count({ where: { tenantId } });
    return `A-${String(count + 1).padStart(6, '0')}`;
  }

  private assertBranchAccess(user: AuthenticatedUser, branchId: string): void {
    if (!user.branchIds.includes(branchId)) throw new ForbiddenException('Branch access denied');
  }
}

