import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { EmployeeAttendanceService } from '../attendance/employee-attendance.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

describe('Leave and Attendance Control', () => {
  let leaveService: LeaveService;
  let attendanceService: EmployeeAttendanceService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      employee: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      employeeLeaveRequest: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      employeeAttendanceLeaveUnlock: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      employeeAttendanceSession: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      globalWorkingSchedule: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    audit = {
      record: jest.fn(),
      recordInTx: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        EmployeeAttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    leaveService = module.get<LeaveService>(LeaveService);
    attendanceService = module.get<EmployeeAttendanceService>(EmployeeAttendanceService);
  });

  describe('Scenario 1: Employee submits valid leave request', () => {
    it('creates a leave request with PENDING status and audit record', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null);
      prisma.employeeLeaveRequest.create.mockResolvedValue({
        id: 'leave-1',
        employeeId: 'emp-1',
        leaveType: 'CASUAL',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        reason: 'Family event',
        status: 'PENDING',
      });

      const result = await leaveService.createLeaveRequest('user-1', {
        leaveType: 'CASUAL',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        reason: 'Family event',
      });

      expect(result.status).toBe('PENDING');
      expect(prisma.employeeLeaveRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId: 'emp-1',
            leaveType: 'CASUAL',
            startDate: '2026-11-01',
            endDate: '2026-11-03',
            reason: 'Family event',
            status: 'PENDING',
          }),
        }),
      );
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'LEAVE_REQUEST_CREATED',
          actorUserId: 'user-1',
          entityType: 'EmployeeLeaveRequest',
        }),
      );
    });
  });

  describe('Scenario 2: Employee submits leave request with end date before start date', () => {
    it('throws BadRequestException for invalid date order', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });

      await expect(
        leaveService.createLeaveRequest('user-1', {
          leaveType: 'SICK',
          startDate: '2026-11-05',
          endDate: '2026-11-02',
          reason: 'Sick leave',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Scenario 3: Employee submits overlapping leave request', () => {
    it('throws BadRequestException when overlapping request exists', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue({
        id: 'existing-leave',
        employeeId: 'emp-1',
        status: 'PENDING',
        startDate: '2026-11-01',
        endDate: '2026-11-05',
      });

      await expect(
        leaveService.createLeaveRequest('user-1', {
          leaveType: 'CASUAL',
          startDate: '2026-11-03',
          endDate: '2026-11-07',
          reason: 'Overlap test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Scenario 4: HR approves pending leave request', () => {
    it('transitions status to APPROVED with reviewer details and records audit', async () => {
      prisma.employeeLeaveRequest.findUnique.mockResolvedValue({
        id: 'leave-1',
        employeeId: 'emp-1',
        status: 'PENDING',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        employee: { userId: 'user-1' },
      });
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null);
      prisma.employeeLeaveRequest.update.mockResolvedValue({
        id: 'leave-1',
        status: 'APPROVED',
        reviewedByUserId: 'hr-1',
        reviewedAt: new Date(),
        reviewNote: 'Approved by HR',
      });

      const result = await leaveService.reviewLeaveRequest('hr-1', 'leave-1', {
        action: 'APPROVE',
        reviewNote: 'Approved by HR',
      });

      expect(result.status).toBe('APPROVED');
      expect(prisma.employeeLeaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'leave-1' },
          data: expect.objectContaining({
            status: 'APPROVED',
            reviewedByUserId: 'hr-1',
            reviewNote: 'Approved by HR',
          }),
        }),
      );
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'LEAVE_REQUEST_APPROVED',
          actorUserId: 'hr-1',
          entityType: 'EmployeeLeaveRequest',
        }),
      );
    });
  });

  describe('Scenario 5: HR rejects pending leave request', () => {
    it('transitions status to REJECTED with note and records audit', async () => {
      prisma.employeeLeaveRequest.findUnique.mockResolvedValue({
        id: 'leave-2',
        employeeId: 'emp-1',
        status: 'PENDING',
        startDate: '2026-11-10',
        endDate: '2026-11-12',
        employee: { userId: 'user-1' },
      });
      prisma.employeeLeaveRequest.update.mockResolvedValue({
        id: 'leave-2',
        status: 'REJECTED',
        reviewedByUserId: 'hr-1',
        reviewedAt: new Date(),
        reviewNote: 'Team capacity low',
      });

      const result = await leaveService.reviewLeaveRequest('hr-1', 'leave-2', {
        action: 'REJECT',
        reviewNote: 'Team capacity low',
      });

      expect(result.status).toBe('REJECTED');
      expect(prisma.employeeLeaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'leave-2' },
          data: expect.objectContaining({
            status: 'REJECTED',
            reviewedByUserId: 'hr-1',
            reviewNote: 'Team capacity low',
          }),
        }),
      );
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'LEAVE_REQUEST_REJECTED',
          actorUserId: 'hr-1',
        }),
      );
    });
  });

  describe('Scenario 6: Attempting to review already reviewed request', () => {
    it('throws BadRequestException if request is not PENDING', async () => {
      prisma.employeeLeaveRequest.findUnique.mockResolvedValue({
        id: 'leave-3',
        employeeId: 'emp-1',
        status: 'APPROVED',
        employee: { userId: 'user-1' },
      });

      await expect(
        leaveService.reviewLeaveRequest('hr-1', 'leave-3', { action: 'APPROVE' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Scenario 7: Concurrent approval collision guard', () => {
    it('rejects approval if another overlapping request was approved concurrently', async () => {
      prisma.employeeLeaveRequest.findUnique.mockResolvedValue({
        id: 'leave-req-1',
        employeeId: 'emp-1',
        status: 'PENDING',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        employee: { userId: 'user-1' },
      });
      // Simulate concurrent approval found in tx
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue({
        id: 'leave-req-2',
        employeeId: 'emp-1',
        status: 'APPROVED',
        startDate: '2026-11-02',
        endDate: '2026-11-04',
      });

      await expect(
        leaveService.reviewLeaveRequest('hr-1', 'leave-req-1', { action: 'APPROVE' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Scenario 8: Employee with APPROVED leave attempts check-in', () => {
    it('is strictly blocked with ForbiddenException', async () => {
      const today = '2026-10-22';
      const checkInDate = new Date(`${today}T09:00:00+05:30`);

      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });
      // Approved leave active today
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue({
        id: 'leave-approved',
        employeeId: 'emp-1',
        status: 'APPROVED',
        startDate: '2026-10-20',
        endDate: '2026-10-25',
      });
      // No unlock
      prisma.employeeAttendanceLeaveUnlock.findFirst.mockResolvedValue(null);

      await expect(
        attendanceService.checkIn('user-1', checkInDate),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Scenario 9: Employee with PENDING leave attempts check-in', () => {
    it('succeeds normally without blocking', async () => {
      const today = '2026-10-22';
      const checkInDate = new Date(`${today}T09:00:00+05:30`);

      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });
      // No APPROVED leave active today (only query status: APPROVED is checked)
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null);
      prisma.employeeAttendanceSession.findFirst.mockResolvedValue(null);
      prisma.employeeAttendanceSession.create.mockResolvedValue({
        id: 'sess-1',
        employeeId: 'emp-1',
        calendarDate: today,
        status: 'ACTIVE',
      });

      const session = await attendanceService.checkIn('user-1', checkInDate);
      expect(session).toBeDefined();
      expect(session.status).toBe('ACTIVE');
    });
  });

  describe('Scenario 10: Employee with REJECTED leave attempts check-in', () => {
    it('succeeds normally without blocking', async () => {
      const today = '2026-10-22';
      const checkInDate = new Date(`${today}T09:00:00+05:30`);

      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });
      // Active leave query filters by status: 'APPROVED' so returns null
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null);
      prisma.employeeAttendanceSession.findFirst.mockResolvedValue(null);
      prisma.employeeAttendanceSession.create.mockResolvedValue({
        id: 'sess-2',
        employeeId: 'emp-1',
        calendarDate: today,
        status: 'ACTIVE',
      });

      const session = await attendanceService.checkIn('user-1', checkInDate);
      expect(session).toBeDefined();
      expect(session.status).toBe('ACTIVE');
    });
  });

  describe('Scenario 11: HR unlocks check-in for specific date during approved leave', () => {
    it('allows check-in on unlocked date while preserving APPROVED leave status', async () => {
      const today = '2026-10-22';
      const checkInDate = new Date(`${today}T09:00:00+05:30`);

      // 1. HR creates unlock
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue({
        id: 'leave-approved',
        employeeId: 'emp-1',
        status: 'APPROVED',
        startDate: '2026-10-20',
        endDate: '2026-10-25',
      });
      prisma.employeeAttendanceLeaveUnlock.findUnique.mockResolvedValue(null);
      prisma.employeeAttendanceLeaveUnlock.create.mockResolvedValue({
        id: 'unlock-1',
        employeeId: 'emp-1',
        leaveRequestId: 'leave-approved',
        calendarDate: today,
        unlockedByUserId: 'hr-1',
        reason: 'Emergency coverage for demo session',
      });

      const unlock = await attendanceService.unlockAttendanceForLeave('hr-1', {
        employeeId: 'emp-1',
        calendarDate: today,
        reason: 'Emergency coverage for demo session',
      });

      expect(unlock.calendarDate).toBe(today);
      expect(unlock.leaveRequestId).toBe('leave-approved');
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'ATTENDANCE_LEAVE_UNLOCKED',
          actorUserId: 'hr-1',
          entityType: 'EmployeeAttendanceLeaveUnlock',
        }),
      );

      // 2. Now employee checks in
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue({
        id: 'leave-approved',
        employeeId: 'emp-1',
        status: 'APPROVED',
        startDate: '2026-10-20',
        endDate: '2026-10-25',
      });
      // Unlock exists matching activeLeave.id
      prisma.employeeAttendanceLeaveUnlock.findFirst.mockResolvedValue({
        id: 'unlock-1',
        employeeId: 'emp-1',
        leaveRequestId: 'leave-approved',
        calendarDate: today,
      });
      prisma.employeeAttendanceSession.findFirst.mockResolvedValue(null);
      prisma.employeeAttendanceSession.create.mockResolvedValue({
        id: 'sess-3',
        employeeId: 'emp-1',
        calendarDate: today,
        status: 'ACTIVE',
      });

      const session = await attendanceService.checkIn('user-1', checkInDate);
      expect(session.status).toBe('ACTIVE');
    });
  });

  describe('Scenario 12: Check-in on a different date in approved range without unlock', () => {
    it('remains blocked on non-unlocked date in the leave range', async () => {
      const otherDate = '2026-10-23';
      const checkInDate = new Date(`${otherDate}T09:00:00+05:30`);

      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue({
        id: 'leave-approved',
        employeeId: 'emp-1',
        status: 'APPROVED',
        startDate: '2026-10-20',
        endDate: '2026-10-25',
      });
      // No unlock for otherDate
      prisma.employeeAttendanceLeaveUnlock.findFirst.mockResolvedValue(null);

      await expect(
        attendanceService.checkIn('user-1', checkInDate),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Scenario 13 (Security): Stale unlock authorization regression', () => {
    it('strictly blocks check-in when an unlock was granted for a different/previous leave request', async () => {
      const today = '2026-10-22';
      const checkInDate = new Date(`${today}T09:00:00+05:30`);

      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });

      // Employee currently has active approved Leave B ('leave-B')
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue({
        id: 'leave-B',
        employeeId: 'emp-1',
        status: 'APPROVED',
        startDate: '2026-10-22',
        endDate: '2026-10-24',
      });

      // But the database only has an unlock for old Leave A ('leave-A')
      // findFirst checking (employeeId, calendarDate, leaveRequestId: 'leave-B') returns null!
      prisma.employeeAttendanceLeaveUnlock.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.leaveRequestId === 'leave-B') {
          return null; // No unlock for leave B!
        }
        return {
          id: 'unlock-old',
          employeeId: 'emp-1',
          leaveRequestId: 'leave-A',
          calendarDate: today,
        };
      });

      await expect(
        attendanceService.checkIn('user-1', checkInDate),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Scenario 14 (Security): Strict calendar date validation', () => {
    it('rejects impossible dates such as 2026-02-30', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });

      await expect(
        leaveService.createLeaveRequest('user-1', {
          leaveType: 'CASUAL',
          startDate: '2026-02-30',
          endDate: '2026-03-02',
          reason: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects impossible dates such as 2026-04-31', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });

      await expect(
        leaveService.createLeaveRequest('user-1', {
          leaveType: 'CASUAL',
          startDate: '2026-04-31',
          endDate: '2026-05-01',
          reason: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid unlock calendar date', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });

      await expect(
        attendanceService.unlockAttendanceForLeave('hr-1', {
          employeeId: 'emp-1',
          calendarDate: '2026-02-30',
          reason: 'Invalid date unlock',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Scenario 15 (Security): Self-review prevention', () => {
    it('forbids an HR manager from reviewing their own leave request', async () => {
      prisma.employeeLeaveRequest.findUnique.mockResolvedValue({
        id: 'leave-hr',
        employeeId: 'emp-hr',
        status: 'PENDING',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        employee: { userId: 'hr-user-id' }, // Same as reviewer!
      });

      await expect(
        leaveService.reviewLeaveRequest('hr-user-id', 'leave-hr', {
          action: 'APPROVE',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Scenario 16 (Security): Self-unlock prevention', () => {
    it('forbids an HR user from granting an attendance unlock to themselves', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-hr',
        userId: 'hr-user-id', // Same as actor!
        employmentStatus: 'ACTIVE',
      });

      await expect(
        attendanceService.unlockAttendanceForLeave('hr-user-id', {
          employeeId: 'emp-hr',
          calendarDate: '2026-10-22',
          reason: 'Self unlock attempt',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Scenario 17 (Security): Unlock requires approved leave covering date', () => {
    it('rejects unlock when employee has no approved leave on that date', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });
      // No approved leave
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null);

      await expect(
        attendanceService.unlockAttendanceForLeave('hr-1', {
          employeeId: 'emp-1',
          calendarDate: '2026-10-22',
          reason: 'No leave active',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Scenario 18 (Concurrency): Transactional Advisory Locks', () => {
    it('executes pg_advisory_xact_lock on employee hash during leave submission', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        userId: 'user-1',
        employmentStatus: 'ACTIVE',
      });
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null);
      prisma.employeeLeaveRequest.create.mockResolvedValue({
        id: 'leave-1',
        employeeId: 'emp-1',
        leaveType: 'CASUAL',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        status: 'PENDING',
      });

      await leaveService.createLeaveRequest('user-1', {
        leaveType: 'CASUAL',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        reason: 'Family event',
      });

      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('executes pg_advisory_xact_lock on employee hash during leave review', async () => {
      prisma.employeeLeaveRequest.findUnique.mockResolvedValue({
        id: 'leave-1',
        employeeId: 'emp-1',
        status: 'PENDING',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        employee: { userId: 'user-other' },
      });
      prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null);
      prisma.employeeLeaveRequest.update.mockResolvedValue({
        id: 'leave-1',
        status: 'APPROVED',
      });

      await leaveService.reviewLeaveRequest('hr-reviewer', 'leave-1', {
        action: 'APPROVE',
        reviewNote: 'Approved for valid reason',
      });

      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('Scenario 19 (Privacy): Leave Reason and Review Note Masking', () => {
    it('masks leave reasons for non-HR team viewers in getAllStaffsWithAttendance', async () => {
      // Non-HR viewer (e.g. Sales Team Lead)
      prisma.user.findUnique.mockResolvedValue({
        id: 'lead-user-1',
        userRoles: [{ role: { code: 'SALES_LEAD' } }],
        employee: { departmentId: 'dept-sales' },
      });
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-subordinate',
          businessId: 'EMP002',
          firstName: 'Alice',
          lastName: 'Smith',
          department: { id: 'dept-sales', name: 'Sales', code: 'SALES' },
          user: { id: 'user-subordinate', email: 'alice@example.com', status: 'ACTIVE', userRoles: [] },
          attendanceSessions: [],
        },
      ]);
      // Active leave with sensitive medical reason
      prisma.employeeLeaveRequest.findMany.mockResolvedValue([
        {
          id: 'leave-sensitive',
          employeeId: 'emp-subordinate',
          leaveType: 'SICK',
          startDate: '2026-10-22',
          endDate: '2026-10-22',
          reason: 'Confidential medical surgery recovery',
        },
      ]);
      prisma.employeeAttendanceLeaveUnlock.findMany.mockResolvedValue([]);

      const result = await attendanceService.getAllStaffsWithAttendance('lead-user-1');

      expect(result).toHaveLength(1);
      expect(result[0].isOnLeave).toBe(true);
      expect(result[0].todayLeave).toBeDefined();
      expect(result[0].todayLeave?.leaveType).toBe('SICK');
      // Sensitive medical reason must be masked to null!
      expect(result[0].todayLeave?.reason).toBeNull();
    });

    it('exposes full leave reason to HR viewers in getAllStaffsWithAttendance', async () => {
      // HR Manager viewer
      prisma.user.findUnique.mockResolvedValue({
        id: 'hr-user-1',
        userRoles: [{ role: { code: 'HR_MANAGER' } }],
        employee: { departmentId: 'dept-hr' },
      });
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-subordinate',
          businessId: 'EMP002',
          firstName: 'Alice',
          lastName: 'Smith',
          department: { id: 'dept-sales', name: 'Sales', code: 'SALES' },
          user: { id: 'user-subordinate', email: 'alice@example.com', status: 'ACTIVE', userRoles: [] },
          attendanceSessions: [],
        },
      ]);
      prisma.employeeLeaveRequest.findMany.mockResolvedValue([
        {
          id: 'leave-sensitive',
          employeeId: 'emp-subordinate',
          leaveType: 'SICK',
          startDate: '2026-10-22',
          endDate: '2026-10-22',
          reason: 'Confidential medical surgery recovery',
        },
      ]);
      prisma.employeeAttendanceLeaveUnlock.findMany.mockResolvedValue([]);

      const result = await attendanceService.getAllStaffsWithAttendance('hr-user-1');

      expect(result).toHaveLength(1);
      expect(result[0].isOnLeave).toBe(true);
      // HR Manager gets unmasked reason
      expect(result[0].todayLeave?.reason).toBe('Confidential medical surgery recovery');
    });

    it('masks reasons and review notes in getStaffDetail for non-HR viewers', async () => {
      // Non-HR viewer
      prisma.user.findUnique.mockResolvedValue({
        id: 'viewer-non-hr',
        userRoles: [{ role: { code: 'ACADEMIC_LEAD' } }],
      });
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-target',
        businessId: 'EMP003',
        firstName: 'Bob',
        lastName: 'Jones',
        department: { id: 'dept-acad', name: 'Academics' },
        user: { id: 'user-target', email: 'bob@example.com', status: 'ACTIVE', userRoles: [] },
        attendanceSessions: [],
      });
      prisma.employeeLeaveRequest.findMany
        .mockResolvedValueOnce([
          {
            id: 'leave-today',
            employeeId: 'emp-target',
            leaveType: 'CASUAL',
            startDate: '2026-10-22',
            endDate: '2026-10-22',
            reason: 'Private personal matters',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'leave-hist',
            employeeId: 'emp-target',
            leaveType: 'CASUAL',
            startDate: '2026-10-10',
            endDate: '2026-10-11',
            reason: 'Private therapy session',
            reviewNote: 'Private HR internal note',
          },
        ]);
      prisma.employeeAttendanceLeaveUnlock.findMany
        .mockResolvedValueOnce([
          {
            id: 'unlock-1',
            employeeId: 'emp-target',
            leaveRequestId: 'leave-today',
            calendarDate: '2026-10-22',
            reason: 'Special executive permission',
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await attendanceService.getStaffDetail('emp-target', 'viewer-non-hr');

      expect(result.isOnLeave).toBe(true);
      expect(result.todayLeave?.reason).toBeNull();
      expect(result.todayUnlock?.reason).toBeNull();
      expect(result.recentLeaves?.[0]?.reason).toBeNull();
      expect(result.recentLeaves?.[0]?.reviewNote).toBeNull();
    });

    it('allows an employee to see their own reasons and review notes in getStaffDetail', async () => {
      // Bob viewing Bob
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-bob',
        userRoles: [{ role: { code: 'TUTOR_OPS' } }],
      });
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-bob',
        businessId: 'EMP003',
        firstName: 'Bob',
        lastName: 'Jones',
        department: { id: 'dept-ops', name: 'Operations' },
        user: { id: 'user-bob', email: 'bob@example.com', status: 'ACTIVE', userRoles: [] },
        attendanceSessions: [],
      });
      prisma.employeeLeaveRequest.findMany
        .mockResolvedValueOnce([
          {
            id: 'leave-today',
            employeeId: 'emp-bob',
            leaveType: 'CASUAL',
            startDate: '2026-10-22',
            endDate: '2026-10-22',
            reason: 'My own family event',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'leave-hist',
            employeeId: 'emp-bob',
            leaveType: 'CASUAL',
            startDate: '2026-10-10',
            endDate: '2026-10-11',
            reason: 'My doctor appointment',
            reviewNote: 'Approved by HR',
          },
        ]);
      prisma.employeeAttendanceLeaveUnlock.findMany.mockResolvedValue([]);

      const result = await attendanceService.getStaffDetail('emp-bob', 'user-bob');

      // Bob can see his own reason and review notes
      expect(result.todayLeave?.reason).toBe('My own family event');
      expect(result.recentLeaves?.[0]?.reason).toBe('My doctor appointment');
      expect(result.recentLeaves?.[0]?.reviewNote).toBe('Approved by HR');
    });
  });
});
