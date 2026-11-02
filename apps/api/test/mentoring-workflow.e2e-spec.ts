/**
 * Mentoring end-to-end test: Sales ENROLLED -> handover -> allocation -> seven stages with a
 * pause / log out / log back in / resume at EVERY stage -> final approval.
 *
 * Needs a DISPOSABLE test database that has the WP2 and WP3 migrations applied and the seed run
 * (roles MENTORING_HEAD, MENTOR, DEMO_COUNSELOR and the mentoring.* permissions). It calls
 * cleanDatabase(), which truncates tables, so it must never point at staging or production.
 *
 * Status: written for CI / a disposable database; NOT executed in the development session that added it.
 */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { getChecklistDefinition } from '../src/modules/mentoring/mentoring.constants';

const TEST_PASSWORD = 'TestPassword123!';
const TEST_HASH = '$argon2id$v=19$m=65536,t=3,p=4$F8nnI8hF9A3BlyGdByiRoQ$wPiFQ/OJIFSbeMyUuGhTZ/4KdrmXoptkeZe1Kkqknio';

describe('Mentoring workflow (e2e)', () => {
  jest.setTimeout(120000);

  let app: INestApplication;
  let prisma: PrismaService;
  let leadId: string;
  let activationId: string;
  const users: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const login = async (email: string): Promise<string> => {
    const res = await http().post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
    return res.body.data.accessToken;
  };
  const api = (method: 'get' | 'post' | 'patch' | 'put', path: string, token: string, body?: object) => {
    const req = http()[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  };

  const makeUser = async (email: string, roleCode: string, deptCode: string, bid: string) => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    const dept = await prisma.department.findUniqueOrThrow({ where: { code: deptCode } });
    const user = await prisma.user.create({
      data: {
        email, passwordHash: TEST_HASH, status: 'ACTIVE',
        userRoles: { create: { roleId: role.id } },
        employee: { create: { businessId: bid, departmentId: dept.id, firstName: roleCode, lastName: 'E2E' } },
      },
    });
    users[roleCode] = user.id;
    return user;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CACHE_MANAGER).useValue({ get: () => Promise.resolve(null), set: () => Promise.resolve(), del: () => Promise.resolve() })
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    await prisma.cleanDatabase();
    await prisma.mentoringStaffProfile.deleteMany();
    await prisma.mentoringSetting.deleteMany();

    await makeUser('head@mentoring.test', 'MENTORING_HEAD', 'MENTORING', 'EMP-M01');
    await makeUser('mentor@mentoring.test', 'MENTOR', 'MENTORING', 'EMP-M02');
    // Demo Counselors are not part of the Mentoring department; they sit with the other demo roles.
    await makeUser('counselor@mentoring.test', 'DEMO_COUNSELOR', 'ACADEMICS', 'EMP-M03');
    const sales = await makeUser('sales@mentoring.test', 'SALES_COUNSELLOR', 'SALES', 'EMP-M04');

    // Head registers the Mentor (capacity 5) and the Counselor.
    const head = await login('head@mentoring.test');
    expect((await api('put', `/mentoring/staff/${users.MENTOR}`, head, { role: 'MENTOR', capacity: 5 })).status).toBe(200);
    expect((await api('put', `/mentoring/staff/${users.DEMO_COUNSELOR}`, head, { role: 'DEMO_COUNSELOR' })).status).toBe(200);

    // A Sales lead with one student and one requirement, owned by the Sales counsellor.
    const [subject, curriculum, grade] = await Promise.all([prisma.subject.findFirstOrThrow(), prisma.curriculum.findFirstOrThrow(), prisma.grade.findFirstOrThrow()]);
    const lead = await prisma.lead.create({
      data: { businessId: 'LED-E2E1', firstName: 'Parent', lastName: 'Test', primaryPhone: '+971500000001', source: 'WEBSITE', creationChannel: 'SALES_COUNSELLOR', status: 'NEGOTIATION', assignedToUserId: sales.id, createdByUserId: sales.id },
    });
    leadId = lead.id;
    const student = await prisma.student.create({ data: { businessId: 'STU-E2E1', leadId, firstName: 'Test', lastName: 'Student', curriculumId: curriculum.id, gradeId: grade.id } });
    await prisma.requirement.create({ data: { businessId: 'RQT-E2E1', studentId: student.id, subjectId: subject.id, curriculumId: curriculum.id, gradeId: grade.id } });
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await prisma.mentoringStaffProfile.deleteMany();
    await app.close();
  });

  it('marking the lead ENROLLED creates one handover, activation and Mentor allocation (idempotent)', async () => {
    const sales = await login('sales@mentoring.test');
    const first = await api('post', `/leads/${leadId}/status`, sales, { status: 'ENROLLED', reason: 'Enrolled in e2e' });
    expect(first.status).toBe(201);
    const again = await api('post', `/leads/${leadId}/status`, sales, { status: 'ENROLLED', reason: 'Repeat' });
    expect([200, 201]).toContain(again.status);

    expect(await prisma.enrollmentHandover.count({ where: { leadId } })).toBe(1);
    const activation = await prisma.mentoringActivation.findFirstOrThrow({ where: { leadId } });
    activationId = activation.id;
    expect(await prisma.mentoringActivation.count({ where: { leadId } })).toBe(1);
    expect(activation.currentMentorUserId).toBe(users.MENTOR);
    expect(activation.status).toBe('ACTIVATION_IN_PROGRESS');
  });

  it('Sales can no longer change the handed-over student', async () => {
    const sales = await login('sales@mentoring.test');
    const student = await prisma.student.findFirstOrThrow({ where: { leadId } });
    const res = await api('patch', `/students/${student.id}`, sales, { firstName: 'Changed' });
    expect(res.status).toBe(403);
  });

  it('a Mentor only sees own students and a Counselor sees none until a task is assigned', async () => {
    const mentor = await login('mentor@mentoring.test');
    const counselor = await login('counselor@mentoring.test');
    expect((await api('get', '/mentoring/students', mentor)).body.data.total).toBe(1);
    expect((await api('get', '/mentoring/students', counselor)).body.data.total).toBe(0);
    expect((await api('get', `/mentoring/students/${activationId}`, counselor)).status).toBe(404);
  });

  it('pauses at every stage, logs out and back in, resumes with the exact saved information, then completes the stage', async () => {
    for (let n = 1; n <= 7; n++) {
      const mentor = await login('mentor@mentoring.test');
      const defs = getChecklistDefinition(n);
      const base = `/mentoring/students/${activationId}`;

      if (n > 1) expect((await api('post', `${base}/stages/${n}/start`, mentor, {})).status).toBe(201);

      // Enter some information, leave the rest pending.
      await api('patch', `${base}/stages/${n}/items/${defs[0].key}`, mentor, { state: 'VERIFIED', value: `entered-${n}`, note: `note-${n}` });
      await api('patch', `${base}/stages/${n}/items/${defs[1].key}`, mentor, { state: 'COLLECTED', value: `collected-${n}` });
      const saved = (await api('get', base, mentor)).body.data.stages[n - 1].checklist;

      const pause = await api('post', `${base}/pause`, mentor, {
        reason: 'Parent travelling', pendingAction: 'Wait for parent', responsibleUserId: users.MENTOR, followUpAt: new Date(Date.now() + 86400000).toISOString(),
      });
      expect(pause.status).toBe(201);

      // "Leave the application": a brand-new login/session reads the stored state.
      const returning = await login('mentor@mentoring.test');
      const whileHeld = (await api('get', base, returning)).body.data;
      expect(whileHeld.activation.status).toBe('ACTIVATION_ON_HOLD');
      expect(whileHeld.stages[n - 1].status).toBe('ON_HOLD');
      expect(whileHeld.stages[n - 1].checklist).toEqual(saved);
      expect((await api('patch', `${base}/stages/${n}/items/${defs[2].key}`, returning, { state: 'VERIFIED' })).status).toBe(409);

      const resume = await api('post', `${base}/resume`, returning, {});
      expect(resume.status).toBe(201);
      expect(resume.body.data.stageNumber).toBe(n);
      const resumed = (await api('get', base, returning)).body.data;
      expect(resumed.activation.status).toBe('ACTIVATION_IN_PROGRESS');
      expect(resumed.stages[n - 1].status).toBe('IN_PROGRESS');
      expect(resumed.stages[n - 1].checklist).toEqual(saved);

      // Finish the stage.
      for (const d of defs) await api('patch', `${base}/stages/${n}/items/${d.key}`, returning, { state: 'VERIFIED' });
      expect((await api('post', `${base}/stages/${n}/verify`, returning, {})).status).toBe(201);
    }
    const activation = await prisma.mentoringActivation.findUniqueOrThrow({ where: { id: activationId } });
    expect(activation.status).toBe('PENDING_FINAL_APPROVAL');
  });

  it('only the Mentoring Head can give final approval, never the Mentor', async () => {
    const mentor = await login('mentor@mentoring.test');
    const head = await login('head@mentoring.test');
    const base = `/mentoring/students/${activationId}`;

    expect((await api('post', `${base}/approval`, mentor, { decision: 'APPROVED' })).status).toBe(403);
    expect((await api('post', `${base}/approval`, head, { decision: 'APPROVED' })).status).toBe(201);
    expect((await prisma.mentoringActivation.findUniqueOrThrow({ where: { id: activationId } })).status).toBe('ACTIVATED');
  });

  it('the CEO can see everything but has no operational rights', async () => {
    const ceoRole = await prisma.role.findUniqueOrThrow({ where: { code: 'CEO' } });
    const dept = await prisma.department.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    await prisma.user.create({
      data: { email: 'ceo@mentoring.test', passwordHash: TEST_HASH, status: 'ACTIVE', userRoles: { create: { roleId: ceoRole.id } }, employee: { create: { businessId: 'EMP-M05', departmentId: dept.id, firstName: 'Ceo', lastName: 'E2E' } } },
    });
    const ceo = await login('ceo@mentoring.test');
    expect((await api('get', '/mentoring/students', ceo)).body.data.total).toBe(1);
    expect((await api('post', `/mentoring/students/${activationId}/approval`, ceo, { decision: 'APPROVED' })).status).toBe(403);
    expect((await api('post', `/mentoring/students/${activationId}/stages/1/verify`, ceo, {})).status).toBe(403);
  });
});
