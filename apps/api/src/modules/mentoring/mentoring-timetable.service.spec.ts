/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringTimetableService } from './mentoring-timetable.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { MentoringWorkflowController } from './mentoring-workflow.controller';
import { FakeDb } from './testing/mentoring-fake-db';

const at = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const KEY = 'timetable.schedule';

const scope = (userId: string, perms: string[], all = false): MentoringScope => ({ userId, perms: new Set(perms), all, assigned: perms.includes('mentoring.student.read-assigned') });
const MENTOR = scope('mentor-1', ['mentoring.student.read-assigned', 'tutor.profile.read']);
const OTHER_MENTOR = scope('mentor-2', ['mentoring.student.read-assigned']);
const HEAD = scope('head-1', ['mentoring.student.read-all'], true);
const NOBODY = scope('nobody', []);

const timed = (d: string, start: string, end: string, extra: object = {}) => ({ day: d, durationMinutes: m(end) - m(start), start, end, ...extra });
const subjectPlan = (over: object) => ({ subjectId: 'sub-en', subjectName: 'English', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 60, distribution: 'EQUAL', sessions: [timed('Monday', '15:00', '16:00')], startDate: '2026-11-09', ...over });

function world(plans: object[] = [subjectPlan({})]) {
  const db = new FakeDb();
  for (const [id, name] of [['sub-en', 'English'], ['sub-ma', 'Mathematics']]) db.seed('subject', { id, name, isActive: true });
  db.seed('grade', { id: 'g-8', name: 'Grade 8', isActive: true });
  db.seed('lead', { id: 'lead-1' });
  db.seed('student', { id: 'stu-1', firstName: 'Synthetic', lastName: 'Student A' });
  db.seed('enrollmentHandover', { id: 'ho-1', status: 'COMPLETED' });
  db.seed('mentoringActivation', { id: 'act-1', leadId: 'lead-1', studentId: 'stu-1', handoverId: 'ho-1', status: 'ACTIVATION_IN_PROGRESS', currentStage: 3, currentMentorUserId: 'mentor-1' });
  db.seed('mentoringStage', { activationId: 'act-1', stageNumber: 3, key: 'TIMETABLE_CREATION', status: 'IN_PROGRESS' });
  const field = db.seed('enrollmentHandoverField', { handoverId: 'ho-1', fieldKey: KEY, value: { version: 2, subjects: plans }, origin: 'MENTOR_COLLECTED', updatedByUserId: 'mentor-1' });
  const tutor = (id: string, name: string) => {
    const [first, last] = name.split(' ');
    db.seed('employee', { id: `e-${id}`, userId: `u-${id}`, firstName: first, lastName: last, employmentStatus: 'ACTIVE' });
    db.seed('tutorProfile', { id: `tp-${id}`, employeeId: `e-${id}`, tutorOperationalStatus: 'ACTIVE' });
    for (const d of [1, 2, 3, 4, 5]) db.seed('tutorAvailabilitySlot', { tutorProfileId: `tp-${id}`, dayOfWeek: d, startTime: at('14:00'), endTime: at('20:00'), isActive: true });
  };
  tutor('anjali', 'Anjali Menon');
  tutor('rahul', 'Rahul Nair');
  const assign = (subjectId: string, tp: string, over: object = {}) => {
    const a = db.seed('mentoringTutorAssignment', { id: `as-${subjectId}`, activationId: 'act-1', subjectId, tutorProfileId: `tp-${tp}`, status: 'ACTIVE', currentKey: `act-1:${subjectId}`, scheduleSnapshot: {}, ...over });
    return a;
  };
  const history = new MentoringHistoryService({ recordInTx: jest.fn() } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: jest.fn() } as any);
  const service = new MentoringTimetableService(db as any, access, new MentoringTutorService(db as any, history));
  return { db, service, field, assign };
}
const weekly = { view: 'weekly', from: '2026-11-09' };

describe('reading a student timetable from what is saved', () => {
  it('turns the saved schedule and the saved tutor into dated classes, and stores nothing', async () => {
    const w = world();
    w.assign('sub-en', 'anjali');
    const snap = () => JSON.stringify(Object.fromEntries(Object.entries(w.db.tables).filter(([, rows]) => rows.length)));
    const before = snap();
    const t = await w.service.timetable('act-1', weekly, MENTOR);
    expect(t.student).toEqual({ id: 'stu-1', name: 'Synthetic Student A' });
    expect(t.period).toEqual({ view: 'weekly', from: '2026-11-09', to: '2026-11-15', month: null });
    expect(t.events.map((e) => [e.date, e.startMinute, e.endMinute, e.subjectName, e.tutorName, e.assignmentState, e.availability?.status])).toEqual([['2026-11-09', 900, 960, 'English', 'Anjali Menon', 'ASSIGNED', 'AVAILABLE']]);
    expect(t.summary).toMatchObject({ totalSubjects: 1, scheduledSessions: 1, teachingMinutes: 60, assignedTutors: 1, unresolvedConflicts: 0, tutorIssues: 0 });
    expect(t.subjects).toEqual([expect.objectContaining({ subjectName: 'English', tutorName: 'Anjali Menon', tutorProfileId: 'tp-anjali', assignmentState: 'ASSIGNED' })]);
    expect(snap()).toBe(before); // no booking, no assignment, nothing created by reading
  });

  it('an empty week is returned as an empty list, not an error', async () => {
    const w = world();
    w.assign('sub-en', 'anjali');
    const t = await w.service.timetable('act-1', { view: 'weekly', from: '2026-11-02' }, MENTOR);
    expect(t.events).toEqual([]); // the class starts on 9 November
    expect(t.summary.scheduledSessions).toBe(0);
  });

  it('works out the period itself when only a date is given, and accepts an exact range', async () => {
    const w = world();
    w.assign('sub-en', 'anjali');
    expect((await w.service.timetable('act-1', { view: 'monthly', from: '2026-11-20' }, MENTOR)).period).toEqual({ view: 'monthly', from: '2026-10-26', to: '2026-12-06', month: '2026-11' });
    expect((await w.service.timetable('act-1', { view: 'biweekly', from: '2026-11-18' }, MENTOR)).period).toEqual({ view: 'biweekly', from: '2026-11-09', to: '2026-11-22', month: null });
    expect((await w.service.timetable('act-1', { view: 'weekly', from: '2026-11-10', to: '2026-11-12' }, MENTOR)).period.to).toBe('2026-11-12');
  });

  it('shows a subject with no tutor as a warning and a draft, and a subject with no times as incomplete', async () => {
    const w = world([subjectPlan({}), subjectPlan({ subjectId: 'sub-ma', subjectName: 'Mathematics', sessions: [{ day: 'Tuesday', durationMinutes: 60 }] })]);
    const t = await w.service.timetable('act-1', weekly, MENTOR);
    expect(t.warnings.map((x) => `${x.subjectName}:${x.kind}`).sort()).toEqual(['English:NO_TUTOR', 'Mathematics:INCOMPLETE', 'Mathematics:NO_TUTOR']);
    expect(t.events.map((e) => [e.subjectName, e.assignmentState])).toEqual([['English', 'NO_TUTOR']]); // nothing invented for Mathematics
    expect(t.status).toBe('DRAFT');
    expect(t.summary).toMatchObject({ incompleteSubjects: 1, subjectsWithoutTutor: 2 });
  });

  it('shows a schedule that was never saved as an empty draft', async () => {
    const w = world();
    w.db.tables.enrollmentHandoverField = [];
    const t = await w.service.timetable('act-1', weekly, MENTOR);
    expect(t).toMatchObject({ events: [], status: 'DRAFT', summary: { totalSubjects: 0 } });
  });
});

describe('what changes after the timetable was first read', () => {
  it('follows a schedule change at once: the next read has the new day and time', async () => {
    const w = world();
    w.assign('sub-en', 'anjali');
    expect((await w.service.timetable('act-1', weekly, MENTOR)).events.map((e) => e.date)).toEqual(['2026-11-09']);
    w.field.value = { version: 2, subjects: [subjectPlan({ sessions: [timed('Wednesday', '17:00', '18:00')] })] };
    const after = await w.service.timetable('act-1', weekly, MENTOR);
    expect(after.events.map((e) => [e.date, e.startMinute])).toEqual([['2026-11-11', 1020]]);
  });

  it('a tutor on leave keeps the class on the page with the reason, and nothing is reassigned', async () => {
    const w = world();
    w.assign('sub-en', 'anjali');
    w.db.seed('employeeLeaveRequest', { employeeId: 'e-anjali', status: 'APPROVED', startDate: '2026-11-09', endDate: '2026-11-09' });
    const t = await w.service.timetable('act-1', weekly, MENTOR);
    expect(t.events).toHaveLength(1);
    expect(t.events[0]).toMatchObject({ tutorName: 'Anjali Menon', availability: { status: 'LEAVE' } });
    expect(t.status).toBe('CONFLICT_DETECTED');
    expect(t.summary.tutorIssues).toBe(1);
    expect(w.db.rows('mentoringTutorAssignment')[0].tutorProfileId).toBe('tp-anjali');
  });

  it('a public holiday and a tutor day off show the same way', async () => {
    const w = world([subjectPlan({ sessions: [timed('Monday', '15:00', '16:00'), timed('Tuesday', '15:00', '16:00')] })]);
    w.assign('sub-en', 'anjali');
    w.db.seed('tutorAvailabilityException', { tutorProfileId: null, date: day('2026-11-09'), kind: 'HOLIDAY', note: 'Holiday' });
    w.db.seed('tutorAvailabilityException', { tutorProfileId: 'tp-anjali', date: day('2026-11-10'), kind: 'DAY_OFF', note: 'Off' });
    const t = await w.service.timetable('act-1', weekly, MENTOR);
    expect(t.events.map((e) => e.availability?.status)).toEqual(['HOLIDAY', 'DAY_OFF']);
  });

  it('a class outside the tutor working hours is flagged, and an assignment under review is surfaced', async () => {
    const w = world([subjectPlan({ sessions: [timed('Monday', '21:00', '22:00')] })]);
    w.assign('sub-en', 'anjali', { status: 'NEEDS_REVIEW' });
    const t = await w.service.timetable('act-1', weekly, MENTOR);
    expect(t.events[0].availability?.status).toBe('OUTSIDE_HOURS');
    expect(t.events[0].assignmentState).toBe('NEEDS_REVIEW');
    expect(t.warnings.map((x) => x.kind)).toContain('TUTOR_NEEDS_REVIEW');
  });

  it('a cancelled class and a moved class come from the saved overrides', async () => {
    const w = world([subjectPlan({ sessions: [timed('Monday', '15:00', '16:00')] })]);
    const a = w.assign('sub-en', 'anjali');
    w.db.seed('mentoringTutorAssignmentOverride', { assignmentId: a.id, date: day('2026-11-16'), originalStartMinute: m('15:00'), kind: 'CANCELLED', reason: 'Away' });
    w.db.seed('mentoringTutorAssignmentOverride', { assignmentId: a.id, date: day('2026-11-23'), originalStartMinute: m('15:00'), kind: 'RESCHEDULED', newDate: day('2026-11-25'), newStartMinute: m('17:00'), newEndMinute: m('18:00'), reason: 'Exam' });
    const t = await w.service.timetable('act-1', { view: 'monthly', from: '2026-11-10' }, MENTOR);
    expect(t.events.filter((e) => e.date >= '2026-11-16' && e.date <= '2026-11-25').map((e) => [e.date, e.classStatus])).toEqual([['2026-11-16', 'CANCELLED'], ['2026-11-23', 'RESCHEDULED'], ['2026-11-25', 'MOVED_HERE']]);
    expect(t.summary.scheduledSessions).toBe(t.events.filter((e) => e.classStatus === 'SCHEDULED' || e.classStatus === 'MOVED_HERE').length);
  });
});

describe('the checklist and the status stay in step', () => {
  const approval = (w: ReturnType<typeof world>, state: string, stageStatus = 'IN_PROGRESS') => {
    const stage = w.db.rows('mentoringStage').find((s) => s.stageNumber === 3)!;
    stage.status = stageStatus;
    w.db.rows('stageChecklistResponse').length = 0;
    w.db.seed('stageChecklistResponse', { stageId: stage.id, itemKey: 'mentor_approved_timetable', state });
  };

  it('is ready for review until the Mentor approves, pending while the stage waits, approved once the item is verified', async () => {
    const w = world();
    w.assign('sub-en', 'anjali');
    expect((await w.service.timetable('act-1', weekly, MENTOR)).status).toBe('READY_FOR_REVIEW');
    approval(w, 'COLLECTED', 'PENDING_REVIEW');
    expect((await w.service.timetable('act-1', weekly, MENTOR)).status).toBe('PENDING_MENTOR_APPROVAL');
    approval(w, 'VERIFIED', 'COMPLETED');
    const t = await w.service.timetable('act-1', weekly, MENTOR);
    expect(t.status).toBe('APPROVED');
    expect(t.approval).toEqual({ state: 'VERIFIED', stageStatus: 'COMPLETED' });
  });

  it('reading never marks a checklist item done, and a new problem overrides an earlier approval', async () => {
    const w = world();
    w.assign('sub-en', 'anjali');
    approval(w, 'VERIFIED', 'COMPLETED');
    w.db.seed('employeeLeaveRequest', { employeeId: 'e-anjali', status: 'APPROVED', startDate: '2026-11-09', endDate: '2026-11-09' });
    const t = await w.service.timetable('act-1', weekly, MENTOR);
    expect(t.status).toBe('CONFLICT_DETECTED');
    expect(w.db.rows('stageChecklistResponse')).toHaveLength(1);
    expect(w.db.rows('stageChecklistResponse')[0].state).toBe('VERIFIED'); // untouched
  });
});

describe('who can read it, and what they see', () => {
  it('the assigned Mentor and the Head can; another Mentor, or someone with no access, cannot', async () => {
    const w = world();
    w.assign('sub-en', 'anjali');
    await expect(w.service.timetable('act-1', weekly, MENTOR)).resolves.toBeDefined();
    await expect(w.service.timetable('act-1', weekly, HEAD)).resolves.toBeDefined();
    await expect(w.service.timetable('act-1', weekly, OTHER_MENTOR)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.service.timetable('act-1', weekly, NOBODY)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.timetable('missing', weekly, HEAD)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("never carries another student's name or booking, even when that student has the tutor at the same time", async () => {
    const w = world([subjectPlan({ sessions: [timed('Monday', '15:00', '16:00')] })]);
    w.assign('sub-en', 'anjali');
    w.db.seed('student', { id: 'stu-2', firstName: 'Secret', lastName: 'Pupil' });
    w.db.seed('mentoringActivation', { id: 'act-2', leadId: 'lead-1', studentId: 'stu-2', handoverId: 'ho-2', status: 'ACTIVATION_IN_PROGRESS', currentMentorUserId: 'mentor-9' });
    const other = w.db.seed('mentoringTutorAssignment', { id: 'as-other', activationId: 'act-2', subjectId: 'sub-ma', tutorProfileId: 'tp-anjali', status: 'ACTIVE', currentKey: 'act-2:sub-ma', scheduleSnapshot: {} });
    w.db.seed('mentoringTutorAssignmentSession', { assignmentId: other.id, tutorProfileId: 'tp-anjali', dayOfWeek: 1, frequency: 'WEEKLY', occurrences: [], startMinute: m('15:00'), endMinute: m('16:00') });
    const t = await w.service.timetable('act-1', weekly, MENTOR);
    const text = JSON.stringify(t);
    expect(text).not.toContain('Secret');
    expect(text).not.toContain('Pupil');
    expect(text).not.toContain('act-2');
    expect(t.events[0].availability).toEqual({ status: 'OCCUPIED', reason: 'Already booked during this time.' });
    expect(t.events).toHaveLength(1); // only this student's class
  });

  it("this student's own booking never counts against itself", async () => {
    const w = world();
    const a = w.assign('sub-en', 'anjali');
    w.db.seed('mentoringTutorAssignmentSession', { assignmentId: a.id, tutorProfileId: 'tp-anjali', dayOfWeek: 1, frequency: 'WEEKLY', occurrences: [], startMinute: m('15:00'), endMinute: m('16:00') });
    const t = await w.service.timetable('act-1', weekly, MENTOR);
    expect(t.events[0].availability?.status).toBe('AVAILABLE');
  });

  it('offers the tutor profile link only to people who may read tutor profiles', async () => {
    const w = world();
    w.assign('sub-en', 'anjali');
    expect((await w.service.timetable('act-1', weekly, MENTOR)).canViewTutorProfile).toBe(true);
    expect((await w.service.timetable('act-1', weekly, scope('mentor-1', ['mentoring.student.read-assigned']))).canViewTutorProfile).toBe(false);
  });

  it('is a read-only route with no write permission, and refuses a bad request', async () => {
    const w = world();
    const proto = MentoringWorkflowController.prototype as any;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.timetable)).toBeUndefined(); // read scope is decided in the query, like the workspace
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.assignTutor)).toEqual(['mentoring.stage.work']); // writes still need the work permission
    for (const bad of [{ view: 'yearly', from: '2026-11-09' }, { view: 'weekly', from: 'soon' }, { view: 'weekly', from: '2026-11-09', to: '2026-11-01' }, { view: 'monthly', from: '2026-01-01', to: '2026-12-31' }]) {
      await expect(w.service.timetable('act-1', bad, HEAD)).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
