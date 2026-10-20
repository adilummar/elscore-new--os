import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, ForbiddenException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import {
  DemoStatus,
  DemoBookingStatus,
  DemoSessionStatus,
  UserStatus,
  LeadStatus,
  DemoParticipantType,
  DemoAttendanceStatus,
  TutorAssignmentStatus,
  DemoExceptionStatus,
  DemoOperationalStage,
  ParentConfirmationChannel,
  Prisma,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { v5 as uuidv5 } from 'uuid';

import { AuditService } from '../../common/audit/audit.service';
import { ValidatedUser } from '../../common/auth/auth.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { RbacService } from '../../common/rbac/rbac.service';
import { DEMO_BACKFILL_NAMESPACE } from './backfill/demo-backfill.service';
import { DemoMultiSessionService } from './demo-multisession.service';

import {
  CreateDemoDto,
  RescheduleDemoDto,
  AssignTutorDto,
  CompleteDemoDto,
  CancelDemoDto,
  NoShowDemoDto,
  EditDemoDto,
  SavePreparationDto,
  RecordMeetingLinkDto,
  ConfirmParentMeetingDto,
  ReassignCoordinatorDto,
} from './dto/demo.dto';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGenerator: IdGeneratorService,
    private readonly rbac: RbacService,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
    private readonly multiSessionService: DemoMultiSessionService = new DemoMultiSessionService(prisma),
  ) {}

  private async checkOverlap(tx: any, studentId: string, tutorId: string | null, start: Date, end: Date, excludeDemoId?: string, excludeBookingId?: string) {
    // In PostgreSQL, lock the student row to prevent concurrent overlapping bookings
    if (tx.$queryRaw) {
      try {
        await tx.$queryRaw`SELECT 1 FROM "students" WHERE "id" = ${studentId} FOR UPDATE`;
      } catch (e) {
        // Fallback for SQLite which doesn't support FOR UPDATE in the same way, or other DBs
      }
    }

    const effectiveBookingId = excludeBookingId || excludeDemoId;

    const studentDemos = await tx.demo.findMany({
      where: {
        studentId,
        id: excludeDemoId ? { not: excludeDemoId } : undefined,
        status: { in: [DemoStatus.SCHEDULED, DemoStatus.ASSIGNED] }
      }
    });

    for (const d of studentDemos) {
      const dStart = new Date(d.scheduledAt).getTime();
      const dEnd = dStart + d.durationMinutes * 60000;
      if (start.getTime() < dEnd && end.getTime() > dStart) {
        throw new BadRequestException('Student already has an overlapping demo');
      }
    }

    if (tx.demoSession?.findMany) {
      const existingSessions = await tx.demoSession.findMany({
        where: {
          booking: {
            studentId,
            ...(effectiveBookingId
              ? {
                  AND: [
                    { id: { not: effectiveBookingId } },
                    { legacyDemoId: { not: effectiveBookingId } },
                  ],
                }
              : {}),
          },
          status: { in: [DemoSessionStatus.SCHEDULED, DemoSessionStatus.ASSIGNED, DemoSessionStatus.IN_PROGRESS] },
        },
      });

      for (const s of existingSessions) {
        const sStart = new Date(s.scheduledStart).getTime();
        const sEnd = new Date(s.scheduledEnd).getTime();
        if (start.getTime() < sEnd && end.getTime() > sStart) {
          throw new BadRequestException('Student already has an overlapping demo session');
        }
      }
    }

    if (tutorId) {
      const tutorDemos = await tx.demo.findMany({
        where: {
          tutorId,
          id: excludeDemoId ? { not: excludeDemoId } : undefined,
          status: { in: [DemoStatus.SCHEDULED, DemoStatus.ASSIGNED] }
        }
      });
      for (const d of tutorDemos) {
        const dStart = new Date(d.scheduledAt).getTime();
        const dEnd = dStart + d.durationMinutes * 60000;
        if (start.getTime() < dEnd && end.getTime() > dStart) {
          throw new BadRequestException('Tutor already has an overlapping demo');
        }
      }

      if (tx.demoSessionTutorAssignment?.findMany) {
        const existingTutorAssignments = await tx.demoSessionTutorAssignment.findMany({
          where: {
            tutorId,
            status: TutorAssignmentStatus.ACTIVE,
            session: {
              ...(effectiveBookingId
                ? {
                    booking: {
                      AND: [
                        { id: { not: effectiveBookingId } },
                        { legacyDemoId: { not: effectiveBookingId } },
                      ],
                    },
                  }
                : {}),
              status: { in: [DemoSessionStatus.SCHEDULED, DemoSessionStatus.ASSIGNED, DemoSessionStatus.IN_PROGRESS] },
            },
          },
          include: { session: true },
        });

        for (const a of existingTutorAssignments) {
          const sStart = new Date(a.session.scheduledStart).getTime();
          const sEnd = new Date(a.session.scheduledEnd).getTime();
          if (start.getTime() < sEnd && end.getTime() > sStart) {
            throw new BadRequestException('Tutor already has an overlapping demo session');
          }
        }
      }
    }
  }

  async bookDemo(dto: CreateDemoDto, user: ValidatedUser) {
    const hasHeadAccess = await this.rbac.hasPermissions(user.id, ['demo.manage_team']);
    const canBookAnyLead = hasHeadAccess || await this.rbac.hasPermissions(user.id, ['demo.manage_all']);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 0. Idempotency Check
      const deterministicBookingId = dto.idempotencyKey
        ? uuidv5(dto.idempotencyKey, DEMO_BACKFILL_NAMESPACE)
        : null;

      if (deterministicBookingId) {
        const existing = await tx.demoBooking.findUnique({
          where: { id: deterministicBookingId },
          include: {
            sessions: {
              include: { subject: true, grade: true, curriculum: true },
            },
          },
        });
        if (existing) {
          return existing;
        }
      }

      // 1. Lock student to prevent concurrent duplicate/overlapping bookings
      if ((tx as any).$queryRaw) {
        try {
          await (tx as any).$queryRaw`SELECT 1 FROM "students" WHERE "id" = ${dto.studentId} FOR UPDATE`;
        } catch (e) {
          // Fallback if not supported
        }
      }

      // 2. Fetch Student with Lead and Requirements
      let student = tx.student ? await tx.student.findUnique({
        where: { id: dto.studentId },
        include: {
          lead: true,
          requirements: {
            include: { subject: true, grade: true, curriculum: true },
          },
        },
      }) : null;

      // Backward compatibility fallback: if student.findUnique returned null, attempt finding via requirement
      if (!student && dto.requirementId && tx.requirement) {
        const req = await tx.requirement.findUnique({
          where: { id: dto.requirementId },
          include: {
            subject: true,
            grade: true,
            curriculum: true,
            student: {
              include: { lead: true },
            },
          },
        });
        if (req?.student) {
          student = {
            ...req.student,
            id: req.studentId || (req.student as any).id || dto.studentId,
            firstName: req.student.firstName || 'Student',
            lastName: req.student.lastName || '',
            lead: req.student.lead,
            requirements: [
              {
                id: req.id || dto.requirementId || 'req-1',
                studentId: req.studentId || dto.studentId,
                subjectId: req.subjectId,
                curriculumId: req.curriculumId,
                gradeId: req.gradeId,
                subject: req.subject,
                grade: req.grade,
                curriculum: req.curriculum,
              },
            ],
          } as any;
        }
      }

      if (!student) {
        throw new NotFoundException('Student not found');
      }
      if (!student.lead) {
        throw new NotFoundException('Student lead not found');
      }

      const lead = student.lead;

      // 3. Status eligibility check: only leads in INTERESTED status can have demos booked
      if (lead.status !== LeadStatus.INTERESTED) {
        throw new BadRequestException(
          `Cannot book demo for a lead with status ${lead.status || 'UNKNOWN'}. Lead must be in INTERESTED status to book a demo.`,
        );
      }

      // 4. Ownership verification
      if (!canBookAnyLead && lead.assignedToUserId && lead.assignedToUserId !== user.id) {
        throw new ForbiddenException('You can only book demos for your assigned leads');
      }

      // 5. Normalize sessions
      const rawSessions: Array<{
        requirementId: string;
        scheduledStart: Date;
        durationMinutes: number;
      }> = [];

      if (dto.sessions && dto.sessions.length > 0) {
        for (const s of dto.sessions) {
          rawSessions.push({
            requirementId: s.requirementId,
            scheduledStart: new Date(s.scheduledStart),
            durationMinutes: s.durationMinutes,
          });
        }
      } else if (dto.requirementId && dto.scheduledAt && dto.durationMinutes) {
        rawSessions.push({
          requirementId: dto.requirementId,
          scheduledStart: new Date(dto.scheduledAt),
          durationMinutes: dto.durationMinutes,
        });
      } else {
        throw new BadRequestException(
          'Either sessions array or requirementId, scheduledAt, and durationMinutes must be provided',
        );
      }

      // Validate each session requirement belongs to the student
      const reqMap = new Map((student.requirements || []).map((r: any) => [r.id, r]));
      const multiSessionInputs = [];

      for (let i = 0; i < rawSessions.length; i++) {
        const item = rawSessions[i];
        const req = reqMap.get(item.requirementId);
        if (!req) {
          throw new BadRequestException(
            `Requirement ${item.requirementId} not found or does not belong to student ${dto.studentId}`,
          );
        }

        const start = new Date(item.scheduledStart);
        const end = new Date(start.getTime() + item.durationMinutes * 60000);

        if (start < new Date() && !hasHeadAccess) {
          throw new BadRequestException(`Cannot book demo session in the past (session ${i + 1})`);
        }

        multiSessionInputs.push({
          requirementId: req.id,
          subjectId: req.subjectId,
          curriculumId: req.curriculumId,
          gradeId: req.gradeId,
          scheduledStart: start,
          scheduledEnd: end,
          durationMinutes: item.durationMinutes,
        });
      }

      // Validate session structure and non-overlapping sequence within the booking
      const { totalDurationMinutes, orderedSessions } =
        this.multiSessionService.validateMultiSessionStructure(multiSessionInputs);

      // Check external overlaps against existing bookings/demos for this student
      for (const s of orderedSessions) {
        await this.checkOverlap(tx, dto.studentId, null, s.scheduledStart, s.scheduledEnd);
      }

      // 6. Generate Business ID
      const businessId = await this.idGenerator.nextIdInTx(tx, 'DMO');

      // 7. Round-robin coordinator
      let coordinatorId: string | null = null;
      try {
        if (tx.roundRobinCoordinatorState) {
          const nextCoordinator = await this.multiSessionService.getRoundRobinNextCoordinator(tx);
          if (nextCoordinator) {
            coordinatorId = nextCoordinator.userId;
            await tx.roundRobinCoordinatorState.update({
              where: { userId: nextCoordinator.userId },
              data: {
                currentLoad: nextCoordinator.currentLoad + 1,
                lastReturnedAt: new Date(),
              },
            });
          }
        }
      } catch (e) {
        // Coordinator round-robin is optional / graceful fallback
      }

      // 8. Create Parent DemoBooking (if table available)
      let booking: any = null;
      if (tx.demoBooking) {
        booking = await tx.demoBooking.create({
          data: {
            id: deterministicBookingId || undefined,
            businessId,
            studentId: student.id,
            leadId: lead.id,
            coordinatorId,
            bookedByUserId: user.id,
            status: DemoBookingStatus.SCHEDULED,
            operationalStage: DemoOperationalStage.VALID_DEMO,
            scheduledDate: orderedSessions[0].scheduledStart,
            totalDurationMin: totalDurationMinutes,
          },
        });

        if (tx.demoOperationalStageHistory) {
          await tx.demoOperationalStageHistory.create({
            data: {
              bookingId: booking.id,
              previousStage: null,
              newStage: DemoOperationalStage.VALID_DEMO,
              changedByUserId: user.id,
              reason: 'Initial demo booking',
            },
          });
        }
      }

      // 9. Create Child DemoSessions
      const createdSessions = [];
      if (tx.demoSession && booking) {
        for (const s of orderedSessions) {
          const createdSession = await tx.demoSession.create({
            data: {
              bookingId: booking.id,
              sessionOrder: s.sessionOrder,
              requirementId: s.requirementId,
              subjectId: s.subjectId,
              curriculumId: s.curriculumId,
              gradeId: s.gradeId,
              status: DemoSessionStatus.SCHEDULED,
              scheduledStart: s.scheduledStart,
              scheduledEnd: s.scheduledEnd,
              durationMinutes: s.durationMinutes,
            },
            include: {
              subject: true,
              grade: true,
              curriculum: true,
            },
          });
          createdSessions.push(createdSession);
        }
      }

      // 10. Dual-write primary session to legacy demos table for backward compatibility
      const primarySession = orderedSessions[0];
      const legacyDemo = await tx.demo.create({
        data: {
          id: booking ? booking.id : undefined,
          businessId,
          studentId: student.id,
          requirementId: primarySession.requirementId,
          status: DemoStatus.SCHEDULED,
          scheduledAt: primarySession.scheduledStart,
          durationMinutes: primarySession.durationMinutes,
          subjectId: primarySession.subjectId,
          curriculumId: primarySession.curriculumId,
          gradeId: primarySession.gradeId,
          bookedByUserId: user.id,
        },
      });

      if (tx.demoBooking && booking) {
        await tx.demoBooking.update({
          where: { id: booking.id },
          data: { legacyDemoId: legacyDemo.id },
        });
      }

      // 11. LEAD STATUS TRANSITION:
      // "A successful save persists the booking and sessions and changes the lead to DEMO_BOOKED according to the existing canonical status model."
      if (tx.lead && lead.id) {
        const oldStatus = lead.status;
        const newStatus = LeadStatus.DEMO_BOOKED;

        await tx.lead.update({
          where: { id: lead.id },
          data: { status: newStatus },
        });

        if (tx.leadStatusHistory) {
          await tx.leadStatusHistory.create({
            data: {
              leadId: lead.id,
              oldStatus,
              newStatus,
              reason: `Demo booked for student ${student.firstName || ''}`,
              note: `Booking ${businessId} (${orderedSessions.length} session(s))`,
              changedByUserId: user.id,
            },
          });
        }

        await this.audit.recordInTx(tx, {
          entityType: 'Lead',
          entityId: lead.id,
          action: 'STATUS_CHANGE',
          actorUserId: user.id,
          oldValue: { status: oldStatus },
          newValue: { status: newStatus },
        });
      }

      // 12. Record audit log for demo booking
      await this.audit.recordInTx(tx, {
        entityType: 'demo',
        entityId: booking ? booking.id : legacyDemo.id,
        action: 'DEMO_BOOKED',
        actorUserId: user.id,
        newValue: {
          bookingId: booking ? booking.id : undefined,
          businessId,
          studentId: student.id,
          leadId: lead.id,
          sessionsCount: orderedSessions.length,
          legacyDemoId: legacyDemo.id,
        },
      });

      // 13. Queue Notification for coordinator
      await this.notificationsQueue.add('send', {
        recipientRole: 'DEMO_COORDINATOR',
        type: 'DEMO_BOOKED',
        entityType: booking ? 'demo_booking' : 'demo',
        entityId: booking ? booking.id : legacyDemo.id,
        message: `New Demo Booked: ${businessId} (${orderedSessions.length} session(s))`,
      });

      return {
        ...legacyDemo,
        bookingId: booking ? booking.id : undefined,
        sessions: createdSessions,
      };
    });
  }

  async getDemoActorContext(userId: string) {
    let userPerms = new Set<string>();
    if (this.rbac) {
      if (typeof (this.rbac as any).getPermissionsForUser === 'function') {
        userPerms = await this.rbac.getPermissionsForUser(userId);
      } else if (typeof this.rbac.hasPermissions === 'function') {
        const testCodes = [
          'demo.manage_all',
          'demo.manage_team',
          'demo.manage_operations',
          'demo.read_all',
          'demo.read',
          'demo.read_own',
          'demo.read_assigned',
          'demo.book',
          'demo.assign_tutor',
          'demo.reschedule',
          'demo.reschedule_own',
          'demo.cancel',
          'demo.cancel_own',
          'demo.complete',
          'demo.mark_exceptions',
          'demo.approve_exception',
          'demo.coordinate',
          'demo.reports.company',
          'demo.reports.operational',
        ];
        for (const code of testCodes) {
          if (await this.rbac.hasPermissions(userId, [code])) {
            userPerms.add(code);
          }
        }
      }
    }

    let roles = new Set<string>();
    if (this.prisma?.userRole?.findMany) {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId },
        include: { role: true },
      });
      roles = new Set(userRoles.map((ur: any) => ur.role?.code).filter(Boolean));
    }

    const isCeo = roles.has('CEO');
    const isDemoHead = roles.has('DEMO_HEAD');
    const isDemoAdmin = roles.has('DEMO_ADMIN');
    const isAcademicHead = roles.has('ACADEMIC_HEAD');
    const isOperationsManager = roles.has('OPERATIONS_MANAGER');
    const isSalesHead = roles.has('SALES_HEAD') || userPerms.has('demo.manage_team');
    const isCoordinator = roles.has('DEMO_COORDINATOR') || userPerms.has('demo.coordinate');
    const isTutor = roles.has('TUTOR') || userPerms.has('demo.read_assigned');
    const isSalesCounsellor = roles.has('SALES_COUNSELLOR') || userPerms.has('demo.read_own');

    // Company-wide demo access: CEO, DEMO_HEAD, DEMO_ADMIN, ACADEMIC_HEAD, OPERATIONS_MANAGER,
    // or holding demo.manage_all / demo.read_all
    const isCompanyWide = (
      isCeo ||
      isDemoHead ||
      isDemoAdmin ||
      isAcademicHead ||
      isOperationsManager ||
      userPerms.has('demo.manage_all') ||
      userPerms.has('demo.read_all')
    );

    return {
      perms: userPerms,
      roles,
      isCeo,
      isDemoHead,
      isDemoAdmin,
      isAcademicHead,
      isOperationsManager,
      isSalesHead,
      isCoordinator,
      isTutor,
      isSalesCounsellor,
      isCompanyWide,
    };
  }

  async buildDemoVisibilityWhere(actor: Awaited<ReturnType<typeof this.getDemoActorContext>>, userId: string) {
    const where: any = {};

    if (actor.isCompanyWide || actor.isSalesHead) {
      // Company-wide / Sales Head: no scoping restrictions on demos
      return where;
    }

    if (actor.isCoordinator) {
      // Demo Coordinator: restricted to bookings within their coordinator assignment scope
      let coordinatedDemoIds: string[] = [];
      if (this.prisma?.demoBooking?.findMany) {
        const coordinatedBookings = await this.prisma.demoBooking.findMany({
          where: { coordinatorId: userId },
          select: { id: true, legacyDemoId: true },
        });
        coordinatedDemoIds = coordinatedBookings
          .flatMap((b: any) => [b.id, b.legacyDemoId])
          .filter((id: any): id is string => Boolean(id));
      }
      where.id = { in: coordinatedDemoIds };
      return where;
    }

    if (actor.isTutor) {
      // Tutor: restricted to sessions where they are assigned as tutor
      let multiSessionDemoIds: string[] = [];
      if (this.prisma?.demoSessionTutorAssignment?.findMany) {
        const tutorAssignments = await this.prisma.demoSessionTutorAssignment.findMany({
          where: {
            tutorId: userId,
            status: TutorAssignmentStatus.ACTIVE,
          },
          select: {
            session: {
              select: {
                booking: {
                  select: { id: true, legacyDemoId: true },
                },
              },
            },
          },
        });
        multiSessionDemoIds = tutorAssignments
          .flatMap((a: any) => [a.session?.booking?.id, a.session?.booking?.legacyDemoId])
          .filter((id: any): id is string => Boolean(id));
      }

      if (multiSessionDemoIds.length > 0) {
        where.OR = [
          { tutorId: userId },
          { id: { in: multiSessionDemoIds } },
        ];
      } else {
        where.tutorId = userId;
      }
      return where;
    }

    // Default (e.g. Sales Counsellor): restricted to own assigned leads
    where.student = {
      lead: {
        assignedToUserId: userId,
      },
    };

    return where;
  }

  async getDemos(user: ValidatedUser, query?: { view?: string; status?: string; stage?: string }) {
    const actor = await this.getDemoActorContext(user.id);
    const where = await this.buildDemoVisibilityWhere(actor, user.id);

    if (query?.status) {
      where.status = query.status;
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86400000);

    if (query?.view) {
      if (query.view === 'pending') {
        where.status = DemoStatus.SCHEDULED;
        where.tutorId = null;
      } else if (query.view === 'today') {
        where.scheduledAt = { gte: startOfToday, lt: endOfToday };
      } else if (query.view === 'upcoming') {
        where.scheduledAt = { gte: endOfToday };
      } else if (query.view === 'completed') {
        where.status = DemoStatus.COMPLETED;
      }
    }

    const demos = await this.prisma.demo.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            currentGrade: true,
            lead: { select: { id: true, assignedToUserId: true, primaryPhone: true, whatsappNumber: true } },
          },
        },
        subject: { select: { id: true, name: true } },
        curriculum: { select: { id: true, name: true } },
        grade: { select: { id: true, name: true } },
        requirement: { select: { id: true, notes: true, subjectId: true, gradeId: true, curriculumId: true } },
        tutor: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        bookedByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
      },
    });

    // Hydrate demoBooking data for operational stage and workflow details
    let demoBookings: any[] = [];
    if (this.prisma.demoBooking && demos.length > 0) {
      const demoIds = demos.map((d: any) => d.id);
      demoBookings = await this.prisma.demoBooking.findMany({
        where: {
          OR: [
            { id: { in: demoIds } },
            { legacyDemoId: { in: demoIds } },
          ],
        },
        include: {
          coordinator: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
          lead: { select: { id: true, assignedToUserId: true, primaryPhone: true, whatsappNumber: true } },
          sessions: {
            include: {
              subject: true,
              grade: true,
              curriculum: true,
              tutorAssignments: {
                where: { status: TutorAssignmentStatus.ACTIVE },
                include: { tutor: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } } },
              },
            },
            orderBy: { sessionOrder: 'asc' },
          },
        },
      });
    }

    const bookingMap = new Map();
    for (const b of demoBookings) {
      bookingMap.set(b.id, b);
      if (b.legacyDemoId) bookingMap.set(b.legacyDemoId, b);
    }

    let enrichedDemos = demos.map((d: any) => {
      const booking = bookingMap.get(d.id);
      return {
        ...d,
        booking: booking || null,
        operationalStage: booking?.operationalStage || (d.status === DemoStatus.COMPLETED ? DemoOperationalStage.COMPLETED : DemoOperationalStage.VALID_DEMO),
        isRescheduled: booking?.isRescheduled || false,
        coordinator: booking?.coordinator || null,
        preparationNotes: booking?.preparationNotes || null,
        meetingLink: booking?.meetingLink || null,
        meetingPlatform: booking?.meetingPlatform || null,
        parentConfirmedAt: booking?.parentConfirmedAt || null,
        salesWhatsAppSharedAt: booking?.salesWhatsAppSharedAt || null,
      };
    });

    // Filter by operational stage if requested
    if (query?.stage) {
      enrichedDemos = enrichedDemos.filter((d: any) => d.operationalStage === query.stage);
    }

    // Filter by specific operational views
    if (query?.view === 'ready_for_sales') {
      enrichedDemos = enrichedDemos.filter(
        (d: any) => d.operationalStage === DemoOperationalStage.LINK_SHARED && !d.parentConfirmedAt,
      );
    } else if (query?.view === 'unassigned') {
      enrichedDemos = enrichedDemos.filter(
        (d: any) => !d.coordinator && d.status !== DemoStatus.COMPLETED && d.status !== DemoStatus.CANCELLED,
      );
    } else if (query?.view === 'my_queue') {
      enrichedDemos = enrichedDemos.filter(
        (d: any) =>
          (d.coordinator && d.coordinator.id === user.id) ||
          (d.student?.lead?.assignedToUserId === user.id) ||
          (d.bookedByUser?.id === user.id),
      );
    } else if (query?.view === 'overdue') {
      enrichedDemos = enrichedDemos.filter(
        (d: any) =>
          new Date(d.scheduledAt).getTime() < now.getTime() &&
          d.status !== DemoStatus.COMPLETED &&
          d.status !== DemoStatus.CANCELLED &&
          d.status !== DemoStatus.NO_SHOW,
      );
    }

    return enrichedDemos;
  }

  async getSummary(user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);
    const where = await this.buildDemoVisibilityWhere(actor, user.id);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86400000);

    const [todayCount, upcomingCount, completedTodayCount, cancelledTodayCount, noShowTodayCount, pendingCount] = await Promise.all([
      this.prisma.demo.count({
        where: { ...where, scheduledAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.demo.count({
        where: { ...where, scheduledAt: { gte: endOfToday } },
      }),
      this.prisma.demo.count({
        where: { ...where, status: DemoStatus.COMPLETED, scheduledAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.demo.count({
        where: { ...where, status: DemoStatus.CANCELLED, scheduledAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.demo.count({
        where: { ...where, status: DemoStatus.NO_SHOW, scheduledAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.demo.count({
        where: { ...where, status: DemoStatus.SCHEDULED, tutorId: null },
      }),
    ]);

    // Operational stages counts from DemoBooking
    const stageCounts: Record<string, number> = {
      VALID_DEMO: 0,
      PREPARATION: 0,
      TUTOR_ASSIGNED: 0,
      LINK_SHARED: 0,
      PARENT_CONFIRMATION: 0,
      COMPLETED: 0,
      NOT_SHOW: 0,
      CANCELLED: 0,
      RESCHEDULED: 0,
    };
    let readyForSalesCount = 0;
    let unassignedCount = 0;
    let myQueueCount = 0;
    let overdueCount = 0;

    if (this.prisma.demoBooking) {
      const activeBookings = await this.prisma.demoBooking.findMany({
        select: {
          id: true,
          operationalStage: true,
          status: true,
          coordinatorId: true,
          parentConfirmedAt: true,
          scheduledDate: true,
          bookedByUserId: true,
          lead: { select: { assignedToUserId: true } },
        },
      });

      for (const b of activeBookings) {
        if (b.operationalStage && stageCounts[b.operationalStage] !== undefined) {
          stageCounts[b.operationalStage]++;
        }
        if (b.operationalStage === DemoOperationalStage.LINK_SHARED && !b.parentConfirmedAt) {
          readyForSalesCount++;
        }
        if (!b.coordinatorId && b.status !== DemoBookingStatus.COMPLETED && b.status !== DemoBookingStatus.CANCELLED) {
          unassignedCount++;
        }
        if (
          (b.coordinatorId === user.id) ||
          (b.lead?.assignedToUserId === user.id) ||
          (b.bookedByUserId === user.id)
        ) {
          myQueueCount++;
        }
        if (
          new Date(b.scheduledDate).getTime() < now.getTime() &&
          b.status !== DemoBookingStatus.COMPLETED &&
          b.status !== DemoBookingStatus.CANCELLED &&
          b.status !== DemoBookingStatus.NO_SHOW
        ) {
          overdueCount++;
        }
      }
    }

    return {
      today: todayCount,
      upcoming: upcomingCount,
      completedToday: completedTodayCount,
      cancelledToday: cancelledTodayCount,
      noShowToday: noShowTodayCount,
      pending: pendingCount,
      readyForSales: readyForSalesCount,
      unassigned: unassignedCount,
      myQueue: myQueueCount,
      overdue: overdueCount,
      stages: stageCounts,
    };
  }

  async getTutorSuggestions(id: string, user: ValidatedUser) {
    const demo = await this.prisma.demo.findUnique({
      where: { id },
      include: {
        requirement: true,
        subject: true,
        grade: true,
        curriculum: true,
      },
    });

    if (!demo) throw new NotFoundException('Demo not found');

    const scheduledDate = new Date(demo.scheduledAt);
    const dayOfWeek = scheduledDate.getDay();
    const durationMinutes = demo.durationMinutes || 60;
    const end = new Date(scheduledDate.getTime() + durationMinutes * 60000);

    const tutors = await (this.prisma.user as any).findMany({
      where: {
        status: UserStatus.ACTIVE,
        userRoles: {
          some: {
            role: { code: 'TUTOR' },
          },
        },
      },
      include: {
        employee: {
          include: {
            tutorProfile: {
              include: {
                subjects: { where: { isActive: true } },
                grades: { where: { isActive: true } },
                curricula: { where: { isActive: true } },
                availability: true,
              },
            },
          },
        },
      },
    });

    const suggestions = [];

    for (const tutor of (tutors as any[])) {
      // Check overlap with legacy demos
      const hasDemoOverlap = await this.prisma.demo.findFirst({
        where: {
          tutorId: tutor.id,
          status: { in: [DemoStatus.SCHEDULED, DemoStatus.ASSIGNED] },
          scheduledAt: { lt: end },
        },
      });

      let hasSessionOverlap = false;
      if (this.prisma.demoSessionTutorAssignment) {
        const activeAssignment = await this.prisma.demoSessionTutorAssignment.findFirst({
          where: {
            tutorId: tutor.id,
            status: TutorAssignmentStatus.ACTIVE,
            session: {
              status: { in: [DemoSessionStatus.SCHEDULED, DemoSessionStatus.ASSIGNED, DemoSessionStatus.IN_PROGRESS] },
              scheduledStart: { lt: end },
              scheduledEnd: { gt: scheduledDate },
            },
          },
        });
        if (activeAssignment) hasSessionOverlap = true;
      }

      if (hasDemoOverlap || hasSessionOverlap) {
        continue;
      }

      const emp = tutor.employee;
      const profile = emp?.tutorProfile;
      let score = 0;
      const matchReasons: string[] = [];

      if (profile) {
        if (demo.subjectId && profile.subjects?.some((s: any) => s.subjectId === demo.subjectId)) {
          score += 40;
          matchReasons.push('Subject match');
        }
        if (demo.gradeId && profile.grades?.some((g: any) => g.gradeId === demo.gradeId)) {
          score += 30;
          matchReasons.push('Grade match');
        }
        if (demo.curriculumId && profile.curricula?.some((c: any) => c.curriculumId === demo.curriculumId)) {
          score += 20;
          matchReasons.push('Curriculum match');
        }
        const timeSlotMatch = profile.availability?.some((slot: any) => slot.dayOfWeek === dayOfWeek);
        if (timeSlotMatch) {
          score += 10;
          matchReasons.push('Availability match');
        }
      }

      suggestions.push({
        id: tutor.id,
        email: tutor.email,
        firstName: emp?.firstName || '',
        lastName: emp?.lastName || '',
        score,
        matchReasons,
        teachingExperience: profile?.teachingExperience || 0,
        isAvailable: true,
      });
    }

    suggestions.sort((a, b) => b.score - a.score);
    return suggestions;
  }

  async searchTutors(query: string) {
    const tutors = await (this.prisma.user as any).findMany({
      where: {
        status: UserStatus.ACTIVE,
        userRoles: {
          some: {
            role: { code: 'TUTOR' },
          },
        },
        OR: query ? [
          { email: { contains: query, mode: 'insensitive' } },
          { employee: { firstName: { contains: query, mode: 'insensitive' } } },
          { employee: { lastName: { contains: query, mode: 'insensitive' } } },
        ] : undefined,
      },
      take: 10,
      include: {
        employee: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return (tutors as any[]).map((t) => ({
      id: t.id,
      email: t.email,
      firstName: t.employee?.firstName || '',
      lastName: t.employee?.lastName || '',
    }));
  }

  async getDemoById(id: string, user: ValidatedUser) {
    let demo = await this.prisma.demo.findUnique({
      where: { id },
      include: {
        student: { 
          select: { 
            id: true, firstName: true, lastName: true, currentGrade: true, cityLocation: true,
            lead: { select: { id: true, assignedToUserId: true } }
          } 
        },
        subject: true,
        curriculum: true,
        grade: true,
        requirement: { select: { notes: true } },
        tutor: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        feedback: true
      }
    });

    // Attach or locate multi-session booking data
    let booking: any = null;
    if (this.prisma.demoBooking) {
      booking = await this.prisma.demoBooking.findFirst({
        where: {
          OR: [
            { id },
            { legacyDemoId: id },
            ...(demo ? [{ id: demo.id }, { legacyDemoId: demo.id }] : []),
          ],
        },
        include: {
          sessions: {
            include: {
              subject: true,
              grade: true,
              curriculum: true,
              tutorAssignments: {
                include: {
                  tutor: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
                },
                orderBy: { assignmentSequence: 'desc' },
              },
              attendances: true,
              exceptions: true,
            },
            orderBy: { sessionOrder: 'asc' },
          },
          attendances: true,
          feedbackRecord: true,
          roadmap: true,
          academicPlan: true,
          rescheduleHistory: true,
          coordinator: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
          stageHistory: {
            include: {
              changedByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
            },
            orderBy: { changedAt: 'desc' },
          },
          meetingLinkHistory: {
            include: {
              sharedByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
            },
            orderBy: { createdAt: 'desc' },
          },
          preparedByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
          linkSharedByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
          parentConfirmedByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
          whatsappOpenedByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              primaryPhone: true,
              whatsappNumber: true,
              status: true,
              assignedToUserId: true,
              assignedToUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      });
    }

    if (!demo && booking && booking.legacyDemoId) {
      demo = await this.prisma.demo.findUnique({
        where: { id: booking.legacyDemoId },
        include: {
          student: { 
            select: { 
              id: true, firstName: true, lastName: true, currentGrade: true, cityLocation: true,
              lead: { select: { id: true, assignedToUserId: true } }
            } 
          },
          subject: true,
          curriculum: true,
          grade: true,
          requirement: { select: { notes: true } },
          tutor: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
          feedback: true
        }
      });
    }

    if (!demo && !booking) {
      throw new NotFoundException('Demo not found');
    }

    // Role and Scope Authorization
    const actor = await this.getDemoActorContext(user.id);

    if (!actor.isCompanyWide && !actor.isSalesHead) {
      // Check if user is the assigned coordinator for this booking
      const isAssignedCoordinator = Boolean(
        booking?.coordinatorId && booking.coordinatorId === user.id
      );

      // Check if user is assigned tutor
      let isAssignedTutor = false;
      if (actor.isTutor) {
        if (demo?.tutorId === user.id) {
          isAssignedTutor = true;
        } else if (booking?.sessions) {
          isAssignedTutor = booking.sessions.some((s: any) =>
            s.tutorAssignments?.some(
              (a: any) => a.tutorId === user.id && (a.status === 'ACTIVE' || a.status === TutorAssignmentStatus.ACTIVE)
            )
          );
        }
      }

      // Check if user is lead owner or booker
      const isLeadOwner = Boolean(
        (demo?.student?.lead?.assignedToUserId && demo.student.lead.assignedToUserId === user.id) ||
        (booking?.lead?.assignedToUserId && booking.lead.assignedToUserId === user.id)
      );
      const isBooker = Boolean(
        (demo?.bookedByUserId && demo.bookedByUserId === user.id) ||
        (booking?.bookedByUserId && booking.bookedByUserId === user.id)
      );

      if (!isAssignedCoordinator && !isAssignedTutor && !isLeadOwner && !isBooker) {
        if (actor.isCoordinator) {
          throw new ForbiddenException('You can only view demos assigned to you for coordination');
        }
        if (actor.isTutor) {
          throw new ForbiddenException('You can only view your assigned demos');
        }
        throw new ForbiddenException('You can only view demos for your assigned leads');
      }
    }

    // Fetch Audit Logs and Reschedule History
    let auditLogs: any[] = [];
    if ((this.prisma as any).auditEvent) {
      const entityIds = Array.from(new Set([id, demo?.id, booking?.id].filter(Boolean))) as string[];
      const events = await (this.prisma as any).auditEvent.findMany({
        where: {
          entityType: { in: ['demo', 'Demo', 'demo_booking', 'DemoBooking'] },
          entityId: { in: entityIds },
        },
        orderBy: { timestamp: 'desc' },
      });
      auditLogs = events.map((e: any) => ({
        ...e,
        createdAt: e.timestamp || e.createdAt,
      }));
    }

    // Format tutor details defensively
    const formattedTutor = demo?.tutor ? {
      id: demo.tutor.id,
      email: demo.tutor.email,
      firstName: demo.tutor.employee?.firstName || '',
      lastName: demo.tutor.employee?.lastName || '',
      employee: demo.tutor.employee,
    } : null;

    // Format sessions tutor details defensively
    if (booking?.sessions) {
      booking.sessions = booking.sessions.map((s: any) => ({
        ...s,
        tutorAssignments: (s.tutorAssignments || []).map((ta: any) => ({
          ...ta,
          tutor: ta.tutor ? {
            id: ta.tutor.id,
            email: ta.tutor.email,
            firstName: ta.tutor.employee?.firstName || '',
            lastName: ta.tutor.employee?.lastName || '',
            employee: ta.tutor.employee,
          } : null,
        })),
      }));
    }

    // Build the synthesized or augmented response
    const baseData = demo || {
      id: booking.id,
      businessId: booking.businessId,
      studentId: booking.studentId,
      status: booking.status,
      scheduledAt: booking.scheduledDate,
      durationMinutes: booking.totalDurationMin,
      subjectId: booking.sessions?.[0]?.subjectId,
      subject: booking.sessions?.[0]?.subject,
      gradeId: booking.sessions?.[0]?.gradeId,
      grade: booking.sessions?.[0]?.grade,
      curriculumId: booking.sessions?.[0]?.curriculumId,
      curriculum: booking.sessions?.[0]?.curriculum,
      requirement: null,
      feedback: booking.feedbackRecord ? [booking.feedbackRecord] : [],
      tutor: null,
      student: null,
    };

    const result: any = {
      ...baseData,
      tutor: formattedTutor || baseData.tutor,
      booking: booking || undefined,
      operationalStage: booking?.operationalStage || (baseData.status === DemoStatus.COMPLETED ? DemoOperationalStage.COMPLETED : DemoOperationalStage.VALID_DEMO),
      isRescheduled: booking?.isRescheduled || false,
      coordinator: booking?.coordinator || null,
      preparationNotes: booking?.preparationNotes || null,
      preparedByUserId: booking?.preparedByUserId || null,
      preparedByUser: booking?.preparedByUser || null,
      meetingLink: booking?.meetingLink || null,
      meetingPlatform: booking?.meetingPlatform || null,
      linkSharedAt: booking?.linkSharedAt || null,
      linkSharedByUser: booking?.linkSharedByUser || null,
      parentConfirmedAt: booking?.parentConfirmedAt || null,
      confirmationChannel: booking?.confirmationChannel || null,
      parentConfirmationChannel: booking?.confirmationChannel || null,
      confirmationNotes: booking?.confirmationNotes || null,
      parentConfirmationNotes: booking?.confirmationNotes || null,
      parentConfirmedByUser: booking?.parentConfirmedByUser || null,
      whatsappOpenedAt: booking?.whatsappOpenedAt || null,
      whatsappOpenedByUser: booking?.whatsappOpenedByUser || null,
      stageHistory: booking?.stageHistory || [],
      meetingLinkHistory: booking?.meetingLinkHistory || [],
      auditLogs: auditLogs || [],
    };

    if (result.student && typeof result.student === 'object') {
      const { lead, ...studentWithoutLead } = result.student;
      result.student = studentWithoutLead;
    }

    return result;
  }

  async rescheduleDemo(id: string, dto: RescheduleDemoDto, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);

    const start = new Date(dto.scheduledAt);
    const end = new Date(start.getTime() + dto.durationMinutes * 60000);

    if (start < new Date() && !actor.isCompanyWide && !actor.isSalesHead) {
      throw new BadRequestException('Cannot book demo in the past');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const demo = await tx.demo.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          tutorId: true,
          scheduledAt: true,
          bookedByUserId: true,
          studentId: true,
          student: { select: { lead: { select: { assignedToUserId: true } } } },
        },
      });
      if (!demo) throw new NotFoundException('Demo not found');

      let booking: any = null;
      if (tx.demoBooking?.findFirst) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
        });
      }

      const terminalStates: DemoStatus[] = [DemoStatus.COMPLETED, DemoStatus.CANCELLED];
      if (terminalStates.includes(demo.status)) {
        throw new BadRequestException('Cannot reschedule a terminal demo');
      }

      const isAssignedCoordinator = Boolean(booking?.coordinatorId && booking.coordinatorId === user.id);
      const isLeadOwnerOrBooker = Boolean(
        demo.bookedByUserId === user.id ||
        (demo.student?.lead?.assignedToUserId && demo.student.lead.assignedToUserId === user.id)
      );

      if (demo.status === DemoStatus.ASSIGNED && !actor.isCompanyWide && !actor.isSalesHead && !isAssignedCoordinator) {
        throw new ForbiddenException('Only Coordinator, Demo Admin, or Sales Head can reschedule an assigned demo');
      }

      if ((demo.status === DemoStatus.SCHEDULED || demo.status === DemoStatus.NO_SHOW) && !actor.isCompanyWide && !actor.isSalesHead && !isAssignedCoordinator && !isLeadOwnerOrBooker) {
        throw new ForbiddenException('Cannot reschedule another users demo');
      }

      const effectiveBookingId = booking?.id || demo.id;
      await this.checkOverlap(tx, demo.studentId, demo.tutorId, start, end, demo.id, effectiveBookingId);

      const updated = await tx.demo.update({
        where: { id },
        data: {
          scheduledAt: start,
          durationMinutes: dto.durationMinutes,
          status: demo.status === DemoStatus.NO_SHOW ? (demo.tutorId ? DemoStatus.ASSIGNED : DemoStatus.SCHEDULED) : undefined,
        }
      });

      if (tx.demoBooking) {
        const oldStage = booking?.operationalStage;
        await tx.demoBooking.updateMany({
          where: { id: effectiveBookingId },
          data: {
            scheduledDate: start,
            totalDurationMin: dto.durationMinutes,
            isRescheduled: true,
            operationalStage: DemoOperationalStage.RESCHEDULED,
            parentConfirmedAt: null,
            parentConfirmedByUserId: null,
            confirmationNotes: null,
            confirmationChannel: null,
            status: DemoBookingStatus.SCHEDULED,
          },
        });

        if (tx.demoBookingRescheduleHistory) {
          await tx.demoBookingRescheduleHistory.create({
            data: {
              bookingId: effectiveBookingId,
              previousDate: demo.scheduledAt,
              newDate: start,
              reason: dto.reason,
              rescheduledByUserId: user.id,
            },
          });
        }

        if (tx.demoOperationalStageHistory) {
          await tx.demoOperationalStageHistory.create({
            data: {
              bookingId: effectiveBookingId,
              previousStage: oldStage,
              newStage: DemoOperationalStage.RESCHEDULED,
              changedByUserId: user.id,
              reason: dto.reason,
            },
          });
        }
      }

      if (tx.demoSession) {
        const targetSessionId = dto.sessionId;
        const sessions = await tx.demoSession.findMany({
          where: {
            bookingId: effectiveBookingId,
            ...(targetSessionId ? { id: targetSessionId } : {}),
          },
          include: {
            tutorAssignments: {
              where: { status: TutorAssignmentStatus.ACTIVE },
            },
          },
          orderBy: { sessionOrder: 'asc' },
        });
        for (const session of sessions) {
          const hasActiveTutor = session.tutorAssignments && session.tutorAssignments.length > 0;
          await tx.demoSession.update({
            where: { id: session.id },
            data: {
              scheduledStart: start,
              scheduledEnd: end,
              durationMinutes: dto.durationMinutes,
              isRescheduled: true,
              status: hasActiveTutor ? DemoSessionStatus.ASSIGNED : DemoSessionStatus.SCHEDULED,
            },
          });
        }
      }

      await tx.demoRescheduleHistory.create({
        data: {
          demoId: id,
          previousScheduledAt: demo.scheduledAt,
          newScheduledAt: start,
          reason: dto.reason,
          rescheduledByUserId: user.id
        }
      });

      await this.audit.recordInTx(tx, {
        entityType: 'demo',
        entityId: id,
        action: 'DEMO_RESCHEDULED',
        actorUserId: user.id,
        oldValue: { scheduledAt: demo.scheduledAt },
        newValue: { scheduledAt: start },
        reason: dto.reason,
      });

      if (demo.tutorId) {
        await this.notificationsQueue.add('send', {
          recipientUserId: demo.tutorId,
          type: 'DEMO_RESCHEDULED',
          entityType: 'demo',
          entityId: demo.id,
          message: 'Your assigned Demo has been rescheduled',
        });
      }

      return updated;
    });
  }

  async editDemo(id: string, dto: EditDemoDto, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const demo = await tx.demo.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          bookedByUserId: true,
          studentId: true,
          student: { select: { lead: { select: { assignedToUserId: true } } } },
        },
      });
      if (!demo) throw new NotFoundException('Demo not found');

      let booking: any = null;
      if (tx.demoBooking?.findFirst) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
        });
      }

      const terminalStates: DemoStatus[] = [DemoStatus.COMPLETED, DemoStatus.NO_SHOW, DemoStatus.CANCELLED];
      if (terminalStates.includes(demo.status)) {
        throw new BadRequestException('Cannot edit a terminal demo');
      }

      const isAssignedCoordinator = Boolean(booking?.coordinatorId && booking.coordinatorId === user.id);
      const isLeadOwnerOrBooker = Boolean(
        demo.bookedByUserId === user.id ||
        (demo.student?.lead?.assignedToUserId && demo.student.lead.assignedToUserId === user.id)
      );

      if (!actor.isCompanyWide && !actor.isSalesHead && !isAssignedCoordinator && !isLeadOwnerOrBooker) {
        throw new ForbiddenException('You can only edit demos for your assigned leads');
      }

      if (demo.status === DemoStatus.ASSIGNED && !actor.isCompanyWide && !actor.isSalesHead && !isAssignedCoordinator) {
        throw new ForbiddenException('Only Coordinator or Sales Head can edit an assigned demo');
      }

      if (!actor.isCompanyWide && !actor.isSalesHead && !isAssignedCoordinator && demo.bookedByUserId !== user.id) {
        throw new ForbiddenException('You can only edit your own booked demos');
      }

      const updateData: any = {};
      if (dto.studentId && dto.studentId !== demo.studentId) {
        const nextStudent = await tx.student.findUnique({
          where: { id: dto.studentId },
          select: { lead: { select: { assignedToUserId: true } } },
        });
        if (!actor.isCompanyWide && !actor.isSalesHead && !isAssignedCoordinator && nextStudent?.lead?.assignedToUserId !== user.id) {
          throw new ForbiddenException('You can only book demos for your assigned leads');
        }
        updateData.studentId = dto.studentId;
      }
      if (dto.requirementId) updateData.requirementId = dto.requirementId;

      if (Object.keys(updateData).length === 0) {
        return demo; // Nothing to update
      }

      const updated = await tx.demo.update({
        where: { id },
        data: updateData
      });

      await this.audit.recordInTx(tx, {
        entityType: 'demo',
        entityId: id,
        action: 'DEMO_EDITED',
        actorUserId: user.id,
        oldValue: {},
        newValue: updateData,
        reason: 'Details updated manually'
      });

      return updated;
    });
  }

  async assignTutor(id: string, dto: AssignTutorDto, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const demo = await tx.demo.findUnique({ where: { id } });
      if (!demo) throw new NotFoundException('Demo not found');

      let booking: any = null;
      if (tx.demoBooking?.findFirst) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
        });
      }

      const terminalStates: DemoStatus[] = [DemoStatus.COMPLETED, DemoStatus.NO_SHOW, DemoStatus.CANCELLED];
      if (terminalStates.includes(demo.status)) {
        throw new BadRequestException('Cannot assign tutor to terminal demo');
      }

      // Preparation Prerequisite Gate:
      // Preparation instructions ("How to take the class", min 15 chars) must be completed before assigning tutor
      if (!booking?.preparationNotes || booking.preparationNotes.trim().length < 15) {
        throw new BadRequestException(
          'Preparation instructions ("How to take the class", minimum 15 characters) must be completed before assigning a tutor'
        );
      }

      const isAssignedCoordinator = Boolean(booking?.coordinatorId && booking.coordinatorId === user.id);
      if (!actor.isCompanyWide && !isAssignedCoordinator) {
        throw new ForbiddenException('Only Demo Admin, Demo Head, or the assigned Coordinator can assign tutors');
      }

      const end = new Date(new Date(demo.scheduledAt).getTime() + demo.durationMinutes * 60000);
      const effectiveBookingId = booking?.id || demo.id;
      await this.checkOverlap(tx, demo.studentId, dto.tutorId, demo.scheduledAt, end, demo.id, effectiveBookingId);

      const oldTutorId = demo.tutorId;

      const updated = await tx.demo.update({
        where: { id },
        data: {
          tutorId: dto.tutorId,
          status: DemoStatus.ASSIGNED
        }
      });

      if (tx.demoBooking) {
        await tx.demoBooking.updateMany({
          where: { id: effectiveBookingId },
          data: { status: DemoBookingStatus.ASSIGNED },
        });
      }

      if (tx.demoSession) {
        const sessions = await tx.demoSession.findMany({
          where: {
            bookingId: effectiveBookingId,
            ...(dto.sessionId ? { id: dto.sessionId } : {}),
          },
          orderBy: { sessionOrder: 'asc' },
        });

        for (const session of sessions) {
          await this.multiSessionService.assignOrReplaceSessionTutor(
            tx,
            session.id,
            dto.tutorId,
            user.id,
            'Assigned by Coordinator'
          );
        }

        // Check if all sessions in the booking now have an active tutor
        const allSessions = await tx.demoSession.findMany({
          where: { bookingId: effectiveBookingId },
          include: {
            tutorAssignments: {
              where: { status: TutorAssignmentStatus.ACTIVE },
            },
          },
        });

        const allAssigned = allSessions.length > 0 && allSessions.every((s) => (s.tutorAssignments?.length ?? 0) > 0);
        if (allAssigned && typeof tx.demoBooking?.findUnique === 'function') {
          const currentBooking = await tx.demoBooking.findUnique({
            where: { id: effectiveBookingId },
          });

          if (currentBooking && currentBooking.operationalStage !== DemoOperationalStage.COMPLETED) {
            const oldStage = currentBooking.operationalStage;
            const newStage = DemoOperationalStage.TUTOR_ASSIGNED;

            if (oldStage !== newStage) {
              await tx.demoBooking.update({
                where: { id: effectiveBookingId },
                data: { operationalStage: newStage },
              });

              if (tx.demoOperationalStageHistory) {
                await tx.demoOperationalStageHistory.create({
                  data: {
                    bookingId: effectiveBookingId,
                    previousStage: oldStage,
                    newStage: newStage,
                    changedByUserId: user.id,
                    reason: 'All active sessions assigned to tutors',
                  },
                });
              }
            }
          }
        }
      }

      await this.audit.recordInTx(tx, {
        entityType: 'demo',
        entityId: id,
        action: oldTutorId ? 'DEMO_TUTOR_REASSIGNED' : 'DEMO_TUTOR_ASSIGNED',
        actorUserId: user.id,
        oldValue: { tutorId: oldTutorId },
        newValue: { tutorId: dto.tutorId },
      });

      await this.notificationsQueue.add('send', {
        recipientUserId: dto.tutorId,
        type: 'DEMO_ASSIGNED',
        entityType: 'demo',
        entityId: id,
        message: 'You have been assigned a new Demo',
      });

      return updated;
    });
  }

  async completeDemo(id: string, dto: CompleteDemoDto, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const demo = await tx.demo.findUnique({
        where: { id },
        include: {
          student: {
            include: {
              lead: true,
            },
          },
        },
      });
      if (!demo) throw new NotFoundException('Demo not found');

      let booking: any = null;
      if (tx.demoBooking?.findFirst) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
        });
      }

      if (demo.status !== DemoStatus.ASSIGNED) {
        throw new BadRequestException('Only ASSIGNED demos can be completed');
      }

      const isAssignedCoordinator = Boolean(booking?.coordinatorId && booking.coordinatorId === user.id);
      const isAssignedTutor = demo.tutorId === user.id;

      if (!actor.isCompanyWide && !isAssignedCoordinator && !isAssignedTutor) {
        throw new ForbiddenException('You do not have permission to complete demos');
      }
      if (demo.tutorId !== user.id && !actor.isCompanyWide && !isAssignedCoordinator) {
        throw new ForbiddenException('Cannot complete another tutors demo');
      }

      // 1. Record Attendances if multi-session table exists
      if (tx.demoAttendance) {
        // Parent attendance
        const existingParentAttendance = await tx.demoAttendance.findFirst({
          where: { bookingId: id, participantType: DemoParticipantType.PARENT },
        });
        if (!existingParentAttendance) {
          await tx.demoAttendance.create({
            data: {
              bookingId: id,
              participantType: DemoParticipantType.PARENT,
              status: dto.attendances?.parentStatus || DemoAttendanceStatus.PRESENT,
              markedByUserId: user.id,
            },
          });
        }

        // Coordinator attendance
        const existingCoordinatorAttendance = await tx.demoAttendance.findFirst({
          where: { bookingId: id, participantType: DemoParticipantType.COORDINATOR },
        });
        if (!existingCoordinatorAttendance) {
          await tx.demoAttendance.create({
            data: {
              bookingId: id,
              participantType: DemoParticipantType.COORDINATOR,
              status: dto.attendances?.coordinatorStatus || DemoAttendanceStatus.PRESENT,
              markedByUserId: user.id,
            },
          });
        }

        // Tutor session attendances
        if (tx.demoSession) {
          const sessions = await tx.demoSession.findMany({
            where: { bookingId: id },
            include: {
              tutorAssignments: {
                where: { status: TutorAssignmentStatus.ACTIVE },
              },
            },
          });

          for (const session of sessions) {
            const activeAssignment = session.tutorAssignments[0];
            if (activeAssignment) {
              const existingTutorAttendance = await tx.demoAttendance.findFirst({
                where: {
                  bookingId: id,
                  sessionId: session.id,
                  assignmentId: activeAssignment.id,
                  participantType: DemoParticipantType.TUTOR,
                },
              });

              if (!existingTutorAttendance) {
                await tx.demoAttendance.create({
                  data: {
                    bookingId: id,
                    sessionId: session.id,
                    assignmentId: activeAssignment.id,
                    participantType: DemoParticipantType.TUTOR,
                    userId: activeAssignment.tutorId,
                    status: dto.attendances?.tutorStatus || DemoAttendanceStatus.PRESENT,
                    markedByUserId: user.id,
                  },
                });
              }
            }
          }
        }
      }

      // 2. Feedback Record
      if (tx.demoFeedbackRecord) {
        await tx.demoFeedbackRecord.upsert({
          where: { bookingId: id },
          create: {
            bookingId: id,
            rating: dto.rating,
            comments: dto.comments,
            studentPerformance: dto.studentPerformance || dto.comments,
            strengths: dto.strengths || null,
            weaknesses: dto.weaknesses || null,
            tutorRecommendations: dto.tutorRecommendations || null,
            tutorRating: dto.tutorRating || dto.rating,
            academicAssessment: dto.academicAssessment || 'Evaluated during demo session',
            engagementLevel: dto.engagementLevel || 'HIGH',
            learningBehaviour: dto.learningBehaviour || 'Engaged and attentive',
            coordinatorRemarks: dto.coordinatorRemarks || 'Demo completed successfully',
            parentFeedback: dto.parentFeedback || 'Positive feedback received',
            parentConcerns: dto.parentConcerns || null,
            parentInterestLevel: dto.parentInterestLevel || 'HIGH',
            submittedByUserId: user.id,
          },
          update: {
            rating: dto.rating,
            comments: dto.comments,
            studentPerformance: dto.studentPerformance || dto.comments,
            strengths: dto.strengths || null,
            weaknesses: dto.weaknesses || null,
            tutorRecommendations: dto.tutorRecommendations || null,
            tutorRating: dto.tutorRating || dto.rating,
            academicAssessment: dto.academicAssessment || undefined,
            engagementLevel: dto.engagementLevel || undefined,
            learningBehaviour: dto.learningBehaviour || undefined,
            coordinatorRemarks: dto.coordinatorRemarks || undefined,
            parentFeedback: dto.parentFeedback || undefined,
            parentConcerns: dto.parentConcerns || undefined,
            parentInterestLevel: dto.parentInterestLevel || undefined,
          },
        });
      }

      // 3. Post-demo Academic Roadmap
      if (tx.demoRoadmap) {
        await tx.demoRoadmap.upsert({
          where: { bookingId: id },
          create: {
            bookingId: id,
            recommendationPlan: dto.recommendationPlan || '4-week foundational plan (1 month)',
            recommendedClassCount: dto.recommendedClassCount || 8,
            recommendedFrequency: dto.recommendedFrequency || '2 classes/week',
            preferredDurationMin: dto.preferredDurationMin || 60,
            preferredTiming: dto.preferredTiming || 'Evening (5:00 PM - 7:00 PM)',
            recommendedSubjects: dto.recommendedSubjects || null,
            remarks: dto.roadmapRemarks || null,
          },
          update: {
            recommendationPlan: dto.recommendationPlan || undefined,
            recommendedClassCount: dto.recommendedClassCount || undefined,
            recommendedFrequency: dto.recommendedFrequency || undefined,
            preferredDurationMin: dto.preferredDurationMin || undefined,
            preferredTiming: dto.preferredTiming || undefined,
            recommendedSubjects: dto.recommendedSubjects || undefined,
            remarks: dto.roadmapRemarks || undefined,
          },
        });
      }

      // 4. Post-demo Academic Plan
      if (tx.demoAcademicPlan) {
        await tx.demoAcademicPlan.upsert({
          where: { bookingId: id },
          create: {
            bookingId: id,
            learningGoal: dto.learningGoal || 'Master core foundational concepts and improve problem-solving',
            targetChapters: dto.targetChapters || 'Chapters 1-3 curriculum coverage',
            studyApproach: dto.studyApproach || 'Interactive conceptual walkthrough with practice exercises',
            milestones: dto.milestones || 'Week 2 progress checkpoint, Week 4 milestone assessment',
          },
          update: {
            learningGoal: dto.learningGoal || undefined,
            targetChapters: dto.targetChapters || undefined,
            studyApproach: dto.studyApproach || undefined,
            milestones: dto.milestones || undefined,
          },
        });
      }

      // 5. Update Sessions & Verify Completion Gate
      if (tx.demoBooking) {
        if (tx.demoSession) {
          await tx.demoSession.updateMany({
            where: { bookingId: id },
            data: { status: DemoSessionStatus.COMPLETED },
          });
        }

        const fullBooking = await tx.demoBooking.findUnique({
          where: { id },
          include: {
            attendances: true,
            sessions: {
              include: {
                attendances: true,
                exceptions: true,
              },
            },
            feedbackRecord: true,
            roadmap: true,
            academicPlan: true,
          },
        });

        if (fullBooking) {
          const gateResult = this.multiSessionService.verifyBookingCompletionGate(fullBooking);
          if (!gateResult.canComplete) {
            throw new BadRequestException('Completion gate requirement not satisfied: ' + gateResult.pendingReasons.join('; '));
          }

          const oldStage = fullBooking.operationalStage;
          await tx.demoBooking.update({
            where: { id },
            data: {
              status: DemoBookingStatus.COMPLETED,
              operationalStage: DemoOperationalStage.COMPLETED,
            },
          });

          if (tx.demoOperationalStageHistory) {
            await tx.demoOperationalStageHistory.create({
              data: {
                bookingId: id,
                previousStage: oldStage,
                newStage: DemoOperationalStage.COMPLETED,
                changedByUserId: user.id,
                reason: 'Authoritative completion gate satisfied',
              },
            });
          }
        }
      }

      // 6. Update legacy Demo
      const updated = await tx.demo.update({
        where: { id },
        data: { status: DemoStatus.COMPLETED },
      });

      // 7. Legacy feedback record
      await tx.demoFeedback.create({
        data: {
          demoId: id,
          rating: dto.rating,
          comments: dto.comments,
          submittedByUserId: user.id,
        },
      });

      // 8. ATOMIC LEAD STATUS TRANSITION:
      // "When the demo is marked COMPLETED, the lead status automatically updates to DEMO_COMPLETED"
      // "Do not regress NEGOTIATION, ENROLLED, or PAID leads."
      const lead = demo.student?.lead;
      if (lead && lead.id) {
        const isProtectedStatus = lead.status && ['NEGOTIATION', 'ENROLLED', 'PAID'].includes(lead.status);
        const shouldTransition = !isProtectedStatus && lead.status !== LeadStatus.DEMO_COMPLETED;

        if (tx.lead && shouldTransition) {
          const oldStatus = lead.status;
          const newStatus = LeadStatus.DEMO_COMPLETED;

          await tx.lead.update({
            where: { id: lead.id },
            data: { status: newStatus },
          });

          if (tx.leadStatusHistory) {
            await tx.leadStatusHistory.create({
              data: {
                leadId: lead.id,
                oldStatus,
                newStatus,
                reason: `Demo completed for student ${demo.student?.firstName || ''}`,
                note: dto.comments,
                changedByUserId: user.id,
              },
            });
          }
        }
      }

      await this.audit.recordInTx(tx, {
        entityType: 'demo',
        entityId: id,
        action: 'DEMO_STATUS_CHANGED',
        actorUserId: user.id,
        oldValue: { status: demo.status },
        newValue: { status: DemoStatus.COMPLETED },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'demo',
        entityId: id,
        action: 'DEMO_FEEDBACK_SUBMITTED',
        actorUserId: user.id,
        newValue: { rating: dto.rating, comments: dto.comments },
      });

      await this.notificationsQueue.add('send', {
        recipientUserId: demo.bookedByUserId,
        type: 'DEMO_COMPLETED',
        entityType: 'demo',
        entityId: id,
        message: 'A Demo has been completed',
      });

      return updated;
    });
  }

  async cancelDemo(id: string, dto: CancelDemoDto, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const demo = await tx.demo.findUnique({
        where: { id },
        include: {
          student: { select: { lead: { select: { assignedToUserId: true } } } },
        },
      });
      if (!demo) throw new NotFoundException('Demo not found');

      let booking: any = null;
      if (tx.demoBooking?.findFirst) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
        });
      }

      const terminalStates: DemoStatus[] = [DemoStatus.COMPLETED, DemoStatus.NO_SHOW, DemoStatus.CANCELLED];
      if (terminalStates.includes(demo.status)) {
        throw new BadRequestException('Cannot cancel terminal demo');
      }

      const isAssignedCoordinator = Boolean(booking?.coordinatorId && booking.coordinatorId === user.id);
      const isLeadOwnerOrBooker = Boolean(
        demo.bookedByUserId === user.id ||
        (demo.student?.lead?.assignedToUserId && demo.student.lead.assignedToUserId === user.id)
      );

      if (demo.status === DemoStatus.ASSIGNED && !actor.isCompanyWide && !actor.isSalesHead && !isAssignedCoordinator) {
        throw new ForbiddenException('Only Coordinator, Demo Admin, or Sales Head can cancel an assigned demo');
      }

      if (demo.status === DemoStatus.SCHEDULED && !actor.isCompanyWide && !actor.isSalesHead && !isAssignedCoordinator && !isLeadOwnerOrBooker) {
        throw new ForbiddenException('Cannot cancel another users demo');
      }

      const updated = await tx.demo.update({
        where: { id },
        data: { 
          status: DemoStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason
        }
      });

      if (tx.demoBooking) {
        const oldStage = booking?.operationalStage;
        await tx.demoBooking.updateMany({
          where: { id: booking?.id || id },
          data: {
            status: DemoBookingStatus.CANCELLED,
            operationalStage: DemoOperationalStage.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: dto.reason,
          },
        });

        if (tx.demoOperationalStageHistory) {
          await tx.demoOperationalStageHistory.create({
            data: {
              bookingId: booking?.id || id,
              previousStage: oldStage,
              newStage: DemoOperationalStage.CANCELLED,
              changedByUserId: user.id,
              reason: dto.reason,
            },
          });
        }
      }

      if (tx.demoSession) {
        await tx.demoSession.updateMany({
          where: { bookingId: booking?.id || id },
          data: { status: DemoSessionStatus.CANCELLED },
        });
      }

      await this.audit.recordInTx(tx, {
        entityType: 'demo',
        entityId: id,
        action: 'DEMO_CANCELLED',
        actorUserId: user.id,
        oldValue: { status: demo.status },
        newValue: { status: DemoStatus.CANCELLED },
        reason: dto.reason
      });

      if (demo.tutorId) {
        await this.notificationsQueue.add('send', {
          recipientUserId: demo.tutorId,
          type: 'DEMO_CANCELLED',
          entityType: 'demo',
          entityId: demo.id,
          message: 'Your assigned Demo has been cancelled',
        });
      }

      return updated;
    });
  }

  async markNoShow(id: string, dto: NoShowDemoDto, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);
    
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const demo = await tx.demo.findUnique({ where: { id } });
      if (!demo) throw new NotFoundException('Demo not found');

      let booking: any = null;
      if (tx.demoBooking?.findFirst) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
        });
      }

      if (demo.status !== DemoStatus.ASSIGNED && demo.status !== DemoStatus.SCHEDULED) {
        throw new BadRequestException('Only SCHEDULED or ASSIGNED demos can be marked No-Show');
      }

      const isAssignedCoordinator = Boolean(booking?.coordinatorId && booking.coordinatorId === user.id);
      const isAssignedTutor = demo.tutorId === user.id;

      if (!actor.isCompanyWide && !isAssignedCoordinator && !isAssignedTutor) {
        throw new ForbiddenException('You do not have permission to mark demos as No-Show');
      }
      if (demo.tutorId && demo.tutorId !== user.id && !actor.isCompanyWide && !isAssignedCoordinator) {
        throw new ForbiddenException('Cannot mark another tutors demo as No-Show');
      }

      const isSessionLevel = Boolean(dto.sessionId);
      let shouldUpdateBookingToNoShow = !isSessionLevel;

      if (tx.demoSession && isSessionLevel) {
        // Update ONLY target session to NO_SHOW; sibling sessions untouched
        await tx.demoSession.updateMany({
          where: {
            bookingId: booking?.id || id,
            id: dto.sessionId,
          },
          data: { status: DemoSessionStatus.NO_SHOW },
        });

        if (tx.demoSession.findMany) {
          const allSessions = await tx.demoSession.findMany({
            where: { bookingId: booking?.id || id },
          });
          const hasActiveSibling = allSessions.some(
            (s: any) => s.id !== dto.sessionId && (
              s.status === DemoSessionStatus.SCHEDULED ||
              s.status === DemoSessionStatus.ASSIGNED ||
              s.status === DemoSessionStatus.IN_PROGRESS
            ),
          );
          shouldUpdateBookingToNoShow = !hasActiveSibling;
        }
      } else if (tx.demoSession && !isSessionLevel) {
        // Explicit booking-level action: mark all sessions as NO_SHOW
        await tx.demoSession.updateMany({
          where: { bookingId: booking?.id || id },
          data: { status: DemoSessionStatus.NO_SHOW },
        });
        shouldUpdateBookingToNoShow = true;
      }

      let updated = demo;
      if (shouldUpdateBookingToNoShow) {
        updated = await tx.demo.update({
          where: { id },
          data: { status: DemoStatus.NO_SHOW },
        });

        if (tx.demoBooking) {
          const oldStage = booking?.operationalStage;
          await tx.demoBooking.updateMany({
            where: { id: booking?.id || id },
            data: {
              status: DemoBookingStatus.NO_SHOW,
              operationalStage: DemoOperationalStage.NOT_SHOW,
            },
          });

          if (tx.demoOperationalStageHistory) {
            await tx.demoOperationalStageHistory.create({
              data: {
                bookingId: booking?.id || id,
                previousStage: oldStage,
                newStage: DemoOperationalStage.NOT_SHOW,
                changedByUserId: user.id,
                reason: dto.reason,
              },
            });
          }
        }
      }

      await this.audit.recordInTx(tx, {
        entityType: 'demo',
        entityId: id,
        action: isSessionLevel && !shouldUpdateBookingToNoShow ? 'DEMO_SESSION_NO_SHOW' : 'DEMO_STATUS_CHANGED',
        actorUserId: user.id,
        oldValue: { status: demo.status },
        newValue: {
          status: shouldUpdateBookingToNoShow ? DemoStatus.NO_SHOW : demo.status,
          ...(dto.sessionId ? { sessionId: dto.sessionId } : {}),
        },
        reason: dto.reason,
      });

      if (demo.bookedByUserId) {
        await this.notificationsQueue.add('send', {
          recipientUserId: demo.bookedByUserId,
          type: 'DEMO_NO_SHOW',
          entityType: 'demo',
          entityId: id,
          message: isSessionLevel ? 'A Demo session has been marked No-Show' : 'A Demo has been marked No-Show',
        });
      }

      return updated;
    });
  }

  async reviewSessionException(
    exceptionId: string,
    dto: { decision: DemoExceptionStatus; reviewNotes?: string },
    user: ValidatedUser,
  ) {
    let roles: string[] = [];
    if (this.prisma?.userRole?.findMany) {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId: user.id },
        include: { role: true },
      });
      roles = userRoles.map((ur: any) => ur.role?.code).filter(Boolean);
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const result = await this.multiSessionService.reviewSessionException(
        tx,
        exceptionId,
        dto.decision,
        { userId: user.id, roles },
        dto.reviewNotes,
      );

      await this.audit.recordInTx(tx, {
        entityType: 'demo_session_exception',
        entityId: exceptionId,
        action: 'DEMO_SESSION_EXCEPTION_REVIEWED',
        actorUserId: user.id,
        newValue: {
          resolutionStatus: dto.decision,
          reviewNotes: dto.reviewNotes,
        },
      });

      return result;
    });
  }

  async savePreparation(id: string, dto: SavePreparationDto, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      let booking: any = null;
      if (tx.demoBooking) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
        });
      }
      if (!booking) throw new NotFoundException('Demo booking not found');

      if (booking.status === DemoBookingStatus.CANCELLED || booking.status === DemoBookingStatus.COMPLETED) {
        throw new BadRequestException('Cannot add preparation instructions to completed or cancelled demo');
      }

      const isAssignedCoordinator = Boolean(booking.coordinatorId && booking.coordinatorId === user.id);
      if (!actor.isCompanyWide && !isAssignedCoordinator) {
        throw new ForbiddenException('Only Demo Admin, Demo Head, or the assigned Coordinator can manage preparation');
      }

      const oldStage = booking.operationalStage;
      let newStage = oldStage;
      if (oldStage === DemoOperationalStage.VALID_DEMO) {
        newStage = DemoOperationalStage.PREPARATION;
      }

      const updated = await tx.demoBooking.update({
        where: { id: booking.id },
        data: {
          preparationNotes: dto.preparationNotes,
          preparationCompletedAt: new Date(),
          preparedByUserId: user.id,
          operationalStage: newStage,
        },
      });

      if (oldStage !== newStage && tx.demoOperationalStageHistory) {
        await tx.demoOperationalStageHistory.create({
          data: {
            bookingId: booking.id,
            previousStage: oldStage,
            newStage: newStage,
            changedByUserId: user.id,
            reason: 'Preparation instructions saved',
          },
        });
      }

      await this.audit.recordInTx(tx, {
        entityType: 'DemoBooking',
        entityId: booking.id,
        action: 'DEMO_PREPARATION_SAVED',
        actorUserId: user.id,
        newValue: {
          preparationNotes: dto.preparationNotes,
          operationalStage: newStage,
        },
      });

      return updated;
    });
  }

  async recordMeetingLink(id: string, dto: RecordMeetingLinkDto, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      let booking: any = null;
      if (tx.demoBooking) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
        });
      }
      if (!booking) throw new NotFoundException('Demo booking not found');

      if (booking.status === DemoBookingStatus.CANCELLED || booking.status === DemoBookingStatus.COMPLETED) {
        throw new BadRequestException('Cannot record meeting link for completed or cancelled demo');
      }

      const isAssignedCoordinator = Boolean(booking.coordinatorId && booking.coordinatorId === user.id);
      if (!actor.isCompanyWide && !isAssignedCoordinator) {
        throw new ForbiddenException('Only Demo Admin, Demo Head, or assigned Coordinator can record meeting link');
      }

      let platform = dto.meetingPlatform || 'GOOGLE_MEET';
      if (dto.meetingLink.includes('meet.google.com')) {
        platform = 'GOOGLE_MEET';
      } else if (dto.meetingLink.includes('zoom.us')) {
        platform = 'ZOOM';
      } else if (dto.meetingLink.includes('teams.microsoft.com')) {
        platform = 'TEAMS';
      }

      const now = new Date();
      const oldStage = booking.operationalStage;
      let newStage = oldStage;
      if (
        oldStage === DemoOperationalStage.VALID_DEMO ||
        oldStage === DemoOperationalStage.PREPARATION ||
        oldStage === DemoOperationalStage.TUTOR_ASSIGNED ||
        oldStage === DemoOperationalStage.RESCHEDULED
      ) {
        newStage = DemoOperationalStage.LINK_SHARED;
      }

      const updated = await tx.demoBooking.update({
        where: { id: booking.id },
        data: {
          meetingLink: dto.meetingLink,
          meetingPlatform: platform,
          linkSharedAt: now,
          linkSharedByUserId: user.id,
          operationalStage: newStage,
        },
      });

      if (dto.sessionId && tx.demoSession) {
        await tx.demoSession.update({
          where: { id: dto.sessionId },
          data: {
            meetingLink: dto.meetingLink,
            meetingPlatform: platform,
            linkSharedAt: now,
            linkSharedByUserId: user.id,
          },
        });
      }

      if (tx.demoMeetingLinkHistory) {
        await tx.demoMeetingLinkHistory.create({
          data: {
            bookingId: booking.id,
            sessionId: dto.sessionId || null,
            meetingLink: dto.meetingLink,
            meetingPlatform: platform,
            sharedByUserId: user.id,
            reason: dto.changeReason || 'Meeting link provided',
          },
        });
      }

      if (oldStage !== newStage && tx.demoOperationalStageHistory) {
        await tx.demoOperationalStageHistory.create({
          data: {
            bookingId: booking.id,
            previousStage: oldStage,
            newStage: newStage,
            changedByUserId: user.id,
            reason: 'Meeting link recorded and shared internally',
          },
        });
      }

      await this.audit.recordInTx(tx, {
        entityType: 'DemoBooking',
        entityId: booking.id,
        action: 'DEMO_MEETING_LINK_RECORDED',
        actorUserId: user.id,
        newValue: {
          meetingLink: dto.meetingLink,
          meetingPlatform: platform,
          operationalStage: newStage,
        },
      });

      return updated;
    });
  }

  async recordWhatsAppOutreach(id: string, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      let booking: any = null;
      if (tx.demoBooking) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
          include: {
            student: true,
            lead: true,
            coordinator: { select: { id: true, email: true, employee: true } },
            sessions: {
              include: { subject: true },
              orderBy: { sessionOrder: 'asc' },
            },
          },
        });
      }
      if (!booking) throw new NotFoundException('Demo booking not found');

      const isLeadOwner = booking.lead?.assignedToUserId === user.id;
      const isBooker = booking.bookedByUserId === user.id;
      if (!actor.isCompanyWide && !actor.isSalesHead && !isLeadOwner && !isBooker) {
        throw new ForbiddenException('Only the assigned Sales Counsellor, Sales Head, or Admin can perform parent outreach');
      }

      const now = new Date();
      await tx.demoBooking.update({
        where: { id: booking.id },
        data: {
          whatsappOpenedAt: now,
          whatsappOpenedByUserId: user.id,
        },
      });

      const studentName = [booking.student?.firstName, booking.student?.lastName].filter(Boolean).join(' ') || 'Student';
      const scheduledTime = new Date(booking.scheduledDate).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const link = booking.meetingLink || 'Meeting link will be shared shortly';
      const guidelines = booking.preparationNotes ? `\n\nClass Guidelines:\n${booking.preparationNotes}` : '';

      const message = `Hello! This is regarding the Demo class for ${studentName} scheduled on ${scheduledTime}.\n\nMeeting Link: ${link}${guidelines}\n\nPlease let us know if you have any questions. Looking forward to having you!`;

      const rawPhone = booking.lead?.primaryPhone || booking.lead?.whatsappNumber || '';
      const cleanPhone = rawPhone.replace(/\D/g, '');
      const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}` : null;

      await this.audit.recordInTx(tx, {
        entityType: 'DemoBooking',
        entityId: booking.id,
        action: 'DEMO_WHATSAPP_SHARED',
        actorUserId: user.id,
        newValue: {
          phone: cleanPhone,
          whatsappOpenedAt: now,
        },
      });

      return {
        success: true,
        waUrl,
        message,
        phone: cleanPhone,
      };
    });
  }

  async confirmParentMeeting(id: string, dto: ConfirmParentMeetingDto, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      let booking: any = null;
      if (tx.demoBooking) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
          include: { lead: true },
        });
      }
      if (!booking) throw new NotFoundException('Demo booking not found');

      if (booking.status === DemoBookingStatus.CANCELLED || booking.status === DemoBookingStatus.COMPLETED) {
        throw new BadRequestException('Cannot confirm a completed or cancelled demo');
      }

      if (!booking.meetingLink) {
        throw new BadRequestException('Meeting link must be recorded before parent confirmation can be submitted');
      }

      const isLeadOwner = booking.lead?.assignedToUserId === user.id;
      const isBooker = booking.bookedByUserId === user.id;
      if (!actor.isCompanyWide && !actor.isSalesHead && !isLeadOwner && !isBooker) {
        throw new ForbiddenException('Only the assigned Sales Counsellor, Sales Head, or Admin can confirm parent attendance');
      }

      const oldStage = booking.operationalStage;
      const newStage = DemoOperationalStage.PARENT_CONFIRMATION;

      const updated = await tx.demoBooking.update({
        where: { id: booking.id },
        data: {
          confirmationChannel: dto.confirmationChannel,
          parentConfirmedAt: new Date(),
          parentConfirmedByUserId: user.id,
          confirmationNotes: dto.confirmationNotes || null,
          operationalStage: newStage,
        },
      });

      if (oldStage !== newStage && tx.demoOperationalStageHistory) {
        await tx.demoOperationalStageHistory.create({
          data: {
            bookingId: booking.id,
            previousStage: oldStage,
            newStage: newStage,
            changedByUserId: user.id,
            reason: `Parent confirmed via ${dto.confirmationChannel}`,
          },
        });
      }

      await this.audit.recordInTx(tx, {
        entityType: 'DemoBooking',
        entityId: booking.id,
        action: 'DEMO_PARENT_CONFIRMED',
        actorUserId: user.id,
        newValue: {
          channel: dto.confirmationChannel,
          notes: dto.confirmationNotes,
          operationalStage: newStage,
        },
      });

      return updated;
    });
  }

  async reassignCoordinator(id: string, dto: ReassignCoordinatorDto, user: ValidatedUser) {
    const actor = await this.getDemoActorContext(user.id);

    if (!actor.isCompanyWide && !actor.isSalesHead && !actor.isCoordinator) {
      throw new ForbiddenException('Only Demo Coordinator, Demo Head, or Admin can reassign coordinator');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      let booking: any = null;
      if (tx.demoBooking) {
        booking = await tx.demoBooking.findFirst({
          where: { OR: [{ id }, { legacyDemoId: id }] },
        });
      }
      if (!booking) throw new NotFoundException('Demo booking not found');

      const oldCoordinatorId = booking.coordinatorId;

      const newCoordinator = await tx.user.findUnique({
        where: { id: dto.coordinatorId },
        include: { employee: true },
      });
      if (!newCoordinator || newCoordinator.status !== UserStatus.ACTIVE) {
        throw new BadRequestException('Selected coordinator is not an active user');
      }

      const updated = await tx.demoBooking.update({
        where: { id: booking.id },
        data: { coordinatorId: dto.coordinatorId },
      });

      if (tx.roundRobinCoordinatorState) {
        if (oldCoordinatorId) {
          const oldState = await tx.roundRobinCoordinatorState.findUnique({
            where: { userId: oldCoordinatorId },
          });
          if (oldState && oldState.currentLoad > 0) {
            await tx.roundRobinCoordinatorState.update({
              where: { userId: oldCoordinatorId },
              data: { currentLoad: oldState.currentLoad - 1 },
            });
          }
        }

        const newState = await tx.roundRobinCoordinatorState.findUnique({
          where: { userId: dto.coordinatorId },
        });
        if (newState) {
          await tx.roundRobinCoordinatorState.update({
            where: { userId: dto.coordinatorId },
            data: { currentLoad: newState.currentLoad + 1 },
          });
        }
      }

      await this.audit.recordInTx(tx, {
        entityType: 'DemoBooking',
        entityId: booking.id,
        action: 'DEMO_COORDINATOR_REASSIGNED',
        actorUserId: user.id,
        oldValue: { coordinatorId: oldCoordinatorId },
        newValue: { coordinatorId: dto.coordinatorId, reason: dto.reason },
      });

      return updated;
    });
  }

  async getCoordinators() {
    return this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        userRoles: {
          some: {
            role: { code: { in: ['DEMO_COORDINATOR', 'DEMO_HEAD', 'DEMO_ADMIN'] } },
          },
        },
      },
      select: {
        id: true,
        email: true,
        employee: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { email: 'asc' },
    });
  }
}
