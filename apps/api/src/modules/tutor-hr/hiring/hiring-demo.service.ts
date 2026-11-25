import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';
import { RbacService } from '../../../common/rbac/rbac.service';

import { HiringCandidateService } from './hiring-candidate.service';
import {
  BookDemoDto,
  DemoAttendanceDto,
  ReassignDemoDto,
  RescheduleDemoDto,
  WorkloadQueryDto,
} from './hiring-demo.dto';
import { HiringScheduleService } from './hiring-schedule.service';
import { addWorkingMinutes, evaluationSla, HiringSchedule, SlaState } from './working-hours.util';

/** Non-blocking overlap warning window around a booking time for the same assignee. */
export const DEMO_CONFLICT_WINDOW_MINUTES = 30;
export const MAX_WORKLOAD_RANGE_DAYS = 62;
const SLA_ALLOWED_WORKING_MINUTES = 120;
/** Hiring staff roles: may be assigned demos and, until a Tutor Coordinator role exists, conduct training. */
export const ASSIGNABLE_ROLE_CODES = ['TUTOR_HEAD', 'HR_MANAGER', 'HR_EXECUTIVE'];

export type EvaluationState = SlaState | 'NOT_APPLICABLE' | 'SLA_NOT_CONFIGURED';

@Injectable()
export class HiringDemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly candidates: HiringCandidateService,
    private readonly schedules: HiringScheduleService,
    private readonly config: ConfigService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async canReadAll(userId: string) {
    return this.rbac.hasPermissions(userId, ['tutor_hiring.read-all']);
  }

  private async assertAssignable(userId: string) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', userRoles: { some: { role: { code: { in: ASSIGNABLE_ROLE_CODES } } } } },
      select: { id: true },
    });
    if (!u) throw new BadRequestException('Selected staff member cannot be assigned demos');
  }

  /** Derived evaluation state; never stored, so it can't go stale. */
  async slaFor(
    b: { status: string; completedAt: Date | null; evaluationDueAt: Date | null; evaluation?: { evaluatedAt: Date } | null },
    now: Date,
    schedule?: HiringSchedule | null,
  ): Promise<{ state: EvaluationState; dueAt: Date | null; evaluatedLate: boolean | null }> {
    if (b.status !== 'ATTENDED' || !b.completedAt) return { state: 'NOT_APPLICABLE', dueAt: null, evaluatedLate: null };
    if (b.evaluation) {
      return { state: 'COMPLETED', dueAt: b.evaluationDueAt, evaluatedLate: b.evaluationDueAt ? b.evaluation.evaluatedAt > b.evaluationDueAt : null };
    }
    let due = b.evaluationDueAt;
    if (!due) {
      const sch = schedule === undefined ? await this.schedules.getEffective(b.completedAt) : schedule;
      if (!sch) return { state: 'SLA_NOT_CONFIGURED', dueAt: null, evaluatedLate: null };
      due = evaluationSla(b.completedAt, null, now, sch, SLA_ALLOWED_WORKING_MINUTES).deadline;
    }
    return { state: now > due ? 'OVERDUE' : 'PENDING', dueAt: due, evaluatedLate: null };
  }

  private bookingInclude = {
    tutorLead: { select: { id: true, businessId: true, firstName: true, lastName: true, phone: true } },
    bookedBy: { select: { id: true, email: true } },
    assignedTo: { select: { id: true, email: true } },
    assignmentHistory: { orderBy: { changedAt: 'asc' as const }, include: { from: { select: { id: true, email: true } }, to: { select: { id: true, email: true } }, changedBy: { select: { id: true, email: true } } } },
    evaluation: true,
  } satisfies Prisma.TutorDemoBookingInclude;

  private async decorate<T extends { status: string; completedAt: Date | null; evaluationDueAt: Date | null; evaluation?: { evaluatedAt: Date } | null }>(rows: T[]) {
    const now = new Date();
    const out = [];
    for (const r of rows) out.push({ ...r, evaluationSla: await this.slaFor(r, now) });
    return out;
  }

  private async findNearby(assigneeId: string, at: Date, excludeId?: string) {
    const w = DEMO_CONFLICT_WINDOW_MINUTES * 60_000;
    return this.prisma.tutorDemoBooking.findMany({
      where: {
        assignedToUserId: assigneeId,
        status: 'BOOKED',
        id: excludeId ? { not: excludeId } : undefined,
        scheduledAt: { gte: new Date(at.getTime() - w), lte: new Date(at.getTime() + w) },
      },
      select: { id: true, scheduledAt: true, tutorLead: { select: { businessId: true } } },
    });
  }

  // ── Booking ───────────────────────────────────────────────────────────────

  async book(leadId: string, dto: BookDemoDto, actorUserId: string) {
    const lead = await this.prisma.tutorLead.findFirst({ where: { id: leadId, deletedAt: null } });
    if (!lead) throw new NotFoundException('Candidate not found');
    await this.candidates.assertCanModifyLead(lead, actorUserId);
    if (lead.hiringStage !== 'LIVE_DEMO_INTERVIEW') {
      throw new BadRequestException('Demos can only be booked at the Live Demo & Interview stage');
    }
    if (lead.leadStatus !== 'PROCESSING') {
      throw new BadRequestException('Set the lead status back to Processing before booking a demo');
    }
    if (lead.decision === 'REJECTED' || lead.decision === 'NOT_INTERESTED') {
      throw new BadRequestException(`Cannot book a demo for a candidate marked ${lead.decision}`);
    }
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() < Date.now() - 5 * 60_000) throw new BadRequestException('Demo cannot be booked in the past');
    await this.assertAssignable(dto.assignedToUserId);

    const conflicts = await this.findNearby(dto.assignedToUserId, scheduledAt);
    const booking = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const active = await tx.tutorDemoBooking.findFirst({ where: { tutorLeadId: leadId, status: 'BOOKED' } });
      if (active) throw new ConflictException('This candidate already has an active demo booking; reschedule it instead');
      const now = new Date();
      const b = await tx.tutorDemoBooking.create({
        data: { tutorLeadId: leadId, scheduledAt, bookedByUserId: actorUserId, bookedAt: now, assignedToUserId: dto.assignedToUserId, assignedAt: now },
      });
      await tx.tutorDemoAssignmentHistory.create({
        data: { bookingId: b.id, toUserId: dto.assignedToUserId, changedByUserId: actorUserId, reason: 'Initial assignment' },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: leadId, action: 'TUTOR_DEMO_BOOKED', actorUserId,
        newValue: { bookingId: b.id, scheduledAt: scheduledAt.toISOString(), assignedToUserId: dto.assignedToUserId },
      });
      return b;
    });
    return { booking, conflicts };
  }

  async reschedule(id: string, dto: RescheduleDemoDto, actorUserId: string) {
    const old = await this.prisma.tutorDemoBooking.findUnique({ where: { id }, include: { tutorLead: true } });
    if (!old) throw new NotFoundException('Booking not found');
    await this.candidates.assertCanModifyLead(old.tutorLead, actorUserId);
    if (old.status !== 'BOOKED') throw new BadRequestException('Only an active booking can be rescheduled');
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() < Date.now() - 5 * 60_000) throw new BadRequestException('Demo cannot be rescheduled to the past');
    const conflicts = await this.findNearby(old.assignedToUserId, scheduledAt, old.id);

    const booking = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const res = await tx.tutorDemoBooking.updateMany({
        where: { id, status: 'BOOKED' },
        data: { status: 'RESCHEDULE', rescheduleReason: dto.reason },
      });
      if (res.count !== 1) throw new ConflictException('Booking changed; reload and retry');
      const now = new Date();
      // The old row is preserved as history; a new booking carries the new time.
      const nb = await tx.tutorDemoBooking.create({
        data: {
          tutorLeadId: old.tutorLeadId, scheduledAt, rescheduledFromId: old.id,
          bookedByUserId: actorUserId, bookedAt: now, assignedToUserId: old.assignedToUserId, assignedAt: now,
        },
      });
      await tx.tutorDemoAssignmentHistory.create({
        data: { bookingId: nb.id, fromUserId: null, toUserId: old.assignedToUserId, changedByUserId: actorUserId, reason: 'Carried over on reschedule' },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: old.tutorLeadId, action: 'TUTOR_DEMO_RESCHEDULED', actorUserId, reason: dto.reason,
        oldValue: { bookingId: old.id, scheduledAt: old.scheduledAt.toISOString() },
        newValue: { bookingId: nb.id, scheduledAt: scheduledAt.toISOString() },
      });
      return nb;
    });
    return { booking, conflicts };
  }

  async reassign(id: string, dto: ReassignDemoDto, actorUserId: string) {
    const b = await this.prisma.tutorDemoBooking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Booking not found');
    // The person who booked the demo may reassign it, as may anyone holding tutor_hiring.reassign (Requirements
    // Final, section 3.7: "including the person who booked the demo").
    if (
      b.bookedByUserId !== actorUserId &&
      !(await this.rbac.hasPermissions(actorUserId, ['tutor_hiring.reassign']))
    ) {
      throw new ForbiddenException('Only the person who booked this demo, or the Head of Tutor Management or HR Head, can reassign it');
    }
    if (b.status !== 'BOOKED') throw new BadRequestException('Only an active booking can be reassigned');
    if (b.assignedToUserId === dto.toUserId) throw new BadRequestException('Demo is already assigned to this staff member');
    await this.assertAssignable(dto.toUserId);
    const conflicts = await this.findNearby(dto.toUserId, b.scheduledAt, b.id);

    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const now = new Date();
      const res = await tx.tutorDemoBooking.updateMany({
        where: { id, status: 'BOOKED', assignedToUserId: b.assignedToUserId },
        data: { assignedToUserId: dto.toUserId, assignedAt: now },
      });
      if (res.count !== 1) throw new ConflictException('Booking changed; reload and retry');
      await tx.tutorDemoAssignmentHistory.create({
        data: { bookingId: id, fromUserId: b.assignedToUserId, toUserId: dto.toUserId, reason: dto.reason, changedByUserId: actorUserId, changedAt: now },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: b.tutorLeadId, action: 'TUTOR_DEMO_REASSIGNED', actorUserId, reason: dto.reason,
        oldValue: { assignedToUserId: b.assignedToUserId }, newValue: { assignedToUserId: dto.toUserId },
      });
    });
    return { id, assignedToUserId: dto.toUserId, conflicts };
  }

  /**
   * Marks the demo Attended / Not Attended. Only the Assigned To (the conductor) may record it;
   * the Head of Tutor Management may override. Attended starts the evaluation SLA clock, and
   * the booking can no longer be reassigned, so the conductor stays fixed.
   */
  async recordAttendance(id: string, dto: DemoAttendanceDto, actorUserId: string) {
    const b = await this.prisma.tutorDemoBooking.findUnique({ where: { id }, include: { tutorLead: true } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'BOOKED') throw new BadRequestException('Attendance can only be recorded on an active booking');
    const override = b.assignedToUserId !== actorUserId;
    if (override && !(await this.candidates.canOverrideConductor(actorUserId))) {
      throw new ForbiddenException('Only the staff member assigned to conduct the demo can record attendance');
    }

    if (dto.status === 'NOT_ATTENDED') {
      const res = await this.prisma.tutorDemoBooking.updateMany({ where: { id, status: 'BOOKED' }, data: { status: 'NOT_ATTENDED' } });
      if (res.count !== 1) throw new ConflictException('Booking changed; reload and retry');
      await this.audit.record({ entityType: 'TutorLead', entityId: b.tutorLeadId, action: 'TUTOR_DEMO_NOT_ATTENDED', actorUserId, metadata: { bookingId: id, override } });
      return { id, status: 'NOT_ATTENDED' as const };
    }

    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    if (completedAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('Completion time cannot be in the future');
    if (completedAt < b.scheduledAt) throw new BadRequestException('Completion cannot be before the scheduled time');

    const schedule = await this.schedules.getEffective(completedAt);
    const evaluationDueAt = schedule ? addWorkingMinutes(completedAt, SLA_ALLOWED_WORKING_MINUTES, schedule) : null;

    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const res = await tx.tutorDemoBooking.updateMany({
        where: { id, status: 'BOOKED' },
        data: { status: 'ATTENDED', completedAt, evaluationDueAt },
      });
      if (res.count !== 1) throw new ConflictException('Booking changed; reload and retry');
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: b.tutorLeadId, action: 'TUTOR_DEMO_ATTENDED', actorUserId,
        newValue: { bookingId: id, conductorUserId: b.assignedToUserId, completedAt: completedAt.toISOString(), evaluationDueAt: evaluationDueAt?.toISOString() ?? null },
        metadata: { override },
      });
    });
    return { id, status: 'ATTENDED' as const, conductorUserId: b.assignedToUserId, completedAt, evaluationDueAt, slaConfigured: !!schedule };
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async listForCandidate(leadId: string) {
    const lead = await this.prisma.tutorLead.findFirst({ where: { id: leadId, deletedAt: null }, select: { id: true } });
    if (!lead) throw new NotFoundException('Candidate not found');
    const rows = await this.prisma.tutorDemoBooking.findMany({
      where: { tutorLeadId: leadId }, orderBy: { scheduledAt: 'desc' }, include: this.bookingInclude,
    });
    return this.decorate(rows);
  }

  /** Individuals see their own workload; read-all holders (Tutor Head) see everyone, optionally filtered. */
  async workload(q: WorkloadQueryDto, userId: string) {
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (to < from) throw new BadRequestException('"to" must not be before "from"');
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_WORKLOAD_RANGE_DAYS) {
      throw new BadRequestException(`Range cannot exceed ${MAX_WORKLOAD_RANGE_DAYS} days`);
    }
    const all = await this.canReadAll(userId);
    if (q.assigneeId && q.assigneeId !== userId && !all) throw new ForbiddenException('You can only view your own workload');
    const assigneeId = all ? q.assigneeId : userId;

    // Calendar days are interpreted in the hiring schedule timezone, else the business timezone.
    const sch = await this.schedules.getEffective();
    const tz = sch?.timezone ?? this.config.get<string>('crm.businessTimezone') ?? 'Asia/Kolkata';
    const nextDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1)).toISOString().slice(0, 10);
    const start = fromZonedTime(`${q.from.slice(0, 10)}T00:00:00`, tz);
    const end = fromZonedTime(`${nextDay}T00:00:00`, tz);

    const rows = await this.prisma.tutorDemoBooking.findMany({
      where: {
        scheduledAt: { gte: start, lt: end },
        ...(assigneeId ? { assignedToUserId: assigneeId } : {}),
        ...(q.status ? { status: q.status as 'BOOKED' } : {}),
      },
      orderBy: { scheduledAt: 'asc' },
      include: this.bookingInclude,
    });
    const data = await this.decorate(rows);
    const byAssignee = new Map<string, { userId: string; email: string; total: number; booked: number; attended: number; overdueEvaluations: number }>();
    for (const r of data) {
      const e = byAssignee.get(r.assignedToUserId) ?? { userId: r.assignedToUserId, email: r.assignedTo.email, total: 0, booked: 0, attended: 0, overdueEvaluations: 0 };
      e.total++;
      if (r.status === 'BOOKED') e.booked++;
      if (r.status === 'ATTENDED') e.attended++;
      if (r.evaluationSla.state === 'OVERDUE') e.overdueEvaluations++;
      byAssignee.set(r.assignedToUserId, e);
    }
    return { data, summary: [...byAssignee.values()], scope: all ? 'DEPARTMENT' : 'OWN' };
  }

  /** Attended demos awaiting evaluation, with Pending/Overdue state. */
  async pendingEvaluations(userId: string) {
    const all = await this.canReadAll(userId);
    const rows = await this.prisma.tutorDemoBooking.findMany({
      where: { status: 'ATTENDED', evaluation: null, ...(all ? {} : { assignedToUserId: userId }) },
      orderBy: { completedAt: 'asc' },
      include: this.bookingInclude,
      take: 200,
    });
    return this.decorate(rows);
  }

  async assignableStaff() {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', userRoles: { some: { role: { code: { in: ASSIGNABLE_ROLE_CODES } } } } },
      select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } }, userRoles: { select: { role: { select: { code: true } } } } },
      orderBy: { email: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.employee ? `${u.employee.firstName} ${u.employee.lastName}`.trim() : u.email,
      roles: u.userRoles.map((r) => r.role.code).filter((c) => ASSIGNABLE_ROLE_CODES.includes(c)),
    }));
  }
}
