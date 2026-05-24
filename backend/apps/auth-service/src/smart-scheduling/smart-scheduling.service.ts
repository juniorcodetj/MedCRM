import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@core/cache/redis.module';
import { AuditLoggerService } from '@core/audit/audit-logger.service';
import { PrismaService } from '@core/database/prisma.service';
import { AuthenticatedUser } from '@core/security/jwt-payload';
import {
  AppointmentListQuery,
  CreateAppointmentDto,
  ReserveSlotDto,
  UpdateAppointmentDto,
  CreateWaitingListDto,
  UpdateWaitingListDto,
  ResourceBufferDto,
  RecurrenceRuleDto,
  PublicSlotsQueryDto,
  OnlineBookingReserveDto,
  OnlineBookingConfirmDto
} from './dto/appointment.schemas';
import { RealtimeGateway } from './realtime.gateway';
import { RemindersService } from './reminders.service';

const ACTIVE_STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'];

@Injectable()
export class SmartSchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggerService,
    private readonly realtime: RealtimeGateway,
    private readonly reminders: RemindersService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  // Distributed Lock Helpers (Idempotent Redis locking)
  private async acquireLock(key: string, ttlMs = 5000): Promise<boolean> {
    const res = await this.redis.setnx(key, 'lock');
    if (res === 1) {
      await this.redis.pexpire(key, ttlMs);
      return true;
    }
    return false;
  }

  private async releaseLock(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async list(user: AuthenticatedUser, query: AppointmentListQuery) {
    const where = this.buildWhere(user, query);
    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: {
          patient: { include: { contacts: true } },
          service: true,
          branch: true,
          statusHistory: { orderBy: { createdAt: 'desc' }, take: 3 }
        },
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

    // Redis distributed lock on employee resource
    const lockKey = `lock:tenant:${user.tenantId}:employee:${dto.employeeId}`;
    let locked = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      locked = await this.acquireLock(lockKey);
      if (locked) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!locked) throw new BadRequestException('Slot is currently being processed. Please try again.');

    try {
      // Auto-resolve required resources based on service requirements
      let roomId: string | null = null;
      let equipmentIds: string[] = [];
      if (dto.serviceId) {
        const resolved = await this.resolveRequiredResources(
          user.tenantId,
          dto.branchId,
          dto.serviceId,
          startAt,
          endAt
        );
        roomId = resolved.roomId;
        equipmentIds = resolved.equipmentIds;
      }

      // Check conflicts
      await this.assertNoConflict(
        user.tenantId,
        dto.branchId,
        dto.employeeId,
        startAt,
        endAt,
        undefined,
        roomId,
        equipmentIds
      );

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
              create: [
                { tenantId: user.tenantId, resourceType: 'EMPLOYEE', resourceId: dto.employeeId, reservedFrom: startAt, reservedTo: endAt },
                ...(roomId ? [{ tenantId: user.tenantId, resourceType: 'ROOM', resourceId: roomId, reservedFrom: startAt, reservedTo: endAt }] : []),
                ...equipmentIds.map(eqId => ({ tenantId: user.tenantId, resourceType: 'EQUIPMENT', resourceId: eqId, reservedFrom: startAt, reservedTo: endAt }))
              ]
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
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateAppointmentDto) {
    const current = await this.getForUser(user, id);
    const branchId = dto.branchId ?? current.branchId;
    this.assertBranchAccess(user, branchId);
    const startAt = dto.startAt ? new Date(dto.startAt) : current.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : current.endAt;
    const employeeId = dto.employeeId ?? current.employeeId;
    if (startAt >= endAt) throw new BadRequestException('endAt must be after startAt');

    const lockKey = `lock:tenant:${user.tenantId}:employee:${employeeId}`;
    let locked = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      locked = await this.acquireLock(lockKey);
      if (locked) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!locked) throw new BadRequestException('Slot is currently being processed. Please try again.');

    try {
      // Find current room resource assigned to the appointment
      const currentRoomRes = await this.prisma.appointmentResource.findFirst({
        where: { appointmentId: id, resourceType: 'ROOM' }
      });

      let roomId: string | null = dto.branchId ? null : (currentRoomRes?.resourceId ?? null);
      let equipmentIds: string[] = [];
      
      const serviceId = dto.serviceId ?? current.serviceId;
      if (serviceId) {
        const resolved = await this.resolveRequiredResources(
          user.tenantId,
          branchId,
          serviceId,
          startAt,
          endAt,
          dto.branchId ? null : (currentRoomRes?.resourceId ?? null)
        );
        roomId = resolved.roomId;
        equipmentIds = resolved.equipmentIds;
      }

      await this.assertNoConflict(
        user.tenantId,
        branchId,
        employeeId,
        startAt,
        endAt,
        id,
        roomId,
        equipmentIds
      );

      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.appointmentResource.deleteMany({ where: { appointmentId: id } });
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
              create: [
                { tenantId: user.tenantId, resourceType: 'EMPLOYEE', resourceId: employeeId, reservedFrom: startAt, reservedTo: endAt },
                ...(roomId ? [{ tenantId: user.tenantId, resourceType: 'ROOM', resourceId: roomId, reservedFrom: startAt, reservedTo: endAt }] : []),
                ...equipmentIds.map(eqId => ({ tenantId: user.tenantId, resourceType: 'EQUIPMENT', resourceId: eqId, reservedFrom: startAt, reservedTo: endAt }))
              ]
            }
          },
          include: { patient: { include: { contacts: true } }, service: true, branch: true }
        });
        return appointment;
      });

      await this.audit.log({
        tenantId: user.tenantId,
        branchId,
        userId: user.userId,
        action: 'appointment.updated',
        entityType: 'appointment',
        entityId: id,
        oldValuesJson: current,
        newValuesJson: updated
      });
      this.realtime.emitAppointmentEvent('appointment.updated', user.tenantId, branchId, updated);
      return updated;
    } finally {
      await this.releaseLock(lockKey);
    }
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

    await this.audit.log({
      tenantId: user.tenantId,
      branchId: updated.branchId,
      userId: user.userId,
      action: `appointment.${status.toLowerCase()}`,
      entityType: 'appointment',
      entityId: id,
      oldValuesJson: current,
      newValuesJson: updated
    });

    const event = status === 'CHECKED_IN' ? 'appointment.checked_in' : 'appointment.updated';
    this.realtime.emitAppointmentEvent(event, user.tenantId, updated.branchId, updated);

    // If cancelled, trigger Waiting List slot matching flow
    if (status === 'CANCELLED') {
      await this.matchWaitingListSlot(user, current);
    }

    return updated;
  }

  async availability(user: AuthenticatedUser, query: AppointmentListQuery) {
    const where = this.buildWhere(user, query);
    const appointments = await this.prisma.appointment.findMany({
      where,
      select: { employeeId: true, startAt: true, endAt: true, status: true }
    });
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
    return assignments.map((item) => ({
      id: item.user.id,
      name: `${item.user.lastName} ${item.user.firstName}`,
      branchId: item.branchId,
      branchName: item.branch.name,
      role: item.role.code
    }));
  }

  // Conflict Resolution Helpers
  private async checkEntitySchedule(tenantId: string, entityType: string, entityId: string, startAt: Date, endAt: Date) {
    const dateStr = startAt.toISOString().slice(0, 10);
    const exception = await this.prisma.scheduleException.findFirst({
      where: { tenantId, entityType, entityId, exceptionDate: new Date(dateStr) }
    });

    if (exception) {
      if (exception.isDayOff) {
        throw new BadRequestException(`${entityType} is on day off on this date`);
      }
      if (exception.startTime && exception.endTime) {
        const [eStartH, eStartM] = exception.startTime.split(':').map(Number);
        const [eEndH, eEndM] = exception.endTime.split(':').map(Number);
        const exceptionStart = new Date(startAt);
        exceptionStart.setHours(eStartH, eStartM, 0, 0);
        const exceptionEnd = new Date(startAt);
        exceptionEnd.setHours(eEndH, eEndM, 0, 0);
        if (startAt < exceptionStart || endAt > exceptionEnd) {
          throw new BadRequestException(`${entityType} working hours on this date are restricted to ${exception.startTime}-${exception.endTime}`);
        }
      }
    }

    const weekday = startAt.getDay() === 0 ? 7 : startAt.getDay();
    const schedules = await this.prisma.workingSchedule.findMany({
      where: { tenantId, entityType, entityId, weekday, isActive: true }
    });

    if (schedules.length > 0) {
      let withinSchedule = false;
      for (const sched of schedules) {
        const [sH, sM] = sched.startTime.split(':').map(Number);
        const [eH, eM] = sched.endTime.split(':').map(Number);
        const schedStart = new Date(startAt);
        schedStart.setHours(sH, sM, 0, 0);
        const schedEnd = new Date(startAt);
        schedEnd.setHours(eH, eM, 0, 0);

        if (startAt >= schedStart && endAt <= schedEnd) {
          if (sched.breakStart && sched.breakEnd) {
            const [bSH, bSM] = sched.breakStart.split(':').map(Number);
            const [bEH, bEM] = sched.breakEnd.split(':').map(Number);
            const breakStart = new Date(startAt);
            breakStart.setHours(bSH, bSM, 0, 0);
            const breakEnd = new Date(startAt);
            breakEnd.setHours(bEH, bEM, 0, 0);

            if (startAt < breakEnd && endAt > breakStart) {
              continue;
            }
          }
          withinSchedule = true;
          break;
        }
      }
      if (!withinSchedule) {
        throw new BadRequestException(`${entityType} schedule does not allow bookings at this hour`);
      }
    }
  }

  private async checkOverlap(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string
  ) {
    const buffer = await this.prisma.resourceBuffer.findUnique({
      where: { tenantId_resourceType_resourceId: { tenantId, resourceType, resourceId } }
    });
    const beforeMinutes = buffer?.beforeMinutes ?? 0;
    const afterMinutes = buffer?.afterMinutes ?? 0;

    const newStartWithBuffer = new Date(startAt.getTime() - beforeMinutes * 60 * 1000);
    const newEndWithBuffer = new Date(endAt.getTime() + afterMinutes * 60 * 1000);

    const conflict = await this.prisma.appointmentResource.findFirst({
      where: {
        tenantId,
        resourceType,
        resourceId,
        appointmentId: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
        appointment: { status: { in: ACTIVE_STATUSES } },
        reservedFrom: { lt: newEndWithBuffer },
        reservedTo: { gt: newStartWithBuffer }
      },
      include: { appointment: true }
    });

    if (conflict) {
      throw new BadRequestException(`${resourceType} is already occupied by appointment ${conflict.appointment.appointmentNumber}`);
    }
  }

  private async assertNoConflict(
    tenantId: string,
    branchId: string,
    employeeId: string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string,
    roomId?: string | null,
    equipmentIds: string[] = []
  ) {
    await this.checkEntitySchedule(tenantId, 'branch', branchId, startAt, endAt);
    await this.checkEntitySchedule(tenantId, 'employee', employeeId, startAt, endAt);
    await this.checkOverlap(tenantId, 'EMPLOYEE', employeeId, startAt, endAt, excludeAppointmentId);

    if (roomId) {
      await this.checkEntitySchedule(tenantId, 'room', roomId, startAt, endAt);
      await this.checkOverlap(tenantId, 'ROOM', roomId, startAt, endAt, excludeAppointmentId);
    }
    for (const eqId of equipmentIds) {
      await this.checkEntitySchedule(tenantId, 'equipment', eqId, startAt, endAt);
      await this.checkOverlap(tenantId, 'EQUIPMENT', eqId, startAt, endAt, excludeAppointmentId);
    }
  }

  private async resolveRequiredResources(
    tenantId: string,
    branchId: string,
    serviceId: string,
    startAt: Date,
    endAt: Date,
    requestedRoomId?: string | null,
    requestedEquipmentIds: string[] = []
  ): Promise<{ roomId: string | null; equipmentIds: string[] }> {
    let resolvedRoomId: string | null = requestedRoomId ?? null;
    const resolvedEquipmentIds: string[] = [...requestedEquipmentIds];

    const requiredResources = await this.prisma.serviceRequiredResource.findMany({
      where: { tenantId, serviceId }
    });

    const roomReq = requiredResources.find((r) => r.resourceType === 'ROOM_TYPE');
    if (roomReq && !resolvedRoomId) {
      const rooms = await this.prisma.room.findMany({
        where: { tenantId, branchId, roomTypeId: roomReq.resourceCategoryId, isActive: true, status: 'ACTIVE' }
      });
      for (const rm of rooms) {
        try {
          await this.checkEntitySchedule(tenantId, 'room', rm.id, startAt, endAt);
          await this.checkOverlap(tenantId, 'ROOM', rm.id, startAt, endAt);
          resolvedRoomId = rm.id;
          break;
        } catch {}
      }
      if (!resolvedRoomId) {
        throw new BadRequestException('No available room matching service requirements');
      }
    }

    const eqReqs = requiredResources.filter((r) => r.resourceType === 'EQUIPMENT_CATEGORY');
    for (const eqReq of eqReqs) {
      const alreadyHasCategory = await this.prisma.equipment.findFirst({
        where: { id: { in: resolvedEquipmentIds }, categoryId: eqReq.resourceCategoryId }
      });

      if (!alreadyHasCategory) {
        const equipmentItems = await this.prisma.equipment.findMany({
          where: { tenantId, branchId, categoryId: eqReq.resourceCategoryId, status: 'ACTIVE' }
        });
        let foundEqId: string | null = null;
        for (const eq of equipmentItems) {
          try {
            await this.checkEntitySchedule(tenantId, 'equipment', eq.id, startAt, endAt);
            await this.checkOverlap(tenantId, 'EQUIPMENT', eq.id, startAt, endAt);
            foundEqId = eq.id;
            break;
          } catch {}
        }
        if (!foundEqId) {
          throw new BadRequestException('No available equipment matching service requirements');
        }
        resolvedEquipmentIds.push(foundEqId);
      }
    }

    return { roomId: resolvedRoomId, equipmentIds: resolvedEquipmentIds };
  }

  // Waiting List Logic
  async listWaitingList(user: AuthenticatedUser) {
    return this.prisma.waitingList.findMany({
      where: { tenantId: user.tenantId, status: 'ACTIVE' },
      include: { patient: true, employee: true, service: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
    });
  }

  async createWaitingList(user: AuthenticatedUser, dto: CreateWaitingListDto) {
    this.assertBranchAccess(user, dto.branchId);
    return this.prisma.waitingList.create({
      data: {
        tenantId: user.tenantId,
        patientId: dto.patientId,
        branchId: dto.branchId,
        employeeId: dto.employeeId,
        preferredDateFrom: new Date(dto.preferredDateFrom),
        preferredDateTo: new Date(dto.preferredDateTo),
        preferredTimeFrom: dto.preferredTimeFrom,
        preferredTimeTo: dto.preferredTimeTo,
        serviceId: dto.serviceId,
        priority: dto.priority,
        notes: dto.notes
      }
    });
  }

  async updateWaitingList(user: AuthenticatedUser, id: string, dto: UpdateWaitingListDto) {
    const entry = await this.prisma.waitingList.findFirst({
      where: { id, tenantId: user.tenantId }
    });
    if (!entry) throw new NotFoundException('Waiting list entry not found');
    if (dto.branchId) this.assertBranchAccess(user, dto.branchId);

    return this.prisma.waitingList.update({
      where: { id },
      data: {
        branchId: dto.branchId,
        employeeId: dto.employeeId,
        preferredDateFrom: dto.preferredDateFrom ? new Date(dto.preferredDateFrom) : undefined,
        preferredDateTo: dto.preferredDateTo ? new Date(dto.preferredDateTo) : undefined,
        preferredTimeFrom: dto.preferredTimeFrom,
        preferredTimeTo: dto.preferredTimeTo,
        serviceId: dto.serviceId,
        priority: dto.priority,
        notes: dto.notes,
        status: dto.status
      }
    });
  }

  async deleteWaitingList(user: AuthenticatedUser, id: string) {
    const entry = await this.prisma.waitingList.findFirst({
      where: { id, tenantId: user.tenantId }
    });
    if (!entry) throw new NotFoundException('Waiting list entry not found');
    await this.prisma.waitingList.delete({ where: { id } });
    return { success: true };
  }

  async matchWaitingListSlot(user: AuthenticatedUser, appointment: any) {
    const waitlist = await this.prisma.waitingList.findMany({
      where: {
        tenantId: user.tenantId,
        branchId: appointment.branchId,
        status: 'ACTIVE',
        preferredDateFrom: { lte: appointment.startAt },
        preferredDateTo: { gte: appointment.startAt }
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
    });

    const appHourMin = appointment.startAt.toISOString().slice(11, 16); // e.g. "14:30"

    for (const entry of waitlist) {
      if (entry.serviceId && entry.serviceId !== appointment.serviceId) continue;
      if (entry.employeeId && entry.employeeId !== appointment.employeeId) continue;
      if (entry.preferredTimeFrom && appHourMin < entry.preferredTimeFrom) continue;
      if (entry.preferredTimeTo && appHourMin > entry.preferredTimeTo) continue;

      // Found a match!
      await this.prisma.waitingList.update({
        where: { id: entry.id },
        data: { status: 'MATCHED' }
      });

      // Create a temporary slot reservation for the patient
      const slotKey = `${appointment.branchId}:${appointment.employeeId}:${appointment.startAt.toISOString()}:${appointment.endAt.toISOString()}`;
      await this.prisma.appointmentReservation.upsert({
        where: { tenantId_slotKey: { tenantId: user.tenantId, slotKey } },
        update: { expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
        create: {
          tenantId: user.tenantId,
          slotKey,
          reservedBy: entry.patientId,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });

      // Emit event
      this.realtime.emitAppointmentEvent('waitinglist.matched', user.tenantId, appointment.branchId, {
        waitingListId: entry.id,
        patientId: entry.patientId,
        slotKey,
        startAt: appointment.startAt,
        endAt: appointment.endAt
      });
      break; // Only match the first priority patient
    }
  }

  // Buffers logic
  async listResourceBuffers(user: AuthenticatedUser) {
    return this.prisma.resourceBuffer.findMany({
      where: { tenantId: user.tenantId }
    });
  }

  async upsertResourceBuffer(user: AuthenticatedUser, dto: ResourceBufferDto) {
    return this.prisma.resourceBuffer.upsert({
      where: {
        tenantId_resourceType_resourceId: {
          tenantId: user.tenantId,
          resourceType: dto.resourceType,
          resourceId: dto.resourceId
        }
      },
      update: {
        beforeMinutes: dto.beforeMinutes,
        afterMinutes: dto.afterMinutes
      },
      create: {
        tenantId: user.tenantId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        beforeMinutes: dto.beforeMinutes,
        afterMinutes: dto.afterMinutes
      }
    });
  }

  async deleteResourceBuffer(user: AuthenticatedUser, id: string) {
    const buf = await this.prisma.resourceBuffer.findFirst({
      where: { id, tenantId: user.tenantId }
    });
    if (!buf) throw new NotFoundException('Resource buffer not found');
    await this.prisma.resourceBuffer.delete({ where: { id } });
    return { success: true };
  }

  // Public Booking Engine
  async getPublicSlots(user: AuthenticatedUser, query: PublicSlotsQueryDto) {
    this.assertBranchAccess(user, query.branchId);

    const targetDate = new Date(query.date);
    const weekday = targetDate.getDay() === 0 ? 7 : targetDate.getDay();

    const employees = query.employeeId
      ? [{ id: query.employeeId }]
      : await this.prisma.employee.findMany({
          where: { tenantId: user.tenantId, status: 'ACTIVE' }
        });

    const duration = query.serviceId
      ? (await this.prisma.service.findUnique({ where: { id: query.serviceId } }))?.durationMinutes ?? 30
      : 30;

    const availableSlots: string[] = [];

    for (const emp of employees) {
      const schedules = await this.prisma.workingSchedule.findMany({
        where: { tenantId: user.tenantId, entityType: 'employee', entityId: emp.id, weekday, isActive: true }
      });
      if (schedules.length === 0) continue;

      for (const sched of schedules) {
        const [sH, sM] = sched.startTime.split(':').map(Number);
        const [eH, eM] = sched.endTime.split(':').map(Number);

        const currentSlotStart = new Date(targetDate);
        currentSlotStart.setHours(sH, sM, 0, 0);
        const workEnd = new Date(targetDate);
        workEnd.setHours(eH, eM, 0, 0);

        while (currentSlotStart.getTime() + duration * 60 * 1000 <= workEnd.getTime()) {
          const slotEnd = new Date(currentSlotStart.getTime() + duration * 60 * 1000);

          try {
            // Dry run assertions
            let roomId: string | null = null;
            let equipmentIds: string[] = [];
            if (query.serviceId) {
              const resolved = await this.resolveRequiredResources(
                user.tenantId,
                query.branchId,
                query.serviceId,
                currentSlotStart,
                slotEnd
              );
              roomId = resolved.roomId;
              equipmentIds = resolved.equipmentIds;
            }

            await this.assertNoConflict(
              user.tenantId,
              query.branchId,
              emp.id,
              currentSlotStart,
              slotEnd,
              undefined,
              roomId,
              equipmentIds
            );

            // Double check if slot is temporarily reserved
            const slotKey = `${query.branchId}:${emp.id}:${currentSlotStart.toISOString()}:${slotEnd.toISOString()}`;
            const reserved = await this.prisma.appointmentReservation.findFirst({
              where: { tenantId: user.tenantId, slotKey, expiresAt: { gt: new Date() } }
            });

            if (!reserved) {
              availableSlots.push(currentSlotStart.toISOString());
            }
          } catch {}

          currentSlotStart.setTime(currentSlotStart.getTime() + 30 * 60 * 1000); // step by 30 mins
        }
      }
    }

    return { date: query.date, slots: Array.from(new Set(availableSlots)).sort() };
  }

  async onlineBookingReserve(user: AuthenticatedUser, dto: OnlineBookingReserveDto) {
    this.assertBranchAccess(user, dto.branchId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    // Double check conflicts
    let roomId: string | null = null;
    let equipmentIds: string[] = [];
    if (dto.serviceId) {
      const resolved = await this.resolveRequiredResources(
        user.tenantId,
        dto.branchId,
        dto.serviceId,
        startAt,
        endAt
      );
      roomId = resolved.roomId;
      equipmentIds = resolved.equipmentIds;
    }

    await this.assertNoConflict(
      user.tenantId,
      dto.branchId,
      dto.employeeId,
      startAt,
      endAt,
      undefined,
      roomId,
      equipmentIds
    );

    const slotKey = `${dto.branchId}:${dto.employeeId}:${dto.startAt}:${dto.endAt}`;
    await this.prisma.appointmentReservation.upsert({
      where: { tenantId_slotKey: { tenantId: user.tenantId, slotKey } },
      update: { expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      create: {
        tenantId: user.tenantId,
        slotKey,
        reservedBy: dto.patientId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });

    const token = createHash('sha256').update(`${slotKey}:${Date.now()}`).digest('hex');
    await this.prisma.onlineBookingToken.create({
      data: {
        tenantId: user.tenantId,
        patientId: dto.patientId,
        token,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });

    // Mock generated verification code "1234"
    return { token, code: '1234', expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
  }

  async onlineBookingConfirm(user: AuthenticatedUser, dto: OnlineBookingConfirmDto) {
    if (dto.code !== '1234') {
      throw new BadRequestException('Invalid confirmation code');
    }

    const bookingToken = await this.prisma.onlineBookingToken.findFirst({
      where: { token: dto.token, tenantId: user.tenantId, expiresAt: { gt: new Date() } }
    });
    if (!bookingToken) {
      throw new BadRequestException('Online booking token expired or invalid');
    }

    const reservation = await this.prisma.appointmentReservation.findFirst({
      where: { tenantId: user.tenantId, reservedBy: bookingToken.patientId, expiresAt: { gt: new Date() } }
    });
    if (!reservation) {
      throw new BadRequestException('Reservation expired. Please start over.');
    }

    const [branchId, employeeId, startAtStr, endAtStr] = reservation.slotKey.split(':');
    const startAt = new Date(startAtStr);
    const endAt = new Date(endAtStr);

    const newAppointment = await this.create(user, {
      branchId,
      patientId: bookingToken.patientId,
      employeeId,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      bookingSource: 'ONLINE_WIDGET',
      appointmentType: 'CONSULTATION',
      notes: 'Online booking self-registration'
    });

    await this.prisma.onlineBookingToken.delete({ where: { id: bookingToken.id } });
    await this.prisma.appointmentReservation.delete({ where: { id: reservation.id } });

    return newAppointment;
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

  private async nextAppointmentNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.appointment.count({ where: { tenantId } });
    return `A-${String(count + 1).padStart(6, '0')}`;
  }

  private async assertPatientAccess(user: AuthenticatedUser, patientId: string, branchId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId: user.tenantId, OR: [{ registrationBranchId: null }, { registrationBranchId: branchId }] }
    });
    if (!patient) throw new BadRequestException('Patient is not available in this branch');
  }

  private async getForUser(user: AuthenticatedUser, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId: user.tenantId, branchId: { in: user.branchIds } }
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  private assertBranchAccess(user: AuthenticatedUser, branchId: string): void {
    if (!user.branchIds.includes(branchId)) throw new ForbiddenException('Branch access denied');
  }
}
