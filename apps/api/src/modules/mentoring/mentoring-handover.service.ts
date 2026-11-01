import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { EnrollmentState, LeadStatus, Prisma } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { MentoringAllocationService } from './mentoring-allocation.service';

/** The only Sales status transition that starts a Mentoring handover. PAID never does. */
export const HANDOVER_TRIGGER_STATUS: LeadStatus = LeadStatus.ENROLLED;

/**
 * Statuses in which a lead can hold an open Mentoring activation. Moving out of these to any other
 * status is blocked while an activation is open.
 */
export const OPEN_ACTIVATION_STATUSES: readonly LeadStatus[] = [LeadStatus.ENROLLED, LeadStatus.PAID];

export const STUDENT_LOCKED_MESSAGE =
  'This student has been handed over to Mentoring. Sales can no longer change the student or their subject requirements.';

/** Stage 1 is created at handover; the remaining six stages belong to the WP3 workflow engine. */
const STAGE_ONE = { stageNumber: 1, key: 'ADMISSION_HANDOVER' } as const;

/** Information Mentoring needs that the Sales admission record does not collect. */
const NOT_COLLECTED_IN_SALES = [
  'parent.relationship',
  'tutor.assignments',
  'academic.preferredLanguage',
  'academic.previousMarks',
  'timetable.schedule',
  'examination.upcomingDates',
  'examination.syllabusPortions',
  'parentExpectations',
  'studentEngagement',
] as const;

interface TransferredField {
  field: string;
  source: 'LEAD' | 'STUDENT' | 'REQUIREMENT';
  value: unknown;
}

interface MissingField {
  field: string;
  reason: 'NOT_COLLECTED_IN_SALES' | 'NOT_PROVIDED';
}

export interface HandoverResult {
  created: Array<{ studentId: string; handoverId: string; activationId: string }>;
  alreadyHandedOver: string[];
  skippedWithoutRequirements: string[];
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class MentoringHandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly allocation: MentoringAllocationService,
  ) {}

  /**
   * True when moving the lead to `nextStatus` is not allowed because Mentoring has already
   * started for one of its students. Sales must have the activation cancelled first.
   */
  async assertCanLeaveEnrolled(tx: PrismaTxClient, leadId: string, nextStatus: LeadStatus): Promise<void> {
    if (OPEN_ACTIVATION_STATUSES.includes(nextStatus)) return;

    const open = await tx.mentoringActivation.count({
      where: { leadId, status: { not: 'CANCELLED' } },
    });
    if (open > 0) {
      throw new ConflictException(
        'This lead has an open Mentoring activation. Cancel the activation before changing the lead out of ENROLLED/PAID.',
      );
    }
  }

  /**
   * Idempotent: creates the handover, activation and Stage 1 for every student of the lead that
   * has at least one requirement and no handover yet. Safe to call repeatedly and concurrently.
   * Runs inside the caller's transaction so the lead status and the handover commit together.
   */
  async ensureHandoverInTx(
    tx: PrismaTxClient,
    leadId: string,
    actorUserId: string,
    options: { strict?: boolean } = {},
  ): Promise<HandoverResult> {
    const strict = options.strict ?? true;
    // Serialise concurrent ENROLLED/retry requests for the same lead.
    await tx.$executeRaw`SELECT 1 FROM leads WHERE id = ${leadId} FOR UPDATE`;

    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      include: {
        students: {
          orderBy: { createdAt: 'asc' },
          include: {
            enrollmentHandover: { select: { id: true } },
            curriculum: { select: { code: true, name: true } },
            grade: { select: { code: true, name: true } },
            requirements: {
              orderBy: { createdAt: 'asc' },
              include: {
                subject: { select: { code: true, name: true } },
                curriculum: { select: { code: true, name: true } },
                grade: { select: { code: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!lead) throw new BadRequestException('Lead not found');

    const result: HandoverResult = { created: [], alreadyHandedOver: [], skippedWithoutRequirements: [] };

    const eligible = lead.students.filter((s) => s.requirements.length > 0);
    const hasAnyHandover = lead.students.some((s) => s.enrollmentHandover);
    if (strict && eligible.length === 0 && !hasAnyHandover) {
      throw new BadRequestException(
        'Cannot hand over to Mentoring: add at least one student with at least one subject requirement first.',
      );
    }

    for (const student of lead.students) {
      if (student.enrollmentHandover) {
        result.alreadyHandedOver.push(student.id);
        continue;
      }
      if (student.requirements.length === 0) {
        result.skippedWithoutRequirements.push(student.id);
        continue;
      }

      const transferred: TransferredField[] = [];
      const missing: MissingField[] = NOT_COLLECTED_IN_SALES.map((field) => ({
        field,
        reason: 'NOT_COLLECTED_IN_SALES' as const,
      }));
      const take = (field: string, source: TransferredField['source'], value: unknown) => {
        if (value === null || value === undefined || value === '') {
          missing.push({ field, reason: 'NOT_PROVIDED' });
        } else {
          transferred.push({ field, source, value });
        }
      };

      take('student.firstName', 'STUDENT', text(student.firstName));
      take('student.lastName', 'STUDENT', text(student.lastName));
      take('student.dateOfBirth', 'STUDENT', student.dateOfBirth?.toISOString().slice(0, 10));
      take('student.gender', 'STUDENT', text(student.gender));
      take('student.schoolName', 'STUDENT', text(student.schoolName));
      take('student.currentGrade', 'STUDENT', text(student.currentGrade));
      take('student.grade', 'STUDENT', student.grade?.name);
      take('student.curriculum', 'STUDENT', student.curriculum?.name);
      take('student.cityLocation', 'STUDENT', text(student.cityLocation));
      take('student.notes', 'STUDENT', text(student.notes));

      const parentName = [text(lead.firstName), text(lead.lastName)].filter(Boolean).join(' ');
      take('parent.name', 'LEAD', parentName || null);
      take('parent.primaryPhone', 'LEAD', text(lead.primaryPhone));
      take('parent.altPhone1', 'LEAD', text(lead.altPhone1));
      take('parent.altPhone2', 'LEAD', text(lead.altPhone2));
      take('parent.whatsappNumber', 'LEAD', text(lead.whatsappNumber));

      const requirements = student.requirements.map((r) => ({
        requirementId: r.id,
        subject: r.subject.name,
        curriculum: r.curriculum.name,
        grade: r.grade.name,
        monthlyHours: r.monthlyHours?.toString() ?? null,
        syllabus: text(r.syllabus),
        notes: text(r.notes),
      }));
      transferred.push({ field: 'academic.subjects', source: 'REQUIREMENT', value: requirements });

      const sourceSnapshot = {
        capturedAt: new Date().toISOString(),
        lead: {
          id: lead.id,
          businessId: lead.businessId,
          firstName: lead.firstName,
          lastName: lead.lastName,
          primaryPhone: lead.primaryPhone,
          altPhone1: lead.altPhone1,
          altPhone2: lead.altPhone2,
          whatsappNumber: lead.whatsappNumber,
          status: lead.status,
        },
        student: {
          id: student.id,
          businessId: student.businessId,
          firstName: student.firstName,
          lastName: student.lastName,
          dateOfBirth: student.dateOfBirth?.toISOString() ?? null,
          gender: student.gender,
          schoolName: student.schoolName,
          currentGrade: student.currentGrade,
          cityLocation: student.cityLocation,
          notes: student.notes,
          curriculum: student.curriculum?.name ?? null,
          grade: student.grade?.name ?? null,
        },
        requirements,
      };

      const now = new Date();
      const handover = await tx.enrollmentHandover.create({
        data: {
          leadId: lead.id,
          studentId: student.id,
          status: 'COMPLETED',
          completedAt: now,
          triggeredByUserId: actorUserId,
          sourceSnapshot: sourceSnapshot,
          transferredFields: transferred as unknown as Prisma.InputJsonValue,
          missingFields: missing as unknown as Prisma.InputJsonValue,
        },
      });

      const activation = await tx.mentoringActivation.create({
        data: {
          leadId: lead.id,
          studentId: student.id,
          handoverId: handover.id,
          status: 'AWAITING_ALLOCATION',
          currentStage: STAGE_ONE.stageNumber,
          stages: {
            create: [{ stageNumber: STAGE_ONE.stageNumber, key: STAGE_ONE.key, status: 'NOT_STARTED' }],
          },
        },
      });

      await tx.student.update({
        where: { id: student.id },
        data: { enrollmentState: EnrollmentState.ENROLLED },
      });

      // Automatic Mentor allocation (or the allocation queue) happens in the same transaction.
      await this.allocation.autoAllocateInTx(tx, activation.id, actorUserId);

      await this.audit.recordInTx(tx, {
        entityType: 'EnrollmentHandover',
        entityId: handover.id,
        action: 'CREATE',
        actorUserId,
        newValue: {
          leadId: lead.id,
          studentId: student.id,
          activationId: activation.id,
          transferredFieldCount: transferred.length,
          missingFieldCount: missing.length,
        },
      });

      result.created.push({ studentId: student.id, handoverId: handover.id, activationId: activation.id });
    }

    return result;
  }

  /**
   * A lead "has been enrolled" when it is ENROLLED, or PAID after having been ENROLLED.
   * A lead that reached PAID without ever being ENROLLED is not eligible for Mentoring.
   */
  async hasBeenEnrolled(client: Pick<PrismaTxClient, 'lead' | 'leadStatusHistory'>, leadId: string): Promise<boolean> {
    const lead = await client.lead.findUnique({ where: { id: leadId }, select: { status: true } });
    if (!lead) return false;
    if (lead.status === LeadStatus.ENROLLED) return true;
    if (lead.status !== LeadStatus.PAID) return false;
    const enrolledBefore = await client.leadStatusHistory.count({
      where: { leadId, newStatus: LeadStatus.ENROLLED },
    });
    return enrolledBefore > 0;
  }

  /**
   * Called after Sales adds or changes a student/requirement under a lead. If the lead is already
   * enrolled, hands over any newly eligible student automatically. Never throws for "nothing eligible".
   */
  async ensureHandoverIfEnrolledInTx(tx: PrismaTxClient, leadId: string, actorUserId: string): Promise<HandoverResult | null> {
    await tx.$executeRaw`SELECT 1 FROM leads WHERE id = ${leadId} FOR UPDATE`;
    if (!(await this.hasBeenEnrolled(tx, leadId))) return null;
    return this.ensureHandoverInTx(tx, leadId, actorUserId, { strict: false });
  }

  /** Sales may not change a student (or their requirements) once the student has been handed over. */
  async assertStudentEditableBySales(client: Pick<PrismaTxClient, 'enrollmentHandover'>, studentId: string): Promise<void> {
    const handover = await client.enrollmentHandover.findUnique({
      where: { studentId },
      select: { id: true },
    });
    if (handover) throw new ForbiddenException(STUDENT_LOCKED_MESSAGE);
  }

  /** Safe retry for a lead whose handover is missing or incomplete (idempotent). */
  async retryForLead(leadId: string, actorUserId: string): Promise<HandoverResult> {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) throw new BadRequestException('Lead not found');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.$executeRaw`SELECT 1 FROM leads WHERE id = ${leadId} FOR UPDATE`;
      if (!(await this.hasBeenEnrolled(tx, leadId))) {
        throw new BadRequestException('The lead must have been ENROLLED before it can be handed over to Mentoring.');
      }
      return this.ensureHandoverInTx(tx, leadId, actorUserId);
    });
  }

  /** Read-only handover status for the Sales lead page. */
  async getStatusForLead(leadId: string) {
    const students = await this.prisma.student.findMany({
      where: { leadId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        businessId: true,
        firstName: true,
        lastName: true,
        enrollmentState: true,
        _count: { select: { requirements: true } },
        enrollmentHandover: {
          select: {
            id: true,
            status: true,
            completedAt: true,
            missingFields: true,
            lastError: true,
            activation: { select: { id: true, status: true, currentStage: true } },
          },
        },
      },
    });

    return students.map((s) => ({
      studentId: s.id,
      studentBusinessId: s.businessId,
      studentName: [s.firstName, s.lastName].filter(Boolean).join(' '),
      enrollmentState: s.enrollmentState,
      requirementCount: s._count.requirements,
      handover: s.enrollmentHandover
        ? {
            id: s.enrollmentHandover.id,
            status: s.enrollmentHandover.status,
            completedAt: s.enrollmentHandover.completedAt,
            missingFieldCount: Array.isArray(s.enrollmentHandover.missingFields)
              ? s.enrollmentHandover.missingFields.length
              : 0,
            lastError: s.enrollmentHandover.lastError,
            activation: s.enrollmentHandover.activation,
          }
        : null,
    }));
  }
}
