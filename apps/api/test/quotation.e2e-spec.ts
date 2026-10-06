import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeadStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    upsertJobScheduler: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
  QueueEvents: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
}));

const TEST_PASSWORD = 'TestPassword123!';
const TEST_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$F8nnI8hF9A3BlyGdByiRoQ$wPiFQ/OJIFSbeMyUuGhTZ/4KdrmXoptkeZe1Kkqknio';

const TEST_EMAILS = [
  'quo-head@crm-test.com',
  'quo-c1@crm-test.com',
  'quo-c2@crm-test.com',
  'quo-ceo@crm-test.com',
];

function decodePdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  return [...raw.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('');
}

describe('Quotation (e2e)', () => {
  jest.setTimeout(90000);

  let app: INestApplication;
  let prisma: PrismaService;
  let headToken: string;
  let counsellor1Token: string;
  let counsellor2Token: string;
  let ceoToken: string;
  let headUserId: string;
  let ceoUserId: string;
  let previousFinanceSetting: any = null;

  const loginAs = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email,
      password: TEST_PASSWORD,
    });
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    const headRole = await prisma.role.findUnique({ where: { code: 'SALES_HEAD' } });
    const cRole = await prisma.role.findUnique({ where: { code: 'SALES_COUNSELLOR' } });
    const ceoRole = await prisma.role.findUnique({ where: { code: 'CEO' } });
    if (!headRole || !cRole || !ceoRole) {
      throw new Error('Required roles not found. Run the seed first.');
    }

    const [head, c1, c2, ceo] = await Promise.all(
      TEST_EMAILS.map((email) =>
        prisma.user.upsert({
          where: { email },
          update: { passwordHash: TEST_HASH, status: 'ACTIVE', mustChangePassword: false },
          create: { email, passwordHash: TEST_HASH, status: 'ACTIVE', mustChangePassword: false },
        }),
      ),
    );
    headUserId = head.id;
    ceoUserId = ceo.id;

    await prisma.userRole.deleteMany({ where: { userId: { in: [head.id, c1.id, c2.id, ceo.id] } } });
    await Promise.all([
      prisma.userRole.create({ data: { userId: head.id, roleId: headRole.id } }),
      prisma.userRole.create({ data: { userId: c1.id, roleId: cRole.id } }),
      prisma.userRole.create({ data: { userId: c2.id, roleId: cRole.id } }),
      prisma.userRole.create({ data: { userId: ceo.id, roleId: ceoRole.id } }),
    ]);

    const ensureRolePerms = async (roleId: string, codes: string[]) => {
      for (const code of codes) {
        const [resource, ...actionParts] = code.split('.');
        const action = actionParts.join('.');
        const perm = await prisma.permission.upsert({
          where: { code },
          update: {},
          create: {
            code,
            resource,
            action,
            description: code,
            isDelegatable: false,
          },
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: perm.id } },
          update: {},
          create: { roleId, permissionId: perm.id },
        });
      }
    };
    await ensureRolePerms(cRole.id, ['quotation.create', 'quotation.read']);
    await ensureRolePerms(headRole.id, ['quotation.create', 'quotation.read', 'lead.read-all']);
    await ensureRolePerms(ceoRole.id, [
      'quotation.create',
      'quotation.read',
      'lead.read-all',
      'analytics.ceo.read',
    ]);

    await prisma.sequence.upsert({
      where: { entityType: 'QUO' },
      update: { prefix: 'QUO', padding: 4 },
      create: { entityType: 'QUO', prefix: 'QUO', nextNumber: 1, padding: 4 },
    });
    await prisma.sequence.upsert({
      where: { entityType: 'RQT' },
      update: { prefix: 'RQT', padding: 4 },
      create: { entityType: 'RQT', prefix: 'RQT', nextNumber: 1, padding: 4 },
    });

    previousFinanceSetting = await prisma.financeSetting.findUnique({ where: { code: 'DEFAULT' } });
    await prisma.financeSetting.upsert({
      where: { code: 'DEFAULT' },
      update: {
        registrationFee: 150,
        currency: 'AED',
        accountHolderName: 'E2E Test Account Holder',
        bankName: 'E2E Test Bank',
        accountNumber: '111111',
        iban: 'AE00E2ETEST0000000001',
      },
      create: {
        code: 'DEFAULT',
        registrationFee: 150,
        currency: 'AED',
        accountHolderName: 'E2E Test Account Holder',
        bankName: 'E2E Test Bank',
        accountNumber: '111111',
        iban: 'AE00E2ETEST0000000001',
      },
    });

    headToken = await loginAs(TEST_EMAILS[0]);
    counsellor1Token = await loginAs(TEST_EMAILS[1]);
    counsellor2Token = await loginAs(TEST_EMAILS[2]);
    ceoToken = await loginAs(TEST_EMAILS[3]);
  });

  afterAll(async () => {
    const testUsers = await prisma.user.findMany({
      where: { email: { in: TEST_EMAILS } },
      select: { id: true },
    });
    const testUserIds = testUsers.map((u) => u.id);
    const testLeads = await prisma.lead.findMany({
      where: { createdByUserId: { in: testUserIds } },
      select: { id: true },
    });
    const testLeadIds = testLeads.map((l) => l.id);
    const testStudents = await prisma.student.findMany({
      where: { leadId: { in: testLeadIds } },
      select: { id: true },
    });
    const testStudentIds = testStudents.map((s) => s.id);

    await prisma.quotation.deleteMany({ where: { studentId: { in: testStudentIds } } });
    await prisma.requirement.deleteMany({ where: { studentId: { in: testStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: testStudentIds } } });
    await prisma.leadStatusHistory.deleteMany({ where: { leadId: { in: testLeadIds } } });
    await prisma.leadAssignmentHistory.deleteMany({ where: { leadId: { in: testLeadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: testLeadIds } } });
    await prisma.pricingSlab.deleteMany({ where: { createdBy: { in: testUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });

    if (previousFinanceSetting) {
      await prisma.financeSetting.update({
        where: { code: 'DEFAULT' },
        data: {
          registrationFee: previousFinanceSetting.registrationFee,
          currency: previousFinanceSetting.currency,
          accountHolderName: previousFinanceSetting.accountHolderName,
          bankName: previousFinanceSetting.bankName,
          accountNumber: previousFinanceSetting.accountNumber,
          iban: previousFinanceSetting.iban,
          updatedBy: previousFinanceSetting.updatedBy,
        },
      });
    } else {
      await prisma.financeSetting.deleteMany({
        where: { code: 'DEFAULT', accountHolderName: 'E2E Test Account Holder' },
      });
    }

    await app.close();
  });

  const createQuotedStudent = async (opts?: { mixedCurriculum?: boolean; status?: LeadStatus }) => {
    const curriculumCbse = await prisma.curriculum.findUnique({ where: { code: 'CBSE' } });
    const curriculumIgcse = await prisma.curriculum.findUnique({ where: { code: 'IGCSE' } });
    const grade5 = await prisma.grade.findUnique({ where: { code: 'GRADE_5' } });
    const grade6 = await prisma.grade.findUnique({ where: { code: 'GRADE_6' } });
    const math = await prisma.subject.findUnique({ where: { code: 'MATH' } });
    const english = await prisma.subject.findUnique({ where: { code: 'ENGLISH' } });
    if (!curriculumCbse || !curriculumIgcse || !grade5 || !grade6 || !math || !english) {
      throw new Error('Reference data missing. Run the seed first.');
    }

    const leadRes = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({
        primaryPhone: `05${Date.now().toString().slice(-8)}`,
        source: 'WEBSITE',
        firstName: 'Fatima',
        lastName: 'Ali',
      });
    expect(leadRes.status).toBe(201);
    const leadId = leadRes.body.data.lead.id as string;

    await prisma.lead.update({
      where: { id: leadId },
      data: { status: opts?.status ?? LeadStatus.DEMO_COMPLETED },
    });

    const studentRes = await request(app.getHttpServer())
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({
        leadId,
        firstName: 'Omar',
        lastName: 'Ali',
        curriculumId: curriculumIgcse.id,
        gradeId: grade6.id,
      });
    expect(studentRes.status).toBe(201);
    const studentId = studentRes.body.data.id as string;

    const req1 = await request(app.getHttpServer())
      .post(`/api/v1/students/${studentId}/requirements`)
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({
        subjectId: math.id,
        curriculumId: curriculumCbse.id,
        gradeId: grade5.id,
        monthlyHours: 10,
      });
    expect(req1.status).toBe(201);

    if (opts?.mixedCurriculum) {
      const req2 = await request(app.getHttpServer())
        .post(`/api/v1/students/${studentId}/requirements`)
        .set('Authorization', `Bearer ${counsellor1Token}`)
        .send({
          subjectId: english.id,
          curriculumId: curriculumIgcse.id,
          gradeId: grade6.id,
          monthlyHours: 8,
        });
      expect(req2.status).toBe(201);
    }

    await prisma.pricingSlab.updateMany({
      where: {
        curriculumId: curriculumCbse.id,
        isActive: true,
        gradeFrom: { lte: grade5.sortOrder },
        gradeTo: { gte: grade5.sortOrder },
      },
      data: { isActive: false },
    });

    const headUser = await prisma.user.findUnique({ where: { email: TEST_EMAILS[0] } });
    const slab = await prisma.pricingSlab.create({
      data: {
        businessId: `SLAB-E2E-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        curriculumId: curriculumCbse.id,
        gradeFrom: grade5.sortOrder,
        gradeTo: grade5.sortOrder,
        hourlyRate: 80,
        createdBy: headUser!.id,
      },
    });

    return { leadId, studentId, slabId: slab.id, curriculumCbse, grade5 };
  };

  it('rejects quotation before DEMO_COMPLETED', async () => {
    const { studentId } = await createQuotedStudent({ status: LeadStatus.CONTACTED });
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotations/preview')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({ studentId });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/DEMO_COMPLETED/);
  });

  it('rejects mixed Curriculum + Grade requirements on preview and generate', async () => {
    const { studentId } = await createQuotedStudent({ mixedCurriculum: true });

    const preview = await request(app.getHttpServer())
      .post('/api/v1/quotations/preview')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({ studentId });
    expect(preview.status).toBe(400);
    expect(JSON.stringify(preview.body)).toMatch(/different Curriculum and Grade/);

    const generate = await request(app.getHttpServer())
      .post('/api/v1/quotations/generate')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({ studentId });
    expect(generate.status).toBe(400);
    expect(JSON.stringify(generate.body)).toMatch(/different Curriculum and Grade/);
  });

  it('owner can preview and generate; totals match; snapshot and PDF stay immutable', async () => {
    const { studentId, slabId } = await createQuotedStudent();

    const previewRes = await request(app.getHttpServer())
      .post('/api/v1/quotations/preview')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({ studentId, offerHourlyRate: 70 });
    expect(previewRes.status).toBe(201);
    const preview = previewRes.body.data;
    expect(Number(preview.normalMonthlyTotal)).toBe(800);
    expect(Number(preview.offerMonthlyTotal)).toBe(700);
    expect(Number(preview.totalAmountDue)).toBe(850);
    expect(preview.parentName).toBe('Fatima Ali');
    expect(preview.parentPhone).toBeDefined();
    expect(preview.parentEmail).toBeNull();
    expect(preview.curriculumName).toBe('CBSE');
    expect(preview.gradeName).toBe('Grade 5');
    expect(preview.curriculumName).not.toBe('Cambridge IGCSE');

    const generateRes = await request(app.getHttpServer())
      .post('/api/v1/quotations/generate')
      .set('Authorization', `Bearer ${counsellor1Token}`)
      .send({ studentId, offerHourlyRate: 70 });
    expect(generateRes.status).toBe(201);
    const quotation = generateRes.body.data;
    expect(quotation.quotationNumber).toMatch(/^QUO-/);
    expect(Number(quotation.normalMonthlyTotal)).toBe(Number(preview.normalMonthlyTotal));
    expect(Number(quotation.offerMonthlyTotal)).toBe(Number(preview.offerMonthlyTotal));
    expect(Number(quotation.totalAmountDue)).toBe(Number(preview.totalAmountDue));
    expect(quotation.parentName).toBe('Fatima Ali');
    expect(quotation.parentEmail).toBeNull();
    expect(quotation.curriculumName).toBe('CBSE');
    expect(quotation.accountHolderName).toBe('E2E Test Account Holder');
    expect(quotation.lineItems[0].appliedOfferHourlyRate).toBeDefined();
    expect(Number(quotation.lineItems[0].appliedOfferHourlyRate)).toBe(70);

    const historyRes = await request(app.getHttpServer())
      .get(`/api/v1/quotations/student/${studentId}`)
      .set('Authorization', `Bearer ${counsellor1Token}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data[0].quotationNumber).toBe(quotation.quotationNumber);
    expect(historyRes.body.data[0].creator.email).toBe(TEST_EMAILS[1]);

    const pdfRes = await request(app.getHttpServer())
      .get(`/api/v1/quotations/${quotation.id}/pdf`)
      .set('Authorization', `Bearer ${counsellor1Token}`);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toMatch(/pdf/);
    const pdfText = decodePdfText(Buffer.from(pdfRes.body));
    expect(pdfText).toContain('AED 70/hr');
    expect(pdfText).not.toContain('AED 80/hr');

    await prisma.pricingSlab.update({
      where: { id: slabId },
      data: { hourlyRate: 999 },
    });

    const persisted = await prisma.quotation.findUnique({
      where: { id: quotation.id },
      include: { lineItems: true },
    });
    expect(Number(persisted!.normalMonthlyTotal)).toBe(800);
    expect(Number(persisted!.lineItems[0].originalHourlyRate)).toBe(80);

    const pdfAfter = await request(app.getHttpServer())
      .get(`/api/v1/quotations/${quotation.id}/pdf`)
      .set('Authorization', `Bearer ${counsellor1Token}`);
    const pdfAfterText = decodePdfText(Buffer.from(pdfAfter.body));
    expect(pdfAfterText).toContain('AED 70/hr');
    expect(pdfAfterText).not.toContain('AED 999/hr');
  });

  it('unauthorized counsellor cannot generate for another Lead', async () => {
    const { studentId } = await createQuotedStudent();
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotations/generate')
      .set('Authorization', `Bearer ${counsellor2Token}`)
      .send({ studentId });
    expect(res.status).toBe(403);
  });

  it('lead.read-all bypass allows Sales Head to generate for another counsellor Lead', async () => {
    const { studentId } = await createQuotedStudent();
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotations/generate')
      .set('Authorization', `Bearer ${headToken}`)
      .send({ studentId });
    expect(res.status).toBe(201);
    expect(res.body.data.quotationNumber).toMatch(/^QUO-/);
  });

  it('CEO can view and generate quotations for a counsellor Lead', async () => {
    const { studentId } = await createQuotedStudent();
    const history = await request(app.getHttpServer())
      .get(`/api/v1/quotations/student/${studentId}`)
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(history.status).toBe(200);

    const generated = await request(app.getHttpServer())
      .post('/api/v1/quotations/generate')
      .set('Authorization', `Bearer ${ceoToken}`)
      .send({ studentId });
    expect(generated.status).toBe(201);
    expect(generated.body.data.quotationNumber).toMatch(/^QUO-/);
  });

  it('Sales Head can view quotations for a counsellor Lead', async () => {
    const { studentId } = await createQuotedStudent();
    const res = await request(app.getHttpServer())
      .get(`/api/v1/quotations/student/${studentId}`)
      .set('Authorization', `Bearer ${headToken}`);
    expect(res.status).toBe(200);
  });

  it('unauthorized counsellor cannot view quotations for another Lead', async () => {
    const { studentId } = await createQuotedStudent();
    const res = await request(app.getHttpServer())
      .get(`/api/v1/quotations/student/${studentId}`)
      .set('Authorization', `Bearer ${counsellor2Token}`);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toMatch(/You do not have permission to view quotations for this student/);
  });

  it('God View as Sales Head uses Sales Head authorization and preserves CEO audit attribution', async () => {
    const { studentId } = await createQuotedStudent();

    const history = await request(app.getHttpServer())
      .get(`/api/v1/quotations/student/${studentId}`)
      .set('Authorization', `Bearer ${ceoToken}`)
      .set('X-God-View-Target', headUserId);
    expect(history.status).toBe(200);

    const preview = await request(app.getHttpServer())
      .post('/api/v1/quotations/preview')
      .set('Authorization', `Bearer ${ceoToken}`)
      .set('X-God-View-Target', headUserId)
      .send({ studentId });
    expect(preview.status).toBe(201);

    const generated = await request(app.getHttpServer())
      .post('/api/v1/quotations/generate')
      .set('Authorization', `Bearer ${ceoToken}`)
      .set('X-God-View-Target', headUserId)
      .send({ studentId });
    expect(generated.status).toBe(201);
    expect(generated.body.data.createdBy).toBe(headUserId);

    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: 'Quotation', entityId: generated.body.data.id, action: 'GENERATED' },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit?.actorUserId).toBe(ceoUserId);
    expect((audit?.metadata as any)?.godViewTargetId).toBe(headUserId);
  });

  it('uses canonical quotation.read and does not introduce scoped quotation.read.* permissions', async () => {
    const scoped = await prisma.permission.findMany({
      where: { code: { in: ['quotation.read.own', 'quotation.read.team', 'quotation.read.all'] } },
    });
    expect(scoped).toHaveLength(0);

    const canonical = await prisma.permission.findUnique({ where: { code: 'quotation.read' } });
    expect(canonical).toBeTruthy();
  });
});
