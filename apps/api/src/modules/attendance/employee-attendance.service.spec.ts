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
            employee: { findUnique: jest.fn() },
            employeeAttendanceSession: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            globalWorkingSchedule: { findFirst: jest.fn() },
            employeeAttendanceEvent: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
            employeeAttendanceCorrection: { create: jest.fn() }
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

});
