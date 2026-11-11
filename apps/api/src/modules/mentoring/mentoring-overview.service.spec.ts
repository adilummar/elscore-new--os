/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringClassService } from './mentoring-class.service';
import { MentoringComplaintService } from './mentoring-complaint.service';
import { MentoringDashboardService } from './mentoring-dashboard.service';
import { MentoringExamService } from './mentoring-exam.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringOverviewService } from './mentoring-overview.service';
import { MentoringReminderService } from './mentoring-reminder.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { FakeDb } from './testing/mentoring-fake-db';

const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const slot = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const MON = '2026-11-09';
const NOW = at(MON, '12:00');
const good = { conducted: true, actualStart: '15:05', actualEnd: '16:10', topicsCovered: 'Tenses', attendance: 'PRESENT' };
const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work'],
  'mentor-2': ['mentoring.student.read-assigned', 'mentoring.stage.work'],
  'head-1': ['mentoring.student.read-all', 'mentoring.allocation.manage'],
  nobody: [],
};

function world(extra = 0) {
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
  db.seed('employee', { id: 'e-m2', userId: 'mentor-2', firstName: 'Mohan', lastName: 'Mentor', employmentStatus: 'ACTIVE' });
  const student = (id: string, first: string, last: string, mentor: string, businessId: string, status: string, subject = 'sub-en', stage = 1) => {
    db.seed('lead', { id: `lead-${id}` });
    db.seed('student', { id: `stu-${id}`, firstName: first, lastName: last, businessId });
    db.seed('mentoringActivation', { id: `act-${id}`, leadId: `lead-${id}`, studentId: `stu-${id}`, handoverId: `ho-${id}`, status, currentStage: stage, currentMentorUserId: mentor, createdAt: new Date(NOW.getTime() - 5 * 86_400_000) });
    if (status !== 'ACTIVATED') db.seed('mentoringStage', { activationId: `act-${id}`, stageNumber: stage, key: 'X', status: 'IN_PROGRESS' });
    const a = db.seed('mentoringTutorAssignment', { id: `as-class-${id}`, activationId: `act-${id}`, subjectId: subject, tutorProfileId: 'tp-meera', status: 'ACTIVE', currentKey: `act-${id}:${subject}`, startDate: day(MON), endDate: null });
    db.seed('mentoringTutorAssignmentSession', { assignmentId: a.id, tutorProfileId: 'tp-meera', dayOfWeek: 1, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: m('15:00'), endMinute: m('16:00') });
  };
  student('A', 'Asha', 'Menon', 'mentor-1', 'STU-0001', 'ACTIVATED');
  student('B', 'Basil', 'Nair', 'mentor-2', 'STU-0002', 'ACTIVATION_IN_PROGRESS', 'sub-en', 3);
  student('C', 'Chitra', 'Pillai', 'mentor-1', 'STU-0003', 'ACTIVATION_IN_PROGRESS', 'sub-ma', 5);
  student('D', 'Dev', 'Kumar', 'mentor-2', 'STU-0004', 'PENDING_FINAL_APPROVAL', 'sub-en', 7);
  for (let i = 0; i < extra; i++) student(`X${i}`, 'Extra', `Student ${i}`, 'mentor-1', `STU-1${String(i).padStart(3, '0')}`, 'ACTIVATED');

  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: (id: string) => Promise.resolve(new Set(PERMS[id] ?? [])) } as any);
  const sla = new MentoringSlaService(db as any, access);
  const reminders = new MentoringReminderService(db as any);
  let n = 0;
  const ids = { nextIdInTx: jest.fn(() => Promise.resolve(`TCR-${String(++n).padStart(7, '0')}`)) };
  const classes = new MentoringClassService(db as any, access, history, sla, reminders, ids as any, new MentoringTutorService(db as any, history));
  const exams = new MentoringExamService(db as any, access, history, reminders, sla);
  const complaints = new MentoringComplaintService(db as any, access, history, sla);
  const dash = new MentoringDashboardService(db as any, access, classes, exams, complaints, sla);
  const overview = new MentoringOverviewService(db as any, access, classes, dash, sla);
  const scope = (u: string) => access.scopeFor(u);
  return { db, overview, classes, scope };
}

describe('the summary', () => {
  it('gives the Head the department and a Mentor only their own students, and nobody without access nothing', async () => {
    const w = world();
    const head = await w.overview.summary(await w.scope('head-1'), {}, NOW);
    const mentor = await w.overview.summary(await w.scope('mentor-1'), {}, NOW);
    expect(head.role).toBe('HEAD');
    expect(mentor.role).toBe('MENTOR');
    expect(head.summary.activeStudents + head.summary.ongoingActivations).toBe(4);
    expect(mentor.summary).toMatchObject({ activeStudents: 1, ongoingActivations: 1 });
    await expect(w.overview.summary(await w.scope('nobody'), {}, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps active students and activations still in progress apart, and breaks the open ones down by status', async () => {
    const w = world();
    const s = await w.overview.summary(await w.scope('head-1'), {}, NOW);
    expect(s.summary).toMatchObject({ activeStudents: 1, ongoingActivations: 3 });
    expect(s.activationByStatus.find((x) => x.status === 'ACTIVATION_IN_PROGRESS')).toMatchObject({ label: 'In progress', count: 2 });
    expect(s.activationByStatus.find((x) => x.status === 'PENDING_FINAL_APPROVAL')).toMatchObject({ label: 'Waiting for final approval', count: 1 });
  });

  it('adds up scheduled hours from the approved schedule for the month, and nothing is consumed until a Mentor verifies', async () => {
    const w = world();
    const s = await w.overview.summary(await w.scope('head-1'), { period: 'month' }, NOW);
    expect(s.window).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(s.summary).toMatchObject({ scheduledMinutes: 4 * 4 * 60, consumedMinutes: 0, reportedMinutes: 0 }); // 4 students, 4 Mondays from the 9th
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0); // reading stores nothing
  });

  it('keeps scheduled, reported and consumed hours apart, and counts consumed only after verification', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    const before = await w.overview.summary(await w.scope('mentor-1'), {}, at(MON, '17:30'));
    expect(before.summary).toMatchObject({ reportedMinutes: 65, consumedMinutes: 0, pendingVerification: 1 });
    await w.classes.verify(w.db.rows('mentoringClassSession')[0].id, {}, 'mentor-1', at(MON, '18:00'));
    const after = await w.overview.summary(await w.scope('mentor-1'), {}, at(MON, '18:10'));
    expect(after.summary).toMatchObject({ reportedMinutes: 65, consumedMinutes: 65, pendingVerification: 0 });
    expect(after.summary.scheduledMinutes).toBe(8 * 60); // two students, four Mondays each
  });

  it('takes a week or a month as the window, and refuses anything else', async () => {
    const w = world();
    expect((await w.overview.summary(await w.scope('head-1'), { period: 'week' }, NOW)).window).toEqual({ from: MON, to: '2026-11-15' });
    expect((await w.overview.summary(await w.scope('head-1'), { period: 'month', date: '2026-12-15' }, NOW)).window).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    await expect(w.overview.summary(await w.scope('head-1'), { period: 'year' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.overview.summary(await w.scope('head-1'), { date: 'soon' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists what needs attention, and leaves out anything that is zero', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    const s = await w.overview.summary(await w.scope('mentor-1'), {}, at(MON, '17:30'));
    expect(s.attention.map((a) => a.key)).toContain('classes_awaiting_verification');
    expect(s.attention.every((a) => a.count > 0)).toBe(true);
    expect(s.summary.attentionTotal).toBe(s.attention.reduce((t, a) => t + a.count, 0));
    expect(s.note).toContain('Consumed hours count only classes the Mentor verified');
  });
});

describe('Mentor by Mentor', () => {
  it('gives the Head one row for each Mentor, with students, hours and pending work', async () => {
    const w = world();
    const r = await w.overview.mentors(await w.scope('head-1'), {}, NOW);
    expect(r.total).toBe(2);
    expect(r.rows[0]).toMatchObject({ name: 'Mira Mentor', assignedStudents: 2, activeStudents: 1, ongoingActivations: 1, scheduledHours: 8, consumedHours: 0, remainingHours: 8 });
    expect(r.rows[1]).toMatchObject({ name: 'Mohan Mentor', assignedStudents: 2, activeStudents: 0, ongoingActivations: 2 });
  });

  it('shows a Mentor only their own row, never another Mentor', async () => {
    const w = world();
    const r = await w.overview.mentors(await w.scope('mentor-1'), {}, NOW);
    expect(r.rows.map((x) => x.name)).toEqual(['Mira Mentor']);
    expect(JSON.stringify(r)).not.toContain('Mohan');
  });

  it('counts pending verification and missing updates into a Mentor pending tasks', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    const r = await w.overview.mentors(await w.scope('head-1'), {}, at(MON, '17:30'));
    const mira = r.rows.find((x) => x.name === 'Mira Mentor')!;
    expect(mira.pendingVerification).toBe(1);
    expect(mira.pendingTasks).toBeGreaterThanOrEqual(2); // the verification, and student C whose tutor has not reported
  });

  it('searches, sorts and pages on the server', async () => {
    const w = world();
    const s = await w.scope('head-1');
    expect((await w.overview.mentors(s, { search: 'moh' }, NOW)).rows.map((x) => x.name)).toEqual(['Mohan Mentor']);
    expect((await w.overview.mentors(s, { sort: 'ongoingActivations', dir: 'desc' }, NOW)).rows[0].name).toBe('Mohan Mentor');
    expect((await w.overview.mentors(s, { sort: 'name', dir: 'desc' }, NOW)).rows[0].name).toBe('Mohan Mentor');
    const p = await w.overview.mentors(s, { pageSize: 1, page: 2 }, NOW);
    expect(p).toMatchObject({ total: 2, pages: 2, page: 2 });
    expect(p.rows).toHaveLength(1);
    expect((await w.overview.mentors(s, { sort: 'password', dir: 'asc' }, NOW)).rows).toHaveLength(2); // an unknown sort falls back to name
  });
});

describe('students and their hours', () => {
  it('shows each student with the Mentor, the activation, the subjects and the hours kept apart', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    const r = await w.overview.students(await w.scope('head-1'), {}, at(MON, '17:30'));
    const asha = r.rows.find((x) => x.studentName === 'Asha Menon')!;
    expect(asha).toMatchObject({ studentId: 'STU-0001', mentorName: 'Mira Mentor', statusLabel: 'Active', scheduledHours: 4, reportedHours: 1.1, consumedHours: 0, remainingHours: 4, pendingClasses: 4 });
    expect(asha.subjects).toEqual([{ id: 'sub-en', name: 'English' }]);
  });

  it('filters by Mentor, status, subject and search, and never reaches another Mentor student', async () => {
    const w = world();
    const head = await w.scope('head-1');
    expect((await w.overview.students(head, { mentorUserId: 'mentor-2' }, NOW)).rows.map((x) => x.studentName).sort()).toEqual(['Basil Nair', 'Dev Kumar']);
    expect((await w.overview.students(head, { status: 'ACTIVATED' }, NOW)).total).toBe(1);
    expect((await w.overview.students(head, { subjectId: 'sub-ma' }, NOW)).rows.map((x) => x.studentName)).toEqual(['Chitra Pillai']);
    expect((await w.overview.students(head, { search: 'stu-0004' }, NOW)).rows.map((x) => x.studentName)).toEqual(['Dev Kumar']);
    const mentor = await w.scope('mentor-1');
    expect((await w.overview.students(mentor, {}, NOW)).rows.map((x) => x.studentName).sort()).toEqual(['Asha Menon', 'Chitra Pillai']);
    expect((await w.overview.students(mentor, { mentorUserId: 'mentor-2' }, NOW)).total).toBe(0);
    await expect(w.overview.students(head, { status: 'LOST' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sorts by hours and pages', async () => {
    const w = world();
    const r = await w.overview.students(await w.scope('head-1'), { sort: 'studentName', dir: 'desc', pageSize: 2 }, NOW);
    expect(r.rows.map((x) => x.studentName)).toEqual(['Dev Kumar', 'Chitra Pillai']);
    expect(r).toMatchObject({ total: 4, pages: 2 });
  });
});

describe('activations still in progress', () => {
  it('shows who has each one, the stage, how long it has waited, and what has to happen next', async () => {
    const w = world();
    const r = await w.overview.activations(await w.scope('head-1'), {}, NOW);
    expect(r.total).toBe(3);
    expect(r.rows.map((x) => x.studentName)).not.toContain('Asha Menon'); // active students are not here
    const dev = r.rows.find((x) => x.studentName === 'Dev Kumar')!;
    expect(dev).toMatchObject({ statusLabel: 'Waiting for final approval', responsible: 'Mentoring Head', nextAction: 'Give final approval', daysPending: 5, stageNumber: 7, stageName: 'First Class Completion' });
    const basil = r.rows.find((x) => x.studentName === 'Basil Nair')!;
    expect(basil).toMatchObject({ responsible: 'Mohan Mentor', nextAction: 'Complete stage 3, Timetable Creation', stageName: 'Timetable Creation', blocked: false });
  });

  it('names a blocked or held workflow, and a student still waiting for a Mentor', async () => {
    const w = world();
    w.db.rows('mentoringActivation').find((a) => a.id === 'act-B')!.status = 'ACTIVATION_BLOCKED';
    w.db.rows('mentoringActivation').find((a) => a.id === 'act-C')!.status = 'ACTIVATION_ON_HOLD';
    const rows = (await w.overview.activations(await w.scope('head-1'), {}, NOW)).rows;
    expect(rows.find((x) => x.studentName === 'Basil Nair')).toMatchObject({ blocked: true, nextAction: 'Clear what is blocking the workflow' });
    expect(rows.find((x) => x.studentName === 'Chitra Pillai')).toMatchObject({ blocked: true, nextAction: 'Resume the workflow' });
  });

  it('filters by status and Mentor, scopes a Mentor to their own, and refuses a status that is not open', async () => {
    const w = world();
    const head = await w.scope('head-1');
    expect((await w.overview.activations(head, { status: 'PENDING_FINAL_APPROVAL' }, NOW)).total).toBe(1);
    expect((await w.overview.activations(head, { mentorUserId: 'mentor-1' }, NOW)).rows.map((x) => x.studentName)).toEqual(['Chitra Pillai']);
    expect((await w.overview.activations(await w.scope('mentor-2'), {}, NOW)).rows.map((x) => x.studentName).sort()).toEqual(['Basil Nair', 'Dev Kumar']);
    await expect(w.overview.activations(head, { status: 'ACTIVATED' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("today's classes", () => {
  it('lists the day in time order with the Mentor, the stage and whether it counts as consumed', async () => {
    const w = world();
    const r = await w.overview.today(await w.scope('head-1'), {}, NOW);
    expect(r).toMatchObject({ date: MON, total: 4, consumed: 0 });
    expect(r.rows[0]).toMatchObject({ startMinute: 900, consumption: 'NOT_CONSUMED', tutorName: 'Meera Thomas' });
    expect(r.rows.map((x) => x.mentorName).sort()).toEqual(['Mira Mentor', 'Mira Mentor', 'Mohan Mentor', 'Mohan Mentor']);
  });

  it('marks a class consumed only after the Mentor verifies it, and warns about a returned one', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    const waiting = await w.overview.today(await w.scope('mentor-1'), {}, at(MON, '17:30'));
    expect(waiting.rows.find((x) => x.studentName === 'Asha Menon')).toMatchObject({ consumption: 'NOT_CONSUMED', state: 'AWAITING_MENTOR_VERIFICATION' });
    await w.classes.verify(w.db.rows('mentoringClassSession')[0].id, {}, 'mentor-1', at(MON, '18:00'));
    const done = await w.overview.today(await w.scope('mentor-1'), {}, at(MON, '18:10'));
    expect(done.rows.find((x) => x.studentName === 'Asha Menon')).toMatchObject({ consumption: 'CONSUMED' });
    expect(done.consumed).toBe(1);
  });

  it('filters by Mentor and search, scopes a Mentor to their own, and moves to another date', async () => {
    const w = world();
    const head = await w.scope('head-1');
    expect((await w.overview.today(head, { mentorUserId: 'mentor-2' }, NOW)).rows).toHaveLength(2);
    expect((await w.overview.today(head, { search: 'chitra' }, NOW)).rows.map((x) => x.studentName)).toEqual(['Chitra Pillai']);
    expect((await w.overview.today(await w.scope('mentor-2'), {}, NOW)).rows.map((x) => x.studentName).sort()).toEqual(['Basil Nair', 'Dev Kumar']);
    expect((await w.overview.today(head, { date: '2026-11-16' }, NOW)).total).toBe(4);
    expect((await w.overview.today(head, { date: '2026-11-10' }, NOW)).total).toBe(0);
  });
});

describe('a Mentor with about 40 students', () => {
  it('builds the summary, the Mentor table and the day quickly, from a few queries and not one per student', async () => {
    const w = world(40);
    const started = Date.now();
    const s = await w.overview.summary(await w.scope('mentor-1'), {}, NOW);
    const t = await w.overview.today(await w.scope('mentor-1'), {}, NOW);
    const mt = await w.overview.mentors(await w.scope('head-1'), {}, NOW);
    expect(Date.now() - started).toBeLessThan(8000);
    expect(s.summary.activeStudents).toBe(41);
    expect(t.total).toBe(42);
    expect(mt.rows.find((x) => x.name === 'Mira Mentor')?.assignedStudents).toBe(42);
    expect((w.db as any).mentoringTutorAssignment.findMany.mock.calls.length).toBeLessThan(40);
  });
});

describe('the routes', () => {
  it('are read only, and scoped in the query', () => {
    const controller = readFileSync(join(__dirname, 'mentoring-overview.controller.ts'), 'utf8');
    expect(controller).not.toMatch(/@Post|@Put|@Patch|@Delete/);
    expect((controller.match(/scopeFor\(user\.id\)/g) ?? []).length).toBe(5);
    const service = readFileSync(join(__dirname, 'mentoring-overview.service.ts'), 'utf8');
    expect(service).not.toMatch(/\.(create|update|delete|upsert)\(/);
  });
});
