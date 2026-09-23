import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, ForbiddenException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { DemoStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import { AuditService } from '../../common/audit/audit.service';
import { ValidatedUser } from '../../common/auth/auth.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { RbacService } from '../../common/rbac/rbac.service';


import { CreateDemoDto, RescheduleDemoDto, AssignTutorDto, CompleteDemoDto,  CancelDemoDto, 
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
  ) {}

  private async checkOverlap(tx: any, studentId: string, tutorId: string | null, start: Date, end: Date, excludeDemoId?: string) {
    // In PostgreSQL, lock the student row to prevent concurrent overlapping bookings
    if (tx.$queryRaw) {
      try {
        await tx.$queryRaw`SELECT 1 FROM "students" WHERE "id" = ${studentId} FOR UPDATE`;
      } catch (e) {
        console.error('Lock error:', e);
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
    
    const start = new Date(dto.scheduledAt);
    const end = new Date(start.getTime() + dto.durationMinutes * 60000);

    if (start < new Date() && !hasHeadAccess) {
      throw new BadRequestException('Cannot book demo in the past');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // Validate Student & Requirement
      const requirement = await tx.requirement.findUnique({
        where: { id: dto.requirementId },
        include: { student: { include: { lead: true } } }
      });

      if (!requirement || requirement.studentId !== dto.studentId) {
        throw new BadRequestException('Invalid Student or Requirement combination');
      }

      // Overlap check
      await this.checkOverlap(tx, dto.studentId, null, start, end);

      const businessId = await this.idGenerator.nextIdInTx(tx, 'DMO');

      const demo = await tx.demo.create({
        data: {
          businessId,
          studentId: dto.studentId,
          requirementId: dto.requirementId,
          status: DemoStatus.SCHEDULED,
          scheduledAt: start,
          durationMinutes: dto.durationMinutes,
          subjectId: requirement.subjectId,
          curriculumId: requirement.curriculumId,
          gradeId: requirement.gradeId,
          bookedByUserId: user.id,
        }
      });

      await this.audit.recordInTx(tx, {
        entityType: 'demo',
        entityId: demo.id,
        action: 'DEMO_BOOKED',
        actorUserId: user.id,
        newValue: demo,
      });

      // Notification
      await this.notificationsQueue.add('send', {
        recipientRole: 'DEMO_COORDINATOR',
        type: 'DEMO_BOOKED',
        entityType: 'demo',
        entityId: demo.id,
        message: `New Demo Booked: ${businessId}`,
      });

      return demo;
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
      
      if (query.view === 'today') {
        where.scheduledAt = { gte: startOfToday, lt: endOfToday };
      } else if (query.view === 'upcoming') {
        where.scheduledAt = { gte: endOfToday };
      } else if (query.view === 'completed') {
        where.status = DemoStatus.COMPLETED;
      }
    }

    const demos = await this.prisma.demo.findMany({
      where,
      include: {
        student: { select: { id: true, firstName: true, currentGrade: true } },
        subject: { select: { name: true } },
        curriculum: { select: { name: true } },
        grade: { select: { name: true } },
        requirement: { select: { notes: true } },
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

    const [todayCount, upcomingCount, completedTodayCount, cancelledTodayCount, noShowTodayCount] = await Promise.all([
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
      })
    ]);

    return {
      today: todayCount,
      upcoming: upcomingCount,
      completedToday: completedTodayCount,
      cancelledToday: cancelledTodayCount,
      noShowToday: noShowTodayCount
    };
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
      const demo = await tx.demo.findUnique({ where: { id }, select: { id: true, status: true, bookedByUserId: true, studentId: true } });
      if (!demo) throw new NotFoundException('Demo not found');

      const terminalStates: DemoStatus[] = [DemoStatus.COMPLETED, DemoStatus.NO_SHOW, DemoStatus.CANCELLED];
      if (terminalStates.includes(demo.status)) {
        throw new BadRequestException('Cannot edit a terminal demo');
      }

      if (demo.status === DemoStatus.ASSIGNED && !isCoordinator && !isHead) {
        throw new ForbiddenException('Only Coordinator or Sales Head can edit an assigned demo');
      }

      if (!isCoordinator && !isHead && demo.bookedByUserId !== user.id) {
        throw new ForbiddenException('You can only edit your own booked demos');
      }

      const updateData: any = {};
      if (dto.studentId) updateData.studentId = dto.studentId;
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
      const demo = await tx.demo.findUnique({ where: { id } });
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

      const updated = await tx.demo.update({
        where: { id },
        data: { status: DemoStatus.COMPLETED }
      });

      await tx.demoFeedback.create({
        data: {
          demoId: id,
          rating: dto.rating,
          comments: dto.comments,
          submittedByUserId: user.id
        }
      });

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
