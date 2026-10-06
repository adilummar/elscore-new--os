import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { AuditContext } from '../../common/audit/audit.context';
import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { StudentService } from './student.service';

const REASON = 'Created by mistake';

function eligibleStudent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'student-1',
    businessId: 'STU-0001',
    leadId: 'lead-1',
    firstName: 'Amina',
    lastName: 'Khan',
    notes: 'private note',
    enrollmentState: 'PENDING',
    ...overrides,
  };
}

describe('StudentService.deleteStudent', () => {
  let service: StudentService;
  let mockPrisma: any;
  let committed: boolean;

  beforeEach(async () => {
    committed = false;
    mockPrisma = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({ assignedToUserId: 'head-1' }),
        delete: jest.fn(),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue(eligibleStudent()),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn(),
      },
      requirement: {
        count: jest.fn().mockResolvedValue(2),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      demo: { count: jest.fn().mockResolvedValue(0), delete: jest.fn(), deleteMany: jest.fn() },
      quotation: { count: jest.fn().mockResolvedValue(0), delete: jest.fn(), deleteMany: jest.fn() },
      invoice: { count: jest.fn().mockResolvedValue(0), delete: jest.fn(), deleteMany: jest.fn() },
      targetCreditLedger: { count: jest.fn().mockResolvedValue(0), delete: jest.fn(), deleteMany: jest.fn() },
      studentAttendance: { count: jest.fn().mockResolvedValue(0), delete: jest.fn(), deleteMany: jest.fn() },
      followUp: { count: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
      curriculum: { delete: jest.fn(), deleteMany: jest.fn() },
      grade: { delete: jest.fn(), deleteMany: jest.fn() },
      subject: { delete: jest.fn(), deleteMany: jest.fn() },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'student-1' }]),
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        try {
          const result = await callback(mockPrisma);
          committed = true;
          return result;
        } catch (error) {
          committed = false;
          throw error;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: new AuditService(mockPrisma) },
        { provide: IdGeneratorService, useValue: {} },
      ],
    }).compile();

    service = module.get(StudentService);
  });

  async function expectBlocked(blockers: string[], message: RegExp) {
    await expect(service.deleteStudent('student-1', REASON, 'head-1', true)).rejects.toBeInstanceOf(ConflictException);
    try {
      await service.deleteStudent('student-1', REASON, 'head-1', true);
    } catch (error) {
      const body = (error as ConflictException).getResponse() as {
        code: string;
        message: string;
        blockers: string[];
      };
      expect(body.code).toBe('STUDENT_IN_USE');
      expect(body.blockers).toEqual(blockers);
      expect(body.message).toMatch(message);
      expect(body.message).not.toMatch(/prisma|P2003|foreign key/i);
    }
    expect(mockPrisma.student.delete).not.toHaveBeenCalled();
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
    expect(committed).toBe(false);
  }

  it('lets a Sales Head delete an unused pending student and audits the deletion', async () => {
    await service.deleteStudent('student-1', REASON, 'head-1', true);

    expect(committed).toBe(true);
    expect(mockPrisma.student.delete).toHaveBeenCalledWith({ where: { id: 'student-1' } });
    expect(mockPrisma.requirement.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.lead.delete).not.toHaveBeenCalled();
    const data = mockPrisma.auditEvent.create.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({
      entityType: 'Student',
      entityId: 'student-1',
      action: 'DELETE',
      actorUserId: 'head-1',
      reason: REASON,
    }));
    expect(data.metadata).toEqual({
      businessId: 'STU-0001',
      leadId: 'lead-1',
      displayName: 'Amina Khan',
      enrollmentState: 'PENDING',
      requirementCount: 2,
    });
    expect(data.newValue).toEqual(data.metadata);
    expect(JSON.stringify(data)).not.toContain('private note');
    expect(data.metadata.reason).toBeUndefined();
  });

  it('lets a CEO with lead read-all delete an unused pending student', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ assignedToUserId: 'someone-else' });

    await service.deleteStudent('student-1', REASON, 'ceo-1', true);

    expect(mockPrisma.student.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditEvent.create.mock.calls[0][0].data.actorUserId).toBe('ceo-1');
  });

  it('rejects a caller who cannot access the parent lead', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ assignedToUserId: 'other-owner' });

    await expect(service.deleteStudent('student-1', REASON, 'counsellor-1', false)).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.student.delete).not.toHaveBeenCalled();
  });

  it('deletes a pending student who only has requirements and leaves reference data', async () => {
    mockPrisma.requirement.count.mockResolvedValue(3);

    await service.deleteStudent('student-1', REASON, 'head-1', true);

    expect(mockPrisma.student.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.requirement.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.curriculum.delete).not.toHaveBeenCalled();
    expect(mockPrisma.grade.delete).not.toHaveBeenCalled();
    expect(mockPrisma.subject.delete).not.toHaveBeenCalled();
    expect(mockPrisma.auditEvent.create.mock.calls[0][0].data.metadata.requirementCount).toBe(3);
  });

  it('blocks a student with a demo', async () => {
    mockPrisma.demo.count.mockResolvedValue(1);
    await expectBlocked(['DEMO'], /demos/);
    expect(mockPrisma.demo.count).toHaveBeenCalledWith({ where: { studentId: 'student-1' } });
    expect(mockPrisma.demo.delete).not.toHaveBeenCalled();
  });

  it('blocks a student whose only demo is cancelled or completed', async () => {
    mockPrisma.demo.count.mockResolvedValue(1);
    await expectBlocked(['DEMO'], /demos/);
    expect(mockPrisma.demo.count.mock.calls[0][0].where).toEqual({ studentId: 'student-1' });
    expect(mockPrisma.demo.count.mock.calls[0][0].where.status).toBeUndefined();
  });

  it('blocks a student with a quotation', async () => {
    mockPrisma.quotation.count.mockResolvedValue(1);
    await expectBlocked(['QUOTATION'], /quotations/);
    expect(mockPrisma.quotation.delete).not.toHaveBeenCalled();
  });

  it('blocks a student with an invoice', async () => {
    mockPrisma.invoice.count.mockResolvedValue(1);
    await expectBlocked(['INVOICE'], /invoices/);
    expect(mockPrisma.invoice.delete).not.toHaveBeenCalled();
  });

  it('blocks a student with target credit ledger entries', async () => {
    mockPrisma.targetCreditLedger.count.mockResolvedValue(1);
    await expectBlocked(['TARGET_CREDIT'], /sales target credits/);
  });

  it('blocks a student with attendance', async () => {
    mockPrisma.studentAttendance.count.mockResolvedValue(1);
    await expectBlocked(['ATTENDANCE'], /attendance records/);
  });

  it('names every record blocker that is present', async () => {
    mockPrisma.demo.count.mockResolvedValue(1);
    mockPrisma.quotation.count.mockResolvedValue(2);
    await expectBlocked(['DEMO', 'QUOTATION'], /existing demos and quotations/);
  });

  it('blocks an enrolled student', async () => {
    mockPrisma.student.findUnique.mockResolvedValue(eligibleStudent({ enrollmentState: 'ENROLLED' }));
    await expectBlocked(['ENROLLED'], /enrolled/);
  });

  it('blocks a student marked not enrolling', async () => {
    mockPrisma.student.findUnique.mockResolvedValue(eligibleStudent({ enrollmentState: 'NOT_ENROLLING' }));
    await expectBlocked(['NOT_ENROLLING'], /not enrolling/);
  });

  it('deletes an otherwise unused student when the lead has follow-ups', async () => {
    await service.deleteStudent('student-1', REASON, 'head-1', true);

    expect(mockPrisma.followUp.count).not.toHaveBeenCalled();
    expect(mockPrisma.followUp.delete).not.toHaveBeenCalled();
    expect(mockPrisma.lead.delete).not.toHaveBeenCalled();
    expect(mockPrisma.student.delete).toHaveBeenCalledTimes(1);
  });

  it('removes only the selected student when a lead has siblings', async () => {
    await service.deleteStudent('student-1', REASON, 'head-1', true);

    expect(mockPrisma.student.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.student.delete).toHaveBeenCalledWith({ where: { id: 'student-1' } });
    expect(mockPrisma.student.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.requirement.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.lead.delete).not.toHaveBeenCalled();
  });

  it('records the real CEO actor and God View target', async () => {
    await AuditContext.run({ realActorId: 'ceo-1', isGodView: true }, () =>
      service.deleteStudent('student-1', REASON, 'head-1', true),
    );

    const data = mockPrisma.auditEvent.create.mock.calls[0][0].data;
    expect(data.actorUserId).toBe('ceo-1');
    expect(data.metadata.godViewTargetId).toBe('head-1');
    expect(data.metadata.leadId).toBe('lead-1');
    expect(data.reason).toBe(REASON);
  });

  it('rolls the deletion back when the audit insert fails', async () => {
    mockPrisma.auditEvent.create.mockRejectedValue(new Error('audit failed'));

    await expect(service.deleteStudent('student-1', REASON, 'head-1', true)).rejects.toThrow('audit failed');
    expect(committed).toBe(false);
    expect(mockPrisma.student.delete).toHaveBeenCalledTimes(1);
  });

  it('returns 404 and writes no audit when the student is already gone', async () => {
    mockPrisma.student.findUnique.mockResolvedValueOnce(null);

    await expect(service.deleteStudent('student-1', REASON, 'head-1', true)).rejects.toThrow(NotFoundException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the locked row disappears before deletion', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.deleteStudent('student-1', REASON, 'head-1', true)).rejects.toThrow(NotFoundException);
    expect(mockPrisma.student.delete).not.toHaveBeenCalled();
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
    expect(committed).toBe(false);
  });

  it('turns a foreign-key race into a safe conflict and does not audit', async () => {
    mockPrisma.student.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: '5.19.1' }),
    );

    try {
      await service.deleteStudent('student-1', REASON, 'head-1', true);
      throw new Error('expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as { code: string; blockers: string[]; message: string };
      expect(body.code).toBe('STUDENT_IN_USE');
      expect(body.blockers).toEqual([]);
      expect(body.message).toMatch(/related business records/);
      expect(body.message).not.toContain('fk');
    }
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
    expect(committed).toBe(false);
  });

  it('locks the student before checking dependencies and deleting', async () => {
    const order: string[] = [];
    mockPrisma.$queryRaw.mockImplementation(() => {
      order.push('lock');
      return [{ id: 'student-1' }];
    });
    for (const model of ['demo', 'quotation', 'invoice', 'targetCreditLedger', 'studentAttendance'] as const) {
      mockPrisma[model].count.mockImplementation(() => {
        order.push('check');
        return 0;
      });
    }
    mockPrisma.student.delete.mockImplementation(() => {
      order.push('delete');
      return {};
    });
    mockPrisma.auditEvent.create.mockImplementation(() => {
      order.push('audit');
      return { id: 'audit-1' };
    });

    await service.deleteStudent('student-1', REASON, 'head-1', true);

    expect(order[0]).toBe('lock');
    expect(order.indexOf('delete')).toBeGreaterThan(order.lastIndexOf('check'));
    expect(order.indexOf('audit')).toBeGreaterThan(order.indexOf('delete'));
    expect(committed).toBe(true);
  });
});
