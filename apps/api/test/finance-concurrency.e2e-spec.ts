import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';


import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

const request = require('supertest');

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn(), on: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
  QueueEvents: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
}));


describe('FinanceModule Concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authHeader: string;
  let studentId: string;
  let invoiceId: string;
  let invoiceBusinessId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    await prisma.cleanDatabase();
    const execSync = require('child_process').execSync;
    execSync('npx ts-node --require tsconfig-paths/register prisma/seed.ts', { stdio: 'ignore' });

    // Find Sales Head to get permissions
    const salesHead = await prisma.user.findFirst({
      where: { userRoles: { some: { role: { code: 'FINANCE_MANAGER' } } } },
    });
    
    // Create finance manager if not exists
    let financeManager = await prisma.user.findUnique({ where: { email: 'finance@elscore.internal' }});
    if (!financeManager) {
      const role = await prisma.role.findUnique({ where: { code: 'FINANCE_MANAGER' }});
      financeManager = await prisma.user.create({
        data: {
          email: 'finance@elscore.internal',
          passwordHash: 'hash',
          status: 'ACTIVE',
          userRoles: {
            create: { roleId: role!.id }
          }
        }
      });
    }

    const secret = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-in-production-min-32-chars';
    const token = jwtService.sign({ sub: financeManager.id, email: financeManager.email, roles: ['FINANCE_MANAGER'] }, { secret });
    authHeader = `Bearer ${token}`;

    // Create a student
    let salesCounsellor = await prisma.user.findFirst({ where: { userRoles: { some: { role: { code: 'SALES_COUNSELLOR' } } } } });
    if (!salesCounsellor) {
      const scRole = await prisma.role.findUnique({ where: { code: 'SALES_COUNSELLOR' } });
      salesCounsellor = await prisma.user.create({
        data: {
          email: 'counsellor-finance-conc@elscore.internal',
          passwordHash: 'hash',
          status: 'ACTIVE',
          userRoles: { create: { roleId: scRole!.id } }
        }
      });
    }
    const lead = await prisma.lead.create({
      data: {
        businessId: 'LED-0001',
        firstName: 'Fin',
        lastName: 'Student',
        primaryPhone: '+1000000000',
        source: 'WEBSITE',
        creationChannel: 'SALES_COUNSELLOR',
        status: 'ENROLLED',
        assignedToUserId: salesCounsellor.id,
        createdByUserId: salesCounsellor.id,
      }
    });

    const student = await prisma.student.create({
      data: {
        businessId: 'STU-0001',
        leadId: lead.id,
        firstName: 'Fin',
        enrollmentState: 'ENROLLED'
      }
    });
    studentId = student.id;
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('should block simultaneous overpayments via FOR UPDATE row locking', async () => {
    // 1. Create Invoice
    const invoiceRes = await request(app.getHttpServer())
      .post('/finance/invoices/draft')
      .set('Authorization', authHeader)
      .send({
        studentId,
        lineItems: [
          { type: 'TUITION', description: 'Course Fee', quantity: 1, unitAmount: 1000 }
        ]
      })
      .expect(201);
    
    invoiceId = invoiceRes.body.id;
    invoiceBusinessId = invoiceRes.body.businessId;

    // Issue it
    await request(app.getHttpServer())
      .post(`/finance/invoices/${invoiceId}/issue`)
      .set('Authorization', authHeader)
      .expect(201);

    // 2. Perform 3 concurrent payment requests of 600 each.
    // Total invoice is 1000. So 2 should succeed, 1 should fail with overpayment.
    // Actually, 1000 outstanding. 1st (600) succeeds. outstanding=400. 2nd (600) fails. 3rd (600) fails.
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(
        request(app.getHttpServer())
          .post('/finance/payments')
          .set('Authorization', authHeader)
          .send({
            invoiceId,
            amount: 600,
            paymentMethod: 'CASH',
            idempotencyKey: `idem-conc-${i}`
          })
      );
    }

    const results = await Promise.allSettled(promises);
    
    let successCount = 0;
    let failCount = 0;

    for (const res of results) {
      if (res.status === 'fulfilled') {
        const status = (res.value).status;
        if (status === 201) successCount++;
        else if (status === 400) failCount++;
      }
    }

    expect(successCount).toBe(1);
    expect(failCount).toBe(2);

    // Verify invoice outstanding is 400
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Number(inv!.amountPaid)).toBe(600);
    expect(Number(inv!.outstanding)).toBe(400);
  });

  it('should idempotently return same payment on exact idempotency key', async () => {
    const res1 = await request(app.getHttpServer())
      .post('/finance/payments')
      .set('Authorization', authHeader)
      .send({
        invoiceId,
        amount: 200,
        paymentMethod: 'CASH',
        idempotencyKey: `idem-exact-key`
      })
      .expect(201);
      
    const res2 = await request(app.getHttpServer())
      .post('/finance/payments')
      .set('Authorization', authHeader)
      .send({
        invoiceId,
        amount: 200,
        paymentMethod: 'CASH',
        idempotencyKey: `idem-exact-key`
      })
      .expect(201);
      
    expect(res1.body.id).toBe(res2.body.id);
    expect(res1.body.receipt.id).toBe(res2.body.receipt.id);

    // Outstanding should now be 200
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Number(inv!.amountPaid)).toBe(800);
    expect(Number(inv!.outstanding)).toBe(200);
  });
});
