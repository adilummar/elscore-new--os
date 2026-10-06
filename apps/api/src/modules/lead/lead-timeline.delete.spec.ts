import { Test, TestingModule } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RoundRobinService } from '../round-robin/round-robin.service';

import { LeadService } from './lead.service';

describe('LeadService.getTimeline deleted student', () => {
  it('includes a student deletion audit after the student row is gone', async () => {
    const auditEvent = {
      id: 'audit-1',
      action: 'DELETE',
      timestamp: new Date('2026-10-06T00:00:00.000Z'),
      entityType: 'Student',
      newValue: {
        businessId: 'STU-0001',
        leadId: 'lead-1',
        displayName: 'Amina Khan',
        enrollmentState: 'PENDING',
        requirementCount: 1,
      },
      actor: { username: 'ceo', employee: null },
    };
    const prisma = {
      lead: {
        findUnique: jest.fn().mockImplementation(({ include }: { include?: unknown }) => {
          if (!include) return { assignedToUserId: 'head-1' };
          return { id: 'lead-1', students: [], invoices: [], followUps: [{ id: 'follow-1' }] };
        }),
      },
      auditEvent: {
        findMany: jest.fn().mockResolvedValue([auditEvent]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: {} },
        { provide: IdGeneratorService, useValue: {} },
        { provide: RoundRobinService, useValue: {} },
      ],
    }).compile();

    const timeline = await module.get(LeadService).getTimeline('lead-1', 'head-1', true);

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { entityId: { in: ['lead-1', 'follow-1'] } },
          {
            entityType: 'Student',
            action: 'DELETE',
            metadata: { path: ['leadId'], equals: 'lead-1' },
          },
        ],
      },
    }));
    expect(timeline).toEqual([
      expect.objectContaining({
        id: 'audit-1',
        type: 'DELETE',
        entityType: 'Student',
        metadata: auditEvent.newValue,
      }),
    ]);
    expect(JSON.stringify(timeline)).not.toContain('Created by mistake');
  });
});
