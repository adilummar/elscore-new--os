import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { StudentService } from './student.service';

describe('StudentService.saveBundle', () => {
  let service: StudentService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({ assignedToUserId: 'owner-1' }),
      },
      student: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      requirement: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((cb: any) => cb(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { recordInTx: jest.fn() } },
        { provide: IdGeneratorService, useValue: { nextIdInTx: jest.fn().mockResolvedValue('STU-1') } },
      ],
    }).compile();

    service = module.get(StudentService);
  });

  it('rejects updating a student that belongs to a different lead', async () => {
    mockPrisma.student.findUnique.mockResolvedValue({
      id: 'foreign-student',
      leadId: 'other-lead',
    });

    await expect(
      service.saveBundle('requested-lead', 'foreign-student', { firstName: 'X' }, 'owner-1', false),
    ).rejects.toThrow(ForbiddenException);

    expect(mockPrisma.student.update).not.toHaveBeenCalled();
    expect(mockPrisma.requirement.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a missing student id', async () => {
    mockPrisma.student.findUnique.mockResolvedValue(null);

    await expect(
      service.saveBundle('requested-lead', 'missing-student', { firstName: 'X' }, 'owner-1', false),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates when the student belongs to the requested lead', async () => {
    mockPrisma.student.findUnique.mockResolvedValue({
      id: 'own-student',
      leadId: 'requested-lead',
    });
    mockPrisma.student.update.mockResolvedValue({ id: 'own-student', leadId: 'requested-lead' });

    await service.saveBundle('requested-lead', 'own-student', { firstName: 'Aisha' }, 'owner-1', false);

    expect(mockPrisma.student.update).toHaveBeenCalledWith({
      where: { id: 'own-student' },
      data: { firstName: 'Aisha' },
    });
  });
});
