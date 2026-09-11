import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { QueueModule } from '../src/common/queue/queue.module';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn(), on: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
  QueueEvents: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
}));

/**
 * Auth E2E Test Suite
 *
 * Tests the full authentication flow against a real database.
 * Requires a running PostgreSQL and Redis instance (use docker-compose up).
 *
 * Tests:
 *  1. Login with valid credentials → returns token pair
 *  2. Login with invalid credentials → 401
 *  3. Refresh valid token → returns new token pair
 *  4. Refresh revoked token → 401
 *  5. Access protected endpoint with valid token → 200
 *  6. Access protected endpoint without token → 401
 *  7. Logout → revokes token
 *  8. Use revoked token after logout → 401
 */
describe('Auth (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;

  beforeAll(async () => {
    class MockQueueModule {}

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
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const validCredentials = {
    email: 'admin@elscore.internal',
    password: 'ChangeMe123!',
  };

  let accessToken: string;
  let refreshToken: string;

  describe('POST /api/v1/auth/login', () => {
    it('should return 200 and token pair for valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(validCredentials)
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      accessToken = res.body.data.accessToken as string;
      refreshToken = res.body.data.refreshToken as string;
    });

    it('should return 401 for invalid password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: validCredentials.email, password: 'wrong' })
        .expect(401);
    });

    it('should return 401 for unknown email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'notreal@example.com', password: 'any' })
        .expect(401);
    });

    it('should return 401 for missing email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ password: 'test' })
        .expect(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.email).toBe(validCredentials.email);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('should return 401 with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should return new token pair for valid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      // Update tokens for subsequent tests
      accessToken = res.body.data.accessToken as string;
      const newRefreshToken = res.body.data.refreshToken as string;

      // Old refresh token should be revoked after rotation
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken }) // Old token
        .expect(401);

      refreshToken = newRefreshToken;
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should revoke the refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Refresh token should now be invalid
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });
});
