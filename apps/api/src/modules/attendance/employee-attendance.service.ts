import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma, AttendanceSessionStatus } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { format, differenceInMinutes, parse, startOfDay, endOfDay } from 'date-fns';
import { formatInTimeZone, toZonedTime, getTimezoneOffset } from 'date-fns-tz';
import { isValidCalendarDate } from '../../common/utils/calendar-date.util';
import { isEligibleForWork } from '../../common/utils/employment-status.util';

const TIMEZONE = 'Asia/Kolkata';

@Injectable()
export class EmployeeAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private getTodayStr(date = new Date()): string {
    return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd');
  }

  async getDailyTaskSummary(userId: string) {
    const today = new Date();
    const start = startOfDay(toZonedTime(today, TIMEZONE));
    const end = endOfDay(toZonedTime(today, TIMEZONE));

    const [pendingFollowUps, completedFollowUps, pendingDemos, completedDemos] = await Promise.all([
      // Pending Follow-ups (scheduled for today or earlier, status SCHEDULED)
      this.prisma.followUp.findMany({
        where: {
          lead: { assignedToUserId: userId },
          status: 'SCHEDULED',
          scheduledAt: { lte: end }
        },
        include: { lead: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { scheduledAt: 'asc' }
      }),
      // Completed Follow-ups (completed today)
      this.prisma.followUp.findMany({
        where: {
          completedByUserId: userId,
          status: 'COMPLETED',
          completedAt: { gte: start, lte: end }
        },
        include: { lead: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { completedAt: 'desc' }
      }),
      // Pending Demos (scheduled for today, status SCHEDULED)
      this.prisma.demo.findMany({
        where: {
          tutorId: userId,
          status: 'SCHEDULED',
          scheduledAt: { gte: start, lte: end }
        },
        include: { student: { include: { lead: { select: { id: true, firstName: true, lastName: true } } } } },
        orderBy: { scheduledAt: 'asc' }
      }),
      // Completed Demos (completed today)
      this.prisma.demo.findMany({
        where: {
          tutorId: userId,
          status: { in: ['COMPLETED', 'NO_SHOW'] },
          scheduledAt: { gte: start, lte: end }
        },
        include: { student: { include: { lead: { select: { id: true, firstName: true, lastName: true } } } } },
        orderBy: { scheduledAt: 'desc' }
      })
    ]);

    return {
      pendingFollowUps,
      completedFollowUps,
      pendingDemos,
      completedDemos,
    };
  }

  async checkIn(userId: string, requestedDate?: Date, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { userId } });
      if (!employee) throw new NotFoundException('Employee not found');
      if (!isEligibleForWork(employee.employmentStatus)) {
        throw new ForbiddenException(`Employees with status ${employee.employmentStatus} cannot check in`);
      }

      const checkInTime = requestedDate || new Date();
      const today = this.getTodayStr(checkInTime);

      // Check for approved leave blocking this calendar date
      const activeLeave = await tx.employeeLeaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          status: 'APPROVED',
          startDate: { lte: today },
          endDate: { gte: today },
        },
      });

      if (activeLeave) {
        const unlock = await tx.employeeAttendanceLeaveUnlock.findFirst({
          where: {
            employeeId: employee.id,
            calendarDate: today,
            leaveRequestId: activeLeave.id,
          },
        });

        if (!unlock) {
          throw new ForbiddenException(
            `Cannot check in: Employee is on approved leave from ${activeLeave.startDate} to ${activeLeave.endDate}. An HR unlock is required for ${today}.`,
          );
        }
      }

      const existingActive = await tx.employeeAttendanceSession.findFirst({
        where: { employeeId: employee.id, status: { in: ['ACTIVE', 'ON_BREAK'] } },
      });
      if (existingActive) {
        throw new BadRequestException('Cannot check in while another session is currently active or on break');
      }

      const schedule = await tx.globalWorkingSchedule.findFirst({
        where: { effectiveFrom: { lte: checkInTime } },
        orderBy: { effectiveFrom: 'desc' },
      });

      let isLate = false;
      let lateMinutes = 0;

      if (schedule && schedule.startTime) {
        // Build the scheduled start time as IST using date-fns-tz — no hardcoded offset strings
        const { fromZonedTime } = await import('date-fns-tz');
        const scheduleTime = fromZonedTime(`${today}T${schedule.startTime}:00`, TIMEZONE);
        if (checkInTime > scheduleTime) {
          isLate = true;
          lateMinutes = Math.floor((checkInTime.getTime() - scheduleTime.getTime()) / 60000);
        }
      }

      const session = await tx.employeeAttendanceSession.create({
        data: {
          employeeId: employee.id,
          calendarDate: today,
          scheduleSnapshot: schedule ? {
             startTime: schedule.startTime,
             endTime: schedule.endTime,
             timezone: schedule.timezone,
             id: schedule.id,
             effectiveFrom: schedule.effectiveFrom.toISOString()
          } : {},
          status: 'ACTIVE',
          isLate,
          lateMinutes,
          note: note || null,
          events: {
            create: {
              eventType: 'CHECK_IN',
              timestamp: checkInTime,
            }
          }
        },
      });

      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: 'ATTENDANCE_CHECK_IN',
        entityType: 'EmployeeAttendanceSession',
        entityId: session.id,
        newValue: session,
      });

      return session;
    });
  }

  async startBreak(userId: string, requestedDate?: Date) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { userId } });
      if (!employee) throw new NotFoundException('Employee not found');
      if (!isEligibleForWork(employee.employmentStatus)) {
        throw new ForbiddenException(`Employee not active (status: ${employee.employmentStatus})`);
      }

      const today = this.getTodayStr(requestedDate || new Date());
      
      const session = await tx.employeeAttendanceSession.findFirst({
        where: { employeeId: employee.id, calendarDate: today },
        orderBy: { createdAt: 'desc' }
      });
      if (!session || session.status !== 'ACTIVE') {
        throw new BadRequestException('Cannot start break from current state');
      }

      // Lock row
      await tx.$executeRaw`SELECT 1 FROM employee_attendance_sessions WHERE id = ${session.id} FOR UPDATE`;

      const updated = await tx.employeeAttendanceSession.update({
        where: { id: session.id },
        data: {
          status: 'ON_BREAK',
          events: {
            create: {
              eventType: 'BREAK_START',
              timestamp: requestedDate || new Date(),
            }
          }
        },
      });

      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: 'ATTENDANCE_BREAK_START',
        entityType: 'EmployeeAttendanceSession',
        entityId: session.id,
        newValue: updated,
      });

      return updated;
    });
  }

  async endBreak(userId: string, requestedDate?: Date) {
     return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { userId } });
      if (!employee) throw new NotFoundException('Employee not found');
      if (!isEligibleForWork(employee.employmentStatus)) {
        throw new ForbiddenException(`Employee not active (status: ${employee.employmentStatus})`);
      }
      
      const endTime = requestedDate || new Date();
      const today = this.getTodayStr(endTime);
      
      const session = await tx.employeeAttendanceSession.findFirst({
        where: { employeeId: employee.id, calendarDate: today },
        orderBy: { createdAt: 'desc' }
      });
      if (!session || session.status !== 'ON_BREAK') {
        throw new BadRequestException('Cannot end break from current state');
      }

      await tx.$executeRaw`SELECT 1 FROM employee_attendance_sessions WHERE id = ${session.id} FOR UPDATE`;

      const lastBreakStart = await tx.employeeAttendanceEvent.findFirst({
        where: { sessionId: session.id, eventType: 'BREAK_START', isInvalidated: false },
        orderBy: { timestamp: 'desc' }
      });

      let addedBreakMins = 0;
      if (lastBreakStart) {
        addedBreakMins = Math.floor((endTime.getTime() - lastBreakStart.timestamp.getTime()) / 60000);
      }

      const updated = await tx.employeeAttendanceSession.update({
        where: { id: session.id },
        data: {
          status: 'ACTIVE',
          breakDurationMinutes: session.breakDurationMinutes + addedBreakMins,
          events: {
            create: {
              eventType: 'BREAK_END',
              timestamp: endTime,
            }
          }
        },
      });

      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: 'ATTENDANCE_BREAK_END',
        entityType: 'EmployeeAttendanceSession',
        entityId: session.id,
        newValue: updated,
      });

      return updated;
    });
  }

  async checkOut(userId: string, requestedDate?: Date) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { userId } });
      if (!employee) throw new NotFoundException('Employee not found');
      if (!isEligibleForWork(employee.employmentStatus)) {
        throw new ForbiddenException(`Employee not active (status: ${employee.employmentStatus})`);
      }
      
      const checkOutTime = requestedDate || new Date();
      const today = this.getTodayStr(checkOutTime);
      
      const session = await tx.employeeAttendanceSession.findFirst({
        where: { employeeId: employee.id, calendarDate: today },
        orderBy: { createdAt: 'desc' }
      });
      if (!session || session.status === 'COMPLETED' || session.status === 'AUTO_CHECKED_OUT' || session.status === 'ON_BREAK') {
        throw new BadRequestException('Cannot check out from current state');
      }

      await tx.$executeRaw`SELECT 1 FROM employee_attendance_sessions WHERE id = ${session.id} FOR UPDATE`;

      const checkInEvent = await tx.employeeAttendanceEvent.findFirst({
        where: { sessionId: session.id, eventType: 'CHECK_IN', isInvalidated: false },
        orderBy: { timestamp: 'asc' }
      });

      let grossMins = 0;
      if (checkInEvent) {
         grossMins = Math.floor((checkOutTime.getTime() - checkInEvent.timestamp.getTime()) / 60000);
      }
      const netMins = Math.max(0, grossMins - session.breakDurationMinutes);

      const updated = await tx.employeeAttendanceSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          grossDurationMinutes: grossMins,
          netDurationMinutes: netMins,
          events: {
            create: {
              eventType: 'CHECK_OUT',
              timestamp: checkOutTime,
            }
          }
        },
      });

      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: 'ATTENDANCE_CHECK_OUT',
        entityType: 'EmployeeAttendanceSession',
        entityId: session.id,
        newValue: updated,
      });

      return updated;
    });
  }

  async correctAttendance(hrUserId: string, sessionId: string, originalEventId: string, newTimestamp: Date, reason: string) {
     return this.prisma.$transaction(async (tx) => {
        const session = await tx.employeeAttendanceSession.findUnique({ where: { id: sessionId }, include: { events: { where: { isInvalidated: false }, orderBy: { timestamp: 'asc' } } } });
        if (!session) throw new NotFoundException('Session not found');

        const originalEvent = await tx.employeeAttendanceEvent.findUnique({ where: { id: originalEventId } });
        if (!originalEvent || originalEvent.isInvalidated) throw new BadRequestException('Invalid original event');

        // Lock row
        await tx.$executeRaw`SELECT 1 FROM employee_attendance_sessions WHERE id = ${session.id} FOR UPDATE`;

        // 1. Invalidate original
        await tx.employeeAttendanceEvent.update({
           where: { id: originalEventId },
           data: { isInvalidated: true }
        });

        // 2. Create new event
        const newEvent = await tx.employeeAttendanceEvent.create({
           data: {
              sessionId,
              eventType: originalEvent.eventType,
              timestamp: newTimestamp
           }
        });

        // 3. Create Correction record
        await tx.employeeAttendanceCorrection.create({
           data: {
              sessionId,
              originalEventId,
              newEventId: newEvent.id,
              reason,
              correctedByUserId: hrUserId
           }
        });

        // 4. Recalculate durations
        // Re-fetch all valid events
        const validEvents = await tx.employeeAttendanceEvent.findMany({
           where: { sessionId, isInvalidated: false },
           orderBy: { timestamp: 'asc' }
        });

        let breakMins = 0;
        let grossMins = 0;

        let checkInTime = null;
        let lastBreakStart = null;
        let lastActionTime = null;

        for (const ev of validEvents) {
           if (ev.eventType === 'CHECK_IN') checkInTime = ev.timestamp;
           if (ev.eventType === 'BREAK_START') lastBreakStart = ev.timestamp;
           if (ev.eventType === 'BREAK_END' || ev.eventType === 'AUTO_BREAK_END') {
              if (lastBreakStart) {
                 breakMins += Math.floor((ev.timestamp.getTime() - lastBreakStart.getTime()) / 60000);
                 lastBreakStart = null;
              }
           }
           if (ev.eventType === 'CHECK_OUT' || ev.eventType === 'AUTO_CHECK_OUT') {
              lastActionTime = ev.timestamp;
           }
        }

        if (checkInTime && lastActionTime) {
           grossMins = Math.floor((lastActionTime.getTime() - checkInTime.getTime()) / 60000);
        }

        const netMins = Math.max(0, grossMins - breakMins);

        const updated = await tx.employeeAttendanceSession.update({
           where: { id: sessionId },
           data: {
              breakDurationMinutes: breakMins,
              grossDurationMinutes: grossMins,
              netDurationMinutes: netMins
           }
        });

        await this.audit.recordInTx(tx, {
           actorUserId: hrUserId,
           action: 'ATTENDANCE_CORRECTION',
           entityType: 'EmployeeAttendanceEvent',
           entityId: originalEventId,
           oldValue: originalEvent,
           newValue: newEvent,
           metadata: { reason }
        });

        return updated;
     });
  }

  /**
   * Unlock check-in for an employee on approved leave for a specific calendar date.
   */
  async unlockAttendanceForLeave(
    hrUserId: string,
    dto: { employeeId: string; calendarDate?: string; reason: string; leaveRequestId?: string },
  ) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('A mandatory reason is required to unlock check-in during approved leave');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    // Prevent self-unlock (separation of duties)
    if (employee.userId === hrUserId) {
      throw new ForbiddenException(
        'Self-unlock is not permitted: another authorized HR user or CEO must grant the unlock',
      );
    }

    const calendarDate = dto.calendarDate || this.getTodayStr();
    if (!isValidCalendarDate(calendarDate)) {
      throw new BadRequestException('calendarDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    return this.prisma.$transaction(async (tx) => {
      let targetLeaveId: string;

      if (dto.leaveRequestId) {
        const leave = await tx.employeeLeaveRequest.findUnique({
          where: { id: dto.leaveRequestId },
        });
        if (!leave || leave.employeeId !== employee.id || leave.status !== 'APPROVED') {
          throw new BadRequestException('Invalid or non-approved leave request specified for unlock');
        }
        if (leave.startDate > calendarDate || leave.endDate < calendarDate) {
          throw new BadRequestException(`Specified leave request does not cover calendar date ${calendarDate}`);
        }
        targetLeaveId = leave.id;
      } else {
        const activeLeave = await tx.employeeLeaveRequest.findFirst({
          where: {
            employeeId: employee.id,
            status: 'APPROVED',
            startDate: { lte: calendarDate },
            endDate: { gte: calendarDate },
          },
        });

        if (!activeLeave) {
          throw new BadRequestException(
            `Cannot unlock check-in: No approved leave request found for employee on ${calendarDate}`,
          );
        }
        targetLeaveId = activeLeave.id;
      }

      const existing = await tx.employeeAttendanceLeaveUnlock.findUnique({
        where: {
          employeeId_calendarDate_leaveRequestId: {
            employeeId: employee.id,
            calendarDate,
            leaveRequestId: targetLeaveId,
          },
        },
      });

      if (existing) {
        return existing;
      }

      const unlock = await tx.employeeAttendanceLeaveUnlock.create({
        data: {
          employeeId: employee.id,
          leaveRequestId: targetLeaveId,
          calendarDate,
          unlockedByUserId: hrUserId,
          reason,
        },
        include: {
          employee: {
            select: {
              id: true,
              businessId: true,
              firstName: true,
              lastName: true,
            },
          },
          unlockedByUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      await this.audit.recordInTx(tx, {
        actorUserId: hrUserId,
        action: 'ATTENDANCE_LEAVE_UNLOCKED',
        entityType: 'EmployeeAttendanceLeaveUnlock',
        entityId: unlock.id,
        newValue: unlock,
        reason,
        metadata: {
          employeeId: employee.id,
          targetUserId: employee.userId,
          calendarDate,
          leaveRequestId: targetLeaveId,
        },
      });

      return unlock;
    });
  }

  async getMyStatus(userId: string) {
     const employee = await this.prisma.employee.findUnique({ where: { userId } });
     if (!employee) return null;
     const today = this.getTodayStr();
     const session = await this.prisma.employeeAttendanceSession.findFirst({
        where: { employeeId: employee.id, calendarDate: today },
        orderBy: { createdAt: 'desc' },
        include: { events: { where: { isInvalidated: false }, orderBy: { timestamp: 'desc' } } }
     });
     return session;
  }

  async getMyHistory(userId: string) {
     const employee = await this.prisma.employee.findUnique({ where: { userId } });
     if (!employee) return [];
     return this.prisma.employeeAttendanceSession.findMany({
        where: { employeeId: employee.id },
        orderBy: { calendarDate: 'desc' },
        include: { events: { where: { isInvalidated: false }, orderBy: { timestamp: 'asc' } } }
     });
  }

  async getTeamAttendance(date: string) {
     return this.prisma.employeeAttendanceSession.findMany({
        where: { calendarDate: date },
        include: { 
          employee: { include: { user: true } },
          events: { where: { isInvalidated: false }, orderBy: { timestamp: 'asc' } }
        }
     });
  }

  /**
   * Returns ALL active employees with their today's attendance session (null if absent).
   * Also overlays active approved leave and date unlock status.
   * If departmentId is provided, scopes to that department only (for team leads/dept heads).
   */
  async getAllStaffsWithAttendance(userId: string, requestedDepartmentId?: string) {
    const today = this.getTodayStr();

    const requestor = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
        employee: true
      }
    });

    const isGlobalViewer = requestor?.userRoles.some(ur => 
      ['CEO', 'HR_MANAGER', 'HR_EXECUTIVE', 'ADMIN'].includes(ur.role.code)
    );

    let departmentId = requestedDepartmentId;

    if (!isGlobalViewer) {
      // Non-global viewers can only see their own department's staff
      departmentId = requestor?.employee?.departmentId;
      if (!departmentId) {
        // If they have no department and aren't a global viewer, they see no one
        return [];
      }
    }

    const [employees, activeLeaves, activeUnlocks] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          employmentStatus: { in: ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD'] },
          ...(departmentId ? { departmentId } : {}),
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
          user: {
            select: {
              id: true,
              email: true,
              status: true,
              userRoles: {
                include: { role: { select: { id: true, name: true, code: true } } },
              },
            },
          },
          attendanceSessions: {
            where: { calendarDate: today },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              events: {
                where: { isInvalidated: false },
                orderBy: { timestamp: 'asc' },
              },
            },
          },
        },
        orderBy: [{ department: { name: 'asc' } }, { firstName: 'asc' }],
      }),
      this.prisma.employeeLeaveRequest.findMany({
        where: {
          status: 'APPROVED',
          startDate: { lte: today },
          endDate: { gte: today },
        },
        select: {
          id: true,
          employeeId: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          reason: true,
        },
      }),
      this.prisma.employeeAttendanceLeaveUnlock.findMany({
        where: {
          calendarDate: today,
        },
        select: {
          id: true,
          employeeId: true,
          leaveRequestId: true,
          calendarDate: true,
          reason: true,
          unlockedByUserId: true,
          createdAt: true,
        },
      }),
    ]);

    return employees.map((emp) => {
      const todaySession = emp.attendanceSessions[0] || null;
      const checkInEvent = todaySession?.events.find((e) => e.eventType === 'CHECK_IN');
      const checkOutEvent = todaySession?.events.find(
        (e) => e.eventType === 'CHECK_OUT' || e.eventType === 'AUTO_CHECK_OUT',
      );

      const todayLeave = activeLeaves.find((l) => l.employeeId === emp.id) || null;
      const todayUnlock = todayLeave
        ? activeUnlocks.find((u) => u.employeeId === emp.id && u.leaveRequestId === todayLeave.id) || null
        : null;

      // Privacy protection: Mask sensitive reasons unless viewer is HR/CEO/Admin or the employee themselves
      const canSeeDetails = isGlobalViewer || emp.user.id === userId;
      const sanitizedTodayLeave = todayLeave
        ? {
            ...todayLeave,
            reason: canSeeDetails ? todayLeave.reason : null,
          }
        : null;
      const sanitizedTodayUnlock = todayUnlock
        ? {
            ...todayUnlock,
            reason: canSeeDetails ? todayUnlock.reason : null,
          }
        : null;

      return {
        id: emp.id,
        businessId: emp.businessId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.user.email,
        userStatus: emp.user.status,
        userId: emp.user.id,
        department: emp.department,
        roles: emp.user.userRoles.map((ur) => ur.role),
        todaySession: todaySession
          ? {
              id: todaySession.id,
              status: todaySession.status,
              note: todaySession.note,
              isLate: todaySession.isLate,
              lateMinutes: todaySession.lateMinutes,
              netDurationMinutes: todaySession.netDurationMinutes,
              breakDurationMinutes: todaySession.breakDurationMinutes,
              checkInTime: checkInEvent?.timestamp ?? null,
              checkOutTime: checkOutEvent?.timestamp ?? null,
            }
          : null,
        todayLeave: sanitizedTodayLeave,
        todayUnlock: sanitizedTodayUnlock,
        isOnLeave: Boolean(todayLeave),
        isLeaveUnlocked: Boolean(todayUnlock),
      };
    });
  }

  /**
   * Returns detailed attendance for a single employee — today + last 14 days history + leave info.
   * Masks sensitive leave reasons and review notes unless viewer is HR/CEO/Admin or the employee themselves.
   */
  async getStaffDetail(employeeId: string, viewerUserId?: string) {
    const today = this.getTodayStr();

    let isGlobalViewer = false;
    if (viewerUserId) {
      const viewer = await this.prisma.user.findUnique({
        where: { id: viewerUserId },
        include: {
          userRoles: { include: { role: true } },
        },
      });
      isGlobalViewer = Boolean(
        viewer?.userRoles?.some((ur: any) =>
          ['CEO', 'HR_MANAGER', 'HR_EXECUTIVE', 'ADMIN'].includes(ur.role?.code),
        ),
      );
    }

    const [employee, activeLeaves, activeUnlocks, recentLeaves, recentUnlocks] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        include: {
          department: true,
          user: {
            select: {
              id: true,
              email: true,
              status: true,
              userRoles: { include: { role: true } },
            },
          },
          attendanceSessions: {
            orderBy: { calendarDate: 'desc' },
            take: 14,
            include: {
              events: {
                where: { isInvalidated: false },
                orderBy: { timestamp: 'asc' },
              },
            },
          },
        },
      }),
      this.prisma.employeeLeaveRequest.findMany({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: { lte: today },
          endDate: { gte: today },
        },
      }),
      this.prisma.employeeAttendanceLeaveUnlock.findMany({
        where: {
          employeeId,
          calendarDate: today,
        },
      }),
      this.prisma.employeeLeaveRequest.findMany({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          reviewedByUser: {
            select: { id: true, email: true },
          },
        },
      }),
      this.prisma.employeeAttendanceLeaveUnlock.findMany({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          unlockedByUser: {
            select: { id: true, email: true },
          },
        },
      }),
    ]);

    if (!employee) throw new NotFoundException('Employee not found');

    const canSeeDetails = isGlobalViewer || (viewerUserId && employee.user.id === viewerUserId);

    const todaySession = employee.attendanceSessions.find((s) => s.calendarDate === today) || null;
    const todayLeave = activeLeaves[0] || null;
    const todayUnlock = todayLeave
      ? activeUnlocks.find((u) => u.leaveRequestId === todayLeave.id) || null
      : null;

    const sanitizedTodayLeave = todayLeave
      ? {
          ...todayLeave,
          reason: canSeeDetails ? todayLeave.reason : null,
        }
      : null;

    const sanitizedTodayUnlock = todayUnlock
      ? {
          ...todayUnlock,
          reason: canSeeDetails ? todayUnlock.reason : null,
        }
      : null;

    const sanitizedRecentLeaves = recentLeaves.map((l) => ({
      ...l,
      reason: canSeeDetails ? l.reason : null,
      reviewNote: canSeeDetails ? l.reviewNote : null,
    }));

    const sanitizedRecentUnlocks = recentUnlocks.map((u) => ({
      ...u,
      reason: canSeeDetails ? u.reason : null,
    }));

    return {
      id: employee.id,
      businessId: employee.businessId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.user.email,
      userId: employee.user.id,
      department: employee.department,
      roles: employee.user.userRoles.map((ur) => ur.role),
      todaySession,
      recentSessions: employee.attendanceSessions,
      todayLeave: sanitizedTodayLeave,
      todayUnlock: sanitizedTodayUnlock,
      isOnLeave: Boolean(todayLeave),
      isLeaveUnlocked: Boolean(todayUnlock),
      recentLeaves: sanitizedRecentLeaves,
      recentUnlocks: sanitizedRecentUnlocks,
    };
  }

  /**
   * Returns company-wide staff attendance summary and detailed records for a specific date.
   * Scoped by RBAC (global viewers can view all departments or filter by department;
   * department managers are scoped to their own department).
   */
  async getAttendanceDashboardSummary(
    userId: string,
    queryDate?: string,
    requestedDepartmentId?: string,
  ) {
    const todayStr = this.getTodayStr();
    const targetDate = queryDate?.trim() || todayStr;

    if (!isValidCalendarDate(targetDate)) {
      throw new BadRequestException('targetDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    const requestor = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
        employee: true,
      },
    });

    const isGlobalViewer = Boolean(
      requestor?.userRoles.some((ur) =>
        ['CEO', 'HR_MANAGER', 'HR_EXECUTIVE', 'ADMIN'].includes(ur.role.code),
      ),
    );

    let departmentId = requestedDepartmentId && requestedDepartmentId !== 'all' ? requestedDepartmentId : undefined;

    if (!isGlobalViewer) {
      departmentId = requestor?.employee?.departmentId;
      if (!departmentId) {
        return {
          date: targetDate,
          timezone: TIMEZONE,
          isToday: targetDate === todayStr,
          isPast: targetDate < todayStr,
          isFuture: targetDate > todayStr,
          isWeekend: false,
          metrics: {
            totalActiveStaff: 0,
            present: 0,
            absent: 0,
            onLeave: 0,
            lateArrivals: 0,
            unmarked: 0,
            expectedToWork: 0,
            attendanceRate: 0,
          },
          records: [],
          departments: [],
        };
      }
    }

    // Determine weekend status (Sunday is weekly off in business operations)
    // Construct Date at 12:00:00 UTC for consistent day-of-week parsing
    const dateObj = new Date(`${targetDate}T12:00:00Z`);
    const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday
    const isWeekend = dayOfWeek === 0;
    const isToday = targetDate === todayStr;
    const isPast = targetDate < todayStr;
    const isFuture = targetDate > todayStr;

    const [allEligibleEmployees, activeLeaves, departments] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          employmentStatus: { in: ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD'] },
          ...(departmentId ? { departmentId } : {}),
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
          user: {
            select: {
              id: true,
              email: true,
              status: true,
              userRoles: {
                include: { role: { select: { id: true, name: true, code: true } } },
              },
            },
          },
          attendanceSessions: {
            where: { calendarDate: targetDate },
            include: {
              events: {
                where: { isInvalidated: false },
                orderBy: { timestamp: 'asc' },
              },
            },
          },
        },
        orderBy: [{ department: { name: 'asc' } }, { firstName: 'asc' }],
      }),
      this.prisma.employeeLeaveRequest.findMany({
        where: {
          status: 'APPROVED',
          startDate: { lte: targetDate },
          endDate: { gte: targetDate },
        },
        select: {
          id: true,
          employeeId: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          reason: true,
        },
      }),
      this.prisma.department.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Historical filtering: Exclude employees who joined after targetDate or left before targetDate
    const eligibleEmployees = allEligibleEmployees.filter((emp) => {
      if (emp.joinedAt) {
        const joinedDateStr = formatInTimeZone(emp.joinedAt, TIMEZONE, 'yyyy-MM-dd');
        if (joinedDateStr > targetDate) return false;
      }
      if (emp.lastWorkingDate && emp.lastWorkingDate < targetDate) {
        return false;
      }
      return true;
    });

    let presentCount = 0;
    let lateCount = 0;
    let onLeaveCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;

    const records = eligibleEmployees.map((emp) => {
      const session = emp.attendanceSessions[0] || null;
      const leave = activeLeaves.find((l) => l.employeeId === emp.id) || null;

      const checkInEvent = session?.events.find((e) => e.eventType === 'CHECK_IN');
      const checkOutEvent = session?.events.find(
        (e) => e.eventType === 'CHECK_OUT' || e.eventType === 'AUTO_CHECK_OUT',
      );

      // Check qualifying attendance
      const hasQualifyingSession = Boolean(
        session && ['ACTIVE', 'ON_BREAK', 'COMPLETED', 'AUTO_CHECKED_OUT'].includes(session.status),
      );

      const isLate = Boolean(hasQualifyingSession && (session?.isLate || (session?.lateMinutes || 0) > 0));

      let attendanceStatus: 'PRESENT' | 'ON_LEAVE' | 'ABSENT' | 'UNMARKED' | 'WEEKEND_OFF' | 'SCHEDULED';

      if (hasQualifyingSession) {
        attendanceStatus = 'PRESENT';
        presentCount++;
        if (isLate) lateCount++;
      } else if (leave) {
        attendanceStatus = 'ON_LEAVE';
        onLeaveCount++;
      } else if (isWeekend) {
        attendanceStatus = 'WEEKEND_OFF';
      } else if (isToday) {
        attendanceStatus = 'UNMARKED';
        unmarkedCount++;
      } else if (isPast) {
        attendanceStatus = 'ABSENT';
        absentCount++;
      } else {
        attendanceStatus = 'SCHEDULED';
      }

      const canSeeDetails = isGlobalViewer || emp.user.id === userId;

      return {
        id: emp.id,
        businessId: emp.businessId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        fullName: `${emp.firstName} ${emp.lastName}`.trim(),
        email: emp.user.email,
        department: emp.department,
        roles: emp.user.userRoles.map((ur) => ur.role),
        attendanceStatus,
        isLate,
        lateMinutes: session?.lateMinutes || 0,
        session: session
          ? {
              id: session.id,
              status: session.status,
              note: session.note,
              netDurationMinutes: session.netDurationMinutes,
              breakDurationMinutes: session.breakDurationMinutes,
              grossDurationMinutes: session.grossDurationMinutes,
              checkInTime: checkInEvent?.timestamp ?? null,
              checkOutTime: checkOutEvent?.timestamp ?? null,
            }
          : null,
        leave: leave
          ? {
              id: leave.id,
              leaveType: leave.leaveType,
              startDate: leave.startDate,
              endDate: leave.endDate,
              reason: canSeeDetails ? leave.reason : null,
            }
          : null,
      };
    });

    const totalActiveStaff = eligibleEmployees.length;

    // Expected to work: On working days = total active staff - those on approved leave.
    // On weekends = employees present (working).
    const expectedToWork = isWeekend
      ? presentCount
      : Math.max(0, totalActiveStaff - onLeaveCount);

    // Absent count: On past working days, confirmed absent; on today, employees expected to work who have not yet checked in
    const totalAbsent = isPast ? absentCount : (isToday && !isWeekend ? unmarkedCount : 0);

    const attendanceRate = expectedToWork > 0
      ? Number(((presentCount / expectedToWork) * 100).toFixed(1))
      : 0;

    return {
      date: targetDate,
      timezone: TIMEZONE,
      isToday,
      isPast,
      isFuture,
      isWeekend,
      metrics: {
        totalActiveStaff,
        present: presentCount,
        absent: totalAbsent,
        onLeave: onLeaveCount,
        lateArrivals: lateCount,
        unmarked: unmarkedCount,
        expectedToWork,
        attendanceRate,
      },
      records,
      departments,
    };
  }

  /**
   * Returns employee-wise staff attendance reports for a monthly or custom date range.
   * Includes expected working days, present days, absent days, late days, leave days,
   * weekly offs, attendance percentage, worked hours, and daily breakdown per employee.
   */
  async getAttendanceReport(
    userId: string,
    query: {
      startDate?: string;
      endDate?: string;
      month?: string; // YYYY-MM
      departmentId?: string;
    },
  ) {
    const todayStr = this.getTodayStr();
    let startDate: string;
    let endDate: string;

    if (query.month?.trim()) {
      const monthStr = query.month.trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) {
        throw new BadRequestException('month must be in YYYY-MM format (e.g. 2026-10)');
      }
      const [year, month] = monthStr.split('-').map(Number);
      startDate = `${monthStr}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
    } else if (query.startDate?.trim() || query.endDate?.trim()) {
      startDate = query.startDate?.trim() || todayStr;
      endDate = query.endDate?.trim() || todayStr;

      if (!isValidCalendarDate(startDate)) {
        throw new BadRequestException('startDate must be a valid real calendar date in YYYY-MM-DD format');
      }
      if (!isValidCalendarDate(endDate)) {
        throw new BadRequestException('endDate must be a valid real calendar date in YYYY-MM-DD format');
      }
      if (startDate > endDate) {
        throw new BadRequestException('startDate cannot be after endDate');
      }
    } else {
      const currentMonth = todayStr.substring(0, 7);
      const [year, month] = currentMonth.split('-').map(Number);
      startDate = `${currentMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;
    }

    const startD = new Date(`${startDate}T00:00:00Z`);
    const endD = new Date(`${endDate}T00:00:00Z`);
    const diffDays = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 366) {
      throw new BadRequestException('Date range cannot exceed 366 days');
    }

    const calendarDates: { date: string; isWeekend: boolean; isPast: boolean; isToday: boolean; isFuture: boolean }[] = [];
    const cur = new Date(startD);
    while (cur <= endD) {
      const dateStr = cur.toISOString().split('T')[0];
      const dayOfWeek = cur.getUTCDay(); // 0 = Sunday
      calendarDates.push({
        date: dateStr,
        isWeekend: dayOfWeek === 0,
        isPast: dateStr < todayStr,
        isToday: dateStr === todayStr,
        isFuture: dateStr > todayStr,
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    const requestor = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
        employee: true,
      },
    });

    const isGlobalViewer = Boolean(
      requestor?.userRoles.some((ur) =>
        ['CEO', 'HR_MANAGER', 'HR_EXECUTIVE', 'ADMIN'].includes(ur.role.code),
      ),
    );

    let departmentId = query.departmentId && query.departmentId !== 'all' ? query.departmentId : undefined;

    if (!isGlobalViewer) {
      departmentId = requestor?.employee?.departmentId;
      if (!departmentId) {
        return {
          startDate,
          endDate,
          timezone: TIMEZONE,
          periodSummary: {
            totalEmployees: 0,
            expectedWorkingDays: 0,
            presentDays: 0,
            absentDays: 0,
            onLeaveDays: 0,
            lateDays: 0,
            weeklyOffDays: 0,
            avgAttendanceRate: 0,
            totalWorkedHours: '0h 0m',
          },
          employees: [],
          departments: [],
        };
      }
    }

    const [allEmployees, allSessions, allLeaves, departments] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          employmentStatus: { in: ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD'] },
          ...(departmentId ? { departmentId } : {}),
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
          user: {
            select: {
              id: true,
              email: true,
              status: true,
              userRoles: { include: { role: { select: { id: true, name: true, code: true } } } },
            },
          },
        },
        orderBy: [{ department: { name: 'asc' } }, { firstName: 'asc' }],
      }),
      this.prisma.employeeAttendanceSession.findMany({
        where: {
          calendarDate: { gte: startDate, lte: endDate },
          ...(departmentId ? { employee: { departmentId } } : {}),
        },
        include: {
          events: {
            where: { isInvalidated: false },
            orderBy: { timestamp: 'asc' },
          },
        },
        orderBy: { calendarDate: 'asc' },
      }),
      this.prisma.employeeLeaveRequest.findMany({
        where: {
          status: 'APPROVED',
          startDate: { lte: endDate },
          endDate: { gte: startDate },
          ...(departmentId ? { employee: { departmentId } } : {}),
        },
        select: {
          id: true,
          employeeId: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          reason: true,
        },
      }),
      this.prisma.department.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const sessionsMap = new Map<string, typeof allSessions[0]>();
    for (const s of allSessions) {
      sessionsMap.set(`${s.employeeId}_${s.calendarDate}`, s);
    }

    const eligibleEmployees = allEmployees.filter((emp) => {
      if (emp.joinedAt) {
        const joinedDateStr = formatInTimeZone(emp.joinedAt, TIMEZONE, 'yyyy-MM-dd');
        if (joinedDateStr > endDate) return false;
      }
      if (emp.lastWorkingDate && emp.lastWorkingDate < startDate) {
        return false;
      }
      return true;
    });

    const reportEmployees = eligibleEmployees.map((emp) => {
      const employeeLeaves = allLeaves.filter((l) => l.employeeId === emp.id);

      let expectedWorkingDays = 0;
      let presentDays = 0;
      let absentDays = 0;
      let lateDays = 0;
      let onLeaveDays = 0;
      let weeklyOffDays = 0;
      let unmarkedDays = 0;
      let totalWorkedMinutes = 0;

      const dailyRecords = calendarDates.map((cd) => {
        if (emp.joinedAt) {
          const joinedDateStr = formatInTimeZone(emp.joinedAt, TIMEZONE, 'yyyy-MM-dd');
          if (joinedDateStr > cd.date) {
            return {
              date: cd.date,
              status: 'NOT_HIRED',
              isWeekend: cd.isWeekend,
              isLate: false,
              lateMinutes: 0,
              session: null,
              leave: null,
            };
          }
        }
        if (emp.lastWorkingDate && emp.lastWorkingDate < cd.date) {
          return {
            date: cd.date,
            status: 'DEPARTED',
            isWeekend: cd.isWeekend,
            isLate: false,
            lateMinutes: 0,
            session: null,
            leave: null,
          };
        }

        const session = sessionsMap.get(`${emp.id}_${cd.date}`) || null;
        const leave = employeeLeaves.find((l) => l.startDate <= cd.date && l.endDate >= cd.date) || null;

        const hasQualifying = Boolean(
          session && ['ACTIVE', 'ON_BREAK', 'COMPLETED', 'AUTO_CHECKED_OUT'].includes(session.status),
        );

        const isLate = Boolean(hasQualifying && (session?.isLate || (session?.lateMinutes || 0) > 0));

        let status: 'PRESENT' | 'ON_LEAVE' | 'ABSENT' | 'UNMARKED' | 'WEEKEND_OFF' | 'SCHEDULED';

        if (hasQualifying) {
          status = 'PRESENT';
          presentDays++;
          expectedWorkingDays++;
          if (isLate) lateDays++;
          totalWorkedMinutes += (session?.netDurationMinutes || 0);
        } else if (leave) {
          status = 'ON_LEAVE';
          onLeaveDays++;
        } else if (cd.isWeekend) {
          status = 'WEEKEND_OFF';
          weeklyOffDays++;
        } else if (cd.isToday) {
          status = 'UNMARKED';
          unmarkedDays++;
          expectedWorkingDays++;
        } else if (cd.isPast) {
          status = 'ABSENT';
          absentDays++;
          expectedWorkingDays++;
        } else {
          status = 'SCHEDULED';
          expectedWorkingDays++;
        }

        const checkInEvent = session?.events?.find((e) => e.eventType === 'CHECK_IN');
        const checkOutEvent = session?.events?.find(
          (e) => e.eventType === 'CHECK_OUT' || e.eventType === 'AUTO_CHECK_OUT',
        );

        const canSeeDetails = isGlobalViewer || emp.user.id === userId;

        return {
          date: cd.date,
          status,
          isWeekend: cd.isWeekend,
          isLate,
          lateMinutes: session?.lateMinutes || 0,
          session: session
            ? {
                id: session.id,
                status: session.status,
                checkInTime: checkInEvent?.timestamp ?? null,
                checkOutTime: checkOutEvent?.timestamp ?? null,
                netDurationMinutes: session.netDurationMinutes,
                breakDurationMinutes: session.breakDurationMinutes,
                grossDurationMinutes: session.grossDurationMinutes,
                note: session.note,
              }
            : null,
          leave: leave
            ? {
                id: leave.id,
                leaveType: leave.leaveType,
                startDate: leave.startDate,
                endDate: leave.endDate,
                reason: canSeeDetails ? leave.reason : null,
              }
            : null,
        };
      });

      const eligibleWorkingDays = presentDays + absentDays;
      const attendancePercentage = eligibleWorkingDays > 0
        ? Number(((presentDays / eligibleWorkingDays) * 100).toFixed(1))
        : expectedWorkingDays === 0
        ? 100
        : 0;

      const workedHoursStr = `${Math.floor(totalWorkedMinutes / 60)}h ${totalWorkedMinutes % 60}m`;

      return {
        id: emp.id,
        businessId: emp.businessId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        fullName: `${emp.firstName} ${emp.lastName}`.trim(),
        email: emp.user.email,
        department: emp.department,
        roles: emp.user.userRoles.map((ur) => ur.role),
        expectedWorkingDays,
        presentDays,
        absentDays,
        lateDays,
        onLeaveDays,
        weeklyOffDays,
        unmarkedDays,
        attendancePercentage,
        totalWorkedMinutes,
        workedHoursStr,
        dailyRecords,
      };
    });

    let sumPresent = 0;
    let sumAbsent = 0;
    let sumOnLeave = 0;
    let sumLate = 0;
    let sumWeeklyOffs = 0;
    let sumWorkedMinutes = 0;
    let sumExpectedWorkingDays = 0;
    let sumRate = 0;

    for (const r of reportEmployees) {
      sumPresent += r.presentDays;
      sumAbsent += r.absentDays;
      sumOnLeave += r.onLeaveDays;
      sumLate += r.lateDays;
      sumWeeklyOffs += r.weeklyOffDays;
      sumWorkedMinutes += r.totalWorkedMinutes;
      sumExpectedWorkingDays += r.expectedWorkingDays;
      sumRate += r.attendancePercentage;
    }

    const avgAttendanceRate = reportEmployees.length > 0
      ? Number((sumRate / reportEmployees.length).toFixed(1))
      : 0;

    const totalWorkedHours = `${Math.floor(sumWorkedMinutes / 60)}h ${sumWorkedMinutes % 60}m`;

    return {
      startDate,
      endDate,
      timezone: TIMEZONE,
      periodSummary: {
        totalEmployees: reportEmployees.length,
        expectedWorkingDays: sumExpectedWorkingDays,
        presentDays: sumPresent,
        absentDays: sumAbsent,
        onLeaveDays: sumOnLeave,
        lateDays: sumLate,
        weeklyOffDays: sumWeeklyOffs,
        avgAttendanceRate,
        totalWorkedHours,
      },
      employees: reportEmployees,
      departments,
    };
  }
}

