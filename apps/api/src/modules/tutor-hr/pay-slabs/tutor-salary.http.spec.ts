import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/rbac/rbac.guard';
import { PERMISSIONS_KEY } from '../../../common/rbac/require-permissions.decorator';

import { PaySlabController } from './pay-slab.controller';
import { PaySlabService } from './pay-slab.service';
import { TutorSalaryController } from './tutor-salary.controller';
import { TutorSlabAssignmentService } from './tutor-slab-assignment.service';

/** Real HTTP routing and validation; guards are replaced because authorisation is covered by the permission specs. */
describe('Tutor Salary HTTP surface', () => {
  let app: INestApplication;
  const service = {
    getSalary: jest.fn().mockResolvedValue({ current: null }),
    assign: jest.fn().mockResolvedValue({ ok: true }),
    cancel: jest.fn().mockResolvedValue({ ok: true }),
    tutorsOnSlab: jest.fn().mockResolvedValue([]),
  };
  const TUTOR = '3f6b9a5e-1c6d-4c1e-9d0e-0a5f4b1c2d3e';
  const SLAB = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const ROW = '9b8a7c6d-5e4f-4b3a-8d2c-1f0e9d8c7b6a';
  const base = `/tutor-hr/tutors/${TUTOR}`;

  beforeAll(async () => {
    const allow = {
      canActivate: (ctx: ExecutionContext) => {
        ctx.switchToHttp().getRequest().user = { id: 'hr-1' };
        return true;
      },
    };
    const mod = await Test.createTestingModule({
      controllers: [TutorSalaryController, PaySlabController],
      providers: [
        { provide: TutorSlabAssignmentService, useValue: service },
        { provide: PaySlabService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allow)
      .overrideGuard(RbacGuard)
      .useValue(allow)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  describe('permissions on each route', () => {
    const perms = (cls: object, method: string) =>
      Reflect.getMetadata(PERMISSIONS_KEY, (cls as { prototype: Record<string, object> }).prototype[method]);
    it('the Salary tab needs tutor_hr.tutor_salary.view', () => {
      expect(perms(TutorSalaryController, 'salary')).toEqual(['tutor_hr.tutor_salary.view']);
    });
    it('assigning and cancelling need tutor_hr.pay_slab.assign', () => {
      expect(perms(TutorSalaryController, 'assign')).toEqual(['tutor_hr.pay_slab.assign']);
      expect(perms(TutorSalaryController, 'cancel')).toEqual(['tutor_hr.pay_slab.assign']);
    });
    it('the tutors-on-slab list needs tutor_hr.pay_slab.read', () => {
      expect(perms(PaySlabController, 'tutors')).toEqual(['tutor_hr.pay_slab.read']);
    });
  });

  describe('there is no edit or delete', () => {
    it.each(['patch', 'put', 'delete'] as const)('%s on the assignment routes is not a route', async (verb) => {
      for (const url of [`${base}/slab-assignments`, `${base}/slab-assignments/${ROW}`, `${base}/salary`]) {
        const res = await request(app.getHttpServer())[verb](url).send({ slabId: SLAB, reason: 'x' });
        expect(res.status).toBe(404);
      }
    });
    it('the controller maps only one GET and two POSTs', () => {
      const proto = TutorSalaryController.prototype as unknown as Record<string, unknown>;
      const verbs = Object.getOwnPropertyNames(proto)
        .filter((m) => m !== 'constructor')
        .map((m) => Reflect.getMetadata('method', proto[m] as object));
      expect(verbs.sort()).toEqual([0, 1, 1]); // Nest RequestMethod: GET = 0, POST = 1
    });
  });

  it('GET salary passes the tutor id', async () => {
    const res = await request(app.getHttpServer()).get(`${base}/salary`);
    expect(res.status).toBe(200);
    expect(service.getSalary).toHaveBeenCalledWith(TUTOR);
  });

  it('GET pay-slabs/:id/tutors passes the slab id', async () => {
    const res = await request(app.getHttpServer()).get(`/tutor-hr/pay-slabs/${SLAB}/tutors`);
    expect(res.status).toBe(200);
    expect(service.tutorsOnSlab).toHaveBeenCalledWith(SLAB);
  });

  describe('assigning', () => {
    it('passes the tutor, a trimmed reason and the signed-in user', async () => {
      const res = await request(app.getHttpServer())
        .post(`${base}/slab-assignments`)
        .send({ slabId: SLAB, reason: '  Promoted  ' });
      expect(res.status).toBe(201);
      expect(service.assign).toHaveBeenCalledWith(TUTOR, { slabId: SLAB, reason: 'Promoted' }, 'hr-1');
    });

    it.each([
      ['no reason', { slabId: SLAB }],
      ['a blank reason', { slabId: SLAB, reason: '   ' }],
      ['a reason over 500 characters', { slabId: SLAB, reason: 'x'.repeat(501) }],
      ['no slab', { reason: 'ok' }],
      ['a slab id that is not a UUID', { slabId: 'slab-a', reason: 'ok' }],
    ])('rejects %s with 400 and never calls the service', async (_l, payload) => {
      const res = await request(app.getHttpServer()).post(`${base}/slab-assignments`).send(payload);
      expect(res.status).toBe(400);
      expect(service.assign).not.toHaveBeenCalled();
    });

    it('rejects a tutor id that is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/tutor-hr/tutors/not-a-uuid/slab-assignments')
        .send({ slabId: SLAB, reason: 'ok' });
      expect(res.status).toBe(400);
    });

    it('ignores fields it does not know (a client cannot choose the month or the source)', async () => {
      await request(app.getHttpServer())
        .post(`${base}/slab-assignments`)
        .send({ slabId: SLAB, reason: 'ok', fromMonth: '2020-01-01', source: 'DEMO_EVALUATION' });
      expect(service.assign.mock.calls[0][1]).toEqual({ slabId: SLAB, reason: 'ok' });
    });
  });

  describe('cancelling', () => {
    it('passes tutor, assignment, reason and user', async () => {
      const res = await request(app.getHttpServer())
        .post(`${base}/slab-assignments/${ROW}/cancel`)
        .send({ reason: 'Wrong tutor' });
      expect(res.status).toBe(201);
      expect(service.cancel).toHaveBeenCalledWith(TUTOR, ROW, { reason: 'Wrong tutor' }, 'hr-1');
    });

    it('requires a reason', async () => {
      const res = await request(app.getHttpServer())
        .post(`${base}/slab-assignments/${ROW}/cancel`)
        .send({ reason: ' ' });
      expect(res.status).toBe(400);
      expect(service.cancel).not.toHaveBeenCalled();
    });
  });
});
