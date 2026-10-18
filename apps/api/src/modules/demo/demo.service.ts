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

import { CreateDemoDto, RescheduleDemoDto, AssignTutorDto, CompleteDemoDto, CancelDemoDto, 
  NoShowDemoDto,
  EditDemoDto
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

    if (tx.demoSession) {
      const existingSessions = await tx.demoSession.findMany({
        where: {
          booking: {
            studentId,
            id: excludeBookingId ? { not: excludeBookingId } : undefined,
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

      // 3. Status eligibility check
      if (lead.status && ['LOST', 'NOT_INTERESTED', 'JUNK'].includes(lead.status)) {
        throw new BadRequestException(
          `Cannot book demo for a lead with status ${lead.status}. Please reopen the lead first.`,
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
            scheduledDate: orderedSessions[0].scheduledStart,
            totalDurationMin: totalDurationMinutes,
          },
        });
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
      // "Do not regress NEGOTIATION, ENROLLED, or PAID leads."
      const isProtectedStatus = lead.status && ['NEGOTIATION', 'ENROLLED', 'PAID'].includes(lead.status);
      const shouldTransition = !isProtectedStatus && lead.status !== 'DEMO_BOOKED';

      if (tx.lead && shouldTransition && lead.id) {
        const oldStatus = lead.status;
        const newStatus = 'DEMO_BOOKED';

        await tx.lead.update({
          where: { id: lead.id },
          data: { status: newStatus as any },
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

  async getDemos(user: ValidatedUser, query?: { view?: string, status?: string }) {
    const isTutor = await this.rbac.hasPermissions(user.id, ['demo.read_assigned']);
    const isCoordinator = await this.rbac.hasPermissions(user.id, ['demo.manage_all']);
    const isHead = await this.rbac.hasPermissions(user.id, ['demo.manage_team']);

    const where: any = {};
    
    if (isCoordinator || isHead) {
      // can see all or team
    } else if (isTutor) {
      where.tutorId = user.id;
    } else {
      // Standard Sales access is tied to Lead ownership, not who booked it
      where.student = {
        lead: {
          assignedToUserId: user.id
        }
      };
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.view) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(startOfToday.getTime() + 86400000);
      
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
        student: { select: { id: true, firstName: true, lastName: true, currentGrade: true } },
        subject: { select: { id: true, name: true } },
        curriculum: { select: { id: true, name: true } },
        grade: { select: { id: true, name: true } },
        requirement: { select: { id: true, notes: true, subjectId: true, gradeId: true, curriculumId: true } },
        tutor: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        bookedByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
      }
    });

    return demos;
  }

  async getSummary(user: ValidatedUser) {
    const isTutor = await this.rbac.hasPermissions(user.id, ['demo.read_assigned']);
    const isCoordinator = await this.rbac.hasPermissions(user.id, ['demo.manage_all']);
    const isHead = await this.rbac.hasPermissions(user.id, ['demo.manage_team']);

    const where: any = {};
    if (isCoordinator || isHead) {
      // see all
    } else if (isTutor) {
      where.tutorId = user.id;
    } else {
      // Standard Sales access is tied to Lead ownership, not who booked it
      where.student = {
        lead: {
          assignedToUserId: user.id
        }
      };
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86400000);

    const [todayCount, upcomingCount, completedTodayCount, cancelledTodayCount, noShowTodayCount, pendingCount] = await Promise.all([
      this.prisma.demo.count({
        where: { ...where, scheduledAt: { gte: startOfToday, lt: endOfToday } }
      }),
      this.prisma.demo.count({
        where: { ...where, scheduledAt: { gte: endOfToday } }
      }),
      this.prisma.demo.count({
        where: { ...where, status: DemoStatus.COMPLETED, scheduledAt: { gte: startOfToday, lt: endOfToday } }
      }),
      this.prisma.demo.count({
        where: { ...where, status: DemoStatus.CANCELLED, scheduledAt: { gte: startOfToday, lt: endOfToday } }
      }),
      this.prisma.demo.count({
        where: { ...where, status: DemoStatus.NO_SHOW, scheduledAt: { gte: startOfToday, lt: endOfToday } }
      }),
      this.prisma.demo.count({
        where: { ...where, status: DemoStatus.SCHEDULED, tutorId: null }
      })
    ]);

    return {
      today: todayCount,
      upcoming: upcomingCount,
      completedToday: completedTodayCount,
      cancelledToday: cancelledTodayCount,
      noShowToday: noShowTodayCount,
      pending: pendingCount
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
    const demo = await this.prisma.demo.findUnique({
      where: { id },
      include: {
        student: { 
          select: { 
            id: true, firstName: true, lastName: true, currentGrade: true, cityLocation: true,
            lead: { select: { assignedToUserId: true } }
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

    if (!demo) throw new NotFoundException('Demo not found');

    const isTutor = await this.rbac.hasPermissions(user.id, ['demo.read_assigned']);
    const isCoordinator = await this.rbac.hasPermissions(user.id, ['demo.manage_all']);
    const isHead = await this.rbac.hasPermissions(user.id, ['demo.manage_team']);

    if (isTutor && demo.tutorId !== user.id) {
      throw new ForbiddenException('You can only view your assigned demos');
    }

    if (!isCoordinator && !isHead && !isTutor) {
      if (demo.student.lead.assignedToUserId !== user.id) {
        throw new ForbiddenException('You can only view demos for your assigned leads');
      }
    }

    // Attach multi-session booking data if available
    if (this.prisma.demoBooking) {
      const booking = await this.prisma.demoBooking.findUnique({
        where: { id },
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
        },
      });
      if (booking) {
        (demo as any).booking = booking;
      }
    }

    // Don't send lead info to the frontend to maintain strict boundary
    const { lead, ...studentWithoutLead } = demo.student as any;
    demo.student = studentWithoutLead;

    return demo;
  }

  async rescheduleDemo(id: string, dto: RescheduleDemoDto, user: ValidatedUser) {
    const isCoordinator = await this.rbac.hasPermissions(user.id, ['demo.manage_all']);
    const isHead = await this.rbac.hasPermissions(user.id, ['demo.manage_team']);

    const start = new Date(dto.scheduledAt);
    const end = new Date(start.getTime() + dto.durationMinutes * 60000);

    if (start < new Date() && !isHead) {
      throw new BadRequestException('Cannot book demo in the past');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const demo = await tx.demo.findUnique({ where: { id }, select: { id: true, status: true, tutorId: true, scheduledAt: true, bookedByUserId: true, studentId: true } });
      if (!demo) throw new NotFoundException('Demo not found');

      const terminalStates: DemoStatus[] = [DemoStatus.COMPLETED, DemoStatus.NO_SHOW, DemoStatus.CANCELLED];
      if (terminalStates.includes(demo.status)) {
        throw new BadRequestException('Cannot reschedule a terminal demo');
      }

      if (demo.status === DemoStatus.ASSIGNED && !isCoordinator && !isHead) {
        throw new ForbiddenException('Only Coordinator or Sales Head can reschedule an assigned demo');
      }

      if (demo.status === DemoStatus.SCHEDULED && demo.bookedByUserId !== user.id && !isCoordinator && !isHead) {
        throw new ForbiddenException('Cannot reschedule another users demo');
      }

      await this.checkOverlap(tx, demo.studentId, demo.tutorId, start, end, demo.id);

      const updated = await tx.demo.update({
        where: { id },
        data: {
          scheduledAt: start,
          durationMinutes: dto.durationMinutes
        }
      });

      if (tx.demoBooking) {
        await tx.demoBooking.updateMany({
          where: { id },
          data: {
            scheduledDate: start,
            totalDurationMin: dto.durationMinutes,
          },
        });

        if (tx.demoBookingRescheduleHistory) {
          await tx.demoBookingRescheduleHistory.create({
            data: {
              bookingId: id,
              previousDate: demo.scheduledAt,
              newDate: start,
              reason: dto.reason,
              rescheduledByUserId: user.id,
            },
          });
        }
      }

      if (tx.demoSession) {
        const sessions = await tx.demoSession.findMany({
          where: { bookingId: id },
          orderBy: { sessionOrder: 'asc' },
        });
        if (sessions.length > 0) {
          await tx.demoSession.update({
            where: { id: sessions[0].id },
            data: {
              scheduledStart: start,
              scheduledEnd: end,
              durationMinutes: dto.durationMinutes,
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
    const isCoordinator = await this.rbac.hasPermissions(user.id, ['demo.manage_all']);
    const isHead = await this.rbac.hasPermissions(user.id, ['demo.manage_team']);

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

      const terminalStates: DemoStatus[] = [DemoStatus.COMPLETED, DemoStatus.NO_SHOW, DemoStatus.CANCELLED];
      if (terminalStates.includes(demo.status)) {
        throw new BadRequestException('Cannot edit a terminal demo');
      }

      if (!isCoordinator && !isHead && demo.student.lead.assignedToUserId !== user.id) {
        throw new ForbiddenException('You can only edit demos for your assigned leads');
      }

      if (demo.status === DemoStatus.ASSIGNED && !isCoordinator && !isHead) {
        throw new ForbiddenException('Only Coordinator or Sales Head can edit an assigned demo');
      }

      if (!isCoordinator && !isHead && demo.bookedByUserId !== user.id) {
        throw new ForbiddenException('You can only edit your own booked demos');
      }

      const updateData: any = {};
      if (dto.studentId && dto.studentId !== demo.studentId) {
        const nextStudent = await tx.student.findUnique({
          where: { id: dto.studentId },
          select: { lead: { select: { assignedToUserId: true } } },
        });
        if (!isCoordinator && !isHead && nextStudent?.lead.assignedToUserId !== user.id) {
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
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const demo = await tx.demo.findUnique({ where: { id } });
      if (!demo) throw new NotFoundException('Demo not found');

      const terminalStates: DemoStatus[] = [DemoStatus.COMPLETED, DemoStatus.NO_SHOW, DemoStatus.CANCELLED];
      if (terminalStates.includes(demo.status)) {
        throw new BadRequestException('Cannot assign tutor to terminal demo');
      }

      const end = new Date(new Date(demo.scheduledAt).getTime() + demo.durationMinutes * 60000);
      await this.checkOverlap(tx, demo.studentId, dto.tutorId, demo.scheduledAt, end, demo.id);

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
          where: { id },
          data: { status: DemoBookingStatus.ASSIGNED },
        });
      }

      if (tx.demoSession) {
        const sessions = await tx.demoSession.findMany({
          where: { bookingId: id },
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
    const isTutor = await this.rbac.hasPermissions(user.id, ['demo.complete']);
    const isCoordinator = await this.rbac.hasPermissions(user.id, ['demo.manage_all']);

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

      if (demo.status !== DemoStatus.ASSIGNED) {
        throw new BadRequestException('Only ASSIGNED demos can be completed');
      }

      if (!isTutor && !isCoordinator) {
        throw new ForbiddenException('You do not have permission to complete demos');
      }
      if (demo.tutorId !== user.id && !isCoordinator) {
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

          await tx.demoBooking.update({
            where: { id },
            data: { status: DemoBookingStatus.COMPLETED },
          });
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
    const isCoordinator = await this.rbac.hasPermissions(user.id, ['demo.manage_all']);
    const isHead = await this.rbac.hasPermissions(user.id, ['demo.manage_team']);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const demo = await tx.demo.findUnique({ where: { id } });
      if (!demo) throw new NotFoundException('Demo not found');

      const terminalStates: DemoStatus[] = [DemoStatus.COMPLETED, DemoStatus.NO_SHOW, DemoStatus.CANCELLED];
      if (terminalStates.includes(demo.status)) {
        throw new BadRequestException('Cannot cancel terminal demo');
      }

      if (demo.status === DemoStatus.ASSIGNED && !isCoordinator && !isHead) {
        throw new ForbiddenException('Only Coordinator or Sales Head can cancel an assigned demo');
      }

      if (demo.status === DemoStatus.SCHEDULED && demo.bookedByUserId !== user.id && !isCoordinator && !isHead) {
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
        await tx.demoBooking.updateMany({
          where: { id },
          data: {
            status: DemoBookingStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: dto.reason,
          },
        });
      }

      if (tx.demoSession) {
        await tx.demoSession.updateMany({
          where: { bookingId: id },
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
    const isTutor = await this.rbac.hasPermissions(user.id, ['demo.mark_exceptions']); 
    
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const demo = await tx.demo.findUnique({ where: { id } });
      if (!demo) throw new NotFoundException('Demo not found');

      if (demo.status !== DemoStatus.ASSIGNED) {
        throw new BadRequestException('Only ASSIGNED demos can be marked No-Show');
      }

      const isCoordinator = await this.rbac.hasPermissions(user.id, ['demo.manage_all']);
      if (!isTutor && !isCoordinator) {
        throw new ForbiddenException('You do not have permission to mark demos as No-Show');
      }
      if (demo.tutorId !== user.id && !isCoordinator) {
        throw new ForbiddenException('Cannot mark another tutors demo as No-Show');
      }

      const updated = await tx.demo.update({
        where: { id },
        data: { status: DemoStatus.NO_SHOW }
      });

      if (tx.demoBooking) {
        await tx.demoBooking.updateMany({
          where: { id },
          data: { status: DemoBookingStatus.NO_SHOW },
        });
      }

      if (tx.demoSession) {
        await tx.demoSession.updateMany({
          where: { bookingId: id },
          data: { status: DemoSessionStatus.CANCELLED },
        });
      }

      await this.audit.recordInTx(tx, {
        entityType: 'demo',
        entityId: id,
        action: 'DEMO_STATUS_CHANGED',
        actorUserId: user.id,
        oldValue: { status: demo.status },
        newValue: { status: DemoStatus.NO_SHOW },
        reason: dto.reason
      });

      await this.notificationsQueue.add('send', {
        recipientUserId: demo.bookedByUserId,
        type: 'DEMO_NO_SHOW',
        entityType: 'demo',
        entityId: id,
        message: 'A Demo has been marked No-Show',
      });

      return updated;
    });
  }
}
