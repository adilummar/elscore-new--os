import { ConflictException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { studentMonthlyHours, summarizeCapacity, wouldExceed } from './mentor-capacity';
import { MentoringAllocationService } from './mentoring-allocation.service';
import { MentoringCapacityController } from './mentoring-capacity.controller';
import { MentoringCapacityService } from './mentoring-capacity.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { FakeDb } from './testing/mentoring-fake-db';

describe('mentor capacity rules (pure)', () => {
  it('charges each student\'s full monthly hours: 20 + 15 + 25 = 60, whatever the tutor split', () => {
    // Tutor splits (12/8, 5/10, 25) never reach the calculation: only the student's own monthly hours do.
    const hours = [20, 15, 25].map((h) => studentMonthlyHours([{ monthlyHours: h }]));
    expect(hours.reduce((a, b) => a + b, 0)).toBe(60);
  });

  it('sums a student\'s subject requirements once and ignores missing values', () => {
    expect(studentMonthlyHours([{ monthlyHours: '8.50' }, { monthlyHours: 11.5 }, { monthlyHours: null }, { monthlyHours: 'x' }])).toBe(20);
  });

  it('computes remaining, utilization and the four states', () => {
    expect(summarizeCapacity(100, 40)).toMatchObject({ remainingHours: 60, utilizationPercent: 40, state: 'AVAILABLE' });
    expect(summarizeCapacity(100, 80)).toMatchObject({ utilizationPercent: 80, state: 'APPROACHING' });
    expect(summarizeCapacity(100, 100)).toMatchObject({ remainingHours: 0, state: 'FULL' });
    expect(summarizeCapacity(100, 112.5)).toMatchObject({ remainingHours: -12.5, utilizationPercent: 112.5, state: 'OVER' });
    expect(summarizeCapacity(0, 0).state).toBe('FULL');
    expect(summarizeCapacity(0, 5).state).toBe('OVER');
  });

  it('wouldExceed is exact at the boundary', () => {
    expect(wouldExceed(60, 40, 20)).toBe(false);
    expect(wouldExceed(60, 40, 20.01)).toBe(true);
  });
});

function world() {
  const db = new FakeDb();
  const capacity = new MentoringCapacityService(db as any);
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const allocation = new MentoringAllocationService(db as any, history, capacity);
  const mentor = (id: string, limit: number | null) => {
    db.seed('user', { id, status: 'ACTIVE' });
    db.seed('employee', { userId: id, firstName: id, lastName: 'M', employmentStatus: 'ACTIVE' });
    db.seed('mentoringStaffProfile', { userId: id, role: 'MENTOR', monthlyHourLimit: limit, isActive: true, acceptsAllocation: true });
    db.seed('userRole', { userId: id, role: { code: 'MENTOR' }, user: { status: 'ACTIVE' } });
  };
  /** An activation with one requirement of `hours` (and a tutor split that must not matter). */
  const student = (id: string, hours: number, mentorId: string | null = null, status = mentorId ? 'ACTIVATION_IN_PROGRESS' : 'AWAITING_ALLOCATION') => {
    db.seed('mentoringActivation', { id, leadId: `L-${id}`, studentId: `S-${id}`, handoverId: `H-${id}`, status, currentStage: 1, currentMentorUserId: mentorId });
    db.seed('requirement', { studentId: `S-${id}`, monthlyHours: hours });
    db.seed('mentoringTutorAssignment', { activationId: id, tutorProfileId: 't1' });
    db.seed('mentoringTutorAssignment', { activationId: id, tutorProfileId: 't2' });
  };
  return { db, capacity, allocation, mentor, student, tx: db as any };
}

describe('MentoringCapacityService', () => {
  it('allocated = sum of full monthly hours of assigned students, never double counted', async () => {
    const w = world();
    w.mentor('m1', 100);
    w.student('a', 20, 'm1'); w.student('b', 15, 'm1'); w.student('c', 25, 'm1');
    const cap = await w.capacity.capacityOf(w.tx, 'm1');
    expect(cap).toMatchObject({ allocatedHours: 60, remainingHours: 40, utilizationPercent: 60, state: 'AVAILABLE', limitIsDefault: false });
    expect(cap.students.map((s) => s.monthlyHours)).toEqual([25, 20, 15]);
  });

  it('uses the default limit when a Mentor has none, and ignores cancelled students', async () => {
    const w = world();
    w.mentor('m1', null);
    w.student('a', 10, 'm1');
    w.student('x', 50, null, 'CANCELLED');
    const cap = await w.capacity.capacityOf(w.tx, 'm1');
    expect(cap).toMatchObject({ limitHours: 160, limitIsDefault: true, allocatedHours: 10 });
  });

  it('recalculates after assignment, reassignment, removal, a hours change and a limit change', async () => {
    const w = world();
    w.mentor('m1', 50); w.mentor('m2', 50);
    w.student('a', 20); w.student('b', 15);
    await w.allocation.allocate('a', { mentorUserId: 'm1' }, 'head');
    await w.allocation.allocate('b', { mentorUserId: 'm1' }, 'head');
    expect((await w.capacity.capacityOf(w.tx, 'm1')).allocatedHours).toBe(35);

    await w.allocation.reassign('b', { mentorUserId: 'm2', reason: 'balance' }, 'head');
    expect((await w.capacity.capacityOf(w.tx, 'm1')).allocatedHours).toBe(20);
    expect((await w.capacity.capacityOf(w.tx, 'm2')).allocatedHours).toBe(15);

    await w.allocation.returnToQueue('b', 'removed', 'head');
    expect((await w.capacity.capacityOf(w.tx, 'm2')).allocatedHours).toBe(0);

    w.db.rows('requirement').find((r) => r.studentId === 'S-a')!.monthlyHours = 30;
    expect((await w.capacity.capacityOf(w.tx, 'm1')).allocatedHours).toBe(30);

    await w.capacity.setLimit('m1', 80, 'Added hours', 'head');
    expect(await w.capacity.capacityOf(w.tx, 'm1')).toMatchObject({ limitHours: 80, remainingHours: 50 });
  });

  it('refuses an over-capacity assignment without a reason, and never leaves a partial assignment', async () => {
    const w = world();
    w.mentor('m1', 30);
    w.student('a', 20, 'm1'); w.student('b', 15);
    await expect(w.allocation.allocate('b', { mentorUserId: 'm1' }, 'head')).rejects.toBeInstanceOf(ConflictException);
    expect(w.db.rows('mentorAssignment')).toHaveLength(0);
    expect(w.db.rows('mentoringCapacityException')).toHaveLength(0);
  });

  it('an approved exception is stored and audited, covers that student only and shows the Mentor as over capacity', async () => {
    const w = world();
    w.mentor('m1', 30);
    w.student('a', 20, 'm1'); w.student('b', 15); w.student('c', 1);
    await w.allocation.allocate('b', { mentorUserId: 'm1', overCapacityReason: 'Exam season cover' }, 'head');
    expect(w.db.rows('mentoringCapacityException')[0]).toMatchObject({
      mentorUserId: 'm1', activationId: 'b', action: 'ASSIGN', studentHours: 15, allocatedBefore: 20, allocatedAfter: 35, limitAtApproval: 30,
      reason: 'Exam season cover', approvedByUserId: 'head',
    });
    expect(w.db.rows('auditEvent').some((e) => e.action === 'OVER_CAPACITY_APPROVED' && e.entityId === 'm1')).toBe(true);
    expect(await w.capacity.capacityOf(w.tx, 'm1')).toMatchObject({ state: 'OVER', remainingHours: -5 });
    // the approval does not open the door for the next student
    await expect(w.allocation.allocate('c', { mentorUserId: 'm1' }, 'head')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a temporary transfer and the return from one are capacity checked, not silently allowed', async () => {
    const w = world();
    w.mentor('m1', 100); w.mentor('m2', 10);
    w.student('a', 20, 'm1');
    const transfer = { mentorUserId: 'm2', reason: 'cover', expectedReturnAt: new Date('2026-12-01') };
    await expect(w.allocation.temporaryTransfer('a', transfer, 'head')).rejects.toBeInstanceOf(ConflictException);
    await w.allocation.temporaryTransfer('a', { ...transfer, overCapacityReason: 'Short cover' }, 'head');
    expect(w.db.rows('mentoringCapacityException')[0]).toMatchObject({ action: 'TEMPORARY_TRANSFER', mentorUserId: 'm2' });
  });

  it('automatic allocation never goes over capacity and skips a Mentor the student\'s hours do not fit', async () => {
    const w = world();
    w.mentor('small', 30); w.mentor('big', 100);
    w.student('a', 25, 'small');
    w.student('n', 20);
    const result = await w.allocation.autoAllocateInTx(w.tx, 'n', 'system');
    expect(result).toMatchObject({ allocated: true, mentorUserId: 'big' });
  });

  it('records every limit change with old and new limit, actor and reason, and rejects invalid limits', async () => {
    const w = world();
    w.mentor('m1', 40);
    await w.capacity.setLimit('m1', 60, 'More availability', 'head');
    await w.capacity.setLimit('m1', 50, undefined, 'head');
    expect(w.db.rows('mentorCapacityChange').map((c) => [Number(c.oldLimit), Number(c.newLimit), c.changedByUserId, c.reason])).toEqual([
      [40, 60, 'head', 'More availability'],
      [60, 50, 'head', null],
    ]);
    expect(w.db.rows('auditEvent').filter((e) => e.action === 'LIMIT_CHANGED')).toHaveLength(2);
    await expect(w.capacity.setLimit('m1', -1, undefined, 'head')).rejects.toThrow();
    await expect(w.capacity.setLimit('m1', 5000, undefined, 'head')).rejects.toThrow();
  });
});

describe('capacity RBAC (route permissions)', () => {
  const perm = (method: string) => Reflect.getMetadata(PERMISSIONS_KEY, MentoringCapacityController.prototype[method as keyof MentoringCapacityController]);

  it('only staff-management (Mentoring Head) can change a limit; team views need staff-read; a Mentor only gets /me', () => {
    expect(perm('setLimit')).toEqual(['mentoring.staff.manage']);
    expect(perm('team')).toEqual(['mentoring.staff.read']);
    expect(perm('mentor')).toEqual(['mentoring.staff.read']);
    expect(perm('history')).toEqual(['mentoring.staff.read']);
    expect(perm('mine')).toEqual(['mentoring.student.read-assigned']);
  });

  it('/me always uses the signed-in user, so a Mentor cannot read a colleague\'s numbers', async () => {
    const service = { mentorOverview: jest.fn().mockResolvedValue({}) } as any;
    const controller = new MentoringCapacityController(service);
    await controller.mine({ id: 'me' } as any);
    expect(service.mentorOverview).toHaveBeenCalledWith('me');
  });
});
