import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { CapacitySummary, roundHours, studentMonthlyHours, summarizeCapacity, wouldExceed } from './mentor-capacity';

/** A Mentor's students count against capacity from allocation until the student is cancelled (a cancelled activation has no Mentor). */
const NOT_COUNTED = ['CANCELLED'] as const;

export interface ContributingStudent {
  activationId: string;
  studentId: string;
  studentBusinessId: string | null;
  studentName: string;
  status: string;
  monthlyHours: number;
}

export interface MentorCapacity extends CapacitySummary {
  mentorUserId: string;
  limitIsDefault: boolean;
  students: ContributingStudent[];
}

export interface CapacityCheck {
  studentHours: number;
  allocatedBefore: number;
  allocatedAfter: number;
  limitHours: number;
  overCapacity: boolean;
}

@Injectable()
export class MentoringCapacityService {
  constructor(private readonly prisma: PrismaService) {}

  private async settings(client: Pick<PrismaTxClient, 'mentoringSetting'>) {
    const row = await client.mentoringSetting.findUnique({ where: { id: 'default' } });
    return {
      defaultLimit: row?.defaultMonthlyHourLimit === null || row?.defaultMonthlyHourLimit === undefined ? 160 : Number(row.defaultMonthlyHourLimit),
      warningPercent: row?.capacityWarningPercent ?? 80,
    };
  }

  /**
   * The students each Mentor currently holds and the hours they cost. Always derived from the live assignments and requirements, so it
   * is correct after any assignment, transfer, removal, hours change or limit change without a stored counter that could drift.
   */
  async capacities(client: PrismaTxClient | PrismaService, mentorUserIds: string[]): Promise<Map<string, MentorCapacity>> {
    const result = new Map<string, MentorCapacity>();
    if (mentorUserIds.length === 0) return result;
    const [settings, profiles, activations] = await Promise.all([
      this.settings(client),
      client.mentoringStaffProfile.findMany({ where: { userId: { in: mentorUserIds } }, select: { userId: true, monthlyHourLimit: true } }),
      client.mentoringActivation.findMany({
        where: { currentMentorUserId: { in: mentorUserIds }, status: { notIn: [...NOT_COUNTED] } },
        select: { id: true, studentId: true, status: true, currentMentorUserId: true, student: { select: { businessId: true, firstName: true, lastName: true } } },
      }),
    ]);
    const requirements = activations.length
      ? await client.requirement.findMany({ where: { studentId: { in: activations.map((a) => a.studentId) } }, select: { studentId: true, monthlyHours: true } })
      : [];
    const byStudent = new Map<string, Array<{ monthlyHours: unknown }>>();
    for (const r of requirements) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
    const limits = new Map(profiles.map((p) => [p.userId, p.monthlyHourLimit === null || p.monthlyHourLimit === undefined ? null : Number(p.monthlyHourLimit)]));

    for (const id of mentorUserIds) {
      const own = activations.filter((a) => a.currentMentorUserId === id);
      const students: ContributingStudent[] = own.map((a) => ({
        activationId: a.id,
        studentId: a.studentId,
        studentBusinessId: a.student?.businessId ?? null,
        studentName: [a.student?.firstName, a.student?.lastName].filter(Boolean).join(' '),
        status: a.status,
        monthlyHours: studentMonthlyHours(byStudent.get(a.studentId) ?? []),
      }));
      const configured = limits.get(id) ?? null;
      const limit = configured ?? settings.defaultLimit;
      const allocated = students.reduce((sum, s) => sum + s.monthlyHours, 0);
      result.set(id, {
        mentorUserId: id,
        limitIsDefault: configured === null,
        students: students.sort((a, b) => b.monthlyHours - a.monthlyHours),
        ...summarizeCapacity(limit, allocated, settings.warningPercent),
      });
    }
    return result;
  }

  /** The student's full monthly hours (all subjects), the amount charged to their Mentor. */
  async studentHours(client: PrismaTxClient | PrismaService, studentId: string): Promise<number> {
    const requirements = await client.requirement.findMany({ where: { studentId }, select: { monthlyHours: true } });
    return studentMonthlyHours(requirements);
  }

  async capacityOf(client: PrismaTxClient | PrismaService, mentorUserId: string): Promise<MentorCapacity> {
    return (await this.capacities(client, [mentorUserId])).get(mentorUserId) as MentorCapacity;
  }

  /**
   * The capacity gate for every way of giving a student to a Mentor. Not over the limit: returns the numbers. Over the limit: refuses
   * unless the caller (always the Mentoring Head, by the route permission) gives a reason, in which case the exception is stored and audited.
   * Never called with a Mentor-supplied approval: a Mentor cannot reach these routes.
   */
  async assertCanTake(
    tx: PrismaTxClient,
    p: { mentorUserId: string; activationId: string; overCapacityReason?: string | null; actorUserId: string; action: string },
  ): Promise<CapacityCheck> {
    const activation = await tx.mentoringActivation.findUnique({ where: { id: p.activationId }, select: { studentId: true } });
    if (!activation) throw new NotFoundException('Activation not found');
    const requirements = await tx.requirement.findMany({ where: { studentId: activation.studentId }, select: { monthlyHours: true } });
    const studentHours = studentMonthlyHours(requirements);
    const current = await this.capacityOf(tx, p.mentorUserId);
    // A student the Mentor already holds is already in the allocated figure.
    const already = current.students.some((s) => s.activationId === p.activationId);
    const allocatedBefore = current.allocatedHours;
    const allocatedAfter = already ? allocatedBefore : roundHours(allocatedBefore + studentHours);
    const check: CapacityCheck = {
      studentHours,
      allocatedBefore,
      allocatedAfter,
      limitHours: current.limitHours,
      overCapacity: !already && wouldExceed(current.limitHours, allocatedBefore, studentHours),
    };
    if (!check.overCapacity) return check;

    const reason = p.overCapacityReason?.trim();
    if (!reason) {
      throw new ConflictException({
        code: 'MENTOR_OVER_CAPACITY',
        message: `This would put the Mentor over their monthly limit (${allocatedAfter} of ${current.limitHours} hours). Raise the limit, choose another Mentor, or approve the exception with a reason.`,
        studentHours,
        allocatedHours: allocatedBefore,
        limitHours: current.limitHours,
      });
    }
    await tx.mentoringCapacityException.create({
      data: {
        mentorUserId: p.mentorUserId,
        activationId: p.activationId,
        action: p.action,
        studentHours,
        allocatedBefore,
        allocatedAfter,
        limitAtApproval: current.limitHours,
        reason,
        approvedByUserId: p.actorUserId,
      },
    });
    await tx.auditEvent.create({
      data: {
        entityType: 'MentorCapacity',
        entityId: p.mentorUserId,
        action: 'OVER_CAPACITY_APPROVED',
        actorUserId: p.actorUserId,
        newValue: { activationId: p.activationId, action: p.action, studentHours, allocatedBefore, allocatedAfter, limitHours: current.limitHours, reason },
      },
    });
    return check;
  }

  /** The Mentoring Head sets a Mentor's monthly hour limit. Every change is stored with who, when, the old and new limit and the reason. */
  async setLimit(mentorUserId: string, limitHours: number, reason: string | undefined, actorUserId: string) {
    const limit = roundHours(limitHours);
    if (!Number.isFinite(limit) || limit < 0 || limit > 1000) throw new BadRequestException('The monthly hour limit must be between 0 and 1000 hours');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const profile = await tx.mentoringStaffProfile.findUnique({ where: { userId: mentorUserId } });
      if (!profile || profile.role !== 'MENTOR') throw new NotFoundException('Mentor profile not found');
      const settings = await this.settings(tx);
      const oldLimit = profile.monthlyHourLimit === null || profile.monthlyHourLimit === undefined ? null : Number(profile.monthlyHourLimit);
      if (oldLimit === limit) return this.capacityOf(tx, mentorUserId);
      await tx.mentoringStaffProfile.update({ where: { userId: mentorUserId }, data: { monthlyHourLimit: limit } });
      await tx.mentorCapacityChange.create({
        data: { mentorUserId, oldLimit: oldLimit ?? settings.defaultLimit, newLimit: limit, changedByUserId: actorUserId, reason: reason?.trim() || null },
      });
      await tx.auditEvent.create({
        data: {
          entityType: 'MentorCapacity',
          entityId: mentorUserId,
          action: 'LIMIT_CHANGED',
          actorUserId,
          oldValue: { limitHours: oldLimit ?? settings.defaultLimit },
          newValue: { limitHours: limit, reason: reason?.trim() || null },
        },
      });
      return this.capacityOf(tx, mentorUserId);
    });
  }

  private async names(client: PrismaTxClient | PrismaService, userIds: string[]) {
    const rows = await client.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, firstName: true, lastName: true } });
    return new Map(rows.map((e) => [e.userId, `${e.firstName} ${e.lastName}`.trim()]));
  }

  /** Team view for the Mentoring Head (and read-only for roles with staff read access): every active Mentor's capacity. */
  async teamOverview() {
    const profiles = await this.prisma.mentoringStaffProfile.findMany({ where: { role: 'MENTOR' }, orderBy: { createdAt: 'asc' } });
    const ids = profiles.map((p) => p.userId);
    const [caps, names, settings] = await Promise.all([this.capacities(this.prisma, ids), this.names(this.prisma, ids), this.settings(this.prisma)]);
    const mentors = profiles.map((p) => {
      const { students, ...cap } = caps.get(p.userId) as MentorCapacity;
      return { ...cap, name: names.get(p.userId) ?? p.userId, isActive: p.isActive, studentCount: students.length };
    });
    const total = mentors.reduce(
      (acc, m) => ({ limit: acc.limit + m.limitHours, allocated: acc.allocated + m.allocatedHours }),
      { limit: 0, allocated: 0 },
    );
    return {
      warningPercent: settings.warningPercent,
      defaultLimitHours: settings.defaultLimit,
      totals: { ...summarizeCapacity(total.limit, total.allocated, settings.warningPercent), mentors: mentors.length },
      counts: {
        approaching: mentors.filter((m) => m.state === 'APPROACHING').length,
        full: mentors.filter((m) => m.state === 'FULL').length,
        over: mentors.filter((m) => m.state === 'OVER').length,
      },
      mentors,
    };
  }

  /** One Mentor's own capacity with the students that contribute to it. Read only; the caller passes the authenticated user's own id. */
  async mentorOverview(mentorUserId: string) {
    const profile = await this.prisma.mentoringStaffProfile.findUnique({ where: { userId: mentorUserId } });
    if (!profile || profile.role !== 'MENTOR') return null;
    return this.capacityOf(this.prisma, mentorUserId);
  }

  async changeHistory(mentorUserId: string) {
    const [changes, exceptions] = await Promise.all([
      this.prisma.mentorCapacityChange.findMany({ where: { mentorUserId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.mentoringCapacityException.findMany({ where: { mentorUserId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    const names = await this.names(this.prisma, [...new Set([...changes.map((c) => c.changedByUserId), ...exceptions.map((e) => e.approvedByUserId)])]);
    return {
      changes: changes.map((c) => ({
        id: c.id,
        oldLimit: c.oldLimit === null ? null : Number(c.oldLimit),
        newLimit: Number(c.newLimit),
        reason: c.reason,
        changedByName: names.get(c.changedByUserId) ?? c.changedByUserId,
        createdAt: c.createdAt,
      })),
      exceptions: exceptions.map((e) => ({
        id: e.id,
        activationId: e.activationId,
        action: e.action,
        studentHours: Number(e.studentHours),
        allocatedAfter: Number(e.allocatedAfter),
        limitAtApproval: Number(e.limitAtApproval),
        reason: e.reason,
        approvedByName: names.get(e.approvedByUserId) ?? e.approvedByUserId,
        createdAt: e.createdAt,
      })),
    };
  }
}
