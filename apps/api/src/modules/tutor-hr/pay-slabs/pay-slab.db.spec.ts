import { ConflictException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

import { PAY_SLAB_GRADE_CODES } from './pay-slab.constants';
import { PaySlabService } from './pay-slab.service';

/**
 * Real-database check of the slab rules, including the immutability triggers.
 *
 * Skipped unless PAY_SLAB_DB_URL points at the throwaway database (name must end in "_slab_scratch" or
 * "_slab_empty"), which must have the migrations applied and the seed run. Slabs cannot be deleted, so this
 * test leaves its rows behind: never point it at a database you care about.
 *
 *   PAY_SLAB_DB_URL=postgresql://user:pass@127.0.0.1:5433/elscore_slab_empty?schema=public npx jest pay-slab.db
 */
const url = process.env.PAY_SLAB_DB_URL;
const safe = !!url && /\/[a-z_]*_slab_(scratch|empty)\b/.test(url);
const maybe = safe ? describe : describe.skip;

maybe('Pay Slabs against a real database', () => {
  // The first query on a cold Prisma connection can be slow when the whole suite runs in parallel.
  jest.setTimeout(30000);

  let prisma: PrismaService;
  let svc: PaySlabService;
  let actorId: string;
  const run = Date.now().toString(36);
  const rates = PAY_SLAB_GRADE_CODES.map((gradeCode) => ({
    gradeCode,
    rate: gradeCode === 'GRADE_9' ? 140.5 : 130,
  }));
  const input = (name: string) => ({ name, currency: 'INR', rates });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    svc = new PaySlabService(prisma, new AuditService(prisma));
    actorId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;
  });
  afterAll(() => prisma.$disconnect());

  it('creates a slab with exactly 13 rates and returns them KG to Grade 12', async () => {
    const slab = await svc.create(input(`Atomic ${run}`), actorId);
    expect(slab.rates.map((r) => r.gradeCode)).toEqual([...PAY_SLAB_GRADE_CODES]);
    expect(slab.rates.find((r) => r.gradeCode === 'GRADE_9')?.rate).toBe('140.50');
    expect(slab.currency).toBe('INR');
    expect(await prisma.tutorSalarySlabRate.count({ where: { slabId: slab.id } })).toBe(13);
  });

  it('refuses a duplicate name regardless of case and writes nothing', async () => {
    await svc.create(input(`Dupe ${run}`), actorId);
    const before = await prisma.tutorSalarySlab.count();
    await expect(svc.create(input(`dUPE ${run}`), actorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await prisma.tutorSalarySlab.count()).toBe(before);
  });

  it('rolls everything back when the audit row cannot be written (no slab, no rates)', async () => {
    const failing = new PaySlabService(prisma, {
      recordInTx: jest.fn().mockRejectedValue(new Error('audit down')),
    } as never);
    const before = await prisma.tutorSalarySlabRate.count();
    await expect(failing.create(input(`Rollback ${run}`), actorId)).rejects.toThrow('audit down');
    expect(await prisma.tutorSalarySlab.count({ where: { name: `Rollback ${run}` } })).toBe(0);
    expect(await prisma.tutorSalarySlabRate.count()).toBe(before);
  });

  describe('the database itself refuses edits and deletes', () => {
    let slabId: string;
    beforeAll(async () => {
      slabId = (await svc.create(input(`Frozen ${run}`), actorId)).id;
    });

    it('slab update', async () => {
      await expect(
        prisma.tutorSalarySlab.update({ where: { id: slabId }, data: { name: 'Renamed' } }),
      ).rejects.toThrow(/cannot be edited or deleted/);
      await expect(
        prisma.tutorSalarySlab.update({ where: { id: slabId }, data: { isActive: false } }),
      ).rejects.toThrow(/cannot be edited or deleted/);
    });
    it('slab delete', async () => {
      await expect(prisma.tutorSalarySlab.delete({ where: { id: slabId } })).rejects.toThrow(
        /cannot be edited or deleted/,
      );
      await expect(prisma.tutorSalarySlab.deleteMany({ where: { id: slabId } })).rejects.toThrow(
        /cannot be edited or deleted/,
      );
    });
    it('rate update and delete', async () => {
      await expect(
        prisma.tutorSalarySlabRate.updateMany({ where: { slabId }, data: { rate: 1 } }),
      ).rejects.toThrow(/cannot be edited or deleted/);
      await expect(prisma.tutorSalarySlabRate.deleteMany({ where: { slabId } })).rejects.toThrow(
        /cannot be edited or deleted/,
      );
    });
    it('adding a 14th rate row', async () => {
      const olevel = await prisma.grade.findUniqueOrThrow({ where: { code: 'O_LEVEL' } });
      await expect(
        prisma.tutorSalarySlabRate.create({ data: { slabId, gradeId: olevel.id, rate: 100 } }),
      ).rejects.toThrow(/KG to Grade 12/);
    });
    it('is unchanged afterwards', async () => {
      const slab = await svc.get(slabId);
      expect(slab.name).toBe(`Frozen ${run}`);
      expect(slab.rates).toHaveLength(13);
    });
  });
});
