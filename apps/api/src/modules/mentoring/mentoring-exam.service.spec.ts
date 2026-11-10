/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringExamController, TutorExamsController } from './mentoring-exam.controller';
import { MentoringExamService } from './mentoring-exam.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringReminderService } from './mentoring-reminder.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { FakeDb } from './testing/mentoring-fake-db';

const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const MON = '2026-11-09', THU = '2026-11-12', FRI = '2026-11-13', SAT = '2026-11-14';
const NOW = at(MON, '12:00');

const scope = (userId: string, perms: string[], all = false): MentoringScope => ({ userId, perms: new Set(perms), all, assigned: perms.includes('mentoring.student.read-assigned') });
const MENTOR = scope('mentor-1', ['mentoring.student.read-assigned', 'mentoring.stage.work']);
const HEAD = scope('head-1', ['mentoring.student.read-all'], true);
const NOBODY = scope('nobody', []);

const exam = (over: object = {}) => ({ title: 'Unit test 1', subjectId: 'sub-en', chapters: ['Tenses', 'Nouns'], portion: 'Chapters 1 and 2', date: THU, start: '10:00', durationMinutes: 60, responsibleType: 'TUTOR', instructions: 'Closed book', ...over });
const SCHEDULE = { version: 2, subjects: [{ subjectId: 'sub-en', subjectName: 'English' }, { subjectId: 'sub-ma', subjectName: 'Mathematics' }] };

function world() {
  const db = new FakeDb();
  db.seed('subject', { id: 'sub-en', name: 'English', isActive: true });
  db.seed('subject', { id: 'sub-ma', name: 'Mathematics', isActive: true });
  for (const [id, mentor] of [['A', 'mentor-1'], ['B', 'mentor-2']] as const) {
    db.seed('lead', { id: `lead-${id}` });
    db.seed('student', { id: `stu-${id}`, firstName: 'Synthetic', lastName: `Student ${id}` });
    db.seed('mentoringActivation', { id: `act-${id}`, leadId: `lead-${id}`, studentId: `stu-${id}`, handoverId: `ho-${id}`, status: 'ACTIVATION_IN_PROGRESS', currentMentorUserId: mentor });
    db.seed('enrollmentHandoverField', { handoverId: `ho-${id}`, fieldKey: 'timetable.schedule', value: SCHEDULE, origin: 'MENTOR_COLLECTED', updatedByUserId: mentor });
  }
  for (const [key, first, last] of [['meera', 'Meera', 'Thomas'], ['rahul', 'Rahul', 'Nair']] as const) {
    db.seed('user', { id: `u-${key}`, status: 'ACTIVE' });
    db.seed('employee', { id: `e-${key}`, userId: `u-${key}`, firstName: first, lastName: last, employmentStatus: 'ACTIVE' });
    db.seed('tutorProfile', { id: `tp-${key}`, employeeId: `e-${key}`, tutorOperationalStatus: 'ACTIVE' });
  }
  // Meera teaches English to student A; nobody is assigned to Mathematics. Rahul teaches English to student B.
  db.seed('mentoringTutorAssignment', { id: 'as-1', activationId: 'act-A', subjectId: 'sub-en', tutorProfileId: 'tp-meera', status: 'ACTIVE', currentKey: 'act-A:sub-en' });
  db.seed('mentoringTutorAssignment', { id: 'as-2', activationId: 'act-B', subjectId: 'sub-en', tutorProfileId: 'tp-rahul', status: 'ACTIVE', currentKey: 'act-B:sub-en' });
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: jest.fn() } as any);
  const sla = new MentoringSlaService(db as any, access);
  const reminders = new MentoringReminderService(db as any);
  const service = new MentoringExamService(db as any, access, history, reminders, sla);
  const make = async (over: object = {}, act = 'act-A', user = 'mentor-1') => (await service.create(act, exam(over), user, NOW)).examId;
  const row = (id?: string) => db.rows('mentoringExam').find((e) => !id || e.id === id)!;
  const item = (id: string, kind: string) => db.rows('mentoringExamItem').find((i) => i.examId === id && i.kind === kind)!;
  const events = (id: string) => db.rows('mentoringExamEvent').filter((e) => e.examId === id).map((e) => e.kind);
  const view = async (id: string, now = NOW) => service.detail(id, MENTOR, now);
  const done = (id: string, kind: string, now = at(THU, '14:00')) => service.updateItem(id, kind, { status: 'DONE', responsible: 'Mentor', evidenceRef: 'Paper 12' }, 'mentor-1', now);
  return { db, service, reminders, make, row, item, events, view, done };
}

describe('scheduling an exam', () => {
  it('saves the exam with its chapters, portion, times and responsible person, and the post-exam checklist, all pending', async () => {
    const w = world();
    const id = await w.make();
    const v = await w.view(id);
    expect(v).toMatchObject({
      studentName: 'Synthetic Student A', subjectName: 'English', kind: 'EXAM', title: 'Unit test 1', chapters: ['Tenses', 'Nouns'], portion: 'Chapters 1 and 2', date: THU, originalDate: THU, startMinute: 600, endMinute: 660,
      responsible: { type: 'TUTOR', name: 'Meera Thomas' }, tutorName: 'Meera Thomas', instructions: 'Closed book', state: 'REMINDER_PENDING', conducted: null,
    });
    expect(v.items).toHaveLength(7);
    expect(v.items.every((i) => i.status === 'PENDING' && i.doneAt === null)).toBe(true);
    expect(v.marks).toBeNull();
    expect(v.reExam).toMatchObject({ required: false, examId: null });
    expect(w.events(id)).toEqual(['SCHEDULED']);
  });

  it('prepares the tutor reminder but delivers nothing by itself', async () => {
    const w = world();
    await w.make();
    expect(w.db.rows('mentoringReminder')).toHaveLength(1);
    expect(w.db.rows('mentoringReminder')[0]).toMatchObject({ status: 'PREPARED', recipientUserId: 'u-meera', entityType: 'Exam' });
    expect(w.db.rows('notification').filter((n) => n.type === 'MENTORING_REMINDER')).toHaveLength(0);
  });

  it('allows several chapters of one subject in one exam', async () => {
    const w = world();
    await expect(w.make({ chapters: ['Tenses', 'Nouns', 'Articles', 'Essays'] })).resolves.toBeDefined();
    expect(w.row().chapters).toHaveLength(4);
  });

  it('refuses a second exam for the student on the same date, whatever the subject, and says which exam is in the way', async () => {
    const w = world();
    await w.make();
    await expect(w.make({ subjectId: 'sub-ma', responsibleType: 'PARENT', responsibleName: 'Parent A' })).rejects.toThrow('This student already has a English exam on 2026-11-12. Only one subject exam is allowed for a student on a date. Choose another date.');
    await expect(w.make({ title: 'Another English test' })).rejects.toThrow('already has a English exam on 2026-11-12. Add the chapters to that exam instead of scheduling a second one.');
    await expect(w.make({ subjectId: 'sub-ma', date: THU, responsibleType: 'PARENT', responsibleName: 'Parent A' })).rejects.toBeInstanceOf(ConflictException);
    expect(w.db.rows('mentoringExam')).toHaveLength(1);
  });

  it('allows different subjects on different dates, and another student on the same date', async () => {
    const w = world();
    await w.make();
    await expect(w.make({ subjectId: 'sub-ma', date: FRI, responsibleType: 'PARENT', responsibleName: 'Parent A' })).resolves.toBeDefined();
    await expect(w.make({}, 'act-B', 'mentor-2')).resolves.toBeDefined();
    expect(w.db.rows('mentoringExam')).toHaveLength(3);
  });

  it('is enforced by the date key too, so the database would refuse a second live exam that day', async () => {
    const w = world();
    await w.make();
    expect(w.row().dateKey).toBe(`act-A:${THU}`);
    await expect(Promise.resolve().then(() => (w.db as any).mentoringExam.create({ data: { ...w.row(), id: 'dup' } }))).rejects.toThrow('Unique constraint failed');
  });

  it('refuses a past date, a subject outside the schedule, a missing tutor, and bad details, with a clear message', async () => {
    const w = world();
    await expect(w.make({ date: '2026-11-08' })).rejects.toThrow('today or a later date');
    await expect(w.make({ subjectId: 'sub-xx' })).rejects.toThrow('saved schedule');
    await expect(w.make({ subjectId: 'sub-ma' })).rejects.toThrow('no assigned tutor yet');
    await expect(w.make({ responsibleType: 'PARENT' })).rejects.toThrow('name of the parent');
    await expect(w.make({ chapters: [] })).rejects.toThrow('at least one chapter');
    await expect(w.make({ title: ' ' })).rejects.toThrow('Give the exam a title');
    await expect(w.make({ start: '10:00', durationMinutes: undefined })).rejects.toThrow('end time');
    await expect(w.make({ date: 'soon' })).rejects.toThrow('real exam date');
    expect(w.db.rows('mentoringExam')).toHaveLength(0);
  });

  it('lets a parent or another person be responsible, who has no account and so no in-app reminder', async () => {
    const w = world();
    const id = await w.make({ subjectId: 'sub-ma', responsibleType: 'PARENT', responsibleName: 'Parent A' });
    const v = await w.view(id);
    expect(v.responsible).toEqual({ type: 'PARENT', name: 'Parent A' });
    expect(w.db.rows('mentoringReminder')).toHaveLength(0);
    await expect(w.service.sendReminder(id, 'mentor-1', NOW)).rejects.toThrow('not in the app');
  });

  it('only the assigned Mentor can schedule, and only while the workflow is running', async () => {
    const w = world();
    await expect(w.service.create('act-A', exam(), 'mentor-2', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    w.db.rows('mentoringActivation').find((a) => a.id === 'act-A')!.status = 'ACTIVATED_CLOSED';
    await expect(w.service.create('act-A', exam(), 'mentor-1', NOW)).rejects.toBeInstanceOf(ConflictException);
    expect(w.db.rows('mentoringExam')).toHaveLength(0);
  });

  it('changes the details of an exam that has not been sat, but moves the date only by rescheduling', async () => {
    const w = world();
    const id = await w.make();
    await w.service.update(id, exam({ title: 'Unit test 1 (revised)', chapters: ['Tenses'], start: '11:00', durationMinutes: 90 }), 'mentor-1', NOW);
    expect(w.row()).toMatchObject({ title: 'Unit test 1 (revised)', chapters: ['Tenses'], startMinute: 660, endMinute: 750 });
    await expect(w.service.update(id, exam({ date: FRI }), 'mentor-1', NOW)).rejects.toThrow('Use reschedule');
    expect(w.events(id)).toEqual(['SCHEDULED', 'DETAILS_CHANGED']);
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    await expect(w.service.update(id, exam(), 'mentor-1', NOW)).rejects.toThrow('has been sat');
  });
});

describe('rescheduling an exam', () => {
  const move = (w: ReturnType<typeof world>, id: string, over: object = {}, user = 'mentor-1') => w.service.reschedule(id, { newDate: FRI, reason: 'Student unwell', ...over }, user, NOW);

  it('moves it, keeps the original date, records who and why, and shows it as rescheduled', async () => {
    const w = world();
    const id = await w.make();
    await expect(move(w, id)).resolves.toMatchObject({ from: { date: THU, startMinute: 600, endMinute: 660 }, to: { date: FRI, startMinute: 600, endMinute: 660 } });
    expect(w.row()).toMatchObject({ dateKey: `act-A:${FRI}` });
    const v = await w.view(id);
    expect(v).toMatchObject({ date: FRI, originalDate: THU, state: 'RESCHEDULED' });
    const event = v.history!.find((e) => e.kind === 'RESCHEDULED')!;
    expect(event).toMatchObject({ actorUserId: 'mentor-1', reason: 'Student unwell' });
    expect(event.payload).toMatchObject({ from: { date: THU }, to: { date: FRI }, requestedByUserId: 'mentor-1', approvedByUserId: null });
  });

  it('tells the tutor through the notification system, and withdraws the reminder for the old date', async () => {
    const w = world();
    const id = await w.make();
    await move(w, id);
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_EXAM_RESCHEDULED')).toMatchObject({ recipientUserId: 'u-meera' });
    expect(w.db.rows('mentoringReminder').map((r) => r.status)).toEqual(['CANCELLED', 'PREPARED']);
    expect(w.db.rows('mentoringReminder')[1].message).toContain('2026-11-13');
  });

  it('checks the one-exam-a-day rule again for the new date', async () => {
    const w = world();
    const id = await w.make();
    await w.make({ subjectId: 'sub-ma', date: FRI, responsibleType: 'PARENT', responsibleName: 'Parent A' });
    await expect(move(w, id)).rejects.toThrow('already has a Mathematics exam on 2026-11-13');
    expect(w.row(id)).toMatchObject({ dateKey: `act-A:${THU}` });
  });

  it('keeps the first date when it is moved again, and keeps the full history', async () => {
    const w = world();
    const id = await w.make();
    await move(w, id);
    await move(w, id, { newDate: SAT, reason: 'Holiday' });
    const v = await w.view(id);
    expect(v).toMatchObject({ date: SAT, originalDate: THU });
    expect(v.history!.filter((e) => e.kind === 'RESCHEDULED').map((e) => e.reason)).toEqual(['Student unwell', 'Holiday']);
  });

  it('needs a reason, a real future date, a different slot, and an exam that has not been sat', async () => {
    const w = world();
    const id = await w.make();
    await expect(move(w, id, { reason: ' ' })).rejects.toThrow('Say why');
    await expect(move(w, id, { newDate: 'soon' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(move(w, id, { newDate: '2026-11-08' })).rejects.toThrow('today or a later date');
    await expect(move(w, id, { newDate: THU })).rejects.toThrow('already has');
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    await expect(move(w, id)).rejects.toThrow('Schedule a re-exam instead');
  });

  it('only the assigned Mentor can move an exam', async () => {
    const w = world();
    const id = await w.make();
    await expect(move(w, id, {}, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.row().date).toEqual(new Date(`${THU}T00:00:00Z`));
  });
});

describe('exam day reminders', () => {
  it('counts as sent only when the in-app notification exists, which is the evidence; sending twice sends once', async () => {
    const w = world();
    const id = await w.make();
    const sent = await w.service.sendReminder(id, 'mentor-1', at(THU, '07:30'));
    const note = w.db.rows('notification').find((n) => n.type === 'MENTORING_REMINDER')!;
    expect(sent.deliveryEvidence).toBe(note.id);
    expect(note).toMatchObject({ recipientUserId: 'u-meera', action: '/tutor-portal' });
    await w.service.sendReminder(id, 'mentor-1', at(THU, '07:35'));
    expect(w.db.rows('notification').filter((n) => n.type === 'MENTORING_REMINDER')).toHaveLength(1);
    const v = await w.view(id, at(THU, '08:00'));
    expect(v.state).toBe('READY_FOR_EXAM');
    expect(v.reminder).toMatchObject({ status: 'SENT', deliveryEvidence: note.id });
  });

  it('for a parent or another person, the Mentor records that they told them, as the Mentor word and not as a delivery', async () => {
    const w = world();
    const id = await w.make({ subjectId: 'sub-ma', responsibleType: 'PARENT', responsibleName: 'Parent A' });
    await expect(w.service.markInformed(id, ' ', 'mentor-1', NOW)).rejects.toThrow('Say how you told them');
    expect((await w.view(id)).state).toBe('SCHEDULED');
    await w.service.markInformed(id, 'Phoned the parent on Monday at 5 PM', 'mentor-1', NOW);
    const v = await w.view(id);
    expect(v.state).toBe('READY_FOR_EXAM');
    expect(v.informed).toMatchObject({ note: 'Phoned the parent on Monday at 5 PM' });
    expect(v.reminder).toBeNull();
    expect(w.db.rows('notification')).toHaveLength(0);
    expect(w.events(id)).toContain('MENTOR_INFORMED_RESPONSIBLE');
  });

  it('is not sent for an exam already sat, and only by the assigned Mentor', async () => {
    const w = world();
    const id = await w.make();
    await expect(w.service.sendReminder(id, 'mentor-2', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    await expect(w.service.sendReminder(id, 'mentor-1', at(THU, '13:00'))).rejects.toThrow('already been sat');
  });
});

describe('after the exam', () => {
  it('cannot be marked as sat before its date, and a not-conducted exam needs a reason', async () => {
    const w = world();
    const id = await w.make();
    await expect(w.service.recordConducted(id, { conducted: true }, 'mentor-1', NOW)).rejects.toThrow('not happened yet');
    await expect(w.service.recordConducted(id, {}, 'mentor-1', at(THU, '12:00'))).rejects.toThrow('Say whether');
    await expect(w.service.recordConducted(id, { conducted: false }, 'mentor-1', at(THU, '12:00'))).rejects.toThrow('Say why the exam was not conducted');
    expect(w.row().conducted).toBeNull();
  });

  it('records that an exam was not conducted, with the reason, and closes it', async () => {
    const w = world();
    const id = await w.make();
    await w.service.recordConducted(id, { conducted: false, reason: 'Student was in hospital' }, 'mentor-1', at(THU, '12:00'));
    const v = await w.view(id, at(THU, '13:00'));
    expect(v).toMatchObject({ conducted: false, notConductedReason: 'Student was in hospital', state: 'COMPLETED' });
    expect(w.events(id)).toContain('NOT_CONDUCTED');
  });

  it('starts a checklist where nothing is ticked by itself, and not before the exam is recorded as sat', async () => {
    const w = world();
    const id = await w.make();
    await expect(w.done(id, 'COLLECT_PAPER')).rejects.toThrow('Record that the exam was sat');
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    const v = await w.view(id, at(THU, '12:30'));
    expect(v.state).toBe('EXAM_COMPLETED');
    expect(v.items.every((i) => i.status === 'PENDING')).toBe(true);
    expect((await w.view(id, at(FRI, '09:00'))).state).toBe('AWAITING_PAPER_COLLECTION');
    expect(v.problems).toContain('Collect the completed exam paper.');
  });

  it('records each step with who, when, remarks and evidence, and Not applicable needs a reason', async () => {
    const w = world();
    const id = await w.make();
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    await w.done(id, 'COLLECT_PAPER', at(THU, '14:00'));
    expect(w.item(id, 'COLLECT_PAPER')).toMatchObject({ status: 'DONE', updatedByUserId: 'mentor-1', responsible: 'Mentor', evidenceRef: 'Paper 12', doneAt: at(THU, '14:00') });
    await expect(w.service.updateItem(id, 'SHARE_WITH_TUTOR', { status: 'NOT_APPLICABLE' }, 'mentor-1', at(THU, '14:00'))).rejects.toThrow('Say why this does not apply');
    await expect(w.service.updateItem(id, 'SHARE_WITH_TUTOR', { status: 'MAYBE' }, 'mentor-1', at(THU, '14:00'))).rejects.toThrow('pending, done or not applicable');
    await expect(w.service.updateItem(id, 'NOT_A_STEP', { status: 'DONE' }, 'mentor-1', at(THU, '14:00'))).rejects.toBeInstanceOf(NotFoundException);
    await w.service.updateItem(id, 'COLLECT_PAPER', { status: 'PENDING' }, 'mentor-1', at(THU, '15:00')); // can be taken back
    expect(w.item(id, 'COLLECT_PAPER')).toMatchObject({ status: 'PENDING', doneAt: null, updatedByUserId: null });
    expect(w.events(id).filter((e) => e === 'ITEM_UPDATED')).toHaveLength(2);
  });

  it('shows the re-exam checklist only when a re-exam is required', async () => {
    const w = world();
    const id = await w.make();
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    expect((await w.view(id, at(THU, '13:00'))).items.some((i) => i.list === 'RE_EXAM')).toBe(false);
    await expect(w.done(id, 'COLLECT_ORIGINAL')).rejects.toThrow('only for an exam that needs a re-exam');
    await w.service.setReExam(id, { required: true, reason: 'Below the pass mark' }, 'mentor-1');
    expect((await w.view(id, at(THU, '13:00'))).items.filter((i) => i.list === 'RE_EXAM').map((i) => i.kind)).toEqual(['COLLECT_ORIGINAL', 'PREPARE_PAPER', 'NOTIFY', 'REEXAM_COMPLETED']);
  });
});

describe('marks and remarks', () => {
  const marks = (w: ReturnType<typeof world>, id: string, body: Record<string, unknown>, user = 'mentor-1') => w.service.recordMarks(id, body, user, at(FRI, '10:00'));
  const sat = async (w: ReturnType<typeof world>) => {
    const id = await w.make();
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    return id;
  };

  it('works out the percentage, and records the evaluating tutor and the evaluation date', async () => {
    const w = world();
    const id = await sat(w);
    await expect(marks(w, id, { marksObtained: 45, maxMarks: 60, evaluationDate: FRI })).resolves.toMatchObject({ percentage: 75 });
    expect(w.row()).toMatchObject({ evaluatingTutorUserId: 'u-meera', marksRecordedByUserId: 'mentor-1' });
    const v = await w.view(id, at(FRI, '11:00'));
    expect(v.marks).toEqual({ obtained: 45, max: 60, percentage: 75, evaluationDate: FRI, evaluatingTutorName: 'Meera Thomas' });
  });

  it('refuses negative marks, marks above the maximum, a maximum of zero, and anything that is not a number', async () => {
    const w = world();
    const id = await sat(w);
    await expect(marks(w, id, { marksObtained: -1, maxMarks: 60 })).rejects.toThrow('cannot be negative');
    await expect(marks(w, id, { marksObtained: 61, maxMarks: 60 })).rejects.toThrow('cannot be more than the maximum');
    await expect(marks(w, id, { marksObtained: 0, maxMarks: 0 })).rejects.toThrow('more than zero');
    await expect(marks(w, id, { marksObtained: '45', maxMarks: 60 })).rejects.toThrow('as numbers');
    await expect(marks(w, id, { marksObtained: 45, maxMarks: 60, percentage: 99 })).resolves.toMatchObject({ percentage: 75 }); // a typed percentage is ignored
    expect(w.db.rows('mentoringExam')).toHaveLength(1);
  });

  it('needs the exam to be recorded as sat first, and the marks of the assigned tutor only', async () => {
    const w = world();
    const id = await w.make();
    await expect(marks(w, id, { marksObtained: 45, maxMarks: 60 })).rejects.toThrow('before the marks');
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    await expect(marks(w, id, { marksObtained: 45, maxMarks: 60, evaluatingTutorUserId: 'u-rahul' })).rejects.toThrow('assigned tutor');
  });

  it('changing recorded marks needs a reason, and the history keeps both figures', async () => {
    const w = world();
    const id = await sat(w);
    await marks(w, id, { marksObtained: 45, maxMarks: 60 });
    await expect(marks(w, id, { marksObtained: 48, maxMarks: 60 })).rejects.toThrow('Say why they are being changed');
    await marks(w, id, { marksObtained: 48, maxMarks: 60, reason: 'Totalling error' });
    const v = await w.view(id, at(FRI, '12:00'));
    expect(v.marks).toMatchObject({ obtained: 48, percentage: 80 });
    const change = v.history!.find((e) => e.kind === 'MARKS_CHANGED')!;
    expect(change).toMatchObject({ reason: 'Totalling error' });
    expect(change.payload).toMatchObject({ before: { obtained: 45, percentage: 75 }, after: { obtained: 48, percentage: 80 } });
  });

  it('keeps the four remarks apart, each on its own exam, and changes one without touching the others', async () => {
    const w = world();
    const id = await sat(w);
    await w.service.recordRemarks(id, { weaknesses: 'Tenses', topicsToImprove: 'Past perfect', tutorSuggestions: 'Daily practice', mentorRemarks: 'Needs encouragement' }, 'mentor-1');
    await w.service.recordRemarks(id, { weaknesses: 'Tenses and articles' }, 'mentor-1');
    expect((await w.view(id, at(FRI, '12:00'))).remarks).toEqual({ weaknesses: 'Tenses and articles', topicsToImprove: 'Past perfect', tutorSuggestions: 'Daily practice', mentorRemarks: 'Needs encouragement' });
    await expect(w.service.recordRemarks(id, {}, 'mentor-1')).rejects.toThrow('at least one remark');
    await expect(w.service.recordRemarks(id, { weaknesses: 5 }, 'mentor-1')).rejects.toThrow('must be text');
  });
});

describe('the tutor side', () => {
  const sat = async (w: ReturnType<typeof world>) => {
    const id = await w.make();
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    return id;
  };

  it('shows a tutor their own exams, without the Mentor remarks or the Mentor note about the parent, and nobody else exams', async () => {
    const w = world();
    const id = await sat(w);
    await w.service.recordRemarks(id, { mentorRemarks: 'Private to the Mentor', weaknesses: 'Tenses' }, 'mentor-1');
    await w.make({}, 'act-B', 'mentor-2');
    const mine = await w.service.tutorExams('u-meera', {}, at(FRI, '09:00'));
    expect(mine.map((e) => e.id)).toEqual([id]);
    expect(mine[0].remarks).toMatchObject({ weaknesses: 'Tenses', mentorRemarks: null });
    expect(JSON.stringify(mine)).not.toContain('Private to the Mentor');
    expect(JSON.stringify(mine)).not.toContain('Student B');
    expect((await w.service.tutorExams('u-rahul', {}, at(FRI, '09:00'))).map((e) => e.studentName)).toEqual(['Synthetic Student B']);
    await expect(w.service.tutorExams('mentor-1')).rejects.toThrow('You do not have a tutor profile.');
    await expect(w.service.tutorExams('u-meera', { from: 'soon' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets the tutor confirm receipt, and only the steps that are theirs', async () => {
    const w = world();
    const id = await sat(w);
    await w.service.tutorConfirmReceipt(id, { remarks: 'Received on Friday' }, 'u-meera', at(FRI, '10:00'));
    expect(w.item(id, 'TUTOR_RECEIPT')).toMatchObject({ status: 'DONE', updatedByUserId: 'u-meera', remarks: 'Received on Friday' });
    expect(w.item(id, 'COLLECT_PAPER').status).toBe('PENDING');
    await expect(w.service.tutorConfirmReceipt(id, {}, 'u-rahul', at(FRI, '10:00'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.tutorEvaluate(id, { marksObtained: 40, maxMarks: 50 }, 'u-rahul', at(FRI, '10:00'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records the evaluation: marks, the tutor remarks and the tutor confirmation, never the Mentor remarks', async () => {
    const w = world();
    const id = await sat(w);
    await expect(w.service.tutorEvaluate(id, { marksObtained: 40, maxMarks: 50, mentorRemarks: 'Mine now' }, 'u-meera', at(FRI, '10:00'))).rejects.toThrow('not yours to change');
    expect(w.row().marksObtained).toBeNull();
    await w.service.tutorEvaluate(id, { marksObtained: 40, maxMarks: 50, weaknesses: 'Tenses', topicsToImprove: 'Past perfect', tutorSuggestions: 'Daily practice' }, 'u-meera', at(FRI, '10:00'));
    expect(w.row()).toMatchObject({ percentage: '80', evaluatingTutorUserId: 'u-meera', weaknesses: 'Tenses', mentorRemarks: null });
    expect(w.item(id, 'TUTOR_EVALUATION')).toMatchObject({ status: 'DONE', updatedByUserId: 'u-meera' });
    expect(w.item(id, 'COLLECT_CHECKED').status).toBe('PENDING'); // the Mentor collects it, the tutor cannot say so
    await expect(w.service.tutorEvaluate(id, { marksObtained: 60, maxMarks: 50 }, 'u-meera', at(FRI, '11:00'))).rejects.toThrow('cannot be more than the maximum');
  });

  it('needs the exam to have been sat', async () => {
    const w = world();
    const id = await w.make();
    await expect(w.service.tutorEvaluate(id, { marksObtained: 40, maxMarks: 50 }, 'u-meera', NOW)).rejects.toThrow('before the marks');
  });
});

describe('an exam through to complete', () => {
  it('is complete only when every step is recorded, and the state follows what is recorded', async () => {
    const w = world();
    const id = await w.make();
    const state = async (now: Date) => (await w.view(id, now)).state;
    await w.service.sendReminder(id, 'mentor-1', at(THU, '07:30'));
    expect(await state(at(THU, '08:00'))).toBe('READY_FOR_EXAM');
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    expect(await state(at(THU, '12:30'))).toBe('EXAM_COMPLETED');
    expect(await state(at(FRI, '09:00'))).toBe('AWAITING_PAPER_COLLECTION');
    await w.done(id, 'COLLECT_PAPER', at(FRI, '09:00'));
    await w.done(id, 'SHARE_WITH_TUTOR', at(FRI, '09:05'));
    await w.service.tutorConfirmReceipt(id, {}, 'u-meera', at(FRI, '10:00'));
    expect(await state(at(FRI, '10:30'))).toBe('AWAITING_EVALUATION');
    await w.service.tutorEvaluate(id, { marksObtained: 40, maxMarks: 50, weaknesses: 'Tenses', topicsToImprove: 'Past perfect', tutorSuggestions: 'Daily practice' }, 'u-meera', at(FRI, '11:00'));
    await w.done(id, 'COLLECT_CHECKED', at(FRI, '12:00'));
    expect(await state(at(FRI, '12:30'))).toBe('MARKS_PENDING'); // the Mentor remarks are still missing
    await w.service.recordRemarks(id, { mentorRemarks: 'Good effort' }, 'mentor-1');
    expect(await state(at(FRI, '13:00'))).toBe('AWAITING_PARENT_SHARING');
    await w.done(id, 'SHARE_WITH_PARENT', at(FRI, '14:00'));
    expect(await state(at(FRI, '14:30'))).toBe('AWAITING_PARENT_SHARING'); // sharing is not receiving
    await w.done(id, 'PARENT_RECEIPT', at(FRI, '15:00'));
    const v = await w.view(id, at(FRI, '15:30'));
    expect(v.state).toBe('COMPLETED');
    expect(v.problems).toEqual([]);
  });
});

describe('re-exams', () => {
  const sat = async (w: ReturnType<typeof world>) => {
    const id = await w.make();
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    return id;
  };
  const reExam = (w: ReturnType<typeof world>, id: string, over: object = {}) => w.service.scheduleReExam(id, { date: '2026-11-19', start: '10:00', durationMinutes: 60, responsibleType: 'TUTOR', ...over }, 'mentor-1', at(FRI, '09:00'));

  it('needs a reason, and the exam to have been sat', async () => {
    const w = world();
    const early = await w.make({ date: FRI });
    await expect(w.service.setReExam(early, { required: true, reason: 'x' }, 'mentor-1')).rejects.toThrow('sat first');
    const id = await sat(w);
    await expect(w.service.setReExam(id, { required: true }, 'mentor-1')).rejects.toThrow('Say why a re-exam is needed');
    await expect(w.service.setReExam(id, { reason: 'x' }, 'mentor-1')).rejects.toThrow('Say whether a re-exam is required');
  });

  it('shows the exam as needing a re-exam until one is scheduled, then keeps the original untouched', async () => {
    const w = world();
    const id = await sat(w);
    await w.service.setReExam(id, { required: true, reason: 'Below the pass mark' }, 'mentor-1');
    expect((await w.view(id, at(FRI, '09:00'))).state).toBe('RE_EXAM_REQUIRED');
    const before = { ...w.row(id) };
    const made = await reExam(w, id);
    const original = await w.view(id, at(FRI, '10:00'));
    expect(original.reExam).toMatchObject({ required: true, reason: 'Below the pass mark', examId: made.examId, date: '2026-11-19' });
    expect(original.state).not.toBe('RE_EXAM_REQUIRED');
    expect(w.row(id)).toMatchObject({ date: before.date, title: before.title, conducted: true, dateKey: before.dateKey });
    const re = await w.view(made.examId, at(FRI, '10:00'));
    expect(re).toMatchObject({ kind: 'RE_EXAM', originalExamId: id, title: 'Re-exam: Unit test 1', chapters: ['Tenses', 'Nouns'], subjectName: 'English' });
    expect(w.events(id)).toEqual(expect.arrayContaining(['RE_EXAM_REQUIRED', 'RE_EXAM_SCHEDULED']));
  });

  it('can be rescheduled like any exam, keeping both histories, and the one-exam-a-day rule applies to it', async () => {
    const w = world();
    const id = await sat(w);
    await w.service.setReExam(id, { required: true, reason: 'Below the pass mark' }, 'mentor-1');
    await w.make({ subjectId: 'sub-ma', date: '2026-11-19', responsibleType: 'PARENT', responsibleName: 'Parent A' });
    await expect(reExam(w, id)).rejects.toThrow('already has a Mathematics exam on 2026-11-19');
    const made = await reExam(w, id, { date: '2026-11-20' });
    await w.service.reschedule(made.examId, { newDate: '2026-11-21', reason: 'Tutor unavailable' }, 'mentor-1', at(FRI, '09:00'));
    const re = await w.view(made.examId, at(FRI, '10:00'));
    expect(re).toMatchObject({ date: '2026-11-21', originalDate: '2026-11-20' });
    expect(re.history!.map((e) => e.kind)).toEqual(['RE_EXAM_SCHEDULED', 'RESCHEDULED']);
    expect((await w.view(id)).originalDate).toBe(THU);
  });

  it('allows one re-exam for an exam, and none for a re-exam, and no withdrawal once one is scheduled', async () => {
    const w = world();
    const id = await sat(w);
    await expect(reExam(w, id)).rejects.toThrow('Say that a re-exam is required');
    await w.service.setReExam(id, { required: true, reason: 'Below the pass mark' }, 'mentor-1');
    const made = await reExam(w, id);
    await expect(reExam(w, id, { date: '2026-11-20' })).rejects.toThrow('already scheduled');
    await expect(w.service.setReExam(id, { required: false, reason: 'Changed my mind' }, 'mentor-1')).rejects.toThrow('cannot be withdrawn');
    await w.service.recordConducted(made.examId, { conducted: true }, 'mentor-1', at('2026-11-19', '12:00'));
    await expect(w.service.setReExam(made.examId, { required: true, reason: 'x' }, 'mentor-1')).rejects.toThrow('cannot have a re-exam of its own');
  });

  it('withdraws a re-exam that was not needed after all, while none is scheduled', async () => {
    const w = world();
    const id = await sat(w);
    await w.service.setReExam(id, { required: true, reason: 'Below the pass mark' }, 'mentor-1');
    await w.service.setReExam(id, { required: false, reason: 'Parent reported a marking error' }, 'mentor-1');
    expect(w.row(id).reExamRequired).toBe(false);
    expect(w.events(id)).toContain('RE_EXAM_WITHDRAWN');
  });

  it('marks the re-exam step complete only after the re-exam has been sat', async () => {
    const w = world();
    const id = await sat(w);
    await w.service.setReExam(id, { required: true, reason: 'Below the pass mark' }, 'mentor-1');
    const made = await reExam(w, id);
    await expect(w.done(id, 'REEXAM_COMPLETED', at(FRI, '10:00'))).rejects.toThrow('has not been sat yet');
    await w.service.recordConducted(made.examId, { conducted: true }, 'mentor-1', at('2026-11-19', '12:00'));
    await expect(w.done(id, 'REEXAM_COMPLETED', at('2026-11-19', '13:00'))).resolves.toBeDefined();
  });
});

describe('finding exams on the server', () => {
  it('filters by subject, state, kind, tutor and dates before the answer is built', async () => {
    const w = world();
    const a = await w.make();
    await w.make({ subjectId: 'sub-ma', date: FRI, responsibleType: 'PARENT', responsibleName: 'Parent A' });
    await w.service.recordConducted(a, { conducted: true }, 'mentor-1', at(THU, '12:00'));
    const now = at(FRI, '09:00');
    const ids = async (f: object) => (await w.service.list('act-A', f, MENTOR, now)).exams.map((e) => e.subjectName);
    expect(await ids({})).toEqual(['English', 'Mathematics']);
    expect(await ids({ subjectId: 'sub-ma' })).toEqual(['Mathematics']);
    expect(await ids({ state: 'AWAITING_PAPER_COLLECTION' })).toEqual(['English']);
    expect(await ids({ state: 'SCHEDULED' })).toEqual(['Mathematics']);
    expect(await ids({ from: FRI })).toEqual(['Mathematics']);
    expect(await ids({ to: THU })).toEqual(['English']);
    expect(await ids({ kind: 'RE_EXAM' })).toEqual([]);
    expect(await ids({ tutorUserId: 'u-meera' })).toEqual(['English']);
    expect(await ids({ limit: 1 })).toEqual(['English']);
    await expect(w.service.list('act-A', { from: 'soon' }, MENTOR, now)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('offers the subjects of the saved schedule and whether the caller can make changes', async () => {
    const w = world();
    const mine = await w.service.list('act-A', {}, MENTOR, NOW);
    expect(mine.subjects.map((s) => s.subjectName)).toEqual(['English', 'Mathematics']);
    expect(mine.canWork).toBe(true);
    expect((await w.service.list('act-A', {}, HEAD, NOW)).canWork).toBe(false);
  });
});

describe('who can see and change exams', () => {
  it('shows a Mentor only their own students, the Head everyone, and nobody without access anything', async () => {
    const w = world();
    const id = await w.make();
    await expect(w.service.list('act-B', {}, MENTOR, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.service.list('act-A', {}, HEAD, NOW)).resolves.toBeDefined();
    await expect(w.service.list('act-A', {}, NOBODY, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.detail(id, scope('mentor-2', ['mentoring.student.read-assigned']), NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.service.detail('nope', MENTOR, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses every change from a Mentor who is not assigned, and leaves the exam as it was', async () => {
    const w = world();
    const id = await w.make();
    const other = 'mentor-2';
    const at12 = at(THU, '12:00');
    await expect(w.service.update(id, exam(), other, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.recordConducted(id, { conducted: true }, other, at12)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.updateItem(id, 'COLLECT_PAPER', { status: 'DONE' }, other, at12)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.recordMarks(id, { marksObtained: 1, maxMarks: 2 }, other, at12)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.recordRemarks(id, { mentorRemarks: 'x' }, other)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.setReExam(id, { required: true, reason: 'x' }, other)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.markInformed(id, 'told', other, at12)).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.row()).toMatchObject({ conducted: null, marksObtained: null, mentorRemarks: null });
    expect(w.events(id)).toEqual(['SCHEDULED']);
  });
});

describe('the routes', () => {
  const mentorWrites = ['create', 'update', 'reschedule', 'remind', 'informed', 'conducted', 'item', 'marks', 'remarks', 'reExam', 'scheduleReExam'];

  it('every Mentor change needs the Mentor work permission, and reading is scoped in the query', () => {
    const proto = MentoringExamController.prototype as any;
    for (const name of mentorWrites) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['mentoring.stage.work']);
    for (const name of ['list', 'detail']) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toBeUndefined();
  });

  it('the tutor routes need the tutor portal permission and cannot name a tutor', () => {
    const proto = TutorExamsController.prototype as any;
    for (const name of ['mine', 'receipt', 'evaluation']) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['tutor.portal.read']);
    const source = readFileSync(join(__dirname, 'mentoring-exam.controller.ts'), 'utf8');
    const tutorPart = source.slice(source.indexOf('class TutorExamsController'));
    expect(tutorPart).not.toMatch(/tutorProfileId|tutorId|tutorUserId/);
  });

  it('has nothing that pays, verifies a class or completes a step by itself', () => {
    const source = readFileSync(join(__dirname, 'mentoring-exam.service.ts'), 'utf8');
    expect(source).not.toMatch(/tutorPayable|tutorClassRecord|paymentStatus/);
    // The only places the service writes DONE itself are the two steps the tutor confirms by submitting them.
    expect(source.match(/status:\s*'DONE'/g) ?? []).toHaveLength(2);
    expect(source).toMatch(/'TUTOR_RECEIPT', \{ status: 'DONE'/);
    expect(source).toMatch(/'TUTOR_EVALUATION', \{ status: 'DONE'/);
  });
});
