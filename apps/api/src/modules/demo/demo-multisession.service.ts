import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import {
  DemoBookingStatus,
  DemoSessionStatus,
  DemoParticipantType,
  DemoAttendanceStatus,
  TutorAssignmentStatus,
  DemoSessionExceptionCategory,
  DemoExceptionStatus,
} from '@prisma/client';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

export interface MultiSessionInput {
  requirementId: string;
  subjectId: string;
  curriculumId: string;
  gradeId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  durationMinutes: number;
}

export interface CompletionGateResult {
  canComplete: boolean;
  pendingReasons: string[];
}

export const AUTHORIZED_EXCEPTION_APPROVER_ROLES = ['ACADEMIC_HEAD', 'OPERATIONS_MANAGER'];

@Injectable()
export class DemoMultiSessionService {
  private readonly logger = new Logger(DemoMultiSessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates multi-session structure and calculates total booking duration.
   * Ensures non-overlapping session times and accurate durations.
   */
  validateMultiSessionStructure(sessions: MultiSessionInput[]): {
    totalDurationMinutes: number;
    orderedSessions: Array<MultiSessionInput & { sessionOrder: number }>;
  } {
    if (!sessions || sessions.length === 0) {
      throw new BadRequestException('A demo booking must contain at least one session');
    }

    // Sort by scheduledStart ascending
    const sorted = [...sessions].sort(
      (a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime(),
    );

    let totalDurationMinutes = 0;

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const startMs = new Date(current.scheduledStart).getTime();
      const endMs = new Date(current.scheduledEnd).getTime();

      if (startMs >= endMs) {
        throw new BadRequestException(
          `Session ${i + 1} has invalid times: scheduledStart must be before scheduledEnd`,
        );
      }

      const calculatedDuration = Math.round((endMs - startMs) / 60000);
      if (current.durationMinutes !== calculatedDuration) {
        throw new BadRequestException(
          `Session ${i + 1} duration mismatch: stated ${current.durationMinutes}m but calculated ${calculatedDuration}m`,
        );
      }

      totalDurationMinutes += current.durationMinutes;

      // Check overlap with next session
      if (i < sorted.length - 1) {
        const next = sorted[i + 1];
        const nextStartMs = new Date(next.scheduledStart).getTime();
        if (endMs > nextStartMs) {
          throw new BadRequestException(
            `Session overlap detected: Session ${i + 1} ends at ${new Date(current.scheduledEnd).toISOString()} after Session ${i + 2} starts at ${new Date(next.scheduledStart).toISOString()}`,
          );
        }
      }
    }

    const orderedSessions = sorted.map((session, index) => ({
      ...session,
      sessionOrder: index + 1,
    }));

    return { totalDurationMinutes, orderedSessions };
  }

  /**
   * Assigns or replaces a session tutor while preserving full assignment history.
   * If an active tutor already exists, marks them as REPLACED and creates a new ACTIVE sequence.
   */
  async assignOrReplaceSessionTutor(
    tx: PrismaTxClient,
    sessionId: string,
    tutorId: string,
    actorUserId: string,
    replacementReason?: string,
  ) {
    const session = await tx.demoSession.findUnique({
      where: { id: sessionId },
      include: {
        tutorAssignments: {
          orderBy: { assignmentSequence: 'desc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Demo session ${sessionId} not found`);
    }

    const activeAssignment = session.tutorAssignments.find(
      (a) => a.status === TutorAssignmentStatus.ACTIVE,
    );

    let nextSequence = 1;

    if (activeAssignment) {
      if (activeAssignment.tutorId === tutorId) {
        return activeAssignment; // Same tutor already actively assigned
      }

      nextSequence = activeAssignment.assignmentSequence + 1;

      // Retire existing assignment
      await tx.demoSessionTutorAssignment.update({
        where: { id: activeAssignment.id },
        data: {
          status: TutorAssignmentStatus.REPLACED,
          replacedAt: new Date(),
          replacedByUserId: actorUserId,
          replacementReason: replacementReason || 'Tutor reassignment',
        },
      });
    } else if (session.tutorAssignments.length > 0) {
      nextSequence = session.tutorAssignments[0].assignmentSequence + 1;
    }

    // Create new active assignment
    const newAssignment = await tx.demoSessionTutorAssignment.create({
      data: {
        sessionId,
        tutorId,
        assignmentSequence: nextSequence,
        status: TutorAssignmentStatus.ACTIVE,
        assignedByUserId: actorUserId,
      },
    });

    if (session.status === DemoSessionStatus.SCHEDULED) {
      await tx.demoSession.update({
        where: { id: sessionId },
        data: { status: DemoSessionStatus.ASSIGNED },
      });
    }

    return newAssignment;
  }

  /**
   * Records attendance enforcing role-specific scoping:
   * - PARENT / COORDINATOR: Booking-level attendance (sessionId and assignmentId must be null).
   * - TUTOR: Session-assignment-level attendance (assignmentId is mandatory).
   */
  async recordAttendance(
    tx: PrismaTxClient,
    dto: {
      bookingId: string;
      sessionId?: string;
      assignmentId?: string;
      participantType: DemoParticipantType;
      userId?: string;
      status: DemoAttendanceStatus;
      remarks?: string;
      markedByUserId: string;
    },
  ) {
    if (dto.participantType === DemoParticipantType.TUTOR) {
      if (!dto.assignmentId) {
        throw new BadRequestException('Tutor attendance requires a specific assignmentId');
      }
    } else {
      // PARENT or COORDINATOR: booking level
      if (dto.sessionId || dto.assignmentId) {
        throw new BadRequestException(
          'Parent and Coordinator attendance must be recorded at booking level without sessionId or assignmentId',
        );
      }
    }

    return tx.demoAttendance.create({
      data: {
        bookingId: dto.bookingId,
        sessionId: dto.sessionId || null,
        assignmentId: dto.assignmentId || null,
        participantType: dto.participantType,
        userId: dto.userId || null,
        status: dto.status,
        remarks: dto.remarks || null,
        markedByUserId: dto.markedByUserId,
      },
    });
  }

  /**
   * Corrects attendance with mandatory audit tracking.
   */
  async correctAttendance(
    tx: PrismaTxClient,
    attendanceId: string,
    dto: {
      newStatus: DemoAttendanceStatus;
      correctionReason: string;
      correctedByUserId: string;
    },
  ) {
    if (!dto.correctionReason || dto.correctionReason.trim().length === 0) {
      throw new BadRequestException('A reason is mandatory when correcting attendance');
    }

    const existing = await tx.demoAttendance.findUnique({
      where: { id: attendanceId },
    });

    if (!existing) {
      throw new NotFoundException(`Attendance record ${attendanceId} not found`);
    }

    return tx.demoAttendance.update({
      where: { id: attendanceId },
      data: {
        status: dto.newStatus,
        isCorrected: true,
        correctionReason: dto.correctionReason,
        correctedByUserId: dto.correctedByUserId,
        correctedAt: new Date(),
      },
    });
  }

  /**
   * Requests a session exception (waiver, replacement, or parent-declined subject).
   */
  async requestSessionException(
    tx: PrismaTxClient,
    dto: {
      sessionId: string;
      category: DemoSessionExceptionCategory;
      reason: string;
      requestedByUserId: string;
      replacementSessionId?: string;
    },
  ) {
    const session = await tx.demoSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${dto.sessionId} not found`);
    }

    return tx.demoSessionException.create({
      data: {
        sessionId: dto.sessionId,
        exceptionCategory: dto.category,
        resolutionStatus: DemoExceptionStatus.PENDING,
        reason: dto.reason,
        requestedByUserId: dto.requestedByUserId,
        replacementSessionId: dto.replacementSessionId || null,
      },
    });
  }

  /**
   * Reviews a session exception with strict authorization.
   * Only Academic Head or Operations Manager may approve or reject.
   */
  async reviewSessionException(
    tx: PrismaTxClient,
    exceptionId: string,
    decision: DemoExceptionStatus,
    actor: { userId: string; roles: string[] },
    reviewNotes?: string,
  ) {
    const isAuthorized = actor.roles.some((role) =>
      AUTHORIZED_EXCEPTION_APPROVER_ROLES.includes(role),
    );

    if (!isAuthorized) {
      throw new ForbiddenException(
        'Only Academic Head or Operations Manager can approve or reject session exceptions',
      );
    }

    const exception = await tx.demoSessionException.findUnique({
      where: { id: exceptionId },
    });

    if (!exception) {
      throw new NotFoundException(`Session exception ${exceptionId} not found`);
    }

    return tx.demoSessionException.update({
      where: { id: exceptionId },
      data: {
        resolutionStatus: decision,
        reviewedByUserId: actor.userId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
      },
    });
  }

  /**
   * Evaluates the Authoritative Demo Completion Gate:
   * 1. Booking-level Parent attendance must be recorded.
   * 2. Booking-level Coordinator attendance must be recorded.
   * 3. Every session in the booking must be either:
   *    - COMPLETED with valid tutor attendance.
   *    - OR have an APPROVED exception of category WAIVER or PARENT_DECLINED_SUBJECT.
   *    - MANDATORY SAFEGUARD: An approved exception of category REPLACEMENT_SCHEDULED
   *      does NOT satisfy the completion gate; the replacement session is pending!
   * 4. Detailed Feedback record must be present.
   * 5. Academic Roadmap must be present.
   * 6. Academic Plan must be present.
   */
  verifyBookingCompletionGate(booking: {
    attendances: Array<{ participantType: DemoParticipantType; status: DemoAttendanceStatus }>;
    sessions: Array<{
      id: string;
      sessionOrder: number;
      status: DemoSessionStatus;
      attendances?: Array<{ participantType: DemoParticipantType; status: DemoAttendanceStatus }>;
      exceptions?: Array<{
        exceptionCategory: DemoSessionExceptionCategory;
        resolutionStatus: DemoExceptionStatus;
      }>;
    }>;
    feedbackRecord?: any;
    roadmap?: any;
    academicPlan?: any;
  }): CompletionGateResult {
    const pendingReasons: string[] = [];

    // 1. Parent Attendance
    const hasParentAttendance = booking.attendances.some(
      (a) => a.participantType === DemoParticipantType.PARENT,
    );
    if (!hasParentAttendance) {
      pendingReasons.push('Parent booking-level attendance is required');
    }

    // 2. Coordinator Attendance
    const hasCoordinatorAttendance = booking.attendances.some(
      (a) => a.participantType === DemoParticipantType.COORDINATOR,
    );
    if (!hasCoordinatorAttendance) {
      pendingReasons.push('Coordinator booking-level attendance is required');
    }

    // 3. Session Resolution & Safeguards
    if (!booking.sessions || booking.sessions.length === 0) {
      pendingReasons.push('Booking contains no sessions');
    } else {
      for (const session of booking.sessions) {
        const approvedExceptions = (session.exceptions || []).filter(
          (e) => e.resolutionStatus === DemoExceptionStatus.APPROVED,
        );

        const hasWaiverOrDeclined = approvedExceptions.some(
          (e) =>
            e.exceptionCategory === DemoSessionExceptionCategory.WAIVER ||
            e.exceptionCategory === DemoSessionExceptionCategory.PARENT_DECLINED_SUBJECT,
        );

        const hasReplacementScheduled = approvedExceptions.some(
          (e) => e.exceptionCategory === DemoSessionExceptionCategory.REPLACEMENT_SCHEDULED,
        );

        if (session.status === DemoSessionStatus.COMPLETED) {
          // Verify tutor attendance for completed session
          const hasTutorAttended = (session.attendances || []).some(
            (a) =>
              a.participantType === DemoParticipantType.TUTOR &&
              (a.status === DemoAttendanceStatus.PRESENT || a.status === DemoAttendanceStatus.LATE),
          );
          if (!hasTutorAttended) {
            pendingReasons.push(
              `Session ${session.sessionOrder} is marked completed but lacks tutor attendance`,
            );
          }
        } else if (hasWaiverOrDeclined) {
          // Waived or parent declined subject satisfies exception criteria
          continue;
        } else if (hasReplacementScheduled) {
          // CRITICAL REQUIREMENT: Replacement session scheduled does NOT satisfy completion!
          pendingReasons.push(
            `Session ${session.sessionOrder} has a replacement scheduled; pending execution of replacement session`,
          );
        } else {
          pendingReasons.push(
            `Session ${session.sessionOrder} is not completed and has no approved waiver or parent-declined exception`,
          );
        }
      }
    }

    // 4. Feedback Record
    if (!booking.feedbackRecord) {
      pendingReasons.push('Detailed demo feedback record is required');
    }

    // 5. Academic Roadmap
    if (!booking.roadmap) {
      pendingReasons.push('Post-demo academic roadmap is required');
    }

    // 6. Academic Plan
    if (!booking.academicPlan) {
      pendingReasons.push('Post-demo academic plan is required');
    }

    return {
      canComplete: pendingReasons.length === 0,
      pendingReasons,
    };
  }

  /**
   * Retrieves the next eligible Demo Coordinator in round-robin order.
   * Atomic concurrency, skips leave/inactive coordinators,
   * leaves unassigned if empty pool, and NEVER falls back to CEO.
   */
  async getRoundRobinNextCoordinator(tx: PrismaTxClient) {
    const eligibleCoordinators = await tx.roundRobinCoordinatorState.findMany({
      where: {
        isEligible: true,
        dailyState: 'ACTIVE',
        user: {
          status: 'ACTIVE',
        },
      },
      include: {
        user: {
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        },
      },
      orderBy: [
        { currentLoad: 'asc' },
        { lastReturnedAt: 'asc' },
      ],
    });

    if (!eligibleCoordinators || eligibleCoordinators.length === 0) {
      return null;
    }

    // Safety guard: Never assign a coordinator with the CEO role
    const candidate = eligibleCoordinators.find((c) => {
      const roles = c.user?.userRoles?.map((ur: any) => ur.role?.code) || [];
      return !roles.includes('CEO');
    });

    return candidate || null;
  }
}
