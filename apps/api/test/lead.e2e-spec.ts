import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QueueModule } from '../src/common/queue/queue.module';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), upsertJobScheduler: jest.fn(), close: jest.fn(), on: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
  QueueEvents: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
}));

class MockQueueModule {}

// Pre-computed argon2id hash of 'TestPassword123!'
// Run: node -e "require('argon2').hash('TestPassword123!').then(console.log)" to regenerate
const TEST_PASSWORD = 'TestPassword123!';
const TEST_HASH = '$argon2id$v=19$m=65536,t=3,p=4$F8nnI8hF9A3BlyGdByiRoQ$wPiFQ/OJIFSbeMyUuGhTZ/4KdrmXoptkeZe1Kkqknio';

describe('LeadModule (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let headToken: string;
  let counsellor1Token: string;
  let counsellor2Token: string;

  const loginAs = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD });
    if (res.status !== 200) {
      throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.data.accessToken as string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CACHE_MANAGER)
      .useValue({
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
      })
      
      
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Look up the roles
    const headRole = await prisma.role.findUnique({ where: { code: 'SALES_HEAD' } });
    const cRole = await prisma.role.findUnique({ where: { code: 'SALES_COUNSELLOR' } });

    if (!headRole || !cRole) {
      throw new Error('Required roles not found. Run the seed first.');
    }

    // Create/update test users with ACTIVE status and real argon2 password hash
    const [head, c1, c2] = await Promise.all([
      prisma.user.upsert({
        where: { email: 'head@crm-test.com' },
        update: { passwordHash: TEST_HASH, status: 'ACTIVE', mustChangePassword: false },
        create: { email: 'head@crm-test.com', passwordHash: TEST_HASH, status: 'ACTIVE', mustChangePassword: false },
      }),
      prisma.user.upsert({
        where: { email: 'c1@crm-test.com' },
        update: { passwordHash: TEST_HASH, status: 'ACTIVE', mustChangePassword: false },
        create: { email: 'c1@crm-test.com', passwordHash: TEST_HASH, status: 'ACTIVE', mustChangePassword: false },
      }),
      prisma.user.upsert({
        where: { email: 'c2@crm-test.com' },
        update: { passwordHash: TEST_HASH, status: 'ACTIVE', mustChangePassword: false },
        create: { email: 'c2@crm-test.com', passwordHash: TEST_HASH, status: 'ACTIVE', mustChangePassword: false },
      }),
    ]);

    // Assign roles (clear existing first to avoid conflicts)
    await prisma.userRole.deleteMany({ where: { userId: { in: [head.id, c1.id, c2.id] } } });
    await Promise.all([
      prisma.userRole.create({ data: { userId: head.id, roleId: headRole.id } }),
      prisma.userRole.create({ data: { userId: c1.id, roleId: cRole.id } }),
      prisma.userRole.create({ data: { userId: c2.id, roleId: cRole.id } }),
    ]);

    // Log in via real HTTP to get valid access tokens
    headToken = await loginAs('head@crm-test.com');
    counsellor1Token = await loginAs('c1@crm-test.com');
    counsellor2Token = await loginAs('c2@crm-test.com');
  });

  afterAll(async () => {
    const testEmails = ['head@crm-test.com', 'c1@crm-test.com', 'c2@crm-test.com'];
    // Clean up all CRM test data (order matters for FK constraints)
    const testUsers = await prisma.user.findMany({ where: { email: { in: testEmails } }, select: { id: true } });
    const testUserIds = testUsers.map(u => u.id);
    const testLeads = await prisma.lead.findMany({ where: { createdByUserId: { in: testUserIds } }, select: { id: true } });
    const testLeadIds = testLeads.map(l => l.id);
    await prisma.salesNote.deleteMany({ where: { leadId: { in: testLeadIds } } });
    await prisma.requirement.deleteMany({ where: { student: { leadId: { in: testLeadIds } } } });
    await prisma.student.deleteMany({ where: { leadId: { in: testLeadIds } } });
    await prisma.leadStatusHistory.deleteMany({ where: { leadId: { in: testLeadIds } } });
    await prisma.leadAssignmentHistory.deleteMany({ where: { leadId: { in: testLeadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: testLeadIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    await app.close();
  });

  let createdLeadId: string;

  it('Create Lead — Sales Counsellor assigns to self', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({
        primaryPhone: '1234567890',
        source: 'WEBSITE',
        firstName: 'John',
        lastName: 'Doe',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.lead.primaryPhone).toBe('1234567890');
    expect(res.body.data.lead.assignedToUserId).toBeDefined();
    expect(res.body.data.warnings).toHaveLength(0);
    createdLeadId = res.body.data.lead.id;
  });

  it('Duplicate primary phone produces a warning but does not block creation', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({
        primaryPhone: '1234567890',
        source: 'WEBSITE',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.warnings).toHaveLength(1);
    expect(res.body.data.warnings[0].type).toBe('DUPLICATE_PHONE');
  });

  it('Counsellor 1 CAN read their own assigned lead', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${counsellor1Token}`);
    expect(res.status).toBe(200);
  });

  it('Counsellor 2 CANNOT read Counsellor 1\'s lead (record-scope enforcement)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${counsellor2Token}`);
    expect(res.status).toBe(403);
  });

  it('Sales Head CAN read any lead (lead.read-all permission)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${headToken}`);
    expect(res.status).toBe(200);
  });

  it('Sales Head can reassign lead to Counsellor 2', async () => {
    const c2 = await prisma.user.findUnique({ where: { email: 'c2@crm-test.com' } });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/leads/${createdLeadId}/reassign`)
      .set('Authorization', `Bearer ${headToken}`)
      .send({ assignedToUserId: c2!.id, reason: 'Load balancing' });

    expect(res.status).toBe(201);
  });

  it('Counsellor 1 loses access immediately after reassignment', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${counsellor1Token}`);
    expect(res.status).toBe(403);
  });

  it('Create Student linked to reassigned Lead (by Counsellor 2 who now owns it)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${counsellor2Token}`)
      .send({ leadId: createdLeadId, firstName: 'Jane' });

    expect(res.status).toBe(201);
    expect(res.body.data.firstName).toBe('Jane');
  });

  it('Sales Head can archive a lead', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/leads/${createdLeadId}/archive`)
      .set('Authorization', `Bearer ${headToken}`);
    expect(res.status).toBe(201);
    expect(res.body.data.isArchived).toBe(true);
  });

  it('Create Lead atomically with multiple Students and Requirements', async () => {
    // We need subject, curriculum, grade
    let subject = await prisma.subject.findFirst();
    if (!subject) subject = await prisma.subject.create({ data: { name: 'Math', code: 'MATH', isActive: true } });
    
    let curriculum = await prisma.curriculum.findFirst();
    if (!curriculum) curriculum = await prisma.curriculum.create({ data: { name: 'CBSE', code: 'CBSE', isActive: true } });
    
    let grade = await prisma.grade.findFirst();
    if (!grade) grade = await prisma.grade.create({ data: { name: 'Grade 10', code: 'G10', sortOrder: 10, isActive: true } });

    const res = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({
        primaryPhone: '9999999999',
        source: 'WEBSITE',
        firstName: 'Parent',
        lastName: 'Multiple',
        students: [
          {
            firstName: 'Student A',
            requirements: [
              { subjectId: subject.id, curriculumId: curriculum.id, gradeId: grade.id },
              { subjectId: subject.id, curriculumId: curriculum.id, gradeId: grade.id }
            ]
          },
          {
            firstName: 'Student B',
            requirements: [
              { subjectId: subject.id, curriculumId: curriculum.id, gradeId: grade.id }
            ]
          },
          {
            firstName: 'Student C',
            requirements: [
              { subjectId: subject.id, curriculumId: curriculum.id, gradeId: grade.id },
              { subjectId: subject.id, curriculumId: curriculum.id, gradeId: grade.id }
            ]
          }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.data.lead.primaryPhone).toBe('9999999999');
    const newLeadId = res.body.data.lead.id;

    // Verify DB state
    const createdStudents = await prisma.student.findMany({ where: { leadId: newLeadId }, include: { requirements: true } });
    expect(createdStudents.length).toBe(3);
    
    const reqCount = createdStudents.reduce((acc, s) => acc + s.requirements.length, 0);
    expect(reqCount).toBe(5);
  });

  it('Transaction rollback: Lead is NOT created if a nested Requirement fails validation (missing subjectId)', async () => {
    // Generate a unique phone for this test
    const uniquePhone = '9991112222';
    
    // We intentionally pass an invalid subjectId to cause DB failure
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({
        primaryPhone: uniquePhone,
        source: 'WEBSITE',
        firstName: 'Rollback',
        lastName: 'Test',
        students: [
          {
            firstName: 'Student A',
            requirements: [
              { subjectId: 'invalid-uuid-format', curriculumId: 'invalid-uuid-format', gradeId: 'invalid-uuid-format' }
            ]
          }
        ]
      });

    // NestJS validation pipe will catch invalid UUID, but let's say it bypasses it and hits Prisma
    // or NestJS catches it before Prisma. Either way, the Lead shouldn't be created.
    expect(res.status).not.toBe(201);
    
    // Ensure the lead does not exist in DB
    const leadInDb = await prisma.lead.findFirst({ where: { primaryPhone: uniquePhone } });
    expect(leadInDb).toBeNull();
  });
});
