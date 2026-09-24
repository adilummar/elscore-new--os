import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Rate Limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows normal requests and blocks excessive requests', async () => {
    let status200Count = 0;
    let status429Count = 0;

    // The limit is 100 requests per 60 seconds (from app.module.ts)
    // We send 105 requests
    for (let i = 0; i < 105; i++) {
      const res = await request(app.getHttpServer()).get('/health');
      if (res.status === 200) {
        status200Count++;
      } else if (res.status === 429) {
        status429Count++;
      }
    }

    expect(status200Count).toBeLessThanOrEqual(100);
    expect(status429Count).toBeGreaterThan(0);
  }, 30000); // give it more time
});
