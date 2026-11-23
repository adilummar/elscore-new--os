import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { TrainingService } from './training.service';

const past = new Date(Date.now() - 3_600_000);
const future = () => new Date(Date.now() + 86_400_000).toISOString();
const lead = { id: 'lead-1', businessId: 'TL-1', firstName: 'Asha', lastName: 'Rao', phone: '+919876543210' };
const session = (o: any = {}) => ({ id: 's1', sessionNumber: 1, scheduledAt: past, conductorUserId: 'coach', ...o });
const attempt = (o: any = {}) => ({
  id: 'a1', enrolmentId: 'e1', sessionId: 's1', sessionNumber: 1, attendance: null, taskCompleted: null, remarks: null,
  recordedAt: null, session: session(), enrolment: { id: 'e1', tutorLeadId: 'lead-1' }, ...o,
});

function build(o: {
  session?: any; attempt?: any; enrolments?: any[]; override?: boolean; conductorOk?: boolean; recordedCount?: number;
  firstPass?: any; counts?: number[]; cas?: number;
} = {}) {
  const counts = [...(o.counts ?? [])];
  const tx: any = {
    tutorTrainingSession: { create: jest.fn().mockResolvedValue({ id: 's-new', sessionNumber: 1, conductorUserId: 'coach' }), updateMany: jest.fn().mockResolvedValue({ count: o.cas ?? 1 }) },
    tutorTrainingSessionHistory: { create: jest.fn() },
    tutorTrainingAttempt: {
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: o.cas ?? 1 }),
      findFirst: jest.fn().mockResolvedValue(o.firstPass === undefined ? { recordedAt: past } : o.firstPass),
    },
    tutorTrainingAttemptCorrection: { create: jest.fn() },
    tutorTrainingEnrolment: { update: jest.fn() },
  };
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue(o.conductorOk === false ? null : { id: 'coach' }) },
    tutorTrainingSession: { findUnique: jest.fn().mockResolvedValue(o.session === undefined ? session() : o.session) },
    tutorTrainingAttempt: {
      findUnique: jest.fn().mockResolvedValue(o.attempt === undefined ? attempt() : o.attempt),
      count: jest.fn().mockImplementation(() => Promise.resolve(counts.length ? counts.shift() : o.recordedCount ?? 0)),
    },
    tutorTrainingEnrolment: { findMany: jest.fn().mockResolvedValue(o.enrolments ?? []) },
    $transaction: jest.fn((fn: any) => Promise.resolve(fn(tx))),
  };
  const audit: any = { recordInTx: jest.fn() };
  const rbac: any = { hasPermissions: jest.fn().mockResolvedValue(!!o.override) };
  return { svc: new TrainingService(prisma, audit, rbac), prisma, tx, audit };
}

const enrol = (o: any = {}) => ({ id: 'e1', tutorLeadId: 'lead-1', session1PassedAt: null, session2PassedAt: null, attempts: [], tutorLead: lead, ...o });

describe('TrainingService', () => {
  describe('sessions', () => {
    it('schedules a session with a Hiring staff conductor, audited', async () => {
      const { svc, tx, audit } = build();
      await svc.createSession({ sessionNumber: 1, scheduledAt: future(), conductorUserId: 'coach' }, 'head');
      expect(tx.tutorTrainingSession.create.mock.calls[0][0].data).toMatchObject({ sessionNumber: 1, conductorUserId: 'coach', createdByUserId: 'head' });
      expect(audit.recordInTx.mock.calls[0][1].action).toBe('TUTOR_TRAINING_SESSION_CREATED');
    });
    it('rejects past times and non-staff conductors', async () => {
      await expect(build().svc.createSession({ sessionNumber: 1, scheduledAt: past.toISOString(), conductorUserId: 'coach' }, 'head')).rejects.toThrow(/past/);
      await expect(build({ conductorOk: false }).svc.createSession({ sessionNumber: 2, scheduledAt: future(), conductorUserId: 'x' }, 'head')).rejects.toThrow(/Session 2 is conducted by the HR Department/);
    });
    it('limits Session 1 to coordinators / Tutor Head and Session 2 to HR', async () => {
      const one = build();
      await one.svc.createSession({ sessionNumber: 1, scheduledAt: future(), conductorUserId: 'coach' }, 'head');
      expect(one.prisma.user.findFirst.mock.calls[0][0].where.userRoles.some.role.code.in).toEqual(['TUTOR_COORDINATOR', 'TUTOR_HEAD']);
      const two = build();
      await two.svc.createSession({ sessionNumber: 2, scheduledAt: future(), conductorUserId: 'hr' }, 'head');
      expect(two.prisma.user.findFirst.mock.calls[0][0].where.userRoles.some.role.code.in).toEqual(['HR_MANAGER', 'HR_EXECUTIVE']);
      await expect(build({ conductorOk: false }).svc.createSession({ sessionNumber: 1, scheduledAt: future(), conductorUserId: 'hr' }, 'head')).rejects.toThrow(/Tutor Coordinator or the Tutor Head/);
    });
    it('reschedule keeps the earlier time and conductor in history', async () => {
      const { svc, tx } = build({ session: session({ scheduledAt: new Date(Date.now() + 3_600_000) }) });
      await svc.rescheduleSession('s1', { scheduledAt: future(), reason: 'trainer on leave' }, 'head');
      expect(tx.tutorTrainingSessionHistory.create.mock.calls[0][0].data).toMatchObject({
        sessionId: 's1', previousConductorUserId: 'coach', newConductorUserId: 'coach', reason: 'trainer on leave', changedByUserId: 'head',
      });
    });
    it('cannot reschedule once attendance is recorded', async () => {
      const { svc } = build({ recordedCount: 1 });
      await expect(svc.rescheduleSession('s1', { scheduledAt: future(), reason: 'late change' }, 'head')).rejects.toThrow(/already recorded/);
    });
  });

  describe('participants', () => {
    it('adds eligible Hired trainees as new attempts', async () => {
      const { svc, tx } = build({ enrolments: [enrol()] });
      await expect(svc.addParticipants('s1', { tutorLeadIds: ['lead-1'] }, 'hr')).resolves.toEqual({ sessionId: 's1', added: 1 });
      expect(tx.tutorTrainingAttempt.create.mock.calls[0][0].data).toMatchObject({ enrolmentId: 'e1', sessionId: 's1', sessionNumber: 1, addedByUserId: 'hr' });
    });
    it('rejects non-enrolled candidates and Session 2 before Session 1 is passed, adding nobody', async () => {
      const a = build({ enrolments: [] });
      await expect(a.svc.addParticipants('s1', { tutorLeadIds: ['lead-x'] }, 'hr')).rejects.toBeInstanceOf(BadRequestException);
      const b = build({ session: session({ sessionNumber: 2 }), enrolments: [enrol()] });
      await expect(b.svc.addParticipants('s1', { tutorLeadIds: ['lead-1'] }, 'hr')).rejects.toMatchObject({
        response: { problems: [expect.stringMatching(/Session 1 must be passed/)] },
      });
      expect(b.tx.tutorTrainingAttempt.create).not.toHaveBeenCalled();
    });
    it('allows a repeat of Session 1 after a failed attempt, but not while one is pending', async () => {
      const failed = enrol({ attempts: [{ sessionId: 'old', sessionNumber: 1, attendance: 'NOT_ATTENDED' }] });
      await expect(build({ enrolments: [failed] }).svc.addParticipants('s1', { tutorLeadIds: ['lead-1'] }, 'hr')).resolves.toBeDefined();
      const pending = enrol({ attempts: [{ sessionId: 'old', sessionNumber: 1, attendance: null }] });
      await expect(build({ enrolments: [pending] }).svc.addParticipants('s1', { tutorLeadIds: ['lead-1'] }, 'hr')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('recording attendance', () => {
    it('the conductor records a pass, which marks the session passed', async () => {
      const { svc, tx, audit } = build();
      const r = await svc.recordAttempt('a1', { attendance: 'ATTENDED', taskCompleted: true }, 'coach');
      expect(r).toMatchObject({ passed: true, repeatRequired: false, trainingCompleted: false });
      expect(tx.tutorTrainingAttempt.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'a1', attendance: null }, data: { attendance: 'ATTENDED', taskCompleted: true, recordedByUserId: 'coach' } });
      expect(tx.tutorTrainingEnrolment.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { session1PassedAt: past } });
      expect(audit.recordInTx.mock.calls[0][1].metadata).toEqual({ override: false, passed: true });
    });
    it('Attended without the task completed is not a pass and needs a repeat', async () => {
      const { svc, tx } = build();
      const r = await svc.recordAttempt('a1', { attendance: 'ATTENDED', taskCompleted: false }, 'coach');
      expect(r).toMatchObject({ passed: false, repeatRequired: true });
      expect(tx.tutorTrainingEnrolment.update).not.toHaveBeenCalled();
    });
    it('passing Session 2 completes training', async () => {
      const { svc, tx } = build({ attempt: attempt({ sessionNumber: 2, session: session({ sessionNumber: 2 }) }) });
      const r = await svc.recordAttempt('a1', { attendance: 'ATTENDED', taskCompleted: true }, 'coach');
      expect(r.trainingCompleted).toBe(true);
      expect(tx.tutorTrainingEnrolment.update.mock.calls[0][0].data).toEqual({ session2PassedAt: past });
    });
    it("requires remarks for Attended but Didn't Complete", async () => {
      await expect(build().svc.recordAttempt('a1', { attendance: 'ATTENDED_NOT_COMPLETED', taskCompleted: false }, 'coach')).rejects.toThrow(/Remarks/);
    });
    it('only the conductor, or the Head on override', async () => {
      await expect(build().svc.recordAttempt('a1', { attendance: 'NOT_ATTENDED', taskCompleted: false }, 'other')).rejects.toBeInstanceOf(ForbiddenException);
      const head = build({ override: true });
      await head.svc.recordAttempt('a1', { attendance: 'NOT_ATTENDED', taskCompleted: false }, 'head');
      expect(head.audit.recordInTx.mock.calls[0][1].metadata.override).toBe(true);
    });
    it('is locked once recorded, and cannot be recorded before the session starts', async () => {
      await expect(build({ attempt: attempt({ attendance: 'ATTENDED', taskCompleted: true }) }).svc.recordAttempt('a1', { attendance: 'NOT_ATTENDED', taskCompleted: false }, 'coach')).rejects.toThrow(/locked/);
      const early = build({ attempt: attempt({ session: session({ scheduledAt: new Date(Date.now() + 86_400_000) }) }) });
      await expect(early.svc.recordAttempt('a1', { attendance: 'ATTENDED', taskCompleted: true }, 'coach')).rejects.toThrow(/started/);
    });
    it('reports a concurrent recording as 409', async () => {
      await expect(build({ cas: 0 }).svc.recordAttempt('a1', { attendance: 'ATTENDED', taskCompleted: true }, 'coach')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('Head correction', () => {
    const recorded = attempt({ attendance: 'NOT_ATTENDED', taskCompleted: false, recordedAt: past });
    it('keeps the previous values and recomputes progress', async () => {
      const { svc, tx } = build({ attempt: recorded });
      const r = await svc.correctAttempt('a1', { attendance: 'ATTENDED', taskCompleted: true, reason: 'marked wrong trainee' }, 'head');
      expect(r.passed).toBe(true);
      expect(tx.tutorTrainingAttemptCorrection.create.mock.calls[0][0].data).toMatchObject({
        previousAttendance: 'NOT_ATTENDED', previousTaskCompleted: false, newAttendance: 'ATTENDED', newTaskCompleted: true,
        reason: 'marked wrong trainee', correctedByUserId: 'head',
      });
      expect(tx.tutorTrainingEnrolment.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { session1PassedAt: past } });
    });
    it('un-passing clears the session pass when no other pass remains', async () => {
      const { svc, tx } = build({ attempt: attempt({ attendance: 'ATTENDED', taskCompleted: true, recordedAt: past }), firstPass: null, counts: [0, 0] });
      await svc.correctAttempt('a1', { attendance: 'ATTENDED', taskCompleted: false, reason: 'task not submitted' }, 'head');
      expect(tx.tutorTrainingEnrolment.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { session1PassedAt: null } });
    });
    it('blocks un-passing Session 1 when Session 2 already depends on it', async () => {
      const { svc } = build({ attempt: attempt({ attendance: 'ATTENDED', taskCompleted: true, recordedAt: past }), counts: [0, 1] });
      await expect(svc.correctAttempt('a1', { attendance: 'NOT_ATTENDED', taskCompleted: false, reason: 'wrong' }, 'head')).rejects.toThrow(/Session 2/);
    });
    it('needs a recorded attempt and a real change', async () => {
      await expect(build().svc.correctAttempt('a1', { attendance: 'ATTENDED', taskCompleted: true, reason: 'x y z' }, 'head')).rejects.toThrow(/not been recorded/);
      await expect(build({ attempt: recorded }).svc.correctAttempt('a1', { attendance: 'NOT_ATTENDED', taskCompleted: false, reason: 'same' }, 'head')).rejects.toThrow(/Nothing changed/);
    });
  });

  describe('trainees', () => {
    it('derives progress and which session each trainee can be added to', async () => {
      const { svc } = build({
        enrolments: [
          enrol({ attempts: [{ sessionNumber: 1, attendance: 'ATTENDED', taskCompleted: false }], tutorLead: lead }),
          enrol({ id: 'e2', session1PassedAt: past, attempts: [{ sessionNumber: 1, attendance: 'ATTENDED', taskCompleted: true }], tutorLead: { ...lead, id: 'lead-2' } }),
        ],
      });
      const rows = await svc.listTrainees({});
      expect(rows.map((r) => [r.stage, r.eligibleFor, r.repeats.session1])).toEqual([
        ['AWAITING_SESSION_1', [1], 1],
        ['AWAITING_SESSION_2', [2], 0],
      ]);
      expect((await svc.listTrainees({ eligibleFor: 2 })).map((r) => r.enrolmentId)).toEqual(['e2']);
    });
  });
});
