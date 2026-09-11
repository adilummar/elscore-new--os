import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication , Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QueueModule } from '../src/common/queue/queue.module';
import { DemoService } from '../src/modules/demo/demo.service';

@Module({})
class MockQueueModule {}

// Mock BullMQ completely
jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      close: jest.fn(),
    })),
    Worker: jest.fn().mockImplementation(() => ({
      close: jest.fn(),
    })),
    QueueEvents: jest.fn(),
  };
});

describe('DemoModule Concurrency (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let prisma: PrismaService;
  let demoService: DemoService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(QueueModule).useModule(MockQueueModule)
      .overrideProvider(CACHE_MANAGER).useValue({
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
      })
      .overrideProvider(getQueueToken('notifications')).useValue({
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    demoService = app.get(DemoService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Blocks overlapping concurrent Demo bookings', async () => {
    const user = await prisma.user.findFirstOrThrow();
    const subject = await prisma.subject.findFirstOrThrow();
    const grade = await prisma.grade.findFirstOrThrow();
    const curriculum = await prisma.curriculum.findFirstOrThrow();

    const lead = await prisma.lead.upsert({
      where: { businessId: 'LED-CONC3' },
      update: {},
      create: {
        businessId: 'LED-CONC3',
        firstName: 'Conc',
        lastName: 'Lead',
        primaryPhone: '1112223334',
        creationChannel: 'SALES_COUNSELLOR',
        source: 'DIRECT',
        status: 'NEW',
        createdByUserId: user.id,
      }
    });

    const student = await prisma.student.upsert({
      where: { businessId: 'STU-CONC3' },
      update: {},
      create: {
        businessId: 'STU-CONC3',
        leadId: lead.id,
        firstName: 'Conc',
        lastName: 'Student',
      }
    });

    const requirement = await prisma.requirement.upsert({
      where: { businessId: 'REQ-CONC3' },
      update: {},
      create: {
        businessId: 'REQ-CONC3',
        student: { connect: { id: student.id } },
        subject: { connect: { id: subject.id } },
        grade: { connect: { id: grade.id } },
        curriculum: { connect: { id: curriculum.id } },
      }
    });

    // Cleanup any existing demos for this requirement
    await prisma.demo.deleteMany({ where: { requirementId: requirement.id } });

    const futureDate = new Date(Date.now() + 86400000).toISOString();

    const req1 = demoService.bookDemo({
      studentId: student.id,
      requirementId: requirement.id,
      scheduledAt: futureDate,
      durationMinutes: 60,
    }, user as any);

    const req2 = demoService.bookDemo({
      studentId: student.id,
      requirementId: requirement.id,
      scheduledAt: futureDate,
      durationMinutes: 60,
    }, user as any);

    const results = await Promise.allSettled([req1, req2]);
    
    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
  });
});
