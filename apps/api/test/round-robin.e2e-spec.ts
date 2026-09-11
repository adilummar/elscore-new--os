import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/common/auth/auth.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QUEUES } from '../src/common/queue/queue.constants';
import { QueueModule } from '../src/common/queue/queue.module';
import { RbacService } from '../src/common/rbac/rbac.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn(), on: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
  QueueEvents: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
}));

class MockQueueModule {}

describe('RoundRobin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  let salesHeadToken: string;
  let counsellorToken: string;
  let counsellorUserId: string;

  beforeAll(async () => {
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
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    authService = moduleFixture.get<AuthService>(AuthService);

    const headRole = await prisma.role.findFirst({ where: { code: 'SALES_HEAD' } });
    const clRole = await prisma.role.findFirst({ where: { code: 'SALES_COUNSELLOR' } });

    const head = await prisma.user.create({
      data: {
        email: 'rr_head2@test.com',
        passwordHash: 'hash',
        status: 'ACTIVE',
        userRoles: { create: { roleId: headRole!.id } }
      }
    });
    salesHeadToken = (await authService.login(head as any)).accessToken;

    const cl = await prisma.user.create({
      data: {
        email: 'rr_cl2@test.com',
        passwordHash: 'hash',
        status: 'ACTIVE',
        userRoles: { create: { roleId: clRole!.id } }
      }
    });
    counsellorToken = (await authService.login(cl as any)).accessToken;
    counsellorUserId = cl.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: ['rr_head2@test.com', 'rr_cl2@test.com'] } } });
    await app.close();
  });

  it('Counsellor cannot mutate their own availability', async () => {
    await request(app.getHttpServer())
      .patch('/round-robin/me/availability')
      .set('Authorization', `Bearer ${counsellorToken}`)
      .send({ dailyState: 'INACTIVE_FROM_NOW' })
      .expect(404);
      
    await request(app.getHttpServer())
      .patch(`/round-robin/counsellors/${counsellorUserId}`)
      .set('Authorization', `Bearer ${counsellorToken}`)
      .send({ dailyState: 'INACTIVE_FROM_NOW' })
      .expect(403);
  });

  it('Sales Head can update counsellor availability', async () => {
    await request(app.getHttpServer())
      .patch(`/round-robin/counsellors/${counsellorUserId}`)
      .set('Authorization', `Bearer ${salesHeadToken}`)
      .send({ dailyState: 'INACTIVE_FROM_NOW' })
      .expect(200);

    const state = await prisma.roundRobinCounsellorState.findUnique({ where: { userId: counsellorUserId } });
    expect(state!.dailyState).toBe('INACTIVE_FROM_NOW');
  });
});
