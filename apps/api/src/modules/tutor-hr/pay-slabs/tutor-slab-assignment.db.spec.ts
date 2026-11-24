import { ConflictException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

import { PAY_SLAB_GRADE_CODES } from './pay-slab.constants';
import { PaySlabService } from './pay-slab.service';
import { addMonths, monthText, TutorSlabAssignmentService } from './tutor-slab-assignment.service';

/**
 * Real-database check of tutor slab assignments, including the triggers and constraints of migration
 * 20261124110000_tutor_slab_assignments.
 *
 * Skipped unless PAY_SLAB_DB_URL points at the throwaway database (name must end in "_slab_scratch" or
 * "_slab_empty"), which must have the migrations applied and the seed run. Assignment history cannot be deleted,
 * so this test leaves its rows behind: never point it at a database you care about.
 *
 *   PAY_SLAB_DB_URL=postgresql://user:pass@127.0.0.1:5433/elscore_slab_empty?schema=public npx jest tutor-slab-assignment.db
 */
const url = process.env.PAY_SLAB_DB_URL;
const safe = !!url && /\/[a-z_]*_slab_(scratch|empty)\b/.test(url);
const maybe = safe ? describe : describe.skip;

maybe('Tutor slab assignments against a real database', () => {
  jest.setTimeout(60000);

  let prisma: PrismaService;
  let svc: TutorSlabAssignmentService;
  let slabs: PaySlabService;
  let actorId: string;
  let departmentId: string;
  let slabA: string;
  let slabB: string;
  let month: Date; // the business month, from the database clock
  let next: Date;
  const run = Date.now().toString(36);
  let seq = 0;

  const rates = (rate: number) => PAY_SLAB_GRADE_CODES.map((gradeCode) => ({ gradeCode, rate }));

  /** A tutor with a Tutor ID and no slab. */
  async function newTutor(): Promise<string> {
    const n = `${run}-${++seq}`;
    const user = await prisma.user.create({
      data: { email: `slab-${n}@test.local`, passwordHash: 'x' },
    });
    const employee = await prisma.employee.create({
      data: { businessId: `EMP-S${n}`, userId: user.id, departmentId, firstName: 'Slab', lastName: `Tutor ${n}` },
    });
    const profile = await prisma.tutorProfile.create({
      data: { employeeId: employee.id, tutorCode: `TUT-S${n}` },
    });
    return profile.id;
  }

  /** A candidate with a demo evaluation that chose a slab (or none). */
  async function evaluatedLead(salarySlabId: string | null): Promise<string> {
    const n = `${run}-${++seq}`;
    const lead = await prisma.tutorLead.create({
      data: { businessId: `TL-S${n}`, firstName: 'Slab', lastName: 'Candidate', phone: `9${seq}`, createdByUserId: actorId },
    });
    const booking = await prisma.tutorDemoBooking.create({
      data: { tutorLeadId: lead.id, scheduledAt: new Date(), bookedByUserId: actorId, assignedToUserId: actorId },
    });
    await prisma.tutorDemoEvaluation.create({
      data: {
        bookingId: booking.id, tutorLeadId: lead.id, evaluatedByUserId: actorId,
        teachingMethods: 'm', technicalSkills: 's', englishRating: 4, salarySlabId,
      },
    });
    return lead.id;
  }

  const rowsOf = (tutorProfileId: string) =>
    prisma.tutorSlabAssignment.findMany({ where: { tutorProfileId }, orderBy: [{ fromMonth: 'asc' }, { createdAt: 'asc' }] });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    svc = new TutorSlabAssignmentService(prisma, audit);
    slabs = new PaySlabService(prisma, audit);
    actorId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;
    departmentId = (await prisma.department.findFirstOrThrow({ select: { id: true } })).id;
    slabA = (await slabs.create({ name: `Assign A ${run}`, currency: 'INR', rates: rates(100) }, actorId)).id;
    slabB = (await slabs.create({ name: `Assign B ${run}`, currency: 'INR', rates: rates(140) }, actorId)).id;
    month = await svc.currentMonth();
    next = addMonths(month, 1);
  });
  afterAll(() => prisma.$disconnect());

  it('uses the Asia/Kolkata month from the database clock', async () => {
    const [{ m }] = await prisma.$queryRaw<Array<{ m: Date }>>`
      SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date AS m`;
    expect(monthText(month)).toBe(monthText(m));
  });

  describe('first slab from the demo evaluation (Ready for Assignment)', () => {
    it('starts in the current month, source DEMO_EVALUATION, linked to the evaluation', async () => {
      const tutor = await newTutor();
      const leadId = await evaluatedLead(slabA);
      const r = await prisma.$transaction((tx) =>
        svc.assignFirstFromEvaluation(tx as never, { tutorProfileId: tutor, tutorLeadId: leadId, actorUserId: actorId }),
      );
      expect(r?.slabId).toBe(slabA);
      const [row] = await rowsOf(tutor);
      expect(monthText(row.fromMonth)).toBe(monthText(month));
      expect(row.toMonth).toBeNull();
      expect(row.source).toBe('DEMO_EVALUATION');
      expect(row.evaluationId).not.toBeNull();
      const salary = await svc.getSalary(tutor);
      expect(salary.current?.slabName).toContain('Assign A');
      expect(salary.current?.slab?.rates).toHaveLength(13);
      expect(salary.pending).toBeNull();
    });

    it('creates nothing when the evaluation chose no slab', async () => {
      const tutor = await newTutor();
      const leadId = await evaluatedLead(null);
      await prisma.$transaction((tx) =>
        svc.assignFirstFromEvaluation(tx as never, { tutorProfileId: tutor, tutorLeadId: leadId, actorUserId: actorId }),
      );
      expect(await rowsOf(tutor)).toHaveLength(0);
      const salary = await svc.getSalary(tutor);
      expect(salary.current).toBeNull();
    });

    it('rolls back with the surrounding transaction (no row if the transaction fails afterwards)', async () => {
      const tutor = await newTutor();
      const leadId = await evaluatedLead(slabA);
      await expect(
        prisma.$transaction(async (tx) => {
          await svc.assignFirstFromEvaluation(tx, { tutorProfileId: tutor, tutorLeadId: leadId, actorUserId: actorId });
          throw new Error('later step failed');
        }),
      ).rejects.toThrow('later step failed');
      expect(await rowsOf(tutor)).toHaveLength(0);
    });
  });

  describe('a tutor with no slab', () => {
    it('shows no slab, then HR gives a first slab starting this month', async () => {
      const tutor = await newTutor();
      expect((await svc.getSalary(tutor)).current).toBeNull();
      const out = await svc.assign(tutor, { slabId: slabB, reason: 'Tutor had no slab' }, actorId);
      expect(out.current?.source).toBe('HR_INITIAL');
      expect(out.current?.fromMonth).toBe(monthText(month));
      expect(out.pending).toBeNull();
    });
  });

  describe('a change in the middle of a month takes effect next month', () => {
    let tutor: string;
    beforeAll(async () => {
      tutor = await newTutor();
      await svc.assign(tutor, { slabId: slabA, reason: 'first' }, actorId);
    });

    it('closes the current row at this month and schedules the new slab from next month', async () => {
      const out = await svc.assign(tutor, { slabId: slabB, reason: 'Promoted after review' }, actorId);
      expect(out.current?.slabName).toContain('Assign A'); // still A this month
      expect(out.pending?.slabName).toContain('Assign B');
      expect(out.pending?.fromMonth).toBe(monthText(next));
      expect(out.pending?.canCancel).toBe(true);
      const [first, change] = await rowsOf(tutor);
      expect(monthText(first.toMonth!)).toBe(monthText(month));
      expect(change.toMonth).toBeNull();
      expect(change.source).toBe('HR_CHANGE');
    });

    it('refuses a second change while one is waiting', async () => {
      await expect(svc.assign(tutor, { slabId: slabA, reason: 'again' }, actorId)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('cancelling a change before its month starts', () => {
    let tutor: string;
    let changeId: string;
    beforeAll(async () => {
      tutor = await newTutor();
      await svc.assign(tutor, { slabId: slabA, reason: 'first' }, actorId);
      const out = await svc.assign(tutor, { slabId: slabB, reason: 'by mistake' }, actorId);
      changeId = out.pending!.id;
    });

    it('keeps the row, marks it cancelled and gives the old slab back', async () => {
      const out = await svc.cancel(tutor, changeId, { reason: 'Entered for the wrong tutor' }, actorId);
      expect(out.pending).toBeNull();
      expect(out.current?.slabName).toContain('Assign A');
      const rows = await rowsOf(tutor);
      expect(rows).toHaveLength(2);
      const cancelled = rows.find((r) => r.id === changeId)!;
      expect(cancelled.cancelledAt).not.toBeNull();
      expect(cancelled.cancelledByUserId).toBe(actorId);
      expect(cancelled.cancelReason).toBe('Entered for the wrong tutor');
      expect(rows.find((r) => r.id !== changeId)!.toMonth).toBeNull(); // Present again
      expect(out.history.find((h) => h.id === changeId)?.cancelled?.reason).toBe('Entered for the wrong tutor');
    });

    it('cannot be cancelled twice', async () => {
      await expect(svc.cancel(tutor, changeId, { reason: 'again' }, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows a new change afterwards', async () => {
      const out = await svc.assign(tutor, { slabId: slabB, reason: 'Entered correctly' }, actorId);
      expect(out.pending?.fromMonth).toBe(monthText(next));
      expect(await rowsOf(tutor)).toHaveLength(3);
    });

    it('refuses to cancel the first slab', async () => {
      const first = (await rowsOf(tutor)).find((r) => r.source === 'HR_INITIAL')!;
      await expect(svc.cancel(tutor, first.id, { reason: 'no' }, actorId)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('rolls everything back when the audit row cannot be written', async () => {
    const tutor = await newTutor();
    const failing = new TutorSlabAssignmentService(prisma, {
      recordInTx: jest.fn().mockRejectedValue(new Error('audit down')),
    } as never);
    await expect(failing.assign(tutor, { slabId: slabA, reason: 'x' }, actorId)).rejects.toThrow('audit down');
    expect(await rowsOf(tutor)).toHaveLength(0);
  });

  describe('the database itself refuses what the service never does', () => {
    let tutor: string;
    let firstId: string;
    beforeAll(async () => {
      tutor = await newTutor();
      await svc.assign(tutor, { slabId: slabA, reason: 'first' }, actorId);
      await svc.assign(tutor, { slabId: slabB, reason: 'change' }, actorId);
      firstId = (await rowsOf(tutor))[0].id;
    });

    const insert = (fromMonth: Date, source = 'HR_CHANGE', slabId = slabA) =>
      prisma.tutorSlabAssignment.create({
        data: { tutorProfileId: tutor, slabId, fromMonth, source, changedByUserId: actorId, reason: 'raw' },
      });

    it('edits and deletes of history', async () => {
      await expect(prisma.tutorSlabAssignment.update({ where: { id: firstId }, data: { slabId: slabB } })).rejects.toThrow(/cannot be edited/);
      await expect(prisma.tutorSlabAssignment.update({ where: { id: firstId }, data: { reason: 'new' } })).rejects.toThrow(/cannot be edited/);
      await expect(prisma.tutorSlabAssignment.delete({ where: { id: firstId } })).rejects.toThrow(/cannot be deleted/);
      await expect(prisma.$executeRawUnsafe('TRUNCATE tutor_slab_assignments')).rejects.toThrow(/cannot be deleted/);
    });

    it('a change that starts this month (backdating) or two months ahead', async () => {
      const lone = await newTutor();
      await svc.assign(lone, { slabId: slabA, reason: 'first' }, actorId);
      const raw = (fromMonth: Date) =>
        prisma.tutorSlabAssignment.create({
          data: { tutorProfileId: lone, slabId: slabB, fromMonth, source: 'HR_CHANGE', changedByUserId: actorId, reason: 'raw' },
        });
      await expect(raw(month)).rejects.toThrow(/next month|overlap|exclusion/i);
      await expect(raw(addMonths(month, 2))).rejects.toThrow(/next month/);
    });

    it('overlapping assignments and a second open one', async () => {
      await expect(insert(next)).rejects.toThrow(/already waiting|overlap|exclusion|conflicting/i);
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE tutor_slab_assignments SET to_month = NULL WHERE id = '${firstId}'`,
        ),
      ).rejects.toThrow(/re-opened only after/);
    });

    it('cancelling without a reason, and un-cancelling', async () => {
      const waiting = (await rowsOf(tutor)).find((r) => r.fromMonth > month)!;
      await expect(
        prisma.tutorSlabAssignment.update({ where: { id: waiting.id }, data: { cancelledAt: new Date(), cancelledByUserId: actorId, cancelReason: ' ' } }),
      ).rejects.toThrow(/cancel_all_or_none|violates check/);
      await svc.cancel(tutor, waiting.id, { reason: 'ok' }, actorId);
      await expect(
        prisma.tutorSlabAssignment.update({ where: { id: waiting.id }, data: { cancelledAt: null, cancelledByUserId: null, cancelReason: null } }),
      ).rejects.toThrow(/cancelled/);
    });

    it('closing a row without a successor fails when the transaction commits (no gap)', async () => {
      const t2 = await newTutor();
      await svc.assign(t2, { slabId: slabA, reason: 'first' }, actorId);
      const row = (await rowsOf(t2))[0];
      await expect(
        prisma.tutorSlabAssignment.update({ where: { id: row.id }, data: { toMonth: month } }),
      ).rejects.toThrow(/gap/);
      expect((await rowsOf(t2))[0].toMonth).toBeNull();
    });

    it('deleting a tutor profile or a slab that has history', async () => {
      await expect(prisma.tutorProfile.delete({ where: { id: tutor } })).rejects.toThrow();
      await expect(prisma.tutorSalarySlab.delete({ where: { id: slabA } })).rejects.toThrow();
    });
  });
});
