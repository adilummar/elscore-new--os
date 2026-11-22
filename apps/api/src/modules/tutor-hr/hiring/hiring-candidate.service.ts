import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TutorLeadStageCode } from '@prisma/client';

import { AuditService } from '../../../common/audit/audit.service';
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';
import { RbacService } from '../../../common/rbac/rbac.service';

import {
  assertDecisionChange,
  assertStageAdvance,
  HiringDecision,
  HiringRuleError,
  HiringStage,
} from './hiring-rules';
import {
  AddEnquiryDto,
  AdvanceStageDto,
  ChangeDecisionDto,
  ListCandidatesQueryDto,
  LogCallDto,
  RegisterCandidateDto,
  SetCvReceivedDto,
  UpdateCandidateDetailsDto,
} from './hiring.dto';
import { InvalidPhoneError, normalizePhone } from './phone.util';

/** Legacy `currentStage` values kept in sync so existing HR Tutor screens stay coherent. */
const LEGACY_STAGE: Record<HiringStage, TutorLeadStageCode> = {
  LEAD: TutorLeadStageCode.LEAD,
  DETAILS_SHARED: TutorLeadStageCode.DETAILS_SHARED,
  CV: TutorLeadStageCode.CV_SHARED,
  LIVE_DEMO_INTERVIEW: TutorLeadStageCode.DEMO,
};

const DETAIL_SCALARS = [
  'firstName', 'lastName', 'motherTongueId', 'onlineTeachingExperience', 'offlineTeachingExperience',
  'expectedHourlyRate', 'additionalPhone', 'remarks', 'detailsDescription', 'detailsRespondedAt',
] as const;

export const DUPLICATE_CANDIDATE = 'DUPLICATE_CANDIDATE';

@Injectable()
export class HiringCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGenerator: IdGeneratorService,
    private readonly rbac: RbacService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private mapRuleError<T>(fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof HiringRuleError || e instanceof InvalidPhoneError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private splitName(name?: string): { firstName: string; lastName: string } {
    const t = (name ?? '').trim().replace(/\s+/g, ' ');
    if (!t) return { firstName: '', lastName: '' };
    const i = t.indexOf(' ');
    return i < 0 ? { firstName: t, lastName: '' } : { firstName: t.slice(0, i), lastName: t.slice(i + 1) };
  }

  private displayName(l: { firstName: string; lastName: string }): string | null {
    return `${l.firstName} ${l.lastName}`.trim() || null;
  }

  private async canReadAll(userId: string): Promise<boolean> {
    return this.rbac.hasPermissions(userId, ['tutor_hiring.read-all']);
  }

  private async loadLead(id: string) {
    const lead = await this.prisma.tutorLead.findFirst({ where: { id, deletedAt: null } });
    if (!lead) throw new NotFoundException('Candidate not found');
    return lead;
  }

  /**
   * Record-level write scope. Tutor Head / HR Manager (tutor_hiring.read-all) may modify any
   * candidate; others only candidates they created, are assigned to, or take part in a demo for.
   * Reads are department-wide for tutor_lead.read so duplicates can be opened.
   */
  async assertCanModifyLead(lead: { id: string; createdByUserId: string; assignedToUserId: string | null }, userId: string) {
    if (lead.createdByUserId === userId || lead.assignedToUserId === userId) return;
    if (await this.canReadAll(userId)) return;
    const participant = await this.prisma.tutorDemoBooking.count({
      where: {
        tutorLeadId: lead.id,
        OR: [{ assignedToUserId: userId }, { bookedByUserId: userId }, { attendedByUserId: userId }],
      },
    });
    if (!participant) throw new ForbiddenException('You do not have access to modify this candidate');
  }

  private duplicateSummary(l: {
    id: string; businessId: string; firstName: string; lastName: string; phoneCountryCode: string | null;
    hiringStage: string | null; decision: string | null; createdAt: Date; assignedTo?: { email: string } | null;
    createdBy?: { email: string } | null;
  }) {
    return {
      id: l.id,
      candidateId: l.businessId,
      name: this.displayName(l),
      stage: l.hiringStage,
      decision: l.decision,
      registeredAt: l.createdAt,
      owner: l.assignedTo?.email ?? l.createdBy?.email ?? null,
    };
  }

  private async findByNormalizedPhone(db: PrismaService | PrismaTxClient, normalized: string) {
    return db.tutorLead.findFirst({
      where: { phoneNormalized: normalized, deletedAt: null },
      include: { assignedTo: { select: { email: true } }, createdBy: { select: { email: true } } },
    });
  }

  // ── Registration & duplicates ─────────────────────────────────────────────

  async checkDuplicate(phone: string, countryCode?: string) {
    const n = this.mapRuleError(() => normalizePhone(phone, countryCode));
    const existing = await this.findByNormalizedPhone(this.prisma, n.normalized);
    return { normalized: n.normalized, duplicate: !!existing, existing: existing ? this.duplicateSummary(existing) : null };
  }

  async register(dto: RegisterCandidateDto, actorUserId: string) {
    const n = this.mapRuleError(() => normalizePhone(dto.phone, dto.countryCode));
    const source = await this.prisma.tutorLeadSource.findFirst({ where: { id: dto.sourceId, isActive: true } });
    if (!source) throw new BadRequestException('Lead source not found or inactive');
    const { firstName, lastName } = this.splitName(dto.name);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // Serialise concurrent registrations of the same number until a DB unique index exists.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'tutor-hiring-phone:' + n.normalized}))`;

      const existing = await this.findByNormalizedPhone(tx, n.normalized);
      if (existing) {
        throw new ConflictException({
          code: DUPLICATE_CANDIDATE,
          message: 'A candidate with this phone number already exists',
          existing: this.duplicateSummary(existing),
        });
      }

      const businessId = await this.idGenerator.nextIdInTx(tx, 'TL');
      const lead = await tx.tutorLead.create({
        data: {
          businessId,
          firstName,
          lastName,
          phone: `${n.countryCode}${n.nationalNumber}`,
          phoneCountryCode: n.countryCode,
          phoneNormalized: n.normalized,
          currentStage: TutorLeadStageCode.LEAD,
          hiringStage: 'LEAD',
          createdByUserId: actorUserId,
          assignedToUserId: actorUserId,
        },
      });
      await tx.tutorLeadEnquiry.create({
        data: {
          tutorLeadId: lead.id,
          sourceId: dto.sourceId,
          enquiryDate: new Date(dto.leadDate),
          notes: dto.notes,
          createdByUserId: actorUserId,
        },
      });
      await tx.tutorLeadStageHistory.create({
        data: { tutorLeadId: lead.id, newStage: TutorLeadStageCode.LEAD, changedByUserId: actorUserId, remarks: 'Registered via Hiring' },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead',
        entityId: lead.id,
        action: 'TUTOR_CANDIDATE_REGISTERED',
        actorUserId,
        metadata: { businessId, sourceId: dto.sourceId },
      });
      return { id: lead.id, candidateId: businessId };
    });
  }

  async addEnquiry(id: string, dto: AddEnquiryDto, actorUserId: string) {
    const lead = await this.loadLead(id);
    const source = await this.prisma.tutorLeadSource.findFirst({ where: { id: dto.sourceId, isActive: true } });
    if (!source) throw new BadRequestException('Lead source not found or inactive');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const enquiry = await tx.tutorLeadEnquiry.create({
        data: {
          tutorLeadId: lead.id,
          sourceId: dto.sourceId,
          enquiryDate: new Date(dto.enquiryDate),
          notes: dto.notes,
          createdByUserId: actorUserId,
        },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: lead.id, action: 'TUTOR_CANDIDATE_ENQUIRY_ADDED', actorUserId,
        metadata: { enquiryId: enquiry.id, sourceId: dto.sourceId },
      });
      return enquiry;
    });
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async list(q: ListCandidatesQueryDto, userId: string) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const and: Prisma.TutorLeadWhereInput[] = [{ deletedAt: null }, { hiringStage: { not: null } }];

    if (q.search?.trim()) {
      const s = q.search.trim();
      const digits = s.replace(/\D/g, '');
      const or: Prisma.TutorLeadWhereInput[] = [
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
        { businessId: { contains: s, mode: 'insensitive' } },
      ];
      if (digits.length >= 3) or.push({ phoneNormalized: { contains: digits } });
      and.push({ OR: or });
    }
    if (q.stage) and.push({ hiringStage: q.stage as HiringStage });
    if (q.decision) and.push({ decision: q.decision as HiringDecision });
    if (q.managerId) and.push({ assignedToUserId: q.managerId });
    if (q.sourceId || q.from || q.to) {
      and.push({
        enquiries: {
          some: {
            ...(q.sourceId ? { sourceId: q.sourceId } : {}),
            ...(q.from || q.to
              ? { enquiryDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
              : {}),
          },
        },
      });
    }
    if (q.mine) {
      and.push({
        OR: [
          { createdByUserId: userId },
          { assignedToUserId: userId },
          { demoBookings: { some: { OR: [{ assignedToUserId: userId }, { bookedByUserId: userId }, { attendedByUserId: userId }] } } },
        ],
      });
    }
    const where: Prisma.TutorLeadWhereInput = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.tutorLead.count({ where }),
      this.prisma.tutorLead.findMany({
        where,
        orderBy: { [q.sortBy ?? 'createdAt']: q.sortDir ?? 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          assignedTo: { select: { id: true, email: true } },
          enquiries: { orderBy: { enquiryDate: 'asc' }, take: 1, include: { source: true } },
          _count: { select: { enquiries: true, calls: true } },
        },
      }),
    ]);
    return {
      data: rows.map((l) => ({
        id: l.id,
        candidateId: l.businessId,
        name: this.displayName(l),
        phone: l.phone,
        stage: l.hiringStage,
        decision: l.decision,
        manager: l.assignedTo,
        firstSource: l.enquiries[0]?.source.name ?? null,
        enquiryCount: l._count.enquiries,
        callCount: l._count.calls,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getProfile(id: string) {
    await this.loadLead(id);
    const l = await this.prisma.tutorLead.findUniqueOrThrow({
      where: { id },
      include: {
        motherTongue: true,
        subjects: { include: { subject: true } },
        grades: { include: { grade: true } },
        languages: { include: { language: true } },
        curricula: { include: { curriculum: true } },
        availability: true,
        enquiries: { orderBy: { enquiryDate: 'desc' }, include: { source: true, createdBy: { select: { id: true, email: true } } } },
        calls: { orderBy: { calledAt: 'desc' }, include: { caller: { select: { id: true, email: true } } } },
        decisionHistory: { orderBy: { changedAt: 'desc' }, include: { changedBy: { select: { id: true, email: true } } } },
        stageHistory: { orderBy: { changedAt: 'desc' }, include: { changedBy: { select: { id: true, email: true } } } },
        assignedTo: { select: { id: true, email: true } },
      },
    });
    const audit = await this.prisma.auditEvent.findMany({
      where: { entityType: 'TutorLead', entityId: id },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    return { ...l, name: this.displayName(l), auditTimeline: audit };
  }

  async listCalls(id: string) {
    await this.loadLead(id);
    return this.prisma.tutorLeadCall.findMany({
      where: { tutorLeadId: id },
      orderBy: { calledAt: 'desc' },
      include: { caller: { select: { id: true, email: true } } },
    });
  }

  // ── Details Shared ────────────────────────────────────────────────────────

  /** Updating details never advances the stage; staff completes the stage explicitly. */
  async updateDetails(id: string, dto: UpdateCandidateDetailsDto, actorUserId: string) {
    const lead = await this.loadLead(id);
    await this.assertCanModifyLead(lead, actorUserId);

    const data: Prisma.TutorLeadUncheckedUpdateInput = {};
    if (dto.name !== undefined) Object.assign(data, this.splitName(dto.name));
    if (dto.motherTongueId !== undefined) data.motherTongueId = dto.motherTongueId;
    if (dto.onlineTeachingExperience !== undefined) data.onlineTeachingExperience = dto.onlineTeachingExperience;
    if (dto.offlineTeachingExperience !== undefined) data.offlineTeachingExperience = dto.offlineTeachingExperience;
    if (dto.onlineTeachingExperience !== undefined || dto.offlineTeachingExperience !== undefined) {
      const on = dto.onlineTeachingExperience ?? lead.onlineTeachingExperience ?? 0;
      const off = dto.offlineTeachingExperience ?? lead.offlineTeachingExperience ?? 0;
      data.totalTeachingExperience = on + off; // keeps the legacy total consistent
    }
    if (dto.expectedHourlyRate !== undefined) data.expectedHourlyRate = dto.expectedHourlyRate;
    if (dto.additionalPhone !== undefined) data.additionalPhone = dto.additionalPhone;
    if (dto.remarks !== undefined) data.remarks = dto.remarks;
    if (dto.detailsDescription !== undefined) data.detailsDescription = dto.detailsDescription;
    if (dto.detailsRespondedAt !== undefined) data.detailsRespondedAt = new Date(dto.detailsRespondedAt);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const updated = await tx.tutorLead.update({ where: { id }, data });
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const k of DETAIL_SCALARS) {
        const a = (lead as Record<string, unknown>)[k];
        const b = (updated as Record<string, unknown>)[k];
        if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) { before[k] = a ?? null; after[k] = b ?? null; }
      }
      const replace = async (key: 'subjectIds' | 'gradeIds' | 'languageIds' | 'curriculumIds') => {
        const ids = dto[key];
        if (!ids) return;
        const unique = [...new Set(ids)];
        if (key === 'subjectIds') {
          await tx.tutorLeadSubject.deleteMany({ where: { tutorLeadId: id } });
          await tx.tutorLeadSubject.createMany({ data: unique.map((subjectId) => ({ tutorLeadId: id, subjectId })) });
        } else if (key === 'gradeIds') {
          await tx.tutorLeadGrade.deleteMany({ where: { tutorLeadId: id } });
          await tx.tutorLeadGrade.createMany({ data: unique.map((gradeId) => ({ tutorLeadId: id, gradeId })) });
        } else if (key === 'languageIds') {
          await tx.tutorLeadLanguage.deleteMany({ where: { tutorLeadId: id } });
          await tx.tutorLeadLanguage.createMany({ data: unique.map((languageId) => ({ tutorLeadId: id, languageId })) });
        } else {
          await tx.tutorLeadCurriculum.deleteMany({ where: { tutorLeadId: id } });
          await tx.tutorLeadCurriculum.createMany({ data: unique.map((curriculumId) => ({ tutorLeadId: id, curriculumId })) });
        }
        after[key] = unique;
      };
      for (const k of ['subjectIds', 'gradeIds', 'languageIds', 'curriculumIds'] as const) await replace(k);

      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: id, action: 'TUTOR_CANDIDATE_DETAILS_UPDATED', actorUserId,
        oldValue: before, newValue: after,
      });
      return { id };
    });
  }

  // ── CV ────────────────────────────────────────────────────────────────────

  async setCvReceived(id: string, dto: SetCvReceivedDto, actorUserId: string) {
    const lead = await this.loadLead(id);
    await this.assertCanModifyLead(lead, actorUserId);
    const stageIdx = ['LEAD', 'DETAILS_SHARED', 'CV', 'LIVE_DEMO_INTERVIEW'].indexOf(lead.hiringStage ?? 'LEAD');
    if (stageIdx < 2) throw new BadRequestException('CV details can only be recorded once the candidate is at the CV stage');
    const when = new Date(dto.cvReceivedAt);
    if (when.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('CV received time cannot be in the future');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.tutorLead.update({ where: { id }, data: { cvReceivedAt: when } });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: id, action: 'TUTOR_CANDIDATE_CV_RECEIVED_SET', actorUserId,
        oldValue: { cvReceivedAt: lead.cvReceivedAt?.toISOString() ?? null }, newValue: { cvReceivedAt: when.toISOString() },
      });
      return { id, cvReceivedAt: when };
    });
  }

  // ── Stage & decision ──────────────────────────────────────────────────────

  async advanceStage(id: string, dto: AdvanceStageDto, actorUserId: string) {
    const lead = await this.loadLead(id);
    await this.assertCanModifyLead(lead, actorUserId);
    const current = (lead.hiringStage ?? 'LEAD');
    this.mapRuleError(() => assertStageAdvance(current, dto.to));
    if (lead.decision === 'REJECTED' || lead.decision === 'NOT_INTERESTED' || lead.decision === 'HIRED') {
      throw new BadRequestException(`Cannot advance a candidate whose decision is ${lead.decision}`);
    }
    if (current === 'CV' && !lead.cvReceivedAt) {
      throw new BadRequestException('Record the CV received date and time before completing the CV stage');
    }
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // Compare-and-set guards against two staff advancing at once.
      const res = await tx.tutorLead.updateMany({
        where: { id, hiringStage: current },
        data: { hiringStage: dto.to, currentStage: LEGACY_STAGE[dto.to] },
      });
      if (res.count !== 1) throw new ConflictException('Candidate stage changed; reload and retry');
      await tx.tutorLeadStageHistory.create({
        data: {
          tutorLeadId: id,
          previousStage: LEGACY_STAGE[current],
          newStage: LEGACY_STAGE[dto.to],
          changedByUserId: actorUserId,
          remarks: dto.remarks,
        },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: id, action: 'TUTOR_CANDIDATE_STAGE_COMPLETED', actorUserId,
        oldValue: { stage: current }, newValue: { stage: dto.to }, reason: dto.remarks,
      });
      return { id, stage: dto.to };
    });
  }

  async changeDecision(id: string, dto: ChangeDecisionDto, actorUserId: string) {
    const lead = await this.loadLead(id);
    await this.assertCanModifyLead(lead, actorUserId);
    const stage = (lead.hiringStage ?? 'LEAD');
    const current = (lead.decision ?? null);
    this.mapRuleError(() => assertDecisionChange(stage, current, dto.decision));
    if (dto.decision === 'ACCEPTED') await this.assertDemoConductorAuthority(id, actorUserId);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const res = await tx.tutorLead.updateMany({
        where: { id, decision: current },
        data: {
          decision: dto.decision,
          decisionAt: new Date(),
          // Keep legacy screens coherent for outcomes that map 1:1; Hired deliberately does not touch Training.
          ...(dto.decision === 'REJECTED' ? { currentStage: TutorLeadStageCode.REJECTED } : {}),
          ...(dto.decision === 'NOT_INTERESTED' ? { currentStage: TutorLeadStageCode.NOT_INTERESTED } : {}),
        },
      });
      if (res.count !== 1) throw new ConflictException('Candidate decision changed; reload and retry');
      await tx.tutorLeadDecisionHistory.create({
        data: { tutorLeadId: id, previousDecision: current, newDecision: dto.decision, reason: dto.reason, changedByUserId: actorUserId },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: id, action: 'TUTOR_CANDIDATE_DECISION_CHANGED', actorUserId,
        oldValue: { decision: current }, newValue: { decision: dto.decision }, reason: dto.reason,
      });
      return { id, decision: dto.decision };
    });
  }

  /**
   * Acceptance is decided by the staff member who actually conducted the demo
   * (or a department-wide authority holder), and only after an evaluation exists.
   */
  private async assertDemoConductorAuthority(leadId: string, userId: string) {
    const attended = await this.prisma.tutorDemoBooking.findFirst({
      where: { tutorLeadId: leadId, status: 'ATTENDED' },
      orderBy: { completedAt: 'desc' },
      include: { evaluation: { select: { id: true } } },
    });
    if (!attended) throw new BadRequestException('A demo must be attended before the candidate can be accepted');
    if (!attended.evaluation) throw new BadRequestException('Submit the demo evaluation before accepting the candidate');
    if (attended.attendedByUserId !== userId && !(await this.canReadAll(userId))) {
      throw new ForbiddenException('Only the staff member who conducted the demo can accept this candidate');
    }
  }

  // ── Calls ─────────────────────────────────────────────────────────────────

  /** Any staff holding tutor_lead.update may log a call; each keeps its own caller attribution. */
  async logCall(id: string, dto: LogCallDto, actorUserId: string) {
    const lead = await this.loadLead(id);
    const calledAt = dto.calledAt ? new Date(dto.calledAt) : new Date();
    if (calledAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('Call time cannot be in the future');
    if (dto.followUpAt && new Date(dto.followUpAt) <= calledAt) {
      throw new BadRequestException('Follow-up must be after the call time');
    }
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const call = await tx.tutorLeadCall.create({
        data: {
          tutorLeadId: lead.id,
          callerUserId: actorUserId,
          calledAt,
          status: dto.status,
          remark: dto.remarks ?? '',
          followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null,
        },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: lead.id, action: 'TUTOR_CANDIDATE_CALL_LOGGED', actorUserId,
        metadata: { callId: call.id, status: dto.status },
      });
      return call;
    });
  }

  // ── Sources ───────────────────────────────────────────────────────────────

  listSources(includeInactive = false) {
    return this.prisma.tutorLeadSource.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createSource(name: string, actorUserId: string) {
    const trimmed = name.trim();
    const dup = await this.prisma.tutorLeadSource.findFirst({ where: { name: { equals: trimmed, mode: 'insensitive' } } });
    if (dup) throw new ConflictException('A source with this name already exists');
    const s = await this.prisma.tutorLeadSource.create({ data: { name: trimmed } });
    await this.audit.record({ entityType: 'TutorLeadSource', entityId: s.id, action: 'TUTOR_LEAD_SOURCE_CREATED', actorUserId });
    return s;
  }

  async updateSource(id: string, patch: { name?: string; isActive?: boolean }, actorUserId: string) {
    const s = await this.prisma.tutorLeadSource.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Source not found');
    const updated = await this.prisma.tutorLeadSource.update({
      where: { id },
      data: { ...(patch.name ? { name: patch.name.trim() } : {}), ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}) },
    });
    await this.audit.record({ entityType: 'TutorLeadSource', entityId: id, action: 'TUTOR_LEAD_SOURCE_UPDATED', actorUserId });
    return updated;
  }
}
