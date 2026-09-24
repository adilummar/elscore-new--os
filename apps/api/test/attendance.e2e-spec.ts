import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RbacService } from '../src/common/rbac/rbac.service';

const request = require('supertest');

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), upsertJobScheduler: jest.fn(), close: jest.fn(), on: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
  QueueEvents: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
}));

describe('AttendanceModule (e2e)', () => {
  jest.setTimeout(120000);
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let tutorToken: string;
  let mentorToken: string;
  let tutorId: string;
  let studentId: string;
  let tcrId: string;

  beforeAll(async () => {
    jest.setTimeout(120000);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    // Grab a Tutor (or use a Counsellor as placeholder if Tutor doesn't exist)
    let tutor = await prisma.user.findFirst({ where: { userRoles: { some: { role: { code: 'TUTOR' } } } } });
    if (!tutor) {
      const role = await prisma.role.findUnique({ where: { code: 'TUTOR' }});
      if (!role) {
         // Create TUTOR role if doesn't exist
         const r = await prisma.role.create({ data: { code: 'TUTOR', name: 'Tutor', description: 'Tutor' }});
         tutor = await prisma.user.create({
           data: { email: 'tutor@test.internal', passwordHash: 'hash', status: 'ACTIVE', userRoles: { create: { roleId: r.id } } }
         });
      } else {
         tutor = await prisma.user.create({
           data: { email: 'tutor@test.internal', passwordHash: 'hash', status: 'ACTIVE', userRoles: { create: { roleId: role.id } } }
         });
      }
    }
    tutorId = tutor.id;
    tutorToken = jwtService.sign({ sub: tutor.id, email: tutor.email, roles: ['TUTOR'] }, { secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production-min-32-chars' });

    let mentor = await prisma.user.findFirst({ where: { userRoles: { some: { role: { code: 'MENTOR' } } } } });
    if (!mentor) {
      const role = await prisma.role.findUnique({ where: { code: 'MENTOR' }});
      mentor = await prisma.user.create({
        data: { email: 'mentor@test.internal', passwordHash: 'hash', status: 'ACTIVE', userRoles: { create: { roleId: role!.id } } }
      });
    }
    mentorToken = jwtService.sign({ sub: mentor.id, email: mentor.email, roles: ['MENTOR'] }, { secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production-min-32-chars' });

    // Seed the necessary permissions for the tests to pass the guards
    const markPerm = await prisma.permission.upsert({ where: { code: 'attendance.tutor.mark' }, update: {}, create: { code: 'attendance.tutor.mark', resource: 'attendance.tutor', action: 'mark', description: '', isDelegatable: false } });
    const verifyPerm = await prisma.permission.upsert({ where: { code: 'attendance.tutor.verify' }, update: {}, create: { code: 'attendance.tutor.verify', resource: 'attendance.tutor', action: 'verify', description: '', isDelegatable: false } });
    
    // Assign to roles
    const tutorRole = await prisma.role.findUnique({ where: { code: 'TUTOR' }});
    const mentorRole = await prisma.role.findUnique({ where: { code: 'MENTOR' }});
    
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: tutorRole!.id, permissionId: markPerm.id } }, update: {}, create: { roleId: tutorRole!.id, permissionId: markPerm.id } });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: mentorRole!.id, permissionId: verifyPerm.id } }, update: {}, create: { roleId: mentorRole!.id, permissionId: verifyPerm.id } });

    const rbacService = app.get(RbacService);
    await rbacService.invalidateCache(tutorId);
    await rbacService.invalidateCache(mentor.id);

    const student = await prisma.student.findFirst();
    if (student) {
      studentId = student.id;
    } else {
      const lead = await prisma.lead.create({
        data: {
          businessId: 'LED-ATT-1',
          firstName: 'Att',
          lastName: 'Student',
          primaryPhone: '1111111111',
          source: 'WEBSITE',
          creationChannel: 'SALES_COUNSELLOR',
          status: 'ENROLLED',
          assignedToUserId: mentor.id,
          createdByUserId: mentor.id,
        }
      });
      const st = await prisma.student.create({
        data: {
          businessId: 'STU-ATT-1',
          leadId: lead.id,
          firstName: 'Att',
          enrollmentState: 'ENROLLED'
        }
      });
      studentId = st.id;
    }
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('Tutor can submit a class record', async () => {
    const res = await request(app.getHttpServer())
      .post('/attendance/tutor-class-record')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({
        sessionId: 'sess-001',
        tutorId,
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
        actualStart: new Date().toISOString(),
        actualEnd: new Date(Date.now() + 3600000).toISOString(),
        workedMinutes: 60,
        cancellation: 'NOT_CANCELLED',
        studentAttendances: [
          {
            sessionId: 'sess-001',
            studentId,
            status: 'PRESENT',
            actualStart: new Date().toISOString(),
            actualEnd: new Date(Date.now() + 3600000).toISOString(),
          }
        ]
      });
      
    if (res.status !== 201) console.log('TUTOR SUBMIT FAILED', res.body);
    expect(res.status).toBe(201);

    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.isPayrollReady).toBe(false);
    expect(res.body.studentAttendances.length).toBe(1);
    expect(res.body.studentAttendances[0].status).toBe('PRESENT');
    
    tcrId = res.body.id;
  });

  it('Mentor can verify the submitted class record', async () => {
    const res = await request(app.getHttpServer())
      .post(`/attendance/tutor-class-record/${tcrId}/verify`)
      .set('Authorization', `Bearer ${mentorToken}`);
      
    if (res.status !== 201) console.log('MENTOR VERIFY FAILED', res.body);
    expect(res.status).toBe(201);

    expect(res.body.status).toBe('VERIFIED');
    expect(res.body.isPayrollReady).toBe(true);
  });
});
