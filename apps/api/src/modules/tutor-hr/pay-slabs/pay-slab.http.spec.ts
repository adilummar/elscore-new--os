import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/rbac/rbac.guard';
import { TutorHrSettingsController } from '../tutor-hr-settings.controller';
import { TutorHrSettingsService } from '../tutor-hr-settings.service';

import { PAY_SLAB_GRADE_CODES } from './pay-slab.constants';
import { PaySlabController } from './pay-slab.controller';
import { PaySlabService } from './pay-slab.service';

/** Real HTTP routing and validation; guards are replaced because authorisation is covered by the permission specs. */
describe('Pay Slab HTTP surface', () => {
  let app: INestApplication;
  const service = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'new' }),
  };
  const settings = { getMotherTongues: jest.fn().mockResolvedValue([]) };
  const SLAB_ID = '3f6b9a5e-1c6d-4c1e-9d0e-0a5f4b1c2d3e';

  const rates = PAY_SLAB_GRADE_CODES.map((gradeCode) => ({ gradeCode, rate: 130 }));
  const body = (over: Record<string, unknown> = {}) => ({
    name: 'French',
    currency: 'INR',
    rates,
    ...over,
  });

  beforeAll(async () => {
    const allow = {
      canActivate: (ctx: ExecutionContext) => {
        ctx.switchToHttp().getRequest().user = { id: 'hr-1' };
        return true;
      },
    };
    const mod = await Test.createTestingModule({
      controllers: [PaySlabController, TutorHrSettingsController],
      providers: [
        { provide: PaySlabService, useValue: service },
        { provide: TutorHrSettingsService, useValue: settings },
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

  describe('editing and deleting are not possible', () => {
    it.each(['patch', 'put', 'delete'] as const)(
      '%s /tutor-hr/pay-slabs/:id is not a route',
      async (verb) => {
        const res = await request(app.getHttpServer())
          [verb](`/tutor-hr/pay-slabs/${SLAB_ID}`)
          .send({ name: 'x' });
        expect(res.status).toBe(404);
      },
    );

    it.each(['patch', 'put', 'delete', 'post', 'get'] as const)(
      'the old %s /tutor-hr/settings/salary-slabs endpoint is gone',
      async (verb) => {
        const url =
          verb === 'post' || verb === 'get'
            ? '/tutor-hr/settings/salary-slabs'
            : `/tutor-hr/settings/salary-slabs/${SLAB_ID}`;
        const res = await request(app.getHttpServer())[verb](url).send(body());
        expect(res.status).toBe(404);
      },
    );

    it('no slab write reaches the service from any of those calls', async () => {
      await request(app.getHttpServer()).patch(`/tutor-hr/pay-slabs/${SLAB_ID}`).send(body());
      await request(app.getHttpServer())
        .patch(`/tutor-hr/settings/salary-slabs/${SLAB_ID}`)
        .send(body());
      expect(service.create).not.toHaveBeenCalled();
    });

    it('the controller only maps GET and POST', () => {
      const proto = PaySlabController.prototype as unknown as Record<string, unknown>;
      const verbs = Object.getOwnPropertyNames(proto)
        .filter((m) => m !== 'constructor')
        .map((m) => Reflect.getMetadata('method', proto[m] as object));
      // Nest RequestMethod: GET = 0, POST = 1
      expect(verbs.sort()).toEqual([0, 0, 1]);
    });
  });

  describe('creating', () => {
    it('accepts a full slab and passes the signed-in user', async () => {
      const res = await request(app.getHttpServer()).post('/tutor-hr/pay-slabs').send(body());
      expect(res.status).toBe(201);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'French', currency: 'INR' }),
        'hr-1',
      );
    });

    it.each([
      ['12 rates', body({ rates: rates.slice(0, 12) })],
      ['14 rates', body({ rates: [...rates, { gradeCode: 'KG', rate: 1 }] })],
      ['a zero rate', body({ rates: [{ gradeCode: 'KG', rate: 0 }, ...rates.slice(1)] })],
      [
        'a rate with three decimals',
        body({ rates: [{ gradeCode: 'KG', rate: 1.234 }, ...rates.slice(1)] }),
      ],
      ['a currency outside INR and AED', body({ currency: 'USD' })],
      ['an empty name', body({ name: '   ' })],
    ])('rejects %s with 400 and never calls the service', async (_l, payload) => {
      const res = await request(app.getHttpServer()).post('/tutor-hr/pay-slabs').send(payload);
      expect(res.status).toBe(400);
      expect(service.create).not.toHaveBeenCalled();
    });
  });
});
