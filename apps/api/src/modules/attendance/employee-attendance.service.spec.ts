import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeeAttendanceService } from './employee-attendance.service';
import { AuditService } from '../../common/audit/audit.service';
import { BadRequestException } from '@nestjs/common';

describe('EmployeeAttendanceService', () => {
  let service: EmployeeAttendanceService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeAttendanceService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(async (cb) => {
               return await cb(prisma);
            }),
            $executeRaw: jest.fn(),
            user: { findUnique: jest.fn() },
            employee: { findUnique: jest.fn(), findMany: jest.fn() },
            department: { findMany: jest.fn() },
            employeeAttendanceSession: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            globalWorkingSchedule: { findFirst: jest.fn() },
            employeeAttendanceEvent: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
            employeeAttendanceCorrection: { create: jest.fn() },
            employeeLeaveRequest: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
            employeeAttendanceLeaveUnlock: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) }
          },
        },
        { provide: AuditService, useValue: { recordInTx: jest.fn() } },
      ],
    }).compile();

    service = module.get<EmployeeAttendanceService>(EmployeeAttendanceService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('Correction Immutability', () => {
     it('creates a new event and invalidates the old one without changing its timestamp', async () => {
        const originalTimestamp = new Date('2026-09-18T09:30:00Z');
        const newTimestamp = new Date('2026-09-18T09:00:00Z');

        jest.spyOn(prisma.employeeAttendanceSession, 'findUnique').mockResolvedValue({ id: 'sess1' } as any);
        jest.spyOn(prisma.employeeAttendanceEvent, 'findUnique').mockResolvedValue({ id: 'ev1', eventType: 'CHECK_IN', timestamp: originalTimestamp, isInvalidated: false } as any);
        const invalidateSpy = jest.spyOn(prisma.employeeAttendanceEvent, 'update').mockResolvedValue({} as any);
        const createEventSpy = jest.spyOn(prisma.employeeAttendanceEvent, 'create').mockResolvedValue({ id: 'ev2' } as any);
        const createCorrectionSpy = jest.spyOn(prisma.employeeAttendanceCorrection, 'create').mockResolvedValue({} as any);
        jest.spyOn(prisma.employeeAttendanceEvent, 'findMany').mockResolvedValue([]);
        jest.spyOn(prisma.employeeAttendanceSession, 'update').mockResolvedValue({} as any);

        await service.correctAttendance('hr1', 'sess1', 'ev1', newTimestamp, 'Mistake');

        // Verify old event was soft invalidated
        expect(invalidateSpy).toHaveBeenCalledWith({
           where: { id: 'ev1' },
           data: { isInvalidated: true }
        });
        
        // Verify new event was created with the new timestamp
        expect(createEventSpy).toHaveBeenCalledWith({
           data: {
              sessionId: 'sess1',
              eventType: 'CHECK_IN',
              timestamp: newTimestamp
           }
        });

        // Verify correction links them
        expect(createCorrectionSpy).toHaveBeenCalledWith({
           data: {
              sessionId: 'sess1',
              originalEventId: 'ev1',
              newEventId: 'ev2',
              reason: 'Mistake',
              correctedByUserId: 'hr1'
           }
        });
     });
  });

  describe('Concurrency (5 simultaneous requests)', () => {
     it('allows exactly 1 CHECK_IN and rejects 4', async () => {
        let activeCount = 0;
        
        jest.spyOn(prisma.employee, 'findUnique').mockResolvedValue({ id: 'emp1', employmentStatus: 'ACTIVE' } as any);
        
        // Mock findFirst to simulate that the first check sees nothing, but subsequent checks see the newly created session.
        // Since we are mocking $transaction directly executing the callback, we can simulate race conditions by tracking activeCount.
        jest.spyOn(prisma.employeeAttendanceSession, 'findFirst').mockImplementation((async () => {
           if (activeCount > 0) return { id: 'sess1', status: 'ACTIVE' } as any;
           activeCount++;
           return null;
        }) as any);

        jest.spyOn(prisma.employeeAttendanceSession, 'create').mockResolvedValue({ id: 'sess1' } as any);
        const promises = Array.from({ length: 5 }).map(() => service.checkIn('u1'));
        const results = await Promise.allSettled(promises);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(4);
     });

     it('allows exactly 1 BREAK_START and rejects 4', async () => {
        let breakCount = 0;
        jest.spyOn(prisma.employee, 'findUnique').mockResolvedValue({ id: 'emp1', employmentStatus: 'ACTIVE' } as any);
        
        jest.spyOn(prisma.employeeAttendanceSession, 'findFirst').mockImplementation((async () => {
           if (breakCount > 0) return { id: 'sess1', status: 'ON_BREAK' } as any; // already on break
           breakCount++;
           return { id: 'sess1', status: 'ACTIVE' } as any;
        }) as any);

        const promises = Array.from({ length: 5 }).map(() => service.startBreak('u1'));
        const results = await Promise.allSettled(promises);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(4);
     });

     it('allows exactly 1 BREAK_END and rejects 4', async () => {
        let endBreakCount = 0;
        jest.spyOn(prisma.employee, 'findUnique').mockResolvedValue({ id: 'emp1', employmentStatus: 'ACTIVE' } as any);
        
        jest.spyOn(prisma.employeeAttendanceSession, 'findFirst').mockImplementation((async () => {
           if (endBreakCount > 0) return { id: 'sess1', status: 'ACTIVE' } as any; // already active (break ended)
           endBreakCount++;
           return { id: 'sess1', status: 'ON_BREAK' } as any;
        }) as any);

        const promises = Array.from({ length: 5 }).map(() => service.endBreak('u1'));
        const results = await Promise.allSettled(promises);

        expect(results.filter(r => r.status === 'fulfilled').length).toBe(1);
        expect(results.filter(r => r.status === 'rejected').length).toBe(4);
     });

     it('allows exactly 1 CHECK_OUT and rejects 4', async () => {
        let checkoutCount = 0;
        jest.spyOn(prisma.employee, 'findUnique').mockResolvedValue({ id: 'emp1', employmentStatus: 'ACTIVE' } as any);
        
        jest.spyOn(prisma.employeeAttendanceSession, 'findFirst').mockImplementation((async () => {
           if (checkoutCount > 0) return { id: 'sess1', status: 'COMPLETED' } as any;
           checkoutCount++;
           return { id: 'sess1', status: 'ACTIVE' } as any;
        }) as any);

        const promises = Array.from({ length: 5 }).map(() => service.checkOut('u1'));
        const results = await Promise.allSettled(promises);

        expect(results.filter(r => r.status === 'fulfilled').length).toBe(1);
        expect(results.filter(r => r.status === 'rejected').length).toBe(4);
     });
  });

  describe('getAttendanceDashboardSummary', () => {
    const mockCeoUser = {
      id: 'ceo-1',
      userRoles: [{ role: { code: 'CEO' } }],
      employee: { departmentId: 'dept-all' },
    };

    const mockEmployees = [
      {
        id: 'emp-1',
        businessId: 'EMP-0001',
        firstName: 'John',
        lastName: 'Doe',
        department: { id: 'dept-sales', name: 'Sales', code: 'SALES' },
        user: { id: 'u-1', email: 'john@elscore.com', status: 'ACTIVE', userRoles: [] },
        attendanceSessions: [
          {
            id: 'sess-1',
            status: 'ACTIVE',
            isLate: false,
            lateMinutes: 0,
            netDurationMinutes: 120,
            breakDurationMinutes: 0,
            grossDurationMinutes: 120,
            events: [{ eventType: 'CHECK_IN', timestamp: new Date('2026-10-20T03:30:00Z') }],
          },
        ],
      },
      {
        id: 'emp-2',
        businessId: 'EMP-0002',
        firstName: 'Jane',
        lastName: 'Smith',
        department: { id: 'dept-sales', name: 'Sales', code: 'SALES' },
        user: { id: 'u-2', email: 'jane@elscore.com', status: 'ACTIVE', userRoles: [] },
        attendanceSessions: [
          {
            id: 'sess-2',
            status: 'COMPLETED',
            isLate: true,
            lateMinutes: 25,
            netDurationMinutes: 480,
            breakDurationMinutes: 30,
            grossDurationMinutes: 510,
            events: [
              { eventType: 'CHECK_IN', timestamp: new Date('2026-10-20T03:55:00Z') },
              { eventType: 'CHECK_OUT', timestamp: new Date('2026-10-20T12:25:00Z') },
            ],
          },
        ],
      },
      {
        id: 'emp-3',
        businessId: 'EMP-0003',
        firstName: 'Bob',
        lastName: 'Wilson',
        department: { id: 'dept-hr', name: 'HR', code: 'HR' },
        user: { id: 'u-3', email: 'bob@elscore.com', status: 'ACTIVE', userRoles: [] },
        attendanceSessions: [],
      },
      {
        id: 'emp-4',
        businessId: 'EMP-0004',
        firstName: 'Alice',
        lastName: 'Brown',
        department: { id: 'dept-hr', name: 'HR', code: 'HR' },
        user: { id: 'u-4', email: 'alice@elscore.com', status: 'ACTIVE', userRoles: [] },
        attendanceSessions: [],
      },
    ];

    it('rejects invalid real calendar date with BadRequestException', async () => {
      await expect(
        service.getAttendanceDashboardSummary('ceo-1', '2026-02-30'),
      ).rejects.toThrow(BadRequestException);
    });

    it('calculates company-wide metrics correctly with zero double counting', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockCeoUser as any);
      jest.spyOn(prisma.employee, 'findMany').mockResolvedValue(mockEmployees as any);
      // Bob (emp-3) is on approved leave
      jest.spyOn(prisma.employeeLeaveRequest, 'findMany').mockResolvedValue([
        {
          id: 'leave-1',
          employeeId: 'emp-3',
          leaveType: 'CASUAL',
          startDate: '2026-10-20',
          endDate: '2026-10-22',
          reason: 'Personal travel',
        },
      ] as any);
      jest.spyOn(prisma.department, 'findMany').mockResolvedValue([
        { id: 'dept-sales', name: 'Sales', code: 'SALES' },
        { id: 'dept-hr', name: 'HR', code: 'HR' },
      ] as any);

      // Tuesday (past date relative to current time 2026-10-27)
      const res = await service.getAttendanceDashboardSummary('ceo-1', '2026-10-20');

      expect(res.date).toBe('2026-10-20');
      expect(res.isWeekend).toBe(false);
      expect(res.isPast).toBe(true);

      // Total Active Staff: 4
      expect(res.metrics.totalActiveStaff).toBe(4);
      // Present: emp-1 (Active) + emp-2 (Completed, Late) = 2
      expect(res.metrics.present).toBe(2);
      // Late Arrivals: emp-2 = 1
      expect(res.metrics.lateArrivals).toBe(1);
      // On Leave: emp-3 = 1
      expect(res.metrics.onLeave).toBe(1);
      // Absent: emp-4 (past date, expected to work, no attendance, no leave) = 1
      expect(res.metrics.absent).toBe(1);
      // Expected to work: 4 - 1 (on leave) = 3
      expect(res.metrics.expectedToWork).toBe(3);
      // Attendance rate: (2 / 3) * 100 = 66.7%
      expect(res.metrics.attendanceRate).toBe(66.7);

      // Verify mutual exclusivity: 2 (present) + 1 (on leave) + 1 (absent) = 4 (total)
      expect(res.metrics.present + res.metrics.onLeave + res.metrics.absent).toBe(res.metrics.totalActiveStaff);

      // Verify records length matches active staff
      expect(res.records.length).toBe(4);
      expect(res.records.find((r) => r.id === 'emp-1')?.attendanceStatus).toBe('PRESENT');
      expect(res.records.find((r) => r.id === 'emp-2')?.attendanceStatus).toBe('PRESENT');
      expect(res.records.find((r) => r.id === 'emp-2')?.isLate).toBe(true);
      expect(res.records.find((r) => r.id === 'emp-3')?.attendanceStatus).toBe('ON_LEAVE');
      expect(res.records.find((r) => r.id === 'emp-4')?.attendanceStatus).toBe('ABSENT');
    });

    it('respects weekends: marks unexcused staff as WEEKEND_OFF rather than ABSENT', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockCeoUser as any);
      jest.spyOn(prisma.employee, 'findMany').mockResolvedValue(mockEmployees as any);
      jest.spyOn(prisma.employeeLeaveRequest, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.department, 'findMany').mockResolvedValue([]);

      // 2026-10-25 is a Sunday
      const res = await service.getAttendanceDashboardSummary('ceo-1', '2026-10-25');

      expect(res.isWeekend).toBe(true);
      // On Sunday, unexcused staff are WEEKEND_OFF, so absent is 0
      expect(res.metrics.absent).toBe(0);
      expect(res.records.find((r) => r.id === 'emp-4')?.attendanceStatus).toBe('WEEKEND_OFF');
    });

    it('scopes non-global viewers strictly to their own department', async () => {
      const mockDeptManager = {
        id: 'mgr-1',
        userRoles: [{ role: { code: 'SALES_MANAGER' } }],
        employee: { departmentId: 'dept-sales' },
      };

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockDeptManager as any);
      const findEmployeesSpy = jest.spyOn(prisma.employee, 'findMany').mockResolvedValue([
        mockEmployees[0],
        mockEmployees[1],
      ] as any);
      jest.spyOn(prisma.employeeLeaveRequest, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.department, 'findMany').mockResolvedValue([]);

      // Even if manager requests 'dept-hr', service overrides to their own department 'dept-sales'
      await service.getAttendanceDashboardSummary('mgr-1', '2026-10-20', 'dept-hr');

      expect(findEmployeesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            departmentId: 'dept-sales',
          }),
        }),
      );
    });

    it('excludes employees hired after the target date', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockCeoUser as any);
      jest.spyOn(prisma.employee, 'findMany').mockResolvedValue([
        {
          ...mockEmployees[0],
          joinedAt: new Date('2026-10-25T00:00:00Z'), // Hired on Oct 25, 2026
        },
      ] as any);
      jest.spyOn(prisma.employeeLeaveRequest, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.department, 'findMany').mockResolvedValue([]);

      // Querying Oct 20 (before hire date)
      const res = await service.getAttendanceDashboardSummary('ceo-1', '2026-10-20');

      expect(res.metrics.totalActiveStaff).toBe(0);
      expect(res.records.length).toBe(0);
    });
  });

  describe('getAttendanceReport', () => {
    const mockCeoUser = {
      id: 'ceo-1',
      userRoles: [{ role: { code: 'CEO' } }],
      employee: { departmentId: 'dept-exec' },
      organizationId: 'org-1',
    };

    const mockReportEmployees = [
      {
        id: 'emp-1',
        businessId: 'EMP-0001',
        firstName: 'John',
        lastName: 'Doe',
        joinedAt: new Date('2026-01-01T00:00:00Z'),
        departmentId: 'dept-sales',
        employmentStatus: 'ACTIVE',
        department: { id: 'dept-sales', name: 'Sales', code: 'SALES' },
        user: { id: 'u-1', email: 'john@elscore.com', userRoles: [] },
      },
      {
        id: 'emp-2',
        businessId: 'EMP-0002',
        firstName: 'Jane',
        lastName: 'Smith',
        joinedAt: new Date('2026-01-01T00:00:00Z'),
        departmentId: 'dept-sales',
        employmentStatus: 'ACTIVE',
        department: { id: 'dept-sales', name: 'Sales', code: 'SALES' },
        user: { id: 'u-2', email: 'jane@elscore.com', userRoles: [] },
      },
      {
        id: 'emp-3',
        businessId: 'EMP-0003',
        firstName: 'Bob',
        lastName: 'Wilson',
        joinedAt: new Date('2026-01-01T00:00:00Z'),
        departmentId: 'dept-hr',
        employmentStatus: 'ACTIVE',
        department: { id: 'dept-hr', name: 'HR', code: 'HR' },
        user: { id: 'u-3', email: 'bob@elscore.com', userRoles: [] },
      },
    ];

    it('rejects invalid month format', async () => {
      await expect(
        service.getAttendanceReport('ceo-1', { month: 'invalid-month' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when startDate is after endDate', async () => {
      await expect(
        service.getAttendanceReport('ceo-1', {
          startDate: '2026-10-25',
          endDate: '2026-10-20',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects range exceeding 366 days', async () => {
      await expect(
        service.getAttendanceReport('ceo-1', {
          startDate: '2025-01-01',
          endDate: '2026-02-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('generates employee-wise report and workforce summary correctly for a date range', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockCeoUser as any);
      jest.spyOn(prisma.employee, 'findMany').mockResolvedValue(mockReportEmployees as any);
      jest.spyOn(prisma.department, 'findMany').mockResolvedValue([
        { id: 'dept-sales', name: 'Sales', code: 'SALES' },
        { id: 'dept-hr', name: 'HR', code: 'HR' },
      ] as any);

      // Sessions for emp-1: present on 2026-10-20 (net 480m)
      // Sessions for emp-2: present on 2026-10-20 (net 480m, late 15m)
      const mockSessions = [
        {
          id: 'sess-1',
          employeeId: 'emp-1',
          calendarDate: '2026-10-20',
          startTime: new Date('2026-10-20T03:30:00Z'), // 09:00 IST
          status: 'COMPLETED',
          isLate: false,
          lateMinutes: 0,
          netDurationMinutes: 480,
          breakDurationMinutes: 30,
          events: [
            { eventType: 'CHECK_IN', timestamp: new Date('2026-10-20T03:30:00Z') },
            { eventType: 'CHECK_OUT', timestamp: new Date('2026-10-20T12:00:00Z') },
          ],
        },
        {
          id: 'sess-2',
          employeeId: 'emp-2',
          calendarDate: '2026-10-20',
          startTime: new Date('2026-10-20T03:45:00Z'), // 09:15 IST
          status: 'COMPLETED',
          isLate: true,
          lateMinutes: 15,
          netDurationMinutes: 480,
          breakDurationMinutes: 30,
          events: [
            { eventType: 'CHECK_IN', timestamp: new Date('2026-10-20T03:45:00Z') },
            { eventType: 'CHECK_OUT', timestamp: new Date('2026-10-20T12:15:00Z') },
          ],
        },
      ];
      jest.spyOn(prisma.employeeAttendanceSession, 'findMany').mockResolvedValue(mockSessions as any);

      // Bob (emp-3) is on approved leave from 2026-10-19 to 2026-10-21
      jest.spyOn(prisma.employeeLeaveRequest, 'findMany').mockResolvedValue([
        {
          id: 'leave-1',
          employeeId: 'emp-3',
          leaveType: 'CASUAL',
          startDate: '2026-10-19',
          endDate: '2026-10-21',
          status: 'APPROVED',
        },
      ] as any);

      // Range: Monday 2026-10-19 to Wednesday 2026-10-21 (3 working days, 0 Sundays)
      const report = await service.getAttendanceReport('ceo-1', {
        startDate: '2026-10-19',
        endDate: '2026-10-21',
      });

      expect(report.startDate).toBe('2026-10-19');
      expect(report.endDate).toBe('2026-10-21');

      expect(report.periodSummary.totalEmployees).toBe(3);
      // emp1 (3) + emp2 (3) + emp3 (0 on leave) = 6 expected working days
      expect(report.periodSummary.expectedWorkingDays).toBe(6);

      // Total presents: emp-1 (1) + emp-2 (1) = 2
      expect(report.periodSummary.presentDays).toBe(2);
      // Total late days: emp-2 (1) = 1
      expect(report.periodSummary.lateDays).toBe(1);
      // Total on leave: emp-3 (3 days: 19, 20, 21) = 3
      expect(report.periodSummary.onLeaveDays).toBe(3);
      // Total absent: emp-1 (2 absent days: 19, 21) + emp-2 (2 absent days: 19, 21) = 4
      expect(report.periodSummary.absentDays).toBe(4);

      // Verify individual employee metrics:
      const emp1 = report.employees.find((e) => e.id === 'emp-1');
      expect(emp1).toBeDefined();
      expect(emp1?.presentDays).toBe(1);
      expect(emp1?.absentDays).toBe(2);
      expect(emp1?.lateDays).toBe(0);
      expect(emp1?.onLeaveDays).toBe(0);
      expect(emp1?.expectedWorkingDays).toBe(3);
      // Attendance % = 1 / (1 + 2) * 100 = 33.3%
      expect(emp1?.attendancePercentage).toBe(33.3);
      expect(emp1?.workedHoursStr).toBe('8h 0m');
      expect(emp1?.dailyRecords.length).toBe(3);

      const emp2 = report.employees.find((e) => e.id === 'emp-2');
      expect(emp2?.presentDays).toBe(1);
      expect(emp2?.lateDays).toBe(1);

      const emp3 = report.employees.find((e) => e.id === 'emp-3');
      expect(emp3?.onLeaveDays).toBe(3);
      expect(emp3?.presentDays).toBe(0);
      expect(emp3?.absentDays).toBe(0);
      expect(emp3?.attendancePercentage).toBe(100);
    });

    it('scopes non-global viewers to their assigned department', async () => {
      const mockSalesManager = {
        id: 'mgr-1',
        userRoles: [{ role: { code: 'SALES_MANAGER' } }],
        employee: { departmentId: 'dept-sales' },
        organizationId: 'org-1',
      };

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockSalesManager as any);
      const findEmployeesSpy = jest.spyOn(prisma.employee, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.employeeAttendanceSession, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.employeeLeaveRequest, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.department, 'findMany').mockResolvedValue([]);

      await service.getAttendanceReport('mgr-1', {
        month: '2026-10',
        departmentId: 'dept-hr', // Attempting to view HR
      });

      // Must be forced to dept-sales
      expect(findEmployeesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            departmentId: 'dept-sales',
          }),
        }),
      );
    });
  });
});
