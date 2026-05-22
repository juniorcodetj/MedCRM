import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditLoggerService } from '@core/audit/audit-logger.service';
import { PrismaService } from '@core/database/prisma.service';
import { AuthenticatedUser } from '@core/security/jwt-payload';
import { CreatePatientDto, PatientListQuery, UpdatePatientDto } from './dto/patient.schemas';

@Injectable()
export class PatientCrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggerService
  ) {}

  async list(user: AuthenticatedUser, query: PatientListQuery) {
    const where = this.buildWhere(user, query);
    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        include: { contacts: { orderBy: { isPrimary: 'desc' } }, registrationBranch: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.prisma.patient.count({ where })
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async search(user: AuthenticatedUser, query: PatientListQuery) {
    const result = await this.list(user, query);
    return {
      ...result,
      duplicateCandidates: query.q ? await this.findDuplicateCandidates(user, query.q) : []
    };
  }

  async create(user: AuthenticatedUser, dto: CreatePatientDto) {
    const branchId = dto.registrationBranchId ?? user.branchIds[0];
    this.assertBranchAccess(user, branchId);
    const fullName = this.fullName(dto);
    const patientCode = await this.nextPatientCode(user.tenantId);

    const patient = await this.prisma.patient.create({
      data: {
        tenantId: user.tenantId,
        patientCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        fullName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        gender: dto.gender,
        language: 'ru',
        status: dto.status,
        registrationBranchId: branchId,
        contacts: {
          create: [
            ...(dto.phone ? [this.contactCreate(user.tenantId, 'PHONE', dto.phone, true)] : []),
            ...(dto.email ? [this.contactCreate(user.tenantId, 'EMAIL', dto.email, !dto.phone)] : [])
          ]
        }
      },
      include: { contacts: true, registrationBranch: true }
    });

    await this.audit.log({
      tenantId: user.tenantId,
      branchId,
      userId: user.userId,
      action: 'patient.created',
      entityType: 'patient',
      entityId: patient.id,
      newValuesJson: patient
    });
    return patient;
  }

  async get(user: AuthenticatedUser, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId: user.tenantId, OR: [{ registrationBranchId: null }, { registrationBranchId: { in: user.branchIds } }] },
      include: { contacts: true, registrationBranch: true, appointments: { orderBy: { startAt: 'desc' }, take: 5, include: { service: true } } }
    });
    if (!patient) throw new NotFoundException('Patient not found');
    await this.audit.log({
      tenantId: user.tenantId,
      branchId: patient.registrationBranchId ?? undefined,
      userId: user.userId,
      action: 'patient.viewed',
      entityType: 'patient',
      entityId: patient.id
    });
    return patient;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdatePatientDto) {
    const current = await this.get(user, id);
    const branchId = dto.registrationBranchId ?? current.registrationBranchId ?? user.branchIds[0];
    this.assertBranchAccess(user, branchId);

    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        fullName: dto.firstName || dto.lastName || dto.middleName ? this.fullName({ ...current, ...dto }) : undefined,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        gender: dto.gender,
        status: dto.status,
        registrationBranchId: branchId
      },
      include: { contacts: true, registrationBranch: true }
    });

    await this.audit.log({
      tenantId: user.tenantId,
      branchId,
      userId: user.userId,
      action: 'patient.updated',
      entityType: 'patient',
      entityId: patient.id,
      oldValuesJson: current,
      newValuesJson: patient
    });
    return patient;
  }

  private buildWhere(user: AuthenticatedUser, query: PatientListQuery) {
    if (query.branchId) this.assertBranchAccess(user, query.branchId);
    return {
      tenantId: user.tenantId,
      archivedAt: null,
      ...(query.status ? { status: query.status } : {}),
      AND: [
        {
          OR: query.branchId
            ? [{ registrationBranchId: query.branchId }]
            : [{ registrationBranchId: null }, { registrationBranchId: { in: user.branchIds } }]
        },
        ...(query.q
          ? [
              {
                OR: [
                  { fullName: { contains: query.q, mode: 'insensitive' as const } },
                  { patientCode: { contains: query.q, mode: 'insensitive' as const } },
                  { contacts: { some: { value: { contains: query.q, mode: 'insensitive' as const } } } }
                ]
              }
            ]
          : [])
      ]
    };
  }

  private async findDuplicateCandidates(user: AuthenticatedUser, q: string) {
    const normalized = this.normalize(q);
    const hash = this.hash(normalized);
    return this.prisma.patient.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { contacts: { some: { normalizedValueHash: hash } } }
        ]
      },
      include: { contacts: true },
      take: 5
    });
  }

  private async nextPatientCode(tenantId: string): Promise<string> {
    const count = await this.prisma.patient.count({ where: { tenantId } });
    return `P-${String(count + 1).padStart(6, '0')}`;
  }

  private contactCreate(tenantId: string, type: string, value: string, isPrimary: boolean) {
    const normalized = this.normalize(value);
    return { tenantId, type, value, normalizedValueHash: this.hash(normalized), isPrimary };
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/[\s()+-]/g, '');
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private fullName(input: { firstName?: string; lastName?: string; middleName?: string | null }): string {
    return [input.lastName, input.firstName, input.middleName].filter(Boolean).join(' ');
  }

  private assertBranchAccess(user: AuthenticatedUser, branchId: string): void {
    if (!user.branchIds.includes(branchId)) {
      throw new ForbiddenException('Branch access denied');
    }
  }
}
