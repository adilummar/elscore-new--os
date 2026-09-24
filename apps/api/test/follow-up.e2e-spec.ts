import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QueueModule } from '../src/common/queue/queue.module';
import { FollowUpOverdueProcessor } from '../src/modules/follow-up/processors/follow-up-overdue.processor';
import { FollowUpReminderProcessor } from '../src/modules/follow-up/processors/follow-up-reminder.processor';

class MockQueueModule {}

const TEST_PASSWORD = 'TestPassword123!';
const TEST_HASH = '$argon2id$v=19$m=65536,t=3,p=4$F8nnI8hF9A3BlyGdByiRoQ$wPiFQ/OJIFSbeMyUuGhTZ/4KdrmXoptkeZe1Kkqknio';

describe('FollowUpModule (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let headToken: string;
  let counsellorToken: string;
  let counsellorId: string;
  let leadId: string;

  const loginAs = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD });
    return res.body.data.accessToken;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CACHE_MANAGER).useValue({ get: () => Promise.resolve(null), set: () => Promise.resolve(), del: () => Promise.resolve() })
      
      .overrideProvider(FollowUpReminderProcessor).useValue({})
      .overrideProvider(FollowUpOverdueProcessor).useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    await prisma.cleanDatabase();

    const roleHead = await prisma.role.findUnique({ where: { code: 'SALES_HEAD' } });
    const roleCounsellor = await prisma.role.findUnique({ where: { code: 'SALES_COUNSELLOR' } });
    const deptSales = await prisma.department.findUnique({ where: { code: 'SALES' } });

    const head = await prisma.user.create({
      data: {
        email: 'head_fup@elscore.test', passwordHash: TEST_HASH, status: 'ACTIVE',
        userRoles: { create: { roleId: roleHead!.id } },
        employee: { create: { businessId: 'EMP-F01', departmentId: deptSales!.id, firstName: 'Head', lastName: 'Fup' } },
      },
    });

    const counsellor = await prisma.user.create({
      data: {
        email: 'counsellor_fup@elscore.test', passwordHash: TEST_HASH, status: 'ACTIVE',
        userRoles: { create: { roleId: roleCounsellor!.id } },
        employee: { create: { businessId: 'EMP-F02', departmentId: deptSales!.id, firstName: 'Counsellor', lastName: 'Fup' } },
      },
    });
    counsellorId = counsellor.id;

    headToken = await loginAs('head_fup@elscore.test');
    counsellorToken = await loginAs('counsellor_fup@elscore.test');

    const leadRes = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${counsellorToken}`)
      .send({ firstName: 'Fup', lastName: 'Test', primaryPhone: '5550001111', leadSource: 'WEBSITE' });
    leadId = leadRes.body.data.id;
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('creates a follow-up successfully', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/leads/${leadId}/follow-ups`)
      .set('Authorization', `Bearer ${counsellorToken}`)
      .send({ scheduledAt: new Date(Date.now() + 86400000).toISOString(), remarks: 'First follow up' });

    expect(res.status).toBe(201);
    expect(res.body.data.businessId).toMatch(/^FUP-\d{4}$/);
    expect(res.body.data.status).toBe('SCHEDULED');

    const leadRes = await request(app.getHttpServer())
      .get(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${counsellorToken}`);
    expect(leadRes.body.data.requiresFollowUp).toBe(true);
  });

  it('fetches aggregate follow-ups (all)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/follow-ups?view=all')
      .set('Authorization', `Bearer ${counsellorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
