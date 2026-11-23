import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, Prisma, TutorLeadStageCode, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

import { AuditService } from '../../../common/audit/audit.service';
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';
import { RbacService } from '../../../common/rbac/rbac.service';

import { generateTemporaryPassword } from './temp-password.util';

/** Same Argon2id parameters as UserService, so tutor logins verify like every other account. */
const ARGON2_OPTIONS: argon2.Options = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 };
/** Tutors are employees of the Academics department. */
export const TUTOR_DEPARTMENT_CODE = 'ACADEMICS';
export const TUTOR_ROLE_CODE = 'TUTOR';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ReadyForAssignmentResult {
  tutorId: string;
  tutorProfileId: string;
  userId: string;
  employeeId: string;
  loginEmail: string;
  /** Shown to HR exactly once for handover. Never stored in plain text, never returned again. */
  temporaryPassword: string;
  mustChangePassword: true;
}

/**
 * Final verification: the Ready for Assignment click. Once both training sessions are passed,
 * the OS creates the tutor's User (login = email), Employee and TutorProfile with a new
 * Tutor ID (TUT-0001) in one transaction, and copies the hiring data into the profile.
 */
@Injectable()
export class TutorTransferService {
  private readonly logger = new Logger(TutorTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGenerator: IdGeneratorService,
    private readonly rbac: RbacService,
  ) {}

  private assertReady(lead: {
    deletedAt: Date | null; decision: string | null; convertedTutorProfileId: string | null;
    trainingEnrolment: { session2PassedAt: Date | null } | null;
  }) {
    if (lead.deletedAt) throw new NotFoundException('Candidate not found');
    if (lead.convertedTutorProfileId) throw new ConflictException('This candidate is already in Tutors');
    if (lead.decision !== 'HIRED' || !lead.trainingEnrolment) throw new BadRequestException('Only Hired candidates in Training can be marked Ready for Assignment');
    if (!lead.trainingEnrolment.session2PassedAt) {
      throw new BadRequestException('Both training sessions must be passed before Ready for Assignment');
    }
  }

  async readyForAssignment(tutorLeadId: string, actorUserId: string): Promise<ReadyForAssignmentResult> {
    const lead = await this.prisma.tutorLead.findUnique({ where: { id: tutorLeadId }, include: { trainingEnrolment: true } });
    if (!lead) throw new NotFoundException('Candidate not found');
    this.assertReady(lead);

    const loginEmail = (lead.email ?? '').trim().toLowerCase();
    if (!loginEmail) throw new BadRequestException("Add the tutor's email in the candidate details first; it becomes the login ID");
    if (!EMAIL_RE.test(loginEmail)) throw new BadRequestException('The candidate email is not a valid email address');
    if (!lead.firstName.trim()) throw new BadRequestException("Add the tutor's name in the candidate details first");
    const taken = await this.prisma.user.findFirst({ where: { email: { equals: loginEmail, mode: 'insensitive' } }, select: { id: true } });
    if (taken) throw new ConflictException('This email is already used by another OS account');

    const [department, role] = await Promise.all([
      this.prisma.department.findUnique({ where: { code: TUTOR_DEPARTMENT_CODE } }),
      this.prisma.role.findUnique({ where: { code: TUTOR_ROLE_CODE } }),
    ]);
    if (!department || !role) throw new BadRequestException('Tutor department or role is not configured');

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, ARGON2_OPTIONS);

    try {
      const out = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
        // Serialise double clicks; then re-check inside the transaction.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'tutor-ready:' + tutorLeadId}))`;
        const fresh = await tx.tutorLead.findUniqueOrThrow({
          where: { id: tutorLeadId },
          include: {
            trainingEnrolment: true,
            subjects: true, grades: true, curricula: true,
            availability: { where: { isActive: true } },
          },
        });
        this.assertReady(fresh);
        const now = new Date();

        const employeeBusinessId = await this.idGenerator.nextIdInTx(tx, 'EMP');
        const tutorId = await this.idGenerator.nextIdInTx(tx, 'TUT');

        const user = await tx.user.create({
          data: { email: loginEmail, passwordHash, status: UserStatus.PENDING_SETUP, mustChangePassword: true },
        });
        const employee = await tx.employee.create({
          data: {
            businessId: employeeBusinessId, userId: user.id, departmentId: department.id,
            firstName: fresh.firstName.trim(), lastName: fresh.lastName.trim(), phone: fresh.phone,
            employmentStatus: EmploymentStatus.ACTIVE, joinedAt: now,
          },
        });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id, grantedByUserId: actorUserId } });
        // Status starts Inactive (schema default) until the tutor conducts the first class.
        const profile = await tx.tutorProfile.create({
          data: {
            employeeId: employee.id, sourceTutorLeadId: fresh.id, tutorCode: tutorId,
            teachingExperience: fresh.totalTeachingExperience, verifiedAt: now, verifiedByUserId: actorUserId,
          },
        });

        // Hiring data carried into the tutor profile; the candidate record and its history stay as they are.
        if (fresh.subjects.length) {
          await tx.tutorSubject.createMany({ data: fresh.subjects.map((s) => ({ tutorProfileId: profile.id, subjectId: s.subjectId, addedByUserId: actorUserId })) });
        }
        if (fresh.grades.length) {
          await tx.tutorGrade.createMany({ data: fresh.grades.map((g) => ({ tutorProfileId: profile.id, gradeId: g.gradeId, addedByUserId: actorUserId })) });
        }
        if (fresh.curricula.length) {
          await tx.tutorCurriculum.createMany({ data: fresh.curricula.map((c) => ({ tutorProfileId: profile.id, curriculumId: c.curriculumId, addedByUserId: actorUserId })) });
        }
        if (fresh.availability.length) {
          await tx.tutorAvailabilitySlot.createMany({
            data: fresh.availability.map((a) => ({
              tutorProfileId: profile.id, dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime, createdByUserId: actorUserId,
            })),
          });
        }

        const res = await tx.tutorLead.updateMany({
          where: { id: fresh.id, convertedTutorProfileId: null },
          data: { convertedTutorProfileId: profile.id, currentStage: TutorLeadStageCode.READY_FOR_ASSIGNMENT, email: loginEmail },
        });
        if (res.count !== 1) throw new ConflictException('This candidate is already in Tutors');
        await tx.tutorLeadStageHistory.create({
          data: {
            tutorLeadId: fresh.id, previousStage: fresh.currentStage, newStage: TutorLeadStageCode.READY_FOR_ASSIGNMENT,
            changedByUserId: actorUserId, remarks: `Ready for Assignment; Tutor ID ${tutorId}`, changedAt: now,
          },
        });

        // Audit rows never contain the password or its hash.
        await this.audit.recordInTx(tx, {
          entityType: 'User', entityId: user.id, action: 'USER_CREATED', actorUserId,
          metadata: { email: loginEmail, employeeBusinessId, initialRole: TUTOR_ROLE_CODE, source: 'TUTOR_READY_FOR_ASSIGNMENT' },
        });
        await this.audit.recordInTx(tx, {
          entityType: 'Employee', entityId: employee.id, action: 'EMPLOYEE_CREATED', actorUserId,
          metadata: { businessId: employeeBusinessId, departmentId: department.id, userId: user.id },
        });
        await this.audit.recordInTx(tx, {
          entityType: 'User', entityId: user.id, action: 'USER_ROLE_ASSIGNED', actorUserId,
          metadata: { roleId: role.id, roleCode: TUTOR_ROLE_CODE, grantedByUserId: actorUserId },
        });
        await this.audit.recordInTx(tx, {
          entityType: 'TutorLead', entityId: fresh.id, action: 'TUTOR_READY_FOR_ASSIGNMENT', actorUserId,
          newValue: { tutorId, tutorProfileId: profile.id, userId: user.id, loginEmail },
        });

        return { tutorId, tutorProfileId: profile.id, userId: user.id, employeeId: employee.id };
      });

      await this.rbac.invalidateCache(out.userId).catch((e: unknown) =>
        this.logger.warn(`RBAC cache invalidation failed for ${out.userId}: ${e instanceof Error ? e.message : String(e)}`));
      return { ...out, loginEmail, temporaryPassword, mustChangePassword: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String((e.meta as { target?: unknown } | undefined)?.target ?? '');
        if (target.includes('email')) throw new ConflictException('This email is already used by another OS account');
        throw new ConflictException('This candidate was transferred at the same time; reload');
      }
      throw e;
    }
  }
}
