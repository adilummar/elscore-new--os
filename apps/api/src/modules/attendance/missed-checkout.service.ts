import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttendanceSessionStatus,
  MissedCheckoutCaseStatus,
  Prisma,
} from '@prisma/client';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

const UNRESOLVED_STATUSES: MissedCheckoutCaseStatus[] = [
  MissedCheckoutCaseStatus.REQUIRED,
  MissedCheckoutCaseStatus.REQUESTED,
  MissedCheckoutCaseStatus.REJECTED,
];

type ScheduleSnapshot = {
  startTime?: string;
  endTime?: string;
  timezone?: string;
};

@Injectable()
export class MissedCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  get businessTimezone(): string {
    return this.config.get<string>('crm.businessTimezone') ?? 'Asia/Kolkata';
  }

  getBusinessDate(date = new Date()): string {
    return formatInTimeZone(date, this.businessTimezone, 'yyyy-MM-dd');
  }

  async autoCloseStaleSessions(executedAt = new Date()): Promise<number> {
    const today = this.getBusinessDate(executedAt);
    const stale = await this.prisma.employeeAttendanceSession.findMany({
      where: {
        calendarDate: { lt: today },
        status: { in: [AttendanceSessionStatus.ACTIVE, AttendanceSessionStatus.ON_BREAK] },
      },
      select: { id: true },
    });

    let closed = 0;
    for (const session of stale) {
      const didClose = await this.prisma.$transaction((tx) =>
        this.autoCloseSessionInTx(tx, session.id, executedAt),
      );
      if (didClose) closed += 1;
    }
    return closed;
  }

  async reconcileEmployeeInTx(
    tx: PrismaTxClient,
    employeeId: string,
    now: Date,
  ): Promise<void> {
    const today = this.getBusinessDate(now);
    const stale = await tx.employeeAttendanceSession.findMany({
      where: {
        employeeId,
        calendarDate: { lt: today },
        status: { in: [AttendanceSessionStatus.ACTIVE, AttendanceSessionStatus.ON_BREAK] },
      },
      select: { id: true },
      orderBy: { calendarDate: 'asc' },
    });

    for (const session of stale) {
      await this.autoCloseSessionInTx(tx, session.id, now);
    }
  }

  async autoCloseSessionInTx(
    tx: PrismaTxClient,
    sessionId: string,
    executedAt: Date,
  ): Promise<boolean> {
    await tx.$executeRaw`SELECT 1 FROM employee_attendance_sessions WHERE id = ${sessionId} FOR UPDATE`;

    const session = await tx.employeeAttendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        events: {
          where: { isInvalidated: false },
          orderBy: { timestamp: 'asc' },
        },
      },
    });
    if (
      !session
      || (
        session.status !== AttendanceSessionStatus.ACTIVE
        && session.status !== AttendanceSessionStatus.ON_BREAK
      )
    ) {
      return false;
    }

    const checkIn = session.events.find((event) => event.eventType === 'CHECK_IN');
    const snapshot = this.readSnapshot(session.scheduleSnapshot);
    let schedule = this.validSchedule(snapshot) ? snapshot : null;

    if (!schedule && checkIn) {
      const fallback = await tx.globalWorkingSchedule.findFirst({
        where: { effectiveFrom: { lte: checkIn.timestamp } },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (fallback && this.validSchedule(fallback)) {
        schedule = fallback;
      }
    }

    const endOfAttendanceDay = fromZonedTime(
      `${session.calendarDate}T23:59:59.999`,
      this.businessTimezone,
    );
    const effectiveCheckoutAt = schedule
      ? fromZonedTime(
          `${session.calendarDate}T${schedule.endTime}:00`,
          schedule.timezone ?? this.businessTimezone,
        )
      : checkIn?.timestamp ?? endOfAttendanceDay;

    let breakMinutes = session.breakDurationMinutes;
    const events: Prisma.EmployeeAttendanceEventCreateWithoutSessionInput[] = [];
    if (session.status === AttendanceSessionStatus.ON_BREAK) {
      const lastBreakStart = [...session.events]
        .reverse()
        .find((event) => event.eventType === 'BREAK_START');
      if (lastBreakStart) {
        breakMinutes += Math.max(
          0,
          Math.floor((effectiveCheckoutAt.getTime() - lastBreakStart.timestamp.getTime()) / 60_000),
        );
      }
      events.push({ eventType: 'AUTO_BREAK_END', timestamp: effectiveCheckoutAt });
    }
    events.push({ eventType: 'AUTO_CHECK_OUT', timestamp: effectiveCheckoutAt });

    const grossMinutes = schedule && checkIn
      ? Math.max(0, Math.floor((effectiveCheckoutAt.getTime() - checkIn.timestamp.getTime()) / 60_000))
      : 0;
    const netMinutes = Math.max(0, grossMinutes - breakMinutes);

    await tx.employeeAttendanceSession.update({
      where: { id: session.id },
      data: {
        status: AttendanceSessionStatus.AUTO_CHECKED_OUT,
        breakDurationMinutes: breakMinutes,
        grossDurationMinutes: grossMinutes,
        netDurationMinutes: netMinutes,
        events: { create: events },
      },
    });

    const missedCase = await tx.employeeMissedCheckoutCase.upsert({
      where: { sessionId: session.id },
      create: {
        sessionId: session.id,
        employeeId: session.employeeId,
        status: MissedCheckoutCaseStatus.REQUIRED,
      },
      update: {},
    });

    await this.audit.recordInTx(tx, {
      action: 'ATTENDANCE_AUTO_CLOSED',
      entityType: 'EmployeeAttendanceSession',
      entityId: session.id,
      oldValue: { status: session.status },
      newValue: {
        status: AttendanceSessionStatus.AUTO_CHECKED_OUT,
        grossDurationMinutes: grossMinutes,
        breakDurationMinutes: breakMinutes,
        netDurationMinutes: netMinutes,
      },
      metadata: {
        employeeId: session.employeeId,
        attendanceDate: session.calendarDate,
        missedCheckoutCaseId: missedCase.id,
        effectiveCheckoutAt: effectiveCheckoutAt.toISOString(),
        autoCloseExecutedAt: executedAt.toISOString(),
        scheduleMissing: !schedule,
      },
    });

    return true;
  }

  async getOwnCurrent(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) return null;
    return this.prisma.employeeMissedCheckoutCase.findFirst({
      where: { employeeId: employee.id, status: { in: UNRESOLVED_STATUSES } },
      orderBy: { createdAt: 'asc' },
      include: {
        session: {
          include: {
            events: {
              where: { isInvalidated: false },
              orderBy: { timestamp: 'asc' },
            },
          },
        },
      },
    });
  }

  async requestApproval(userId: string, caseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { userId } });
      if (!employee) throw new NotFoundException('Employee not found');

      await tx.$executeRaw`SELECT 1 FROM employee_missed_checkout_cases WHERE id = ${caseId} FOR UPDATE`;
      const missedCase = await tx.employeeMissedCheckoutCase.findUnique({ where: { id: caseId } });
      if (!missedCase || missedCase.employeeId !== employee.id) {
        throw new NotFoundException('Missed checkout case not found');
      }
      if (missedCase.status === MissedCheckoutCaseStatus.REQUESTED) return missedCase;
      if (
        missedCase.status !== MissedCheckoutCaseStatus.REQUIRED
        && missedCase.status !== MissedCheckoutCaseStatus.REJECTED
      ) {
        throw new BadRequestException('This missed checkout case is already resolved');
      }

      const isResubmission = missedCase.status === MissedCheckoutCaseStatus.REJECTED;
      const updated = await tx.employeeMissedCheckoutCase.update({
        where: { id: missedCase.id },
        data: {
          status: MissedCheckoutCaseStatus.REQUESTED,
          requestedAt: new Date(),
          reviewedAt: null,
          reviewedByUserId: null,
          rejectionReason: null,
        },
      });
      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: isResubmission
          ? 'MISSED_CHECKOUT_APPROVAL_RESUBMITTED'
          : 'MISSED_CHECKOUT_APPROVAL_REQUESTED',
        entityType: 'EmployeeMissedCheckoutCase',
        entityId: missedCase.id,
        oldValue: { status: missedCase.status },
        newValue: { status: updated.status, requestedAt: updated.requestedAt },
        metadata: { employeeId: employee.id, attendanceSessionId: missedCase.sessionId },
      });
      return updated;
    });
  }

  async listForManagement(actorUserId: string) {
    const scope = await this.getManagementScope(actorUserId);
    return this.prisma.employeeMissedCheckoutCase.findMany({
      where: {
        status: { in: UNRESOLVED_STATUSES },
        ...(scope.departmentId ? { employee: { departmentId: scope.departmentId } } : {}),
      },
      orderBy: [{ requestedAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        employee: {
          select: {
            id: true,
            businessId: true,
            userId: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
        session: {
          include: {
            events: {
              where: { isInvalidated: false },
              orderBy: { timestamp: 'asc' },
            },
          },
        },
      },
    });
  }

  async approve(actorUserId: string, caseId: string) {
    return this.review(actorUserId, caseId, MissedCheckoutCaseStatus.APPROVED);
  }

  async reject(actorUserId: string, caseId: string, reason: string) {
    return this.review(actorUserId, caseId, MissedCheckoutCaseStatus.REJECTED, reason);
  }

  async resolve(actorUserId: string, caseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const scope = await this.getManagementScope(actorUserId, tx);
      await tx.$executeRaw`SELECT 1 FROM employee_missed_checkout_cases WHERE id = ${caseId} FOR UPDATE`;
      const missedCase = await tx.employeeMissedCheckoutCase.findUnique({
        where: { id: caseId },
        include: { employee: true },
      });
      if (!missedCase) throw new NotFoundException('Missed checkout case not found');
      this.assertCanManage(scope, actorUserId, missedCase.employee);
      if (
        missedCase.status !== MissedCheckoutCaseStatus.REQUIRED
        && missedCase.status !== MissedCheckoutCaseStatus.REQUESTED
        && missedCase.status !== MissedCheckoutCaseStatus.REJECTED
      ) {
        throw new BadRequestException('This missed checkout case is already resolved');
      }

      const updated = await tx.employeeMissedCheckoutCase.update({
        where: { id: missedCase.id },
        data: {
          status: MissedCheckoutCaseStatus.RESOLVED,
          resolvedByUserId: actorUserId,
          resolvedAt: new Date(),
        },
      });
      await this.audit.recordInTx(tx, {
        actorUserId,
        action: 'MISSED_CHECKOUT_RESOLVED',
        entityType: 'EmployeeMissedCheckoutCase',
        entityId: missedCase.id,
        oldValue: { status: missedCase.status },
        newValue: {
          status: updated.status,
          resolvedAt: updated.resolvedAt,
          resolvedByUserId: updated.resolvedByUserId,
        },
        metadata: {
          employeeId: missedCase.employeeId,
          attendanceSessionId: missedCase.sessionId,
        },
      });
      return updated;
    });
  }

  async assertNoUnresolvedInTx(tx: PrismaTxClient, employeeId: string): Promise<void> {
    const unresolved = await tx.employeeMissedCheckoutCase.findFirst({
      where: { employeeId, status: { in: UNRESOLVED_STATUSES } },
      include: { session: { select: { calendarDate: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!unresolved) return;
    throw new ConflictException({
      code: 'MISSED_CHECKOUT_APPROVAL_REQUIRED',
      message: 'You forgot to check out on your previous attendance day. Your attendance needs approval before you can check in.',
      details: {
        missedCheckoutCaseId: unresolved.id,
        attendanceDate: unresolved.session.calendarDate,
        status: unresolved.status,
      },
    });
  }

  private async review(
    actorUserId: string,
    caseId: string,
    nextStatus: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const scope = await this.getManagementScope(actorUserId, tx);
      await tx.$executeRaw`SELECT 1 FROM employee_missed_checkout_cases WHERE id = ${caseId} FOR UPDATE`;
      const missedCase = await tx.employeeMissedCheckoutCase.findUnique({
        where: { id: caseId },
        include: { employee: true },
      });
      if (!missedCase) throw new NotFoundException('Missed checkout case not found');
      this.assertCanManage(scope, actorUserId, missedCase.employee);
      if (missedCase.status !== MissedCheckoutCaseStatus.REQUESTED) {
        throw new BadRequestException('Only a requested missed checkout case can be reviewed');
      }

      const updated = await tx.employeeMissedCheckoutCase.update({
        where: { id: missedCase.id },
        data: {
          status: nextStatus,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
          rejectionReason: nextStatus === MissedCheckoutCaseStatus.REJECTED ? reason : null,
        },
      });
      await this.audit.recordInTx(tx, {
        actorUserId,
        action: nextStatus === MissedCheckoutCaseStatus.APPROVED
          ? 'MISSED_CHECKOUT_APPROVED'
          : 'MISSED_CHECKOUT_REJECTED',
        entityType: 'EmployeeMissedCheckoutCase',
        entityId: missedCase.id,
        reason,
        oldValue: { status: missedCase.status },
        newValue: { status: updated.status, reviewedAt: updated.reviewedAt },
        metadata: {
          employeeId: missedCase.employeeId,
          attendanceSessionId: missedCase.sessionId,
        },
      });
      return updated;
    });
  }

  private async getManagementScope(actorUserId: string, tx: PrismaTxClient | PrismaService = this.prisma) {
    const actor = await tx.user.findUnique({
      where: { id: actorUserId },
      include: {
        employee: true,
        userRoles: { include: { role: true } },
      },
    });
    if (!actor) throw new ForbiddenException('Management user not found');
    const roles = new Set(actor.userRoles.map((item) => item.role.code));
    if (roles.has('CEO')) return { departmentId: null };
    if (roles.has('SALES_HEAD') && actor.employee?.departmentId) {
      return { departmentId: actor.employee.departmentId };
    }
    throw new ForbiddenException('You do not have access to missed checkout management');
  }

  private assertCanManage(
    scope: { departmentId: string | null },
    actorUserId: string,
    employee: { userId: string; departmentId: string },
  ): void {
    if (employee.userId === actorUserId) {
      throw new ForbiddenException('You cannot review your own missed checkout');
    }
    if (scope.departmentId && employee.departmentId !== scope.departmentId) {
      throw new ForbiddenException('You do not have access to this employee');
    }
  }

  private readSnapshot(value: Prisma.JsonValue): ScheduleSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
  }

  private validSchedule(schedule: ScheduleSnapshot): schedule is Required<Pick<ScheduleSnapshot, 'startTime' | 'endTime'>> & ScheduleSnapshot {
    return Boolean(
      schedule.startTime
      && schedule.endTime
      && /^\d{2}:\d{2}$/.test(schedule.startTime)
      && /^\d{2}:\d{2}$/.test(schedule.endTime)
      && schedule.endTime > schedule.startTime,
    );
  }
}
