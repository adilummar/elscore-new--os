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


describe('FinanceModule Rules (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authHeader: string;
  let studentId: string;
  let leadId: string;

  beforeAll(async () => {

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    const execSync = require('child_process').execSync;
    execSync('npx ts-node --require tsconfig-paths/register prisma/seed.ts', { stdio: 'ignore' });

    let financeManager = await prisma.user.findUnique({ where: { email: 'finance2@elscore.internal' }});
    if (!financeManager) {
      const role = await prisma.role.findUnique({ where: { code: 'FINANCE_MANAGER' }});
      financeManager = await prisma.user.create({
        data: {
          email: 'finance2@elscore.internal',
          passwordHash: 'hash',
          status: 'ACTIVE',
          userRoles: { create: { roleId: role!.id } }
        }
      });
    }

    const secret = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-in-production-min-32-chars';
    const token = jwtService.sign({ sub: financeManager.id, email: financeManager.email, roles: ['FINANCE_MANAGER'] }, { secret });
    authHeader = `Bearer ${token}`;

    let salesCounsellor = await prisma.user.findFirst({ where: { userRoles: { some: { role: { code: 'SALES_COUNSELLOR' } } } } });
    if (!salesCounsellor) {
      const scRole = await prisma.role.findUnique({ where: { code: 'SALES_COUNSELLOR' } });
      salesCounsellor = await prisma.user.create({
        data: {
          email: 'counsellor-finance-rules@elscore.internal',
          passwordHash: 'hash',
          status: 'ACTIVE',
          userRoles: { create: { roleId: scRole!.id } }
        }
      });
    }
    const lead = await prisma.lead.create({
      data: {
        businessId: 'LED-0002',
        firstName: 'Rules',
        lastName: 'Student',
        primaryPhone: '+1000000002',
        source: 'WEBSITE',
        creationChannel: 'SALES_COUNSELLOR',
        status: 'ENROLLED',
        assignedToUserId: salesCounsellor.id,
        createdByUserId: salesCounsellor.id,
      }
    });
    leadId = lead.id;

    const student = await prisma.student.create({
      data: {
        businessId: 'STU-0002',
        leadId: lead.id,
        firstName: 'Rules',
        enrollmentState: 'ENROLLED'
      }
    });
    studentId = student.id;
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('should draft and issue invoice, generating PDF', async () => {
    const res = await request(app.getHttpServer())
      .post('/finance/invoices/draft')
      .set('Authorization', authHeader)
      .send({
        studentId,
        discountAmount: 100,
        lineItems: [
          { type: 'REGISTRATION_FEE', description: 'Reg Fee', quantity: 1, unitAmount: 500 },
          { type: 'TUITION', description: 'Tuition Fee', quantity: 1, unitAmount: 2000 }
        ],
        installments: [
          { sequence: 1, amount: 1200, dueDate: new Date().toISOString() },
          { sequence: 2, amount: 1200, dueDate: new Date().toISOString() }
        ]
      })
      .expect(201);
    
    expect(res.body.status).toBe('DRAFT');
    expect(Number(res.body.total)).toBe(2400); // 2500 - 100

    await request(app.getHttpServer())
      .post(`/finance/invoices/${res.body.id}/issue`)
      .set('Authorization', authHeader)
      .expect(201);

    const pdfRes = await request(app.getHttpServer())
      .get(`/finance/invoices/${res.body.id}/pdf`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect(pdfRes.body.toString('utf8')).toContain('%PDF');
  });

  it('should allocate payments oldest-first and reject reg fee refund', async () => {
    // 1. Create Invoice
    const invoiceRes = await request(app.getHttpServer())
      .post('/finance/invoices/draft')
      .set('Authorization', authHeader)
      .send({
        studentId,
        lineItems: [
          { type: 'REGISTRATION_FEE', description: 'Reg Fee', quantity: 1, unitAmount: 500 },
          { type: 'TUITION', description: 'Tuition Fee', quantity: 1, unitAmount: 1500 }
        ],
        installments: [
          { sequence: 1, amount: 1000, dueDate: new Date().toISOString() },
          { sequence: 2, amount: 1000, dueDate: new Date().toISOString() }
        ]
      })
      .expect(201);
    
    const invoiceId = invoiceRes.body.id;
    
    await request(app.getHttpServer())
      .post(`/finance/invoices/${invoiceId}/issue`)
      .set('Authorization', authHeader)
      .expect(201);

    // 2. Partial installment payment (1200) -> should cover 1st and partially 2nd
    const pmt1Res = await request(app.getHttpServer())
      .post('/finance/payments')
      .set('Authorization', authHeader)
      .send({ invoiceId, amount: 1200, paymentMethod: 'CASH', idempotencyKey: 'pmt-1' })
      .expect(201);

    const check1 = await request(app.getHttpServer())
      .get(`/finance/invoices/${invoiceId}`)
      .set('Authorization', authHeader)
      .expect(200);
      
    expect(check1.body.installments[0].status).toBe('PAID');
    expect(Number(check1.body.installments[1].amountPaid)).toBe(200);
    expect(check1.body.installments[1].status).toBe('PARTIALLY_PAID');

    // 3. Exact invoice balance payment
    await request(app.getHttpServer())
      .post('/finance/payments')
      .set('Authorization', authHeader)
      .send({ invoiceId, amount: 800, paymentMethod: 'CASH', idempotencyKey: 'pmt-2' })
      .expect(201);

    const check2 = await request(app.getHttpServer())
      .get(`/finance/invoices/${invoiceId}`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(check2.body.status).toBe('PAID');
    expect(Number(check2.body.outstanding)).toBe(0);

    // 4. Overpayment rejection
    await request(app.getHttpServer())
      .post('/finance/payments')
      .set('Authorization', authHeader)
      .send({ invoiceId, amount: 100, paymentMethod: 'CASH', idempotencyKey: 'pmt-3' })
      .expect(400);

    // 5. Reg fee refund rejection
    // Invoice total = 2000. Reg fee = 500. Refundable = 1500.
    // Try to refund 1600 from the first payment (which is 1200) - wait, payment 1 is 1200. Max refund from it is 1200.
    // So let's request refund of 1200 on pmt1, and 400 on pmt2.
    // 1200 on pmt1:
    await request(app.getHttpServer())
      .post('/finance/refunds/request')
      .set('Authorization', authHeader)
      .send({ paymentId: pmt1Res.body.id, amount: 1200, reason: 'Drop out' })
      .expect(201);

    // Now 1200 is requested. Remaining refundable = 1500 - 1200 = 300.
    // Try to refund 400 on pmt2. Should fail because it exceeds 300 (which touches the reg fee limit).
    await request(app.getHttpServer())
      .post('/finance/refunds/request')
      .set('Authorization', authHeader)
      .send({ paymentId: check2.body.payments[1].id, amount: 400, reason: 'Drop out more' })
      .expect(400);
  });
});
