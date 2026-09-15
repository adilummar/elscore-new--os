import * as crypto from 'crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';


// Mock BullMQ completely to prevent Redis connection timeouts on local environments
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

jest.setTimeout(30000);

describe('Marketing Ingestion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testIntegrationToken: string;

  beforeAll(async () => {
    console.log('beforeAll: starting Test.createTestingModule');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    console.log('beforeAll: module compiled');

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    
    console.log('beforeAll: calling app.init()');
    await app.init();
    console.log('beforeAll: app initialized');

    prisma = app.get<PrismaService>(PrismaService);
    
    // Setup test credential
    testIntegrationToken = 'secret-test-token-123';
    const hash = crypto.createHash('sha256').update(testIntegrationToken).digest('hex');

    console.log('beforeAll: calling prisma upsert');
    await prisma.integrationCredential.upsert({
      where: { provider: 'TEST_META' },
      update: { apiKeyHash: hash, isActive: true },
      create: {
        provider: 'TEST_META',
        apiKeyHash: hash,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.integrationCredential.delete({ where: { provider: 'TEST_META' } });
    await app.close();
  });

  it('1. Rejects invalid credentials', async () => {
    await request(app.getHttpServer())
      .post('/marketing/ingest')
      .send({
        firstName: 'John',
        primaryPhone: '15551230001',
        externalLeadId: 'ext-1',
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/marketing/ingest')
      .set('Authorization', 'Bearer invalid-token')
      .send({
        firstName: 'John',
        primaryPhone: '15551230001',
        externalLeadId: 'ext-1',
      })
      .expect(401);
  });

  it('2. Ingests new lead and triggers Round Robin safely', async () => {
    const payload = {
      firstName: 'Ingest',
      lastName: 'New',
      primaryPhone: '15551230002',
      externalLeadId: 'ext-new-1',
      campaignName: 'Summer Sale',
    };

    const res = await request(app.getHttpServer())
      .post('/marketing/ingest')
      .set('Authorization', `Bearer ${testIntegrationToken}`)
      .send(payload);
    
    if (res.status !== 201) console.error('500 Error Body:', res.body);
    
    expect(res.status).toBe(201);

    expect(res.body.status).toBe('CREATED');
    expect(res.body.isDuplicate).toBe(false);

    const lead = await prisma.lead.findUnique({
      where: { id: res.body.leadId },
      include: { marketingInteractions: true },
    });

    expect(lead).toBeDefined();
    expect(lead!.firstName).toBe('Ingest');
    expect(lead!.marketingInteractions).toHaveLength(1);
    expect(lead!.marketingInteractions[0].externalLeadId).toBe('ext-new-1');
    expect(lead!.marketingInteractions[0].isOriginal).toBe(true);
    // Should be automatically assigned due to round robin if configured, but test might not have eligible counsellors seeded
  });

  it('3. Handles idempotency (same provider + externalId)', async () => {
    const payload = {
      firstName: 'Idempotent',
      primaryPhone: '15551230003',
      externalLeadId: 'ext-idem-1',
    };

    // First call
    const res1 = await request(app.getHttpServer())
      .post('/marketing/ingest')
      .set('Authorization', `Bearer ${testIntegrationToken}`)
      .send(payload)
      .expect(201);
    
    expect(res1.body.status).toBe('CREATED');

    // Second call
    const res2 = await request(app.getHttpServer())
      .post('/marketing/ingest')
      .set('Authorization', `Bearer ${testIntegrationToken}`)
      .send(payload)
      .expect(201);

    expect(res2.body.status).toBe('IGNORED_IDEMPOTENT');
    expect(res2.body.leadId).toBe(res1.body.leadId);
  });

  it('4. Handles duplicate normalized phone correctly (does not create 2nd lead)', async () => {
    // Create base lead
    const res1 = await request(app.getHttpServer())
      .post('/marketing/ingest')
      .set('Authorization', `Bearer ${testIntegrationToken}`)
      .send({
        firstName: 'Base',
        primaryPhone: '15551230004',
        externalLeadId: 'ext-base-4',
      })
      .expect(201);
    
    // Now send a duplicate with a slightly different phone string but same normalized value
    // e.g. add dashes or plus sign, but our normalizePhone currently just strips non-digits
    const res2 = await request(app.getHttpServer())
      .post('/marketing/ingest')
      .set('Authorization', `Bearer ${testIntegrationToken}`)
      .send({
        firstName: 'Duplicate',
        primaryPhone: '+1 (555) 123-0004',
        externalLeadId: 'ext-dup-4', // Different external ID
      })
      .expect(201);

    expect(res2.body.status).toBe('DUPLICATE_RECORDED');
    expect(res2.body.leadId).toBe(res1.body.leadId); // Must match!

    const lead = await prisma.lead.findUnique({
      where: { id: res1.body.leadId },
      include: { marketingInteractions: { orderBy: { receivedAt: 'asc' } } },
    });

    expect(lead!.marketingInteractions).toHaveLength(2);
    expect(lead!.marketingInteractions[1].isOriginal).toBe(false);
    expect(lead!.marketingInteractions[1].externalLeadId).toBe('ext-dup-4');
  });

  it('5. Allows same externalLeadId from different providers', async () => {
    // We create a second integration
    const hash2 = crypto.createHash('sha256').update('token-tiktok').digest('hex');
    await prisma.integrationCredential.upsert({
      where: { provider: 'TEST_TIKTOK' },
      update: { apiKeyHash: hash2, isActive: true },
      create: { provider: 'TEST_TIKTOK', apiKeyHash: hash2, isActive: true },
    });

    // Send from META
    await request(app.getHttpServer())
      .post('/marketing/ingest')
      .set('Authorization', `Bearer ${testIntegrationToken}`)
      .send({
        firstName: 'MetaLead',
        primaryPhone: '15551230005',
        externalLeadId: 'shared-ext-id',
      })
      .expect(201);

    // Send from TIKTOK with SAME externalLeadId but DIFFERENT phone (so we verify it creates a new lead and doesn't idempotent drop)
    const res = await request(app.getHttpServer())
      .post('/marketing/ingest')
      .set('Authorization', `Bearer token-tiktok`)
      .send({
        firstName: 'TikTokLead',
        primaryPhone: '15551230006',
        externalLeadId: 'shared-ext-id',
      })
      .expect(201);
    
    expect(res.body.status).toBe('CREATED');
    
    await prisma.integrationCredential.delete({ where: { provider: 'TEST_TIKTOK' } });
  });

  it('6. Handles concurrency for the same phone safely', async () => {
    const payload1 = {
      firstName: 'Race1',
      primaryPhone: '15551230007',
      externalLeadId: 'ext-race-1',
    };
    const payload2 = {
      firstName: 'Race2',
      primaryPhone: '15551230007',
      externalLeadId: 'ext-race-2',
    };

    const req1 = request(app.getHttpServer())
      .post('/marketing/ingest')
      .set('Authorization', `Bearer ${testIntegrationToken}`)
      .send(payload1);

    const req2 = request(app.getHttpServer())
      .post('/marketing/ingest')
      .set('Authorization', `Bearer ${testIntegrationToken}`)
      .send(payload2);

    const [res1, res2] = await Promise.all([req1, req2]);

    expect([res1.status, res2.status]).toEqual([201, 201]);

    const createdCount = [res1.body.status, res2.body.status].filter(s => s === 'CREATED').length;
    const dupCount = [res1.body.status, res2.body.status].filter(s => s === 'DUPLICATE_RECORDED').length;

    expect(createdCount).toBe(1);
    expect(dupCount).toBe(1);
    expect(res1.body.leadId).toBe(res2.body.leadId); // Both resolved to the same lead
  });
});
