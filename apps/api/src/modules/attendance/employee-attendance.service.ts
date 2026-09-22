import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma, AttendanceSessionStatus } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { format, differenceInMinutes, parse, startOfDay, endOfDay } from 'date-fns';
import { formatInTimeZone, toZonedTime, getTimezoneOffset } from 'date-fns-tz';

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
      if (employee.employmentStatus !== 'ACTIVE') {
        throw new ForbiddenException('Only active employees can check in');
      }

      const checkInTime = requestedDate || new Date();
      const today = this.getTodayStr(checkInTime);

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
        // schedule.startTime is like "09:00"
        const scheduleDateStr = `${today}T${schedule.startTime}:00+05:30`; // IST offset
        const scheduleTime = new Date(scheduleDateStr);
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
      if (employee.employmentStatus !== 'ACTIVE') throw new ForbiddenException('Employee not active');

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
      if (employee.employmentStatus !== 'ACTIVE') throw new ForbiddenException('Employee not active');
      
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
      if (employee.employmentStatus !== 'ACTIVE') throw new ForbiddenException('Employee not active');
      
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

    const employees = await this.prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
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
    });

    return employees.map((emp) => {
      const todaySession = emp.attendanceSessions[0] || null;
      const checkInEvent = todaySession?.events.find((e) => e.eventType === 'CHECK_IN');
      const checkOutEvent = todaySession?.events.find(
        (e) => e.eventType === 'CHECK_OUT' || e.eventType === 'AUTO_CHECK_OUT',
      );

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
      };
    });
  }

  /**
   * Returns detailed attendance for a single employee — today + last 14 days history.
   */
  async getStaffDetail(employeeId: string) {
    const today = this.getTodayStr();

    const employee = await this.prisma.employee.findUnique({
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
    });

    if (!employee) throw new NotFoundException('Employee not found');

    const todaySession = employee.attendanceSessions.find((s) => s.calendarDate === today) || null;

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
    };
  }
}
