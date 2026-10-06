import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
const req = request.default || request;
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Tutor HR (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hrToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();

    // Ensure test HR user exists and get token
    const res = await req(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'system@elscoreacademy.com', password: 'Password123!' });
    
    hrToken = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdLeadId: string;

  it('Tutor HR can create a new Tutor Lead', async () => {
    const res = await req(app.getHttpServer())
      .post('/tutor-hr/leads')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+971501234567',
        email: 'jane.doe@example.com',
        totalTeachingExperience: 5,
        offlineTeachingExperience: 2
      });

    expect(res.status).toBe(201);
    expect(res.body.currentStage).toBe('LEAD');
    createdLeadId = res.body.id;
  });

  it('Tutor HR can move Lead to TRAINING and trainingStartedAt is recorded correctly', async () => {
    const res = await req(app.getHttpServer())
      .post(`/tutor-hr/leads/${createdLeadId}/stage`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ stage: 'TRAINING' });

    expect(res.status).toBe(201);
    
    // Fetch to verify trainingStartedAt
    const leadRes = await req(app.getHttpServer())
      .get(`/tutor-hr/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${hrToken}`);
      
    expect(leadRes.body.currentStage).toBe('TRAINING');
    expect(leadRes.body.trainingStartedAt).not.toBeNull();
  });

  it('Tutor HR can record a training session for the candidate', async () => {
    const res = await req(app.getHttpServer())
      .post(`/tutor-hr/leads/${createdLeadId}/training`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        sessionDate: '2026-10-01',
        attendanceStatus: 'ATTENDED',
        taskStatus: 'DONE',
        remarks: 'Excellent performance'
      });

    expect(res.status).toBe(201);
    expect(res.body.attendanceStatus).toBe('ATTENDED');
    expect(res.body.taskStatus).toBe('DONE');
  });
});
