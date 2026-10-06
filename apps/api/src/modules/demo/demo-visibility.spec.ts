import { ForbiddenException } from '@nestjs/common';

import { DemoService } from './demo.service';

describe('Demo lead ownership', () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  function serviceFor(permissions: string[]) {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      requirement: { findUnique: jest.fn() },
      student: { findUnique: jest.fn() },
      demo: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'demo-1' }),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: (client: any) => Promise<unknown>) => fn(tx)),
      demo: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const rbac = {
      hasPermissions: jest.fn((_userId: string, codes: string[]) => codes.every((code) => permissions.includes(code))),
    };
    const service = new DemoService(
      prisma,
      { recordInTx: jest.fn() } as any,
      { nextIdInTx: jest.fn().mockResolvedValue('DMO-0001') } as any,
      rbac as any,
      { add: jest.fn() } as any,
    );
    return { service, tx, prisma, rbac };
  }

  it('denies a counsellor booking a demo on another counsellor’s student', async () => {
    const { service, tx } = serviceFor(['demo.book', 'demo.read']);
    tx.requirement.findUnique.mockResolvedValue({
      studentId: 'student-b',
      subjectId: 'math',
      curriculumId: 'cbse',
      gradeId: 'grade-5',
      student: { lead: { assignedToUserId: 'counsellor-b' } },
    });

    await expect(service.bookDemo({
      studentId: 'student-b',
      requirementId: 'req-b',
      scheduledAt: future,
      durationMinutes: 30,
    }, { id: 'counsellor-a', email: 'a@example.com' } as any)).rejects.toThrow(ForbiddenException);

    expect(tx.demo.create).not.toHaveBeenCalled();
  });

  it('lets a counsellor book a demo for their own lead and lets Sales Head book either', async () => {
    const own = serviceFor(['demo.book']);
    own.tx.requirement.findUnique.mockResolvedValue({
      studentId: 'student-a',
      subjectId: 'math',
      curriculumId: 'cbse',
      gradeId: 'grade-5',
      student: { lead: { assignedToUserId: 'counsellor-a' } },
    });
    await own.service.bookDemo({
      studentId: 'student-a',
      requirementId: 'req-a',
      scheduledAt: future,
      durationMinutes: 30,
    }, { id: 'counsellor-a', email: 'a@example.com' } as any);
    expect(own.tx.demo.create).toHaveBeenCalled();

    const head = serviceFor(['demo.manage_team']);
    head.tx.requirement.findUnique.mockResolvedValue({
      studentId: 'student-b',
      subjectId: 'math',
      curriculumId: 'cbse',
      gradeId: 'grade-5',
      student: { lead: { assignedToUserId: 'counsellor-b' } },
    });
    await head.service.bookDemo({
      studentId: 'student-b',
      requirementId: 'req-b',
      scheduledAt: future,
      durationMinutes: 30,
    }, { id: 'sales-head', email: 'head@example.com' } as any);
    expect(head.tx.demo.create).toHaveBeenCalled();
  });

  it('scopes the demo list to the caller’s assigned leads unless they manage the team', async () => {
    const counsellor = serviceFor(['demo.read']);
    await counsellor.service.getDemos({ id: 'counsellor-a', email: 'a@example.com' } as any);
    expect(counsellor.prisma.demo.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        student: { lead: { assignedToUserId: 'counsellor-a' } },
      },
    }));

    const head = serviceFor(['demo.manage_team']);
    await head.service.getDemos({ id: 'sales-head', email: 'head@example.com' } as any);
    expect(head.prisma.demo.findMany.mock.calls[0][0].where).toEqual({});
  });
});
