import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication, ValidationPipe , Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/common/auth/auth.service';
import { IdGeneratorService } from '../src/common/id-generator/id-generator.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QueueModule } from '../src/common/queue/queue.module';


@Module({})
class MockQueueModule {}

// Mock BullMQ completely
jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      close: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(true),
    })),
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(true),
    })),
  };
});

describe('DemoModule (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let prisma: PrismaService;

  let headToken: string;
  let headUserId: string;
  let counsellorToken: string;
  let counsellorUserId: string;
  let coordinatorToken: string;
  let coordinatorUserId: string;
  let tutorToken: string;
  let tutorUserId: string;

  let studentId: string;
  let requirementId: string;
  let demoId: string;

  beforeAll(async () => {
    const { execSync } = require('child_process');
    execSync('npx ts-node --require tsconfig-paths/register prisma/seed.ts', { stdio: 'ignore', cwd: __dirname + '/..' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(QueueModule)
      .useModule(MockQueueModule)
      .overrideProvider(CACHE_MANAGER)
      .useValue({
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
      })
      .overrideProvider(getQueueToken('notifications'))
      .useValue({
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    const idGen = app.get<IdGeneratorService>(IdGeneratorService);

    // Get Admin user (CEO)
    const admin = await prisma.user.findFirstOrThrow({ where: { userRoles: { some: { role: { code: 'CEO' } } } } });

    const ensurePermission = async (roleCode: string, permissions: string[]) => {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
      for (const permCode of permissions) {
        const perm = await prisma.permission.upsert({
          where: { code: permCode },
          update: {},
          create: {
            code: permCode,
            resource: 'demo',
            action: permCode.split('.')[1] || permCode,
            description: permCode,
          },
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
    };

    await ensurePermission('SALES_COUNSELLOR', ['demo.book']);
    await ensurePermission('DEMO_COORDINATOR', ['demo.assign_tutor', 'demo.manage_all', 'demo.read', 'demo.mark_exceptions']);
    await ensurePermission('TUTOR', ['demo.complete', 'demo.read_assigned']);

    // Helper to create users with roles
    const createUser = async (email: string, roleCode: string) => {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          passwordHash: 'dummy',
          status: 'ACTIVE',
          userRoles: { create: { roleId: role.id } },
        },
      });
      return user;
    };

    const head = await createUser('head.demo@elscore.test', 'SALES_HEAD');
    headUserId = head.id;
    const counsellor = await createUser('counsellor.demo@elscore.test', 'SALES_COUNSELLOR');
    counsellorUserId = counsellor.id;
    const coordinator = await createUser('coord.demo@elscore.test', 'DEMO_COORDINATOR');
    coordinatorUserId = coordinator.id;
    const tutor = await createUser('tutor.demo@elscore.test', 'TUTOR');
    tutorUserId = tutor.id;

    // Login helper (mock token)
    const authService = app.get(AuthService);
    const login = async (u: any, roleCode: string) => {
      const tokens = await authService.login({ 
        id: u.id, 
        email: u.email, 
        roles: [roleCode], 
        permissions: [], 
        requiresPasswordChange: false 
      } as any);
      return `Bearer ${tokens.accessToken}`;
    };

    headToken = await login(head, 'SALES_HEAD');
    counsellorToken = await login(counsellor, 'SALES_COUNSELLOR');
    coordinatorToken = await login(coordinator, 'DEMO_COORDINATOR');
    tutorToken = await login(tutor, 'TUTOR');

    // Setup Lead, Student, Requirement
    await prisma.demoFeedback.deleteMany();
    await prisma.demoRescheduleHistory.deleteMany();
    await prisma.demo.deleteMany();
    await prisma.requirement.deleteMany({ where: { businessId: 'REQ-9999' } });
    await prisma.student.deleteMany({ where: { businessId: 'STU-9999' } });
    await prisma.lead.deleteMany({ where: { primaryPhone: '1234567890' } });

    await prisma.sequence.upsert({
      where: { entityType: 'DMO' },
      update: {},
      create: { entityType: 'DMO', prefix: 'DMO', nextNumber: 1, padding: 4 },
    });

    const businessId = await prisma.$transaction(async (tx) => idGen.nextIdInTx(tx as any, 'LED'));
    const lead = await prisma.lead.create({
      data: {
        businessId,
        primaryPhone: '1234567890',
        firstName: 'Demo',
        lastName: 'Parent',
        status: 'INTERESTED',
        source: 'WEBSITE',
        creationChannel: 'SALES_HEAD',
        createdByUserId: headUserId,
        assignedToUserId: counsellorUserId,
      },
    });

    studentId = (await prisma.student.create({
      data: {
        businessId: 'STU-9999',
        leadId: lead.id,
        firstName: 'Demo Student',
      },
    })).id;

    const subj = await prisma.subject.findFirstOrThrow();
    const curr = await prisma.curriculum.findFirstOrThrow();
    const grad = await prisma.grade.findFirstOrThrow();

    requirementId = (await prisma.requirement.create({
      data: {
        businessId: 'REQ-9999',
        studentId,
        subjectId: subj.id,
        curriculumId: curr.id,
        gradeId: grad.id,
      },
    })).id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.demoFeedback.deleteMany();
    await prisma.demoRescheduleHistory.deleteMany();
    await prisma.demo.deleteMany();
    await prisma.requirement.deleteMany({ where: { businessId: 'REQ-9999' } });
    await prisma.student.deleteMany({ where: { businessId: 'STU-9999' } });
    await prisma.lead.deleteMany({ where: { primaryPhone: '1234567890' } });
    await prisma.user.deleteMany({ where: { email: { contains: 'demo@elscore.test' } } });
    await app.close();
  });

  it('1. Sales Counsellor can book Demo', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await request.default(app.getHttpServer())
      .post('/demos')
      .set('Authorization', counsellorToken)
      .send({
        studentId,
        requirementId,
        scheduledAt: futureDate,
        durationMinutes: 60,
      });

    if (res.status !== 201) console.log(res.body);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SCHEDULED');
    demoId = res.body.id;
  });

  it('2. Coordinator can assign tutor', async () => {
    const demo = await prisma.demo.findFirstOrThrow();
    const res = await request.default(app.getHttpServer())
      .patch(`/demos/${demo.id}/assign`)
      .set('Authorization', coordinatorToken)
      .send({
        tutorId: tutorUserId,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ASSIGNED');
    expect(res.body.tutorId).toBe(tutorUserId);
  });

  it('3. Tutor can complete their assigned demo', async () => {
    const res = await request.default(app.getHttpServer())
      .patch(`/demos/${demoId}/complete`)
      .set('Authorization', tutorToken)
      .send({
        rating: 5,
        comments: 'Great session!',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
  });

  it('4. Sales Counsellor past booking blocked', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const res = await request.default(app.getHttpServer())
      .post('/demos')
      .set('Authorization', counsellorToken)
      .send({
        studentId,
        requirementId,
        scheduledAt: pastDate,
        durationMinutes: 60,
      });

    expect(res.status).toBe(400);
  });

  it('5. Overlapping Demo blocked', async () => {
    const futureDate = new Date(Date.now() + 172800000).toISOString(); // +2 days
    // Book first
    await request.default(app.getHttpServer())
      .post('/demos')
      .set('Authorization', counsellorToken)
      .send({
        studentId,
        requirementId,
        scheduledAt: futureDate,
        durationMinutes: 60,
      });

    // Book second overlapping
    const res2 = await request.default(app.getHttpServer())
      .post('/demos')
      .set('Authorization', counsellorToken)
      .send({
        studentId,
        requirementId,
        scheduledAt: futureDate,
        durationMinutes: 60,
      });

    expect(res2.status).toBe(400);
    expect(res2.body.message).toContain('overlapping');
  });

  it('6. Valid demo can be booked with less than 24 hours notice', async () => {
    // 2 hours from now
    const nearDate = new Date(Date.now() + 2 * 3600000).toISOString();
    
    // Cleanup any existing demos to avoid overlap
    await prisma.demo.deleteMany();

    const res = await request.default(app.getHttpServer())
      .post('/demos')
      .set('Authorization', counsellorToken)
      .send({
        studentId,
        requirementId,
        scheduledAt: nearDate,
        durationMinutes: 60,
      });

    expect(res.status).toBe(201);
  });

  it('7. Valid demo can be booked outside 09:00-21:00', async () => {
    // Book at 03:00 AM UTC tomorrow
    const baseDate = new Date();
    baseDate.setUTCDate(baseDate.getUTCDate() + 1);
    baseDate.setUTCHours(3, 0, 0, 0); // 3 AM UTC
    const nightDate = baseDate.toISOString();

    await prisma.demo.deleteMany();

    const res = await request.default(app.getHttpServer())
      .post('/demos')
      .set('Authorization', counsellorToken)
      .send({
        studentId,
        requirementId,
        scheduledAt: nightDate,
        durationMinutes: 60,
      });

    expect(res.status).toBe(201);
  });

  it('8. Sales Head can override past booking restriction', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    
    await prisma.demo.deleteMany();

    const res = await request.default(app.getHttpServer())
      .post('/demos')
      .set('Authorization', headToken)
      .send({
        studentId,
        requirementId,
        scheduledAt: pastDate,
        durationMinutes: 60,
      });

    expect(res.status).toBe(201);
  });
});
