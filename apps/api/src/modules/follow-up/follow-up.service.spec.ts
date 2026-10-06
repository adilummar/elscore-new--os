import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUES } from '../../common/queue/queue.constants';

import { FollowUpService } from './follow-up.service';

describe('FollowUpService', () => {
  let service: FollowUpService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockIdGen: any;
  let mockQueue: any;
  let mockConfig: any;

  beforeEach(async () => {
    mockPrisma = {
      lead: { findUnique: jest.fn(), update: jest.fn() },
      followUp: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      followUpRescheduleHistory: { create: jest.fn() },
      leadStatusHistory: { create: jest.fn() },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };
    mockAudit = { recordInTx: jest.fn() };
    mockIdGen = { nextIdInTx: jest.fn().mockResolvedValue('FUP-0001') };
    mockQueue = { add: jest.fn(), getJob: jest.fn() };
    mockConfig = { get: jest.fn().mockReturnValue('Asia/Kolkata') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowUpService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: IdGeneratorService, useValue: mockIdGen },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getQueueToken(QUEUES.DEADLINE_MONITOR), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FollowUpService>(FollowUpService);
  });

  describe('create', () => {
    it('creates follow-up successfully if no active exists', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead1', assignedToUserId: 'user1', isArchived: false });
      mockPrisma.followUp.findFirst.mockResolvedValue(null);
      mockPrisma.followUp.create.mockResolvedValue({ id: 'fup1', status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 1200000) });

      const res = await service.create('lead1', { scheduledAt: new Date(Date.now() + 1200000).toISOString() }, 'user1', false);
      expect(res.id).toBe('fup1');
      expect(mockPrisma.followUp.create).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledTimes(2); // reminder & overdue jobs
    });

    it('throws Forbidden if not lead owner', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead1', assignedToUserId: 'owner1' });
      await expect(service.create('lead1', { scheduledAt: '2026-01-01T10:00:00Z' }, 'other_user', false)).rejects.toThrow(ForbiddenException);
    });

    it('throws Conflict if active follow-up already exists', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead1', assignedToUserId: 'user1', isArchived: false });
      mockPrisma.followUp.findFirst.mockResolvedValue({ id: 'fup1', status: 'SCHEDULED', businessId: 'FUP-001' });

      await expect(service.create('lead1', { scheduledAt: '2026-01-01T10:00:00Z' }, 'user1', false)).rejects.toThrow(ConflictException);
    });
  });

  describe('complete', () => {
    it('completes follow-up and unsets requiresFollowUp if no next FUP', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead1', assignedToUserId: 'user1' });
      mockPrisma.followUp.findFirst.mockResolvedValueOnce({ id: 'fup1', status: 'SCHEDULED', leadId: 'lead1' }); // access check
      mockPrisma.followUp.findFirst.mockResolvedValueOnce(null); // other active check
      mockPrisma.followUp.update.mockResolvedValue({ id: 'fup1', status: 'COMPLETED' });

      await service.complete('lead1', 'fup1', { remarks: 'Completed notes' }, 'user1', false);

      expect(mockPrisma.followUp.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
      expect(mockPrisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({ data: { requiresFollowUp: false } }));
    });
  });

  describe('cross-counsellor visibility', () => {
    it('denies follow-ups on another counsellor lead', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead-b', assignedToUserId: 'counsellor-b', isArchived: false });
      mockPrisma.followUp.findMany.mockResolvedValue([]);

      await expect(service.findByLead('lead-b', 'counsellor-a', false, {})).rejects.toThrow(ForbiddenException);
      await expect(service.findAll('counsellor-a', false, { leadId: 'lead-b' })).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.followUp.findMany).not.toHaveBeenCalled();
    });

    it('scopes the follow-up list to the caller when they lack followup.read-all', async () => {
      mockPrisma.followUp.findMany.mockResolvedValue([]);
      await service.findAll('counsellor-a', false, {});
      expect(mockPrisma.followUp.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          lead: { assignedToUserId: 'counsellor-a' },
        }),
      }));
    });

    it('lets a Sales Head list follow-ups without an owner filter', async () => {
      mockPrisma.followUp.findMany.mockResolvedValue([]);
      await service.findAll('sales-head', true, {});
      const where = mockPrisma.followUp.findMany.mock.calls[0][0].where;
      expect(where.lead).toBeUndefined();
    });
  });
});
