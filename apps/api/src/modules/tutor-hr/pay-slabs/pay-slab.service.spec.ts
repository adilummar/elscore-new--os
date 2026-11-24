import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PAY_SLAB_GRADE_CODES } from './pay-slab.constants';
import { CreatePaySlabDto } from './pay-slab.dto';
import { PaySlabService } from './pay-slab.service';

const gradeRows = PAY_SLAB_GRADE_CODES.map((code) => ({ id: `g-${code}`, code }));

function fullRates(overrides: Record<string, number> = {}) {
  return PAY_SLAB_GRADE_CODES.map((gradeCode) => ({
    gradeCode,
    rate: overrides[gradeCode] ?? 130,
  }));
}

function dto(over: Partial<CreatePaySlabDto> = {}): CreatePaySlabDto {
  return {
    name: 'French',
    currency: 'INR',
    rates: fullRates({ GRADE_9: 140, GRADE_10: 140 }),
    ...over,
  };
}

/**
 * `tx` is the transaction client. The top-level prisma object only offers $transaction and the read used to
 * return the finished slab, so any write that bypasses the transaction fails the test (the mock does not exist).
 */
function make(
  opts: {
    existing?: { name: string } | null;
    grades?: typeof gradeRows;
    createManyError?: Error;
  } = {},
) {
  const tx = {
    tutorSalarySlab: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
      create: jest.fn().mockResolvedValue({ id: 'slab-1' }),
    },
    grade: { findMany: jest.fn().mockResolvedValue(opts.grades ?? gradeRows) },
    tutorSalarySlabRate: {
      createMany: opts.createManyError
        ? jest.fn().mockRejectedValue(opts.createManyError)
        : jest.fn().mockResolvedValue({ count: 13 }),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: unknown) => unknown) => Promise.resolve(fn(tx))),
    tutorSalarySlab: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'slab-1',
        name: 'French',
        currency: 'INR',
        createdAt: new Date('2026-11-24'),
        rates: gradeRows.map((g, i) => ({
          rate: '130',
          grade: { code: g.code, name: g.code, sortOrder: i + 1 },
        })),
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const audit = { recordInTx: jest.fn().mockResolvedValue(undefined) };
  const svc = new PaySlabService(prisma as never, audit as never);
  return { svc, prisma, tx, audit };
}

describe('PaySlabService', () => {
  describe('there is no way to edit or delete a slab', () => {
    it('exposes only list, get and create', () => {
      const methods = Object.getOwnPropertyNames(PaySlabService.prototype).filter(
        (m) => m !== 'constructor' && m !== 'validateRates',
      );
      expect(methods.sort()).toEqual(['create', 'get', 'list']);
    });

    it('never calls update, delete or upsert on a slab or its rates', async () => {
      const { svc, prisma, tx } = make();
      await svc.create(dto(), 'u1');
      await svc.list();
      await svc.get('slab-1');
      const forbidden = /^(update|updateMany|delete|deleteMany|upsert)$/;
      for (const model of [
        prisma.tutorSalarySlab,
        tx.tutorSalarySlab,
        tx.tutorSalarySlabRate,
      ] as Array<Record<string, unknown>>) {
        expect(Object.keys(model).filter((k) => forbidden.test(k))).toEqual([]);
      }
    });
  });

  describe('creating a slab', () => {
    it('writes the slab, all 13 rates and the audit row inside one transaction', async () => {
      const { svc, prisma, tx, audit } = make();
      const view = await svc.create(dto(), 'u1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.tutorSalarySlab.create).toHaveBeenCalledTimes(1);
      expect(tx.tutorSalarySlabRate.createMany).toHaveBeenCalledTimes(1);
      const rows = tx.tutorSalarySlabRate.createMany.mock.calls[0][0].data;
      expect(rows).toHaveLength(13);
      expect(new Set(rows.map((r: { gradeId: string }) => r.gradeId)).size).toBe(13);
      expect(rows.find((r: { gradeId: string }) => r.gradeId === 'g-GRADE_9').rate).toBe(140);
      expect(tx.tutorSalarySlab.create.mock.calls[0][0].data).toMatchObject({
        name: 'French',
        currency: 'INR',
        hourlyRate: 130,
      });
      expect(audit.recordInTx).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: 'PAY_SLAB_CREATED', actorUserId: 'u1' }),
      );
      expect(view.rates).toHaveLength(13);
      expect(view.rates[0].gradeCode).toBe('KG');
      expect(view.rates[12].gradeCode).toBe('GRADE_12');
    });

    it('leaves nothing behind when the rates cannot be written (the error leaves the transaction, which rolls back)', async () => {
      const boom = new Error('rates failed');
      const { svc, prisma, audit } = make({ createManyError: boom });
      await expect(svc.create(dto(), 'u1')).rejects.toBe(boom);
      expect(audit.recordInTx).not.toHaveBeenCalled();
      expect(prisma.tutorSalarySlab.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['12 rates (a grade missing)', fullRates().slice(0, 12)],
      ['14 rates', [...fullRates(), { gradeCode: 'O_LEVEL', rate: 100 }]],
      ['a duplicated grade', [...fullRates().slice(0, 12), { gradeCode: 'KG', rate: 99 }]],
      [
        'a grade outside KG..Grade 12',
        [...fullRates().slice(0, 12), { gradeCode: 'A_LEVEL', rate: 100 }],
      ],
    ])('refuses %s and does not open a transaction', async (_label, rates) => {
      const { svc, prisma } = make();
      await expect(svc.create(dto({ rates }), 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a name that already exists, ignoring case', async () => {
      const { svc, tx } = make({ existing: { name: 'French' } });
      await expect(svc.create(dto({ name: '  fRENCH ' }), 'u1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.tutorSalarySlab.findFirst.mock.calls[0][0].where).toEqual({
        name: { equals: 'fRENCH', mode: 'insensitive' },
      });
      expect(tx.tutorSalarySlab.create).not.toHaveBeenCalled();
      expect(tx.tutorSalarySlabRate.createMany).not.toHaveBeenCalled();
    });

    it('turns a unique-index race on the exact name into a conflict', async () => {
      const { svc, tx } = make();
      tx.tutorSalarySlab.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(svc.create(dto(), 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('stops with a clear message when the grade list is incomplete', async () => {
      const { svc, tx } = make({ grades: gradeRows.slice(0, 12) });
      await expect(svc.create(dto(), 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.tutorSalarySlab.create).not.toHaveBeenCalled();
    });
  });

  it('reports a missing slab as not found', async () => {
    const { svc, prisma } = make();
    prisma.tutorSalarySlab.findUnique.mockResolvedValue(null);
    await expect(svc.get('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
