/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringClassService } from './mentoring-class.service';
import { MentoringComplaintService } from './mentoring-complaint.service';
import { CARDS, MentoringDashboardService } from './mentoring-dashboard.service';
import { MentoringExamService } from './mentoring-exam.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringReminderService } from './mentoring-reminder.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { makeVerifyLenient } from './testing/class-workspace-fixture';
import { FakeDb } from './testing/mentoring-fake-db';

const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const slot = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const MON = '2026-11-09';
const NOW = at(MON, '12:00');
const good = { conducted: true, actualStart: '15:05', actualEnd: '16:10', topicsCovered: 'Tenses', attendance: 'PRESENT', participation: 'GOOD', portionsCompleted: 'Chapter 3', homework: 'Worksheet 4', classNotes: 'None', resubmitReason: 'Corrected as asked' };
const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.complaint.handle'],
  'mentor-2': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.complaint.handle'],
  'head-1': ['mentoring.student.read-all', 'mentoring.allocation.manage', 'mentoring.complaint.handle'],
  'ceo-1': ['mentoring.student.read-all'],
  nobody: [],
};

function world(extraStudents = 0) {
  const db = new FakeDb();
  db.seed('subject', { id: 'sub-en', name: 'English', isActive: true });
  db.seed('subject', { id: 'sub-ma', name: 'Mathematics', isActive: true });
  db.seed('grade', { id: 'g-8', name: 'Grade 8' });
  db.seed('user', { id: 'u-meera', status: 'ACTIVE' });
  db.seed('employee', { id: 'e-meera', userId: 'u-meera', firstName: 'Meera', lastName: 'Thomas', employmentStatus: 'ACTIVE' });
  db.seed('tutorProfile', { id: 'tp-meera', employeeId: 'e-meera', tutorOperationalStatus: 'ACTIVE', profilePhotoUrl: null });
  db.seed('tutorSubject', { tutorProfileId: 'tp-meera', subjectId: 'sub-en' });
  db.seed('tutorGrade', { tutorProfileId: 'tp-meera', gradeId: 'g-8' });
  for (const d of [1, 2, 3, 4, 5]) db.seed('tutorAvailabilitySlot', { tutorProfileId: 'tp-meera', dayOfWeek: d, startTime: slot('14:00'), endTime: slot('20:00') });
  db.seed('employee', { id: 'e-m1', userId: 'mentor-1', firstName: 'Mira', lastName: 'Mentor', employmentStatus: 'ACTIVE' });
  const student = (id: string, first: string, last: string, mentor: string, businessId: string, subject = 'sub-en') => {
    db.seed('lead', { id: `lead-${id}` });
    db.seed('student', { id: `stu-${id}`, firstName: first, lastName: last, businessId });
    db.seed('mentoringActivation', { id: `act-${id}`, leadId: `lead-${id}`, studentId: `stu-${id}`, handoverId: `ho-${id}`, status: 'ACTIVATED', currentMentorUserId: mentor });
    db.seed('mentoringStage', { activationId: `act-${id}`, stageNumber: 3, key: 'TIMETABLE_CREATION', status: 'COMPLETED' });
    db.seed('enrollmentHandoverField', { handoverId: `ho-${id}`, fieldKey: 'timetable.schedule', value: { version: 2, subjects: [{ subjectId: subject, subjectName: subject }] }, origin: 'MENTOR_COLLECTED', updatedByUserId: mentor });
    const a = db.seed('mentoringTutorAssignment', { id: `as-class-${id}`, activationId: `act-${id}`, subjectId: subject, tutorProfileId: 'tp-meera', status: 'ACTIVE', currentKey: `act-${id}:${subject}`, startDate: day(MON), endDate: null });
    db.seed('mentoringTutorAssignmentSession', { assignmentId: a.id, tutorProfileId: 'tp-meera', dayOfWeek: 1, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: m('15:00'), endMinute: m('16:00') });
  };
  student('A', 'Asha', 'Menon', 'mentor-1', 'STU-0001');
  student('B', 'Basil', 'Nair', 'mentor-2', 'STU-0002');
  student('C', 'Chitra', 'Pillai', 'mentor-1', 'STU-0003', 'sub-ma');
  for (let i = 0; i < extraStudents; i++) student(`X${i}`, 'Extra', `Student ${i}`, 'mentor-1', `STU-1${String(i).padStart(3, '0')}`);

  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: (id: string) => Promise.resolve(new Set(PERMS[id] ?? [])) } as any);
  const sla = new MentoringSlaService(db as any, access);
  const reminders = new MentoringReminderService(db as any);
  let n = 0;
  const ids = { nextIdInTx: jest.fn(() => Promise.resolve(`TCR-${String(++n).padStart(7, '0')}`)) };
  const classes = new MentoringClassService(db as any, access, history, sla, reminders, ids as any, new MentoringTutorService(db as any, history));
  makeVerifyLenient(classes, db);
  const exams = new MentoringExamService(db as any, access, history, reminders, sla);
  const complaints = new MentoringComplaintService(db as any, access, history, sla);
  const dash = new MentoringDashboardService(db as any, access, classes, exams, complaints, sla);
  const scope = (u: string) => access.scopeFor(u);
  const count = async (u: string, key: string, f: object = {}, now = NOW) => (await dash.summary(await scope(u), f, now)).cards.find((c) => c.key === key)!.count;
  const records = async (u: string, key: string, f: object = {}, now = NOW, page = 1, size = 25) => dash.records(await scope(u), key, f, page, size, now);
  const exam = (act: string, subjectId: string, date: string, over: object = {}, items: string[] = []) => {
    const e = db.seed('mentoringExam', { activationId: act, subjectId, title: `${subjectId} test`, kind: 'EXAM', date: day(date), originalDate: day(date), startMinute: 600, endMinute: 660, responsibleType: 'TUTOR', chapters: ['Ch 1'], conducted: null, createdByUserId: 'mentor-1', dateKey: `${act}:${date}`, ...over });
    for (const kind of items) db.seed('mentoringExamItem', { examId: e.id, list: 'POST_EXAM', kind, status: 'DONE' });
    return e;
  };
  return { db, dash, classes, complaints, scope, count, records, exam };
}

describe('who sees what', () => {
  it('shows a Mentor their own students, the Head and the CEO everyone, and nobody without access nothing', async () => {
    const w = world();
    expect(await w.count('mentor-1', 'students_total')).toBe(2);
    expect(await w.count('mentor-2', 'students_total')).toBe(1);
    expect(await w.count('head-1', 'students_total')).toBe(3);
    expect(await w.count('ceo-1', 'students_total')).toBe(3);
    await expect(w.count('nobody', 'students_total')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never lets a filter reach another Mentor student', async () => {
    const w = world();
    await expect(w.dash.summary(await w.scope('mentor-1'), { activationId: 'act-B' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(await w.count('mentor-1', 'students_total', { studentQuery: 'Basil' })).toBe(0);
    expect(await w.count('head-1', 'students_total', { studentQuery: 'Basil' })).toBe(1);
  });
});

describe('the cards', () => {
  it('has every card of the brief that the system records, and says plainly what it does not record', async () => {
    const w = world();
    const s = await w.dash.summary(await w.scope('mentor-1'), {}, NOW);
    expect(s.cards.map((c) => c.key)).toEqual(CARDS.map((c) => c.key));
    expect(s.cards.every((c) => typeof c.count === 'number')).toBe(true);
    expect(s.notRecorded.map((n) => n.label)).toEqual(expect.arrayContaining(['Pending post-class activities', 'Pending follow-ups']));
    expect(s.cards.map((c) => c.label).join(' ')).not.toMatch(/[–—]/);
  });

  it('counts the classes from the approved schedule: today, and the next seven days', async () => {
    const w = world();
    expect(await w.count('mentor-1', 'classes_today')).toBe(2); // students A and C, Monday 3 PM
    expect(await w.count('mentor-1', 'classes_upcoming')).toBe(2); // next Monday
    expect(await w.count('mentor-2', 'classes_today')).toBe(1);
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0); // reading stores nothing
  });

  it('counts a class waiting for the Mentor after the tutor submits, and a verified class, and a class with the voice update not confirmed', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    const later = at(MON, '17:30');
    expect(await w.count('mentor-1', 'classes_awaiting_verification', {}, later)).toBe(1);
    expect(await w.count('mentor-1', 'classes_voice_pending', {}, later)).toBe(1);
    expect(await w.count('mentor-1', 'classes_awaiting_update', {}, later)).toBe(1); // student C, whose tutor has not reported
    const session = w.db.rows('mentoringClassSession')[0];
    await w.classes.verify(session.id, {}, 'mentor-1', at(MON, '18:00'));
    expect(await w.count('mentor-1', 'classes_verified', {}, at(MON, '18:10'))).toBe(1);
    expect(await w.count('mentor-1', 'classes_awaiting_verification', {}, at(MON, '18:10'))).toBe(0);
  });

  it('counts exams by what is recorded: upcoming, waiting for evaluation, marks pending and re-exam required', async () => {
    const w = world();
    w.exam('act-A', 'sub-en', '2026-11-12');
    w.exam('act-A', 'sub-en', '2026-11-05', { conducted: true }, ['COLLECT_PAPER']);
    w.exam('act-C', 'sub-ma', '2026-11-04', { conducted: true }, ['COLLECT_PAPER', 'SHARE_WITH_TUTOR', 'TUTOR_RECEIPT', 'COLLECT_CHECKED', 'TUTOR_EVALUATION']);
    w.exam('act-C', 'sub-ma', '2026-11-03', { conducted: true, reExamRequired: true }, []);
    expect(await w.count('mentor-1', 'exams_upcoming')).toBe(1);
    expect(await w.count('mentor-1', 'exams_awaiting_evaluation')).toBe(1);
    expect(await w.count('mentor-1', 'exams_marks_pending')).toBe(1);
    expect(await w.count('mentor-1', 'exams_reexam')).toBe(1);
    expect(await w.count('mentor-2', 'exams_upcoming')).toBe(0);
  });

  it('counts monthly meetings: upcoming, overdue, held but not complete, needing a new date, and plans with no meeting date', async () => {
    const w = world();
    const meet = (act: string, date: string, over: object = {}) => w.db.seed('mentoringReviewMeeting', { activationId: act, kind: 'MONTHLY_REVIEW', scheduledFor: day(date), originalDate: day(date), status: 'SCHEDULED', currentKey: `${act}:M`, createdByUserId: 'mentor-1', ...over });
    meet('act-A', '2026-11-20');
    meet('act-C', '2026-11-05');
    meet('act-B', '2026-11-08', { conducted: true });
    w.db.seed('mentoringLearningPlan', { activationId: 'act-A', status: 'DRAFT', currentKey: 'act-A', endsOn: null, createdByUserId: 'mentor-1' });
    w.db.seed('mentoringLearningPlan', { activationId: 'act-C', status: 'DRAFT', currentKey: 'act-C', endsOn: null, createdByUserId: 'mentor-1' });
    expect(await w.count('mentor-1', 'meetings_upcoming')).toBe(1);
    expect(await w.count('mentor-1', 'meetings_overdue')).toBe(1);
    expect(await w.count('mentor-2', 'meetings_pending_completion')).toBe(1);
    expect(await w.count('mentor-1', 'plans_awaiting_date')).toBe(0); // both have a meeting
    w.db.rows('mentoringReviewMeeting').find((x) => x.activationId === 'act-C')!.status = 'CANCELLED'; // its meeting was cancelled
    expect(await w.count('mentor-1', 'plans_awaiting_date')).toBe(1);
    w.db.seed('mentoringLearningPlan', { activationId: 'act-B', status: 'DRAFT', currentKey: 'act-B', endsOn: null, createdByUserId: 'mentor-2' });
    expect(await w.count('head-1', 'plans_awaiting_date')).toBe(1); // B has a meeting, so only C waits
  });

  it('counts complaints and the two response time cards from their own services', async () => {
    const w = world();
    await w.complaints.create('act-A', { title: 'Late', category: 'TUTOR', description: 'Tutor late again', parentName: 'Parent A', channel: 'PHONE' }, 'mentor-1', at(MON, '10:00'));
    expect(await w.count('mentor-1', 'complaints_new', {}, at(MON, '10:30'))).toBe(1);
    expect(await w.count('mentor-1', 'complaints_open', {}, at(MON, '10:30'))).toBe(1);
    expect(await w.count('mentor-1', 'complaints_approaching', {}, at(MON, '11:35'))).toBe(1);
    expect(await w.count('mentor-1', 'sla_approaching', {}, at(MON, '11:35'))).toBe(1);
    expect(await w.count('mentor-1', 'complaints_breached', {}, at(MON, '12:30'))).toBe(1);
    expect(await w.count('mentor-1', 'sla_breached', {}, at(MON, '12:30'))).toBe(1);
    expect(await w.count('mentor-2', 'complaints_new', {}, at(MON, '12:30'))).toBe(0);
  });
});

describe('filters, in the query', () => {
  it('finds a student by name or by student ID', async () => {
    const w = world();
    expect(await w.count('mentor-1', 'students_total', { studentQuery: 'asha' })).toBe(1);
    expect(await w.count('mentor-1', 'students_total', { studentQuery: 'STU-0003' })).toBe(1);
    expect(await w.count('mentor-1', 'classes_today', { studentQuery: 'Chitra' })).toBe(1);
    expect(await w.count('mentor-1', 'students_total', { studentQuery: 'nobody here' })).toBe(0);
  });

  it('filters by subject and tutor', async () => {
    const w = world();
    expect(await w.count('mentor-1', 'classes_today', { subjectId: 'sub-ma' })).toBe(1);
    expect(await w.count('mentor-1', 'classes_today', { subjectId: 'sub-xx' })).toBe(0);
    expect(await w.count('mentor-1', 'classes_today', { tutorProfileId: 'tp-meera' })).toBe(2);
    expect(await w.count('mentor-1', 'classes_today', { tutorProfileId: 'tp-other' })).toBe(0);
  });

  it('takes a day, a week or a month, or an explicit range, as the window', async () => {
    const w = world();
    const s = (f: object) => w.dash.summary(w.scope('mentor-1') as any, f, NOW);
    expect((await w.dash.summary(await w.scope('mentor-1'), { period: 'week' }, NOW)).window).toEqual({ from: MON, to: '2026-11-15' });
    expect((await w.dash.summary(await w.scope('mentor-1'), { period: 'month' }, NOW)).window).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect((await w.dash.summary(await w.scope('mentor-1'), { period: 'day', date: '2026-11-16' }, NOW)).window).toEqual({ from: '2026-11-16', to: '2026-11-16' });
    expect((await w.dash.summary(await w.scope('mentor-1'), { from: '2026-11-09', to: '2026-11-23' }, NOW)).window).toEqual({ from: MON, to: '2026-11-23' });
    expect(await w.count('mentor-1', 'classes_upcoming', { period: 'week' })).toBe(0); // the next class is on 16 November
    expect(await w.count('mentor-1', 'classes_upcoming', { period: 'month' })).toBe(6); // three more Mondays, two students
    void s;
  });

  it('filters complaints by category, status and priority, and exams by state', async () => {
    const w = world();
    await w.complaints.create('act-A', { title: 'Bill', category: 'PAYMENT', priority: 'URGENT', description: 'Charged twice', parentName: 'P', channel: 'EMAIL' }, 'mentor-1', at(MON, '10:00'));
    await w.complaints.create('act-A', { title: 'Late', category: 'TUTOR', description: 'Late tutor', parentName: 'P', channel: 'PHONE' }, 'mentor-1', at(MON, '10:05'));
    expect(await w.count('mentor-1', 'complaints_open', { complaintCategory: 'PAYMENT' })).toBe(1);
    expect(await w.count('mentor-1', 'complaints_open', { priority: 'URGENT' })).toBe(1);
    expect(await w.count('mentor-1', 'complaints_new', { complaintStatus: 'NEW' })).toBe(2);
    expect(await w.count('mentor-1', 'complaints_new', { complaintStatus: 'RESOLVED' })).toBe(0);
    w.exam('act-A', 'sub-en', '2026-11-12');
    expect(await w.count('mentor-1', 'exams_upcoming', { examState: 'SCHEDULED' })).toBe(1);
    expect(await w.count('mentor-1', 'exams_upcoming', { examState: 'COMPLETED' })).toBe(0);
  });

  it('refuses a filter that is not real, saying what is wrong', async () => {
    const w = world();
    for (const f of [{ period: 'year' }, { date: 'x' }, { from: '2026-13-01' }, { priority: 'SOON' }, { complaintCategory: 'WEATHER' }, { complaintStatus: 'LOST' }]) {
      await expect(w.dash.summary(await w.scope('mentor-1'), f, NOW)).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe('opening a card', () => {
  it('shows the records the card counted, with where to open each one', async () => {
    const w = world();
    const r = await w.records('mentor-1', 'classes_today');
    expect(r).toMatchObject({ key: 'classes_today', total: 2, page: 1, pages: 1 });
    expect(r.rows[0]).toMatchObject({ kind: 'CLASS', panel: 'classes', date: MON, tutorName: 'Meera Thomas' });
    expect(r.rows.map((x) => x.studentId).sort()).toEqual(['STU-0001', 'STU-0003']);
    expect(r.rows.map((x) => x.activationId).sort()).toEqual(['act-A', 'act-C']);
  });

  it('every card opens exactly as many records as it counts', async () => {
    const w = world();
    w.exam('act-A', 'sub-en', '2026-11-12');
    await w.complaints.create('act-A', { title: 'Late', category: 'TUTOR', description: 'Late tutor', parentName: 'P', channel: 'PHONE' }, 'mentor-1', at(MON, '10:00'));
    const now = at(MON, '12:30');
    const s = await w.dash.summary(await w.scope('mentor-1'), {}, now);
    for (const c of s.cards) expect((await w.records('mentor-1', c.key, {}, now)).total).toBe(c.count);
    expect(s.cards.filter((c) => c.count > 0).length).toBeGreaterThan(4);
  });

  it('pages the records on the server, caps the page size, and refuses a card that does not exist', async () => {
    const w = world();
    const p1 = await w.records('head-1', 'students_total', {}, NOW, 1, 2);
    expect(p1).toMatchObject({ total: 3, pageSize: 2, pages: 2 });
    expect(p1.rows).toHaveLength(2);
    expect((await w.records('head-1', 'students_total', {}, NOW, 2, 2)).rows).toHaveLength(1);
    expect((await w.records('head-1', 'students_total', {}, NOW, 1, 5000)).pageSize).toBe(100);
    expect((await w.records('head-1', 'students_total', {}, NOW, -3, 2)).page).toBe(1);
    await expect(w.records('head-1', 'made_up_card')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('opens only the caller own students records', async () => {
    const w = world();
    expect((await w.records('mentor-2', 'classes_today')).rows.map((r) => r.activationId)).toEqual(['act-B']);
  });
});

describe('a Mentor with about 40 students', () => {
  it('builds every card and a page of records quickly, from a database query per source and not one per student', async () => {
    const w = world(40);
    const started = Date.now();
    const s = await w.dash.summary(await w.scope('mentor-1'), {}, NOW);
    const first = await w.records('mentor-1', 'classes_today', {}, NOW, 1, 25);
    const elapsed = Date.now() - started;
    expect(s.cards.find((c) => c.key === 'students_total')?.count).toBe(42);
    expect(s.cards.find((c) => c.key === 'classes_today')?.count).toBe(42);
    expect(first).toMatchObject({ total: 42, pages: 2 });
    expect(first.rows).toHaveLength(25);
    expect(elapsed).toBeLessThan(5000);
    const calls = (w.db as any).mentoringTutorAssignment.findMany.mock.calls.length;
    expect(calls).toBeLessThan(30); // not 42 or more per card
  });
});

describe('the routes', () => {
  it('are read only: no route changes anything, and each is scoped in the query', () => {
    const controller = readFileSync(join(__dirname, 'mentoring-dashboard.controller.ts'), 'utf8');
    expect(controller).not.toMatch(/@Post|@Put|@Patch|@Delete/);
    expect(controller).toContain('scopeFor(user.id)');
    const service = readFileSync(join(__dirname, 'mentoring-dashboard.service.ts'), 'utf8');
    expect(service).not.toMatch(/\.(create|update|delete|upsert)\(/);
  });
});

describe('class follow-up cards (Stage 1)', () => {
  const task = (w: ReturnType<typeof world>, over: object = {}) => w.db.seed('mentoringTask', { activationId: 'act-A', title: 'Practise fractions', assigneeUserId: 'u-meera', assignedByUserId: 'mentor-1', sourceType: 'CLASS', sourceId: 'sess-1', status: 'OPEN', dueAt: new Date(NOW.getTime() + 86_400_000), ...over });

  it('counts the open follow-ups of a class and the ones past their due time, for the students the Mentor may see', async () => {
    const w = world();
    task(w);
    task(w, { dueAt: new Date(NOW.getTime() - 3_600_000), status: 'IN_PROGRESS' });
    task(w, { status: 'SUBMITTED', dueAt: new Date(NOW.getTime() - 86_400_000) });
    task(w, { status: 'VERIFIED', dueAt: new Date(NOW.getTime() - 86_400_000) });
    task(w, { status: 'CANCELLED' });
    task(w, { sourceType: null, sourceId: null, title: 'An ordinary task' });
    task(w, { activationId: 'act-B' });
    expect(await w.count('mentor-1', 'followups_open')).toBe(3);
    expect(await w.count('mentor-1', 'followups_overdue')).toBe(2);
    expect(await w.count('head-1', 'followups_open')).toBe(4);
    expect(await w.count('mentor-2', 'followups_open')).toBe(1);
  });

  it('opens each card on the records it counted, as the other cards do', async () => {
    const w = world();
    task(w);
    task(w, { dueAt: new Date(NOW.getTime() - 3_600_000) });
    for (const key of ['followups_open', 'followups_overdue']) {
      const r = await w.records('mentor-1', key);
      expect(r.total).toBe(await w.count('mentor-1', key));
      expect(r.rows.every((x) => x.kind === 'TASK' && x.panel === 'classes')).toBe(true);
    }
    expect((await w.records('mentor-1', 'followups_open')).rows.map((x) => x.status).sort()).toEqual(['Open', 'Open']);
  });
});
