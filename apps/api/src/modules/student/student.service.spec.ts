import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MentoringHandoverService } from '../mentoring/mentoring-handover.service';

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
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((cb: any) => cb(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { recordInTx: jest.fn() } },
        { provide: IdGeneratorService, useValue: { nextIdInTx: jest.fn().mockResolvedValue('STU-1') } },
        {
          provide: MentoringHandoverService,
          useValue: {
            assertStudentEditableBySales: jest.fn().mockResolvedValue(undefined),
            ensureHandoverIfEnrolledInTx: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get(StudentService);
  });

  it('denies a counsellor reading a student reached through another counsellor lead', async () => {
    mockPrisma.student.findUnique.mockResolvedValue({
      id: 'student-b',
      leadId: 'lead-b',
      requirements: [],
    });
    mockPrisma.lead.findUnique.mockResolvedValue({ assignedToUserId: 'counsellor-b' });

    await expect(service.findOne('student-b', 'counsellor-a', false)).rejects.toThrow(ForbiddenException);
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

describe('StudentService Mentoring handover rules', () => {
  let service: StudentService;
  let mockPrisma: any;
  let handover: { assertStudentEditableBySales: jest.Mock; ensureHandoverIfEnrolledInTx: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      lead: { findUnique: jest.fn().mockResolvedValue({ assignedToUserId: 'owner-1' }) },
      student: {
        findUnique: jest.fn().mockResolvedValue({ id: 'stu-1', leadId: 'lead-1' }),
        update: jest.fn().mockResolvedValue({ id: 'stu-1', leadId: 'lead-1' }),
        create: jest.fn().mockResolvedValue({ id: 'stu-2', leadId: 'lead-1' }),
      },
      requirement: {
        findUnique: jest.fn().mockResolvedValue({ id: 'req-1', studentId: 'stu-1', student: { leadId: 'lead-1' } }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'req-2' }),
        update: jest.fn().mockResolvedValue({ id: 'req-1' }),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((cb: any) => cb(mockPrisma)),
    };
    handover = {
      assertStudentEditableBySales: jest.fn().mockResolvedValue(undefined),
      ensureHandoverIfEnrolledInTx: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { recordInTx: jest.fn() } },
        { provide: IdGeneratorService, useValue: { nextIdInTx: jest.fn().mockResolvedValue('X-1') } },
        { provide: MentoringHandoverService, useValue: handover },
      ],
    }).compile();
    service = module.get(StudentService);
  });

  const locked = () =>
    handover.assertStudentEditableBySales.mockRejectedValue(new ForbiddenException('handed over'));

  it('hands over automatically after a requirement is added (idempotent hook)', async () => {
    await service.createRequirement('stu-1', { subjectId: 's', curriculumId: 'c', gradeId: 'g' }, 'owner-1', false);

    expect(handover.ensureHandoverIfEnrolledInTx).toHaveBeenCalledWith(mockPrisma, 'lead-1', 'owner-1');
  });

  it('hands over automatically after a bundle save for a new student', async () => {
    await service.saveBundle('lead-1', null, { firstName: 'A', subjectIds: [] }, 'owner-1', false);

    expect(handover.ensureHandoverIfEnrolledInTx).toHaveBeenCalledWith(mockPrisma, 'lead-1', 'owner-1');
  });

  it('does not hand over when only a student without subjects is created via POST /students', async () => {
    await service.create({ leadId: 'lead-1', firstName: 'A' }, 'owner-1', false);

    expect(handover.ensureHandoverIfEnrolledInTx).not.toHaveBeenCalled();
  });

  it('blocks Sales from updating a handed-over student', async () => {
    locked();
    await expect(service.update('stu-1', { firstName: 'B' } as any, 'owner-1', false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mockPrisma.student.update).not.toHaveBeenCalled();
  });

  it('blocks Sales from adding a requirement to a handed-over student', async () => {
    locked();
    await expect(
      service.createRequirement('stu-1', { subjectId: 's', curriculumId: 'c', gradeId: 'g' } as any, 'owner-1', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.requirement.create).not.toHaveBeenCalled();
  });

  it('blocks Sales from editing a requirement of a handed-over student', async () => {
    locked();
    await expect(service.updateRequirement('req-1', {} as any, 'owner-1', false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mockPrisma.requirement.update).not.toHaveBeenCalled();
  });

  it('blocks the bundle save (including removing subjects) for a handed-over student', async () => {
    locked();
    await expect(
      service.saveBundle('lead-1', 'stu-1', { firstName: 'A', subjectIds: [] }, 'owner-1', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.requirement.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.student.update).not.toHaveBeenCalled();
  });
});
