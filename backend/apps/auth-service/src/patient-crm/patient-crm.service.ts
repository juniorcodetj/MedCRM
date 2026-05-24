import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditLoggerService } from '@core/audit/audit-logger.service';
import { PrismaService } from '@core/database/prisma.service';
import { AuthenticatedUser } from '@core/security/jwt-payload';
import { CreatePatientDto, PatientListQuery, UpdatePatientDto } from './dto/patient.schemas';
import {
  CrmTagDto,
  FamilyGroupDto,
  FamilyMemberDto,
  PatientLegalDocumentDto,
  PatientNoteDto,
  PatientTimelineEventDto,
  PatientLeadDto
} from './dto/patient-crm.dto';

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

  // Tagging
  async listTags(user: AuthenticatedUser) {
    return this.prisma.crmTag.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { code: 'asc' }
    });
  }

  async createTag(user: AuthenticatedUser, dto: CrmTagDto) {
    return this.prisma.crmTag.create({
      data: {
        tenantId: user.tenantId,
        code: dto.code,
        name: dto.name,
        color: dto.color
      }
    });
  }

  async assignTag(user: AuthenticatedUser, patientId: string, tagId: string) {
    const patient = await this.get(user, patientId);
    const tag = await this.prisma.crmTag.findFirst({ where: { id: tagId, tenantId: user.tenantId } });
    if (!tag) throw new NotFoundException('Tag not found');

    const pt = await this.prisma.patientTag.upsert({
      where: { patientId_tagId: { patientId, tagId } },
      update: {},
      create: {
        tenantId: user.tenantId,
        patientId,
        tagId,
        assignedBy: user.userId
      }
    });

    await this.addTimelineEvent(user, patientId, {
      eventType: 'TAG_ASSIGNED',
      eventSource: 'SYSTEM',
      title: `Присвоен тег: ${tag.name}`,
      metadataJson: { tagId, tagCode: tag.code }
    });

    return pt;
  }

  async removeTag(user: AuthenticatedUser, patientId: string, tagId: string) {
    await this.get(user, patientId);
    await this.prisma.patientTag.delete({
      where: { patientId_tagId: { patientId, tagId } }
    });
    return { success: true };
  }

  // Family Ties
  async getFamily(user: AuthenticatedUser, patientId: string) {
    await this.get(user, patientId);
    const membership = await this.prisma.familyMember.findFirst({
      where: { patientId, tenantId: user.tenantId },
      include: {
        familyGroup: {
          include: {
            members: {
              include: {
                patient: true
              }
            }
          }
        }
      }
    });
    return membership ? membership.familyGroup : null;
  }

  async createFamilyGroup(user: AuthenticatedUser, dto: FamilyGroupDto) {
    return this.prisma.familyGroup.create({
      data: {
        tenantId: user.tenantId,
        familyName: dto.familyName,
        primaryContactPatientId: dto.primaryContactPatientId,
        sharedBalanceEnabled: dto.sharedBalanceEnabled,
        sharedDiscountEnabled: dto.sharedDiscountEnabled
      }
    });
  }

  async addFamilyMember(user: AuthenticatedUser, dto: FamilyMemberDto) {
    await this.get(user, dto.patientId);

    const fg = await this.prisma.familyGroup.findFirst({ where: { id: dto.familyGroupId, tenantId: user.tenantId } });
    if (!fg) throw new NotFoundException('Family group not found');

    return this.prisma.familyMember.create({
      data: {
        tenantId: user.tenantId,
        familyGroupId: dto.familyGroupId,
        patientId: dto.patientId,
        relationType: dto.relationType,
        isPrimaryContact: dto.isPrimaryContact,
        canReceiveNotifications: dto.canReceiveNotifications
      }
    });
  }

  async removeFamilyMember(user: AuthenticatedUser, memberId: string) {
    const member = await this.prisma.familyMember.findFirst({
      where: { id: memberId, tenantId: user.tenantId }
    });
    if (!member) throw new NotFoundException('Family member not found');

    await this.prisma.familyMember.delete({ where: { id: memberId } });
    return { success: true };
  }

  // Legal Documents
  async listLegalDocuments(user: AuthenticatedUser, patientId: string) {
    await this.get(user, patientId);
    return this.prisma.patientLegalDocument.findMany({
      where: { tenantId: user.tenantId, patientId },
      include: { documentType: true, branch: true, signedByUser: true },
      orderBy: { signedAt: 'desc' }
    });
  }

  async signLegalDocument(user: AuthenticatedUser, patientId: string, dto: PatientLegalDocumentDto) {
    await this.get(user, patientId);
    if (dto.branchId) this.assertBranchAccess(user, dto.branchId);

    const docType = await this.prisma.legalDocumentType.findUnique({
      where: { id: dto.documentTypeId }
    });
    if (!docType) throw new NotFoundException('Document type not found');

    const signedDoc = await this.prisma.patientLegalDocument.create({
      data: {
        tenantId: user.tenantId,
        patientId,
        documentTypeId: dto.documentTypeId,
        fileId: dto.fileId,
        documentNumber: dto.documentNumber,
        signedAt: dto.signedAt ? new Date(dto.signedAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        retentionUntil: dto.retentionUntil ? new Date(dto.retentionUntil) : null,
        status: dto.status,
        signedByUserId: user.userId,
        branchId: dto.branchId ?? user.branchIds[0]
      }
    });

    await this.addTimelineEvent(user, patientId, {
      eventType: 'DOCUMENT_SIGNED',
      eventSource: 'SYSTEM',
      title: `Подписан документ: ${docType.name}`,
      description: dto.documentNumber ? `Номер документа: ${dto.documentNumber}` : undefined,
      metadataJson: { documentId: signedDoc.id }
    });

    await this.audit.log({
      tenantId: user.tenantId,
      branchId: dto.branchId ?? user.branchIds[0],
      userId: user.userId,
      action: 'patient.document.signed',
      entityType: 'patient_legal_document',
      entityId: signedDoc.id,
      newValuesJson: signedDoc
    });

    return signedDoc;
  }

  async listTemplates(user: AuthenticatedUser) {
    return this.prisma.legalDocumentTemplate.findMany({
      where: { OR: [{ tenantId: null }, { tenantId: user.tenantId }] },
      include: { documentType: true }
    });
  }

  // Timeline & Notes
  async getTimeline(user: AuthenticatedUser, patientId: string) {
    await this.get(user, patientId);
    return this.prisma.patientTimelineEvent.findMany({
      where: { tenantId: user.tenantId, patientId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createNote(user: AuthenticatedUser, patientId: string, dto: PatientNoteDto) {
    await this.get(user, patientId);
    const note = await this.prisma.patientNote.create({
      data: {
        tenantId: user.tenantId,
        patientId,
        note: dto.note,
        visibility: dto.visibility,
        createdBy: user.userId
      }
    });

    await this.addTimelineEvent(user, patientId, {
      eventType: 'NOTE',
      eventSource: 'STAFF',
      title: 'Добавлена заметка',
      description: dto.note.length > 60 ? dto.note.slice(0, 60) + '...' : dto.note,
      metadataJson: { noteId: note.id }
    });

    return note;
  }

  async addTimelineEvent(user: AuthenticatedUser, patientId: string, dto: PatientTimelineEventDto) {
    return this.prisma.patientTimelineEvent.create({
      data: {
        tenantId: user.tenantId,
        patientId,
        eventType: dto.eventType,
        eventSource: dto.eventSource,
        title: dto.title,
        description: dto.description,
        metadataJson: dto.metadataJson ?? undefined,
        createdBy: user.userId
      }
    });
  }

  // Metrics & Leads
  async getMetrics(user: AuthenticatedUser, patientId: string) {
    await this.get(user, patientId);
    return this.prisma.patientCrmMetric.findUnique({
      where: { patientId }
    });
  }

  async trackLead(user: AuthenticatedUser, patientId: string, dto: PatientLeadDto) {
    await this.get(user, patientId);
    return this.prisma.patientLead.create({
      data: {
        tenantId: user.tenantId,
        patientId,
        sourceType: dto.sourceType,
        sourceName: dto.sourceName,
        campaignName: dto.campaignName,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
        utmContent: dto.utmContent,
        utmTerm: dto.utmTerm,
        conversionAt: dto.conversionAt ? new Date(dto.conversionAt) : null
      }
    });
  }
}
