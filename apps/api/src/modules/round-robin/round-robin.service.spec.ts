import { Test, TestingModule } from '@nestjs/testing';
import { RoundRobinDailyState } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { RoundRobinService } from './round-robin.service';


describe('RoundRobinService', () => {
  let service: RoundRobinService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((cb) => cb(prisma)),
      $executeRaw: jest.fn(),
      roundRobinState: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      roundRobinCounsellorState: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
      leadStatusHistory: {
        findFirst: jest.fn(),
      },
    };

    audit = { recordInTx: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoundRobinService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<RoundRobinService>(RoundRobinService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Algorithm Verification', () => {
    it('returns null if paused', async () => {
      prisma.roundRobinState.findUnique.mockResolvedValue({ id: 'singleton', isPaused: true, assignmentSequence: 5 });
      const nextUser = await service.getNextAssignee(prisma);
      expect(nextUser.userId).toBeNull();
    });

    it('returns null if no eligible active counsellors', async () => {
      prisma.roundRobinState.findUnique.mockResolvedValue({ id: 'singleton', isPaused: false, assignmentSequence: 5 });
      prisma.roundRobinCounsellorState.findMany.mockResolvedValue([]);
      const nextUser = await service.getNextAssignee(prisma);
      expect(nextUser.userId).toBeNull();
    });

    it('returns the next counsellor in sequence', async () => {
      prisma.roundRobinState.findUnique.mockResolvedValue({ id: 'singleton', isPaused: false, lastAssignedUserId: 'user-a', assignmentSequence: 5 });
      prisma.roundRobinCounsellorState.findMany.mockResolvedValue([
        { userId: 'user-a', lastReturnedAt: null },
        { userId: 'user-b', lastReturnedAt: null },
        { userId: 'user-c', lastReturnedAt: null },
      ]);
      prisma.roundRobinState.update.mockResolvedValue({ assignmentSequence: 6 });

      const nextUser = await service.getNextAssignee(prisma);
      expect(nextUser.userId).toBe('user-b');
      expect(prisma.roundRobinState.update).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        data: { lastAssignedUserId: 'user-b', assignmentSequence: { increment: 1 } },
      });
    });

    it('gives priority to returning counsellor', async () => {
      prisma.roundRobinState.findUnique.mockResolvedValue({ id: 'singleton', isPaused: false, lastAssignedUserId: 'user-c', assignmentSequence: 5 });
      
      const pastTime = new Date(Date.now() - 10000);
      const recentTime = new Date();
      
      prisma.roundRobinCounsellorState.findMany.mockResolvedValue([
        { userId: 'user-a', lastReturnedAt: null },
        { userId: 'user-b', lastReturnedAt: pastTime }, // Earliest return
        { userId: 'user-c', lastReturnedAt: recentTime },
      ]);
      prisma.roundRobinState.update.mockResolvedValue({ assignmentSequence: 6 });

      const nextUser = await service.getNextAssignee(prisma);
      expect(nextUser.userId).toBe('user-b');
      expect(prisma.roundRobinCounsellorState.update).toHaveBeenCalledWith({
        where: { userId: 'user-b' },
        data: { lastReturnedAt: null },
      });
    });
  });

  describe('Authorization Rules Enforcement', () => {
    it('blocks setting INACTIVE_FULL_DAY if leads worked today', async () => {
      prisma.leadStatusHistory.findFirst.mockResolvedValue({ id: 'history-1' });

      await expect(
        service.updateCounsellor('user-1', { dailyState: RoundRobinDailyState.INACTIVE_FULL_DAY }, 'actor-1')
      ).rejects.toThrow('Cannot set Full Day inactivity. Counsellor has already worked a Lead today.');
    });

    it('allows setting INACTIVE_FULL_DAY if NO leads worked today', async () => {
      prisma.leadStatusHistory.findFirst.mockResolvedValue(null);
      prisma.roundRobinCounsellorState.upsert.mockResolvedValue({ userId: 'user-1' });

      await service.updateCounsellor('user-1', { dailyState: RoundRobinDailyState.INACTIVE_FULL_DAY }, 'actor-1');
      expect(prisma.roundRobinCounsellorState.upsert).toHaveBeenCalled();
    });
  });
});
