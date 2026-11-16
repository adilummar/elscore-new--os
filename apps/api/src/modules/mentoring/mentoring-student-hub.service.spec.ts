/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringClassService } from './mentoring-class.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringLearningPlanService } from './mentoring-learning-plan.service';
import { MentoringReminderService } from './mentoring-reminder.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { MentoringStudentHubService } from './mentoring-student-hub.service';
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
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work'],
  'mentor-2': ['mentoring.student.read-assigned', 'mentoring.stage.work'],
  'head-1': ['mentoring.student.read-all', 'mentoring.allocation.manage'],
  'ceo-1': ['mentoring.student.read-all'],
  'counselor-1': ['mentoring.student.read-assigned', 'mentoring.task.work'],
  'tutor-1': ['tutor.portal.read'],
  'parent-1': [],
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
  const student = (id: string, first: string, last: string, mentor: string, businessId: string, status: string, subject = 'sub-en', grade = 'Grade 8') => {
    db.seed('lead', { id: `lead-${id}`, firstName: 'Parent', lastName: id, primaryPhone: '+919900000000' });
    db.seed('student', { id: `stu-${id}`, firstName: first, lastName: last, businessId, currentGrade: grade });
    db.seed('mentoringActivation', { id: `act-${id}`, leadId: `lead-${id}`, studentId: `stu-${id}`, handoverId: `ho-${id}`, status, ...(status === 'ACTIVATED' ? { activatedAt: new Date('2026-11-01T00:00:00Z') } : {}), currentStage: 3, currentMentorUserId: mentor, createdAt: new Date(NOW.getTime() - 5 * 86_400_000) });
    db.seed('mentoringStage', { activationId: `act-${id}`, stageNumber: 3, key: 'TIMETABLE_CREATION', status: status === 'ACTIVATED' ? 'COMPLETED' : 'IN_PROGRESS' });
    const a = db.seed('mentoringTutorAssignment', { id: `as-class-${id}`, activationId: `act-${id}`, subjectId: subject, tutorProfileId: 'tp-meera', status: 'ACTIVE', currentKey: `act-${id}:${subject}`, startDate: day(MON), endDate: null, scheduleSnapshot: { subjectName: subject === 'sub-en' ? 'English' : 'Mathematics', labels: ['Monday 15:00 to 16:00'] } });
    db.seed('mentoringTutorAssignmentSession', { assignmentId: a.id, tutorProfileId: 'tp-meera', dayOfWeek: 1, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: m('15:00'), endMinute: m('16:00') });
  };
  student('A', 'Asha', 'Menon', 'mentor-1', 'STU-0001', 'ACTIVATED');
  student('B', 'Basil', 'Nair', 'mentor-2', 'STU-0002', 'ACTIVATED', 'sub-en', 'Grade 9');
  student('C', 'Chitra', 'Pillai', 'mentor-1', 'STU-0003', 'ACTIVATION_IN_PROGRESS', 'sub-ma');
  for (let i = 0; i < extra; i++) student(`X${i}`, 'Extra', `Student ${String(i).padStart(2, '0')}`, 'mentor-1', `STU-1${String(i).padStart(3, '0')}`, 'ACTIVATED');
  // The Sales requirement is the only entitlement the system stores: 4 hours a month for Asha, nothing set for Basil.
  db.seed('requirement', { studentId: 'stu-A', subjectId: 'sub-en', monthlyHours: 4 });
  db.seed('requirement', { studentId: 'stu-B', subjectId: 'sub-en', monthlyHours: null });

  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: (id: string) => Promise.resolve(new Set(PERMS[id] ?? [])) } as any);
  const sla = new MentoringSlaService(db as any, access);
  const reminders = new MentoringReminderService(db as any);
  let n = 0;
  const ids = { nextIdInTx: jest.fn(() => Promise.resolve(`TCR-${String(++n).padStart(7, '0')}`)) };
  const tutors = new MentoringTutorService(db as any, history);
  const classes = new MentoringClassService(db as any, access, history, sla, reminders, ids as any, tutors);
  makeVerifyLenient(classes, db);
  const plans = { get: jest.fn().mockResolvedValue(null) } as unknown as MentoringLearningPlanService;
  const hub = new MentoringStudentHubService(db as any, access, classes, tutors, plans, sla);
  const scope = (u: string) => access.scopeFor(u);
  return { db, hub, classes, scope };
}

describe('the Students list', () => {
  it('gives a Mentor only their own students, the Head and the CEO the department, and everyone else nothing', async () => {
    const w = world();
    expect((await w.hub.list(await w.scope('mentor-1'), {}, NOW)).rows.map((r) => r.name)).toEqual(['Asha Menon', 'Chitra Pillai']);
    expect((await w.hub.list(await w.scope('mentor-2'), {}, NOW)).rows.map((r) => r.name)).toEqual(['Basil Nair']);
    expect((await w.hub.list(await w.scope('head-1'), {}, NOW)).total).toBe(3);
    expect((await w.hub.list(await w.scope('ceo-1'), {}, NOW)).total).toBe(3);
    for (const u of ['tutor-1', 'parent-1', 'stranger']) await expect(w.hub.list(await w.scope(u), {}, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cannot be widened by the mentor filter when the caller is a Mentor', async () => {
    const w = world();
    const r = await w.hub.list(await w.scope('mentor-1'), { mentorUserId: 'mentor-2' }, NOW);
    expect(r.rows.map((x) => x.name)).toEqual(['Asha Menon', 'Chitra Pillai']);
    expect((await w.hub.list(await w.scope('head-1'), { mentorUserId: 'mentor-2' }, NOW)).rows.map((x) => x.name)).toEqual(['Basil Nair']);
  });

  it('searches by name and by student ID, inside the caller scope only', async () => {
    const w = world();
    expect((await w.hub.list(await w.scope('mentor-1'), { search: 'asha' }, NOW)).rows.map((r) => r.studentId)).toEqual(['STU-0001']);
    expect((await w.hub.list(await w.scope('mentor-1'), { search: 'STU-0003' }, NOW)).rows.map((r) => r.name)).toEqual(['Chitra Pillai']);
    expect((await w.hub.list(await w.scope('mentor-1'), { search: 'Basil' }, NOW)).rows).toEqual([]); // another Mentor's student
  });

  it('filters by grade, subject and status, and refuses values that do not exist', async () => {
    const w = world();
    const head = await w.scope('head-1');
    expect((await w.hub.list(head, { grade: 'Grade 9' }, NOW)).rows.map((r) => r.name)).toEqual(['Basil Nair']);
    expect((await w.hub.list(head, { subjectId: 'sub-ma' }, NOW)).rows.map((r) => r.name)).toEqual(['Chitra Pillai']);
    expect((await w.hub.list(head, { status: 'ACTIVATED' }, NOW)).total).toBe(2);
    await expect(w.hub.list(head, { status: 'NOPE' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.hub.list(head, { consumption: 'NOPE' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.hub.list(head, { sort: 'nope' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.hub.list(head, { month: 'soon' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters by pending verification and by an upcoming exam', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    w.db.seed('mentoringExam', { activationId: 'act-B', subjectId: 'sub-en', title: 'Tenses test', date: day('2026-11-12'), startMinute: m('10:00'), endMinute: m('11:00'), dateKey: 'act-B:2026-11-12', conducted: null });
    const head = await w.scope('head-1');
    expect((await w.hub.list(head, { pendingVerification: 'true' }, at(MON, '17:30'))).rows.map((r) => r.name)).toEqual(['Asha Menon']);
    const exam = await w.hub.list(head, { upcomingExam: 'true' }, NOW);
    expect(exam.rows.map((r) => r.name)).toEqual(['Basil Nair']);
    expect(exam.rows[0].nextExam).toMatchObject({ date: '2026-11-12', title: 'Tenses test' });
  });

  it('paginates on the server and reports the total', async () => {
    const w = world(30);
    const mentor = await w.scope('mentor-1');
    const p1 = await w.hub.list(mentor, { pageSize: 10, page: 1 }, NOW);
    const p4 = await w.hub.list(mentor, { pageSize: 10, page: 4 }, NOW);
    expect(p1).toMatchObject({ total: 32, pages: 4, pageSize: 10 });
    expect(p1.rows).toHaveLength(10);
    expect(p4.rows).toHaveLength(2);
    expect(new Set([...p1.rows, ...p4.rows].map((r) => r.activationId)).size).toBe(12);
    expect((await w.hub.list(mentor, { pageSize: 5000 }, NOW)).pageSize).toBe(100);
  });

  it('works out allocated, consumed, remaining and pending apart, and counts only what a Mentor verified', async () => {
    const w = world();
    const mentor = await w.scope('mentor-1');
    const row = async (now: Date) => (await w.hub.list(mentor, { search: 'Asha' }, now)).rows[0];
    expect((await row(NOW)).balance).toMatchObject({ allocatedMinutes: 240, consumedMinutes: 0, remainingMinutes: 240, scheduledMinutes: 240, pendingMinutes: 0 });
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    // Submitted by the tutor is pending, not consumed, and remaining does not move.
    expect((await row(at(MON, '17:30'))).balance).toMatchObject({ consumedMinutes: 0, remainingMinutes: 240, pendingMinutes: 60 });
    await w.classes.verify(w.db.rows('mentoringClassSession')[0].id, {}, 'mentor-1', at(MON, '18:00'));
    expect((await row(at(MON, '18:10'))).balance).toMatchObject({ consumedMinutes: 65, remainingMinutes: 175, pendingMinutes: 0, over: false });
  });

  it('does not count a cancelled class, and shows unavailable instead of inventing an allocation', async () => {
    const w = world();
    await w.classes.cancel('as-class-A~2026-11-16~900', 'Public holiday', 'mentor-1', NOW);
    const asha = (await w.hub.list(await w.scope('mentor-1'), { search: 'Asha' }, NOW)).rows[0];
    expect(asha.balance.consumedMinutes).toBe(0);
    expect(asha.balance.scheduledMinutes).toBe(180); // 4 Mondays less the cancelled one
    const basil = (await w.hub.list(await w.scope('head-1'), { search: 'Basil' }, NOW)).rows[0];
    expect(basil.balance).toMatchObject({ allocatedMinutes: null, remainingMinutes: null, band: 'UNAVAILABLE' });
  });

  it('filters by class consumption and sorts by consumed time', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    await w.classes.verify(w.db.rows('mentoringClassSession')[0].id, {}, 'mentor-1', at(MON, '18:00'));
    const head = await w.scope('head-1');
    const now = at(MON, '18:10');
    expect((await w.hub.list(head, { consumption: 'IN_PROGRESS' }, now)).rows.map((r) => r.name)).toEqual(['Asha Menon']);
    expect((await w.hub.list(head, { consumption: 'UNAVAILABLE' }, now)).rows.map((r) => r.name)).toEqual(['Basil Nair', 'Chitra Pillai']);
    expect((await w.hub.list(head, { sort: 'consumed', dir: 'desc' }, now)).rows[0].name).toBe('Asha Menon');
  });

  it('shows the next class from the timetable and reads without storing anything', async () => {
    const w = world();
    const asha = (await w.hub.list(await w.scope('mentor-1'), { search: 'Asha' }, NOW)).rows[0];
    expect(asha.nextClass).toMatchObject({ date: MON, startMinute: m('15:00'), subjectName: 'English' });
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0);
  });
});

describe('the Student Workspace', () => {
  it('opens only for students the caller may see, and says not found for anyone else', async () => {
    const w = world();
    expect((await w.hub.workspace('act-A', await w.scope('mentor-1'), NOW)).header.name).toBe('Asha Menon');
    await expect(w.hub.workspace('act-A', await w.scope('mentor-2'), NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.hub.studentClasses('act-A', await w.scope('mentor-2'), {}, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.hub.communication('act-A', await w.scope('mentor-2'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.hub.workspace('act-A', await w.scope('tutor-1'), NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.hub.workspace('act-A', await w.scope('parent-1'), NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets only the assigned Mentor verify: the Head and the CEO read, and parent contact stays with the Mentor, the Head and the CEO', async () => {
    const w = world();
    const mentor = await w.hub.workspace('act-A', await w.scope('mentor-1'), NOW);
    const head = await w.hub.workspace('act-A', await w.scope('head-1'), NOW);
    const ceo = await w.hub.workspace('act-A', await w.scope('ceo-1'), NOW);
    expect(mentor.viewer).toMatchObject({ canVerify: true, readOnly: false });
    expect(head.viewer).toMatchObject({ canVerify: false, readOnly: true });
    expect(ceo.viewer).toMatchObject({ canVerify: false, readOnly: true });
    expect(mentor.header.parent).not.toBeNull();
    expect(head.header.parent).not.toBeNull();
    expect(ceo.header.parent).not.toBeNull();
    // A Demo Counselor who holds a task for the student reads the workspace but never sees the parent or verifies a class.
    w.db.seed('mentoringTask', { activationId: 'act-A', assigneeUserId: 'counselor-1', title: 'Collect the report card' });
    const counselor = await w.hub.workspace('act-A', await w.scope('counselor-1'), NOW);
    expect(counselor.header.parent).toBeNull();
    expect(counselor.header.parentHidden).toBe(true);
    expect(counselor.viewer).toMatchObject({ canVerify: false, readOnly: true });
  });

  it('shows the tutors subject by subject and the cards for upcoming, awaiting and pending work', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    const ws = await w.hub.workspace('act-A', await w.scope('mentor-1'), at(MON, '17:30'));
    expect(ws.tutors).toEqual([expect.objectContaining({ subjectName: 'English', tutorName: 'Meera Thomas' })]);
    expect(ws.cards).toMatchObject({ awaitingMentorVerification: 1, pending: { verification: 1, total: 1 } });
    expect(ws.balance).toMatchObject({ allocatedMinutes: 240, consumedMinutes: 0 });
  });
});

describe('the lifecycle-aware cards', () => {
  it('lists subjects and tutors on the list, and counts verified classes apart from hours', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    await w.classes.verify(w.db.rows('mentoringClassSession')[0].id, {}, 'mentor-1', at(MON, '18:00'));
    const row = (await w.hub.list(await w.scope('mentor-1'), { search: 'Asha' }, at(MON, '18:10'))).rows[0];
    expect(row.subjects).toEqual(['English']);
    expect(row.tutors).toEqual(['Meera Thomas']);
    expect(row.balance).toMatchObject({ consumedClasses: 1, consumedMinutes: 65, scheduledClasses: 4 });
  });

  it('reports open complaints, upcoming exams and whether an activation workflow is genuinely pending', async () => {
    const w = world();
    w.db.seed('mentoringComplaint', { activationId: 'act-A', status: 'NEW' });
    w.db.seed('mentoringComplaint', { activationId: 'act-A', status: 'RESOLVED' });
    w.db.seed('mentoringExam', { activationId: 'act-A', subjectId: 'sub-en', title: 'T', date: day('2026-11-12'), startMinute: 600, endMinute: 660, dateKey: 'act-A:2026-11-12', conducted: null });
    const mentor = await w.scope('mentor-1');
    let ws = await w.hub.workspace('act-A', mentor, NOW);
    expect(ws.cards).toMatchObject({ openComplaints: 1, upcomingExams: 1, pendingWorkflow: false });
    expect(ws.cards.nextClass).toMatchObject({ date: MON });
    w.db.seed('workflowHold', { activationId: 'act-A', resolvedAt: null });
    ws = await w.hub.workspace('act-A', mentor, NOW);
    expect(ws.cards.pendingWorkflow).toBe(true);
  });
});

describe('the Classes tab', () => {
  it('lists stored records only: a timetable full of future classes is not a list of records', async () => {
    const w = world();
    const none = await w.hub.studentClasses('act-A', await w.scope('mentor-1'), {}, NOW);
    expect(none.records).toEqual([]);
    expect(none.balance.scheduledMinutes).toBe(240); // the timetable still shows its scheduled time, separately
    expect(none.counts.allTime.records).toBe(0);
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0);
  });

  it('colours each record: amber while it waits, grey once verified and consumed, neutral when cancelled', async () => {
    const w = world();
    const mentor = await w.scope('mentor-1');
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, good, at(MON, '17:00'));
    await w.classes.cancel('as-class-A~2026-11-16~900', 'Holiday', 'mentor-1', NOW);
    const waiting = await w.hub.studentClasses('act-A', mentor, {}, at(MON, '17:30'));
    expect(waiting.records.map((r) => [r.date, r.tone, r.consumption])).toEqual([['2026-11-16', 'neutral', 'NOT_CONSUMED'], [MON, 'amber', 'NOT_CONSUMED']]);
    expect(waiting.counts.allTime).toMatchObject({ records: 2, consumedClasses: 0, awaitingMentor: 1, cancelled: 1 });
    await w.classes.verify(w.db.rows('mentoringClassSession').find((s) => s.status === 'AWAITING_MENTOR_VERIFICATION')!.id, {}, 'mentor-1', at(MON, '18:00'));
    const done = await w.hub.studentClasses('act-A', mentor, {}, at(MON, '18:10'));
    expect(done.records.find((r) => r.date === MON)).toMatchObject({ tone: 'grey', consumption: 'CONSUMED', verifiedMinutes: 65 });
    expect(done.counts.allTime).toMatchObject({ consumedClasses: 1, consumedMinutes: 65, awaitingMentor: 0, cancelled: 1 });
    expect(done.balance).toMatchObject({ allocatedMinutes: 240, consumedMinutes: 65, remainingMinutes: 175 });
    expect(done.canVerify).toBe(true);
  });

  it('marks a class the tutor says was not held as never consumed', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', `as-class-A~${MON}~900`, { conducted: false, notConductedReason: 'Student unwell', resubmitReason: 'x' }, at(MON, '17:00'));
    const r = await w.hub.studentClasses('act-A', await w.scope('mentor-1'), {}, at(MON, '17:30'));
    expect(r.records).toHaveLength(1);
    expect(r.records[0].consumption).toBe('NOT_CONSUMED');
    expect(r.counts.allTime.consumedMinutes).toBe(0);
  });

  it('gives the Head a read-only view', async () => {
    const w = world();
    expect((await w.hub.studentClasses('act-A', await w.scope('head-1'), {}, NOW)).canVerify).toBe(false);
  });
});

describe('the Communication tab', () => {
  it('shows only messages and reminders that exist', async () => {
    const w = world();
    const mentor = await w.scope('mentor-1');
    expect(await w.hub.communication('act-A', mentor)).toEqual({ messages: [], reminders: [] });
    w.db.seed('mentoringReminder', { kind: 'CLASS_REMINDER', entityType: 'ClassSession', entityId: 's1', activationId: 'act-A', recipientUserId: 'u-meera', status: 'SENT', message: 'Class at 3', preparedAt: NOW, sentAt: NOW });
    const c = await w.hub.communication('act-A', mentor);
    expect(c.reminders).toHaveLength(1);
    expect((await w.hub.communication('act-B', await w.scope('mentor-2'))).reminders).toHaveLength(0);
  });
});
