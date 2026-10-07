import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceSessionStatus, MissedCheckoutCaseStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { MissedCheckoutService } from './missed-checkout.service';

describe('MissedCheckoutService', () => {
  let prisma: any;
  let audit: { recordInTx: jest.Mock };
  let service: MissedCheckoutService;

  const openSession = {
    id: 'session-1',
    employeeId: 'employee-1',
    calendarDate: '2026-10-05',
    scheduleSnapshot: {
      startTime: '09:00',
      endTime: '18:00',
      timezone: 'Asia/Kolkata',
    },
    status: AttendanceSessionStatus.ACTIVE,
    breakDurationMinutes: 0,
    events: [
      {
        id: 'event-in',
        eventType: 'CHECK_IN',
        timestamp: new Date('2026-10-05T03:30:00.000Z'),
      },
    ],
  };

  beforeEach(() => {
    audit = { recordInTx: jest.fn() };
    prisma = {
      $executeRaw: jest.fn(),
      $transaction: jest.fn((callback: (tx: any) => unknown) => callback(prisma)),
      employeeAttendanceSession: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(openSession),
        update: jest.fn().mockResolvedValue({}),
      },
      employeeAttendanceEvent: {},
      employeeMissedCheckoutCase: {
        upsert: jest.fn().mockResolvedValue({ id: 'case-1' }),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      globalWorkingSchedule: { findFirst: jest.fn().mockResolvedValue(null) },
      employee: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    service = new MissedCheckoutService(
      prisma as PrismaService,
      audit as unknown as AuditService,
      { get: jest.fn().mockReturnValue('Asia/Kolkata') } as unknown as ConfigService,
    );
  });

  it('auto-closes an open session and caps credit at scheduled end', async () => {
    const executedAt = new Date('2026-10-05T18:29:59.999Z');

    await expect(service.autoCloseSessionInTx(prisma, 'session-1', executedAt)).resolves.toBe(true);

    expect(prisma.employeeAttendanceSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        status: AttendanceSessionStatus.AUTO_CHECKED_OUT,
        grossDurationMinutes: 540,
        netDurationMinutes: 540,
        events: {
          create: [
            {
              eventType: 'AUTO_CHECK_OUT',
              timestamp: new Date('2026-10-05T12:30:00.000Z'),
            },
          ],
        },
      }),
    });
    expect(prisma.employeeMissedCheckoutCase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'session-1' },
        create: expect.objectContaining({
          employeeId: 'employee-1',
          status: MissedCheckoutCaseStatus.REQUIRED,
        }),
      }),
    );
    expect(audit.recordInTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'ATTENDANCE_AUTO_CLOSED',
        metadata: expect.objectContaining({
          effectiveCheckoutAt: '2026-10-05T12:30:00.000Z',
          autoCloseExecutedAt: executedAt.toISOString(),
          scheduleMissing: false,
        }),
      }),
    );
  });

  it('does not touch an attendance that was already checked out', async () => {
    prisma.employeeAttendanceSession.findUnique.mockResolvedValue({
      ...openSession,
      status: AttendanceSessionStatus.COMPLETED,
    });

    await expect(
      service.autoCloseSessionInTx(prisma, 'session-1', new Date()),
    ).resolves.toBe(false);

    expect(prisma.employeeAttendanceSession.update).not.toHaveBeenCalled();
    expect(prisma.employeeMissedCheckoutCase.upsert).not.toHaveBeenCalled();
    expect(audit.recordInTx).not.toHaveBeenCalled();
  });

  it('awards zero credit when no authoritative schedule exists', async () => {
    prisma.employeeAttendanceSession.findUnique.mockResolvedValue({
      ...openSession,
      scheduleSnapshot: {},
    });

    await service.autoCloseSessionInTx(prisma, 'session-1', new Date());

    expect(prisma.employeeAttendanceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grossDurationMinutes: 0,
          netDurationMinutes: 0,
          events: {
            create: [
              {
                eventType: 'AUTO_CHECK_OUT',
                timestamp: new Date('2026-10-05T03:30:00.000Z'),
              },
            ],
          },
        }),
      }),
    );
    expect(audit.recordInTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        metadata: expect.objectContaining({ scheduleMissing: true }),
      }),
    );
  });

  it('blocks check-in with a stable code while a case is unresolved', async () => {
    prisma.employeeMissedCheckoutCase.findFirst.mockResolvedValue({
      id: 'case-1',
      status: MissedCheckoutCaseStatus.REJECTED,
      session: { calendarDate: '2026-10-05' },
    });

    try {
      await service.assertNoUnresolvedInTx(prisma, 'employee-1');
      throw new Error('Expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual(expect.objectContaining({
        code: 'MISSED_CHECKOUT_APPROVAL_REQUIRED',
        details: {
          missedCheckoutCaseId: 'case-1',
          attendanceDate: '2026-10-05',
          status: MissedCheckoutCaseStatus.REJECTED,
        },
      }));
    }
  });

  it('allows a rejected employee to resubmit their own request', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' });
    prisma.employeeMissedCheckoutCase.findUnique.mockResolvedValue({
      id: 'case-1',
      employeeId: 'employee-1',
      sessionId: 'session-1',
      status: MissedCheckoutCaseStatus.REJECTED,
    });
    prisma.employeeMissedCheckoutCase.update.mockResolvedValue({
      id: 'case-1',
      status: MissedCheckoutCaseStatus.REQUESTED,
      requestedAt: new Date(),
    });

    await service.requestApproval('user-1', 'case-1');

    expect(prisma.employeeMissedCheckoutCase.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: expect.objectContaining({
        status: MissedCheckoutCaseStatus.REQUESTED,
        rejectionReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
      }),
    });
    expect(audit.recordInTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ action: 'MISSED_CHECKOUT_APPROVAL_RESUBMITTED' }),
    );
  });

  it('makes a duplicate pending request idempotent', async () => {
    const pending = {
      id: 'case-1',
      employeeId: 'employee-1',
      status: MissedCheckoutCaseStatus.REQUESTED,
    };
    prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' });
    prisma.employeeMissedCheckoutCase.findUnique.mockResolvedValue(pending);

    await expect(service.requestApproval('user-1', 'case-1')).resolves.toBe(pending);

    expect(prisma.employeeMissedCheckoutCase.update).not.toHaveBeenCalled();
    expect(audit.recordInTx).not.toHaveBeenCalled();
  });

  it('keeps Sales Head management within their department', async () => {
    prisma.user.findUnique.mockResolvedValue({
      employee: { departmentId: 'sales' },
      userRoles: [{ role: { code: 'SALES_HEAD' } }],
    });
    prisma.employeeMissedCheckoutCase.findUnique.mockResolvedValue({
      id: 'case-1',
      employeeId: 'employee-2',
      sessionId: 'session-1',
      status: MissedCheckoutCaseStatus.REQUESTED,
      employee: { userId: 'user-2', departmentId: 'finance' },
    });

    await expect(service.approve('head-1', 'case-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.employeeMissedCheckoutCase.update).not.toHaveBeenCalled();
  });

  it('approves without rewriting historical attendance', async () => {
    prisma.user.findUnique.mockResolvedValue({
      employee: null,
      userRoles: [{ role: { code: 'CEO' } }],
    });
    prisma.employeeMissedCheckoutCase.findUnique.mockResolvedValue({
      id: 'case-1',
      employeeId: 'employee-1',
      sessionId: 'session-1',
      status: MissedCheckoutCaseStatus.REQUESTED,
      employee: { userId: 'user-1', departmentId: 'sales' },
    });
    prisma.employeeMissedCheckoutCase.update.mockResolvedValue({
      id: 'case-1',
      status: MissedCheckoutCaseStatus.APPROVED,
      reviewedAt: new Date(),
    });

    await service.approve('ceo-1', 'case-1');

    expect(prisma.employeeMissedCheckoutCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MissedCheckoutCaseStatus.APPROVED }),
      }),
    );
    expect(prisma.employeeAttendanceSession.update).not.toHaveBeenCalled();
    expect(audit.recordInTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ action: 'MISSED_CHECKOUT_APPROVED' }),
    );
  });

  it('explicitly resolves without rewriting historical attendance', async () => {
    prisma.user.findUnique.mockResolvedValue({
      employee: null,
      userRoles: [{ role: { code: 'CEO' } }],
    });
    prisma.employeeMissedCheckoutCase.findUnique.mockResolvedValue({
      id: 'case-1',
      employeeId: 'employee-1',
      sessionId: 'session-1',
      status: MissedCheckoutCaseStatus.REJECTED,
      employee: { userId: 'user-1', departmentId: 'sales' },
    });
    prisma.employeeMissedCheckoutCase.update.mockResolvedValue({
      id: 'case-1',
      status: MissedCheckoutCaseStatus.RESOLVED,
      resolvedAt: new Date(),
      resolvedByUserId: 'ceo-1',
    });

    await service.resolve('ceo-1', 'case-1');

    expect(prisma.employeeAttendanceSession.update).not.toHaveBeenCalled();
    expect(audit.recordInTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ action: 'MISSED_CHECKOUT_RESOLVED' }),
    );
  });
});
