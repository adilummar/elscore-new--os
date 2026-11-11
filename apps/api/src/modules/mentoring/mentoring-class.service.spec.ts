/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringClassController } from './mentoring-class.controller';
import { MentoringClassService } from './mentoring-class.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringReminderService } from './mentoring-reminder.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { makeVerifyLenient } from './testing/class-workspace-fixture';
import { FakeDb } from './testing/mentoring-fake-db';
import { TutorClassesController } from './tutor-classes.controller';

const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const slot = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const MON = '2026-11-09', TUE = '2026-11-10', WED = '2026-11-11';
const KEY = `as-class-1~${MON}~900`;

const scope = (userId: string, perms: string[], all = false): MentoringScope => ({ userId, perms: new Set(perms), all, assigned: perms.includes('mentoring.student.read-assigned') });
const MENTOR = scope('mentor-1', ['mentoring.student.read-assigned', 'mentoring.stage.work']);
const HEAD = scope('head-1', ['mentoring.student.read-all'], true);
const NOBODY = scope('nobody', []);

const good = { conducted: true, actualStart: '15:05', actualEnd: '16:10', topicsCovered: 'Tenses', attendance: 'PRESENT' };

function world(opts: { rate?: boolean; extraDays?: boolean } = {}) {
  const db = new FakeDb();
  db.seed('subject', { id: 'sub-en', name: 'English', isActive: true });
  db.seed('subject', { id: 'sub-ma', name: 'Mathematics', isActive: true });
  db.seed('grade', { id: 'g-8', name: 'Grade 8' });
  for (const [id, first, last, mentor] of [['A', 'Synthetic', 'Student A', 'mentor-1'], ['B', 'Synthetic', 'Student B', 'mentor-2']] as const) {
    db.seed('lead', { id: `lead-${id}` });
    db.seed('student', { id: `stu-${id}`, firstName: first, lastName: last });
    db.seed('mentoringActivation', { id: `act-${id}`, leadId: `lead-${id}`, studentId: `stu-${id}`, handoverId: `ho-${id}`, status: 'ACTIVATED', currentMentorUserId: mentor });
    db.seed('mentoringStage', { activationId: `act-${id}`, stageNumber: 3, key: 'TIMETABLE_CREATION', status: 'COMPLETED' });
  }
  const tutor = (key: string, first: string, last: string) => {
    db.seed('user', { id: `u-${key}`, status: 'ACTIVE' });
    db.seed('employee', { id: `e-${key}`, userId: `u-${key}`, firstName: first, lastName: last, employmentStatus: 'ACTIVE' });
    db.seed('tutorProfile', { id: `tp-${key}`, employeeId: `e-${key}`, tutorOperationalStatus: 'ACTIVE', profilePhotoUrl: null });
    db.seed('tutorSubject', { tutorProfileId: `tp-${key}`, subjectId: 'sub-en' });
    db.seed('tutorGrade', { tutorProfileId: `tp-${key}`, gradeId: 'g-8' });
    for (const d of [1, 2, 3, 4, 5]) db.seed('tutorAvailabilitySlot', { tutorProfileId: `tp-${key}`, dayOfWeek: d, startTime: slot('14:00'), endTime: slot('20:00') });
    if (opts.rate !== false) db.seed('tutorRate', { id: `rate-${key}`, tutorProfileId: `tp-${key}`, hourlyRate: '50.00', currency: 'AED', effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null, isActive: true });
  };
  tutor('meera', 'Meera', 'Thomas');
  tutor('rahul', 'Rahul', 'Nair');
  const book = (id: string, activation: string, tp: string, days: Array<[number, string, string]>) => {
    const a = db.seed('mentoringTutorAssignment', { id, activationId: activation, subjectId: 'sub-en', tutorProfileId: tp, status: 'ACTIVE', currentKey: `${activation}:sub-en`, startDate: day(MON), endDate: null });
    for (const [d, s, e] of days) db.seed('mentoringTutorAssignmentSession', { assignmentId: a.id, tutorProfileId: tp, dayOfWeek: d, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: m(s), endMinute: m(e) });
    return a;
  };
  book('as-class-1', 'act-A', 'tp-meera', opts.extraDays ? [[1, '15:00', '16:00'], [2, '15:00', '16:00'], [3, '15:00', '16:30']] : [[1, '15:00', '16:00']]);
  book('as-class-2', 'act-B', 'tp-rahul', [[1, '15:00', '16:00']]);

  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: jest.fn() } as any);
  const sla = new MentoringSlaService(db as any, access);
  const reminders = new MentoringReminderService(db as any);
  let n = 0;
  const ids = { nextIdInTx: jest.fn(() => Promise.resolve(`TCR-${String(++n).padStart(7, '0')}`)) };
  const service = new MentoringClassService(db as any, access, history, sla, reminders, ids as any, new MentoringTutorService(db as any, history));
  const submit = (date = MON, body: object = good, user = 'u-meera', key = `as-class-1~${date}~${date === MON ? 900 : 900}`, now = at(date, '17:00')) => service.tutorSubmitUpdate(user, key, body, now);
  const session = (id?: string) => db.rows('mentoringClassSession').find((s) => !id || s.id === id)!;
  const strictVerify = makeVerifyLenient(service, db);
  return { db, service, sla, reminders, ids, submit, session, strictVerify };
}

describe("the Mentor's daily class dashboard", () => {
  it("shows the day's classes from the tutor assignments, without storing anything", async () => {
    const w = world();
    const view = await w.service.daily('act-A', MON, {}, MENTOR, at(MON, '12:00'));
    expect(view.student).toEqual({ id: 'stu-A', name: 'Synthetic Student A' });
    expect(view.classes).toHaveLength(1);
    expect(view.classes[0]).toMatchObject({
      key: KEY, sessionId: null, studentName: 'Synthetic Student A', subjectName: 'English', tutorName: 'Meera Thomas', date: MON, startMinute: 900, endMinute: 960, scheduledMinutes: 60,
      status: 'SCHEDULED', state: 'SCHEDULED', stateLabel: 'Scheduled', tutorConfirmation: 'NOT_SENT', mentorVerification: 'PENDING', moved: false,
    });
    expect(view.classes[0].checklist.filter((i) => i.done)).toEqual([]);
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0); // reading creates no class
    expect(view.canWork).toBe(true);
  });

  it('shows only the classes the rule produces for that date, and nothing on a day without one', async () => {
    const w = world({ extraDays: true });
    expect((await w.service.daily('act-A', TUE, {}, MENTOR, at(TUE, '12:00'))).classes.map((c) => c.date)).toEqual([TUE]);
    expect((await w.service.daily('act-A', '2026-11-12', {}, MENTOR, at(TUE, '12:00'))).classes).toEqual([]);
    expect((await w.service.daily('act-A', '2026-11-08', {}, MENTOR)).classes).toEqual([]); // before the start date
  });

  it('filters on the server by subject, tutor and state', async () => {
    const w = world();
    const now = at(MON, '12:00');
    expect((await w.service.daily('act-A', MON, { subjectId: 'sub-ma' }, MENTOR, now)).classes).toEqual([]);
    expect((await w.service.daily('act-A', MON, { subjectId: 'sub-en', tutorProfileId: 'tp-meera' }, MENTOR, now)).classes).toHaveLength(1);
    expect((await w.service.daily('act-A', MON, { tutorProfileId: 'tp-rahul' }, MENTOR, now)).classes).toEqual([]);
    expect((await w.service.daily('act-A', MON, { state: 'VERIFIED' }, MENTOR, now)).classes).toEqual([]);
    expect((await w.service.daily('act-A', MON, { state: 'AWAITING_TUTOR_UPDATE' }, MENTOR, at(MON, '17:00'))).classes).toHaveLength(1);
    expect((await w.service.daily('act-A', MON, {}, MENTOR, at(MON, '17:00'))).counts).toEqual({ AWAITING_TUTOR_UPDATE: 1 });
  });

  it('shows a Mentor only their own students, the Head everyone, and nobody without access anything', async () => {
    const w = world();
    await expect(w.service.daily('act-B', MON, {}, MENTOR)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.service.daily('act-B', MON, {}, HEAD)).resolves.toBeDefined();
    expect((await w.service.daily('act-A', MON, {}, HEAD)).canWork).toBe(false);
    await expect(w.service.daily('act-A', MON, {}, NOBODY)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.daily('act-A', 'soon', {}, MENTOR)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('the tutor reminder', () => {
  it('prepares it first: the class gets a record, the reminder is pending, and nothing is delivered', async () => {
    const w = world();
    await expect(w.service.prepareReminder(KEY, 'mentor-1')).resolves.toMatchObject({ status: 'PREPARED' });
    expect(w.db.rows('mentoringClassSession')).toHaveLength(1);
    expect(w.db.rows('notification')).toHaveLength(0);
    const c = (await w.service.daily('act-A', MON, {}, MENTOR, at(MON, '12:00'))).classes[0];
    expect(c).toMatchObject({ state: 'REMINDER_PENDING', tutorConfirmation: 'NOT_SENT' });
    expect(c.checklist[0]).toMatchObject({ key: 'REMINDER', done: false, detail: 'Prepared, not sent' });
  });

  it('is sent only when the in-app notification exists, which is the evidence, and sending twice sends once', async () => {
    const w = world();
    const sent = await w.service.sendReminder(KEY, 'mentor-1', at(MON, '12:00'));
    expect(sent.deliveryEvidence).toBe(w.db.rows('notification')[0].id);
    expect(w.db.rows('notification')[0]).toMatchObject({ recipientUserId: 'u-meera', type: 'MENTORING_REMINDER', action: '/tutor-portal', message: 'Class reminder: English with Synthetic Student A on 2026-11-09, 3:00 PM to 4:00 PM.' });
    await w.service.sendReminder(KEY, 'mentor-1', at(MON, '12:05'));
    expect(w.db.rows('notification')).toHaveLength(1);
    expect(w.db.rows('mentoringClassSession')).toHaveLength(1); // one class, however often it is touched
    const c = (await w.service.daily('act-A', MON, {}, MENTOR, at(MON, '12:10'))).classes[0];
    expect(c).toMatchObject({ state: 'REMINDER_SENT', tutorConfirmation: 'SENT' });
  });

  it('shows the tutor acknowledgement once the tutor confirms it', async () => {
    const w = world();
    const sent = await w.service.sendReminder(KEY, 'mentor-1', at(MON, '12:00'));
    await w.reminders.acknowledge(sent.reminderId, 'u-meera', at(MON, '12:30'));
    const c = (await w.service.daily('act-A', MON, {}, MENTOR, at(MON, '13:00'))).classes[0];
    expect(c.tutorConfirmation).toBe('ACKNOWLEDGED');
    expect(c.checklist[0]).toMatchObject({ done: true, detail: 'Sent and acknowledged by the tutor' });
  });

  it('only the assigned Mentor can send it, and only for a class the schedule really has', async () => {
    const w = world();
    await expect(w.service.sendReminder(KEY, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.sendReminder('as-class-1~2026-11-10~900', 'mentor-1')).rejects.toBeInstanceOf(NotFoundException); // Tuesday is not a class day
    await expect(w.service.sendReminder('nonsense', 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.service.sendReminder('as-nothere1~2026-11-09~900', 'mentor-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(w.db.rows('notification')).toHaveLength(0);
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0);
  });
});

describe('the tutor class update', () => {
  it("shows a tutor their own classes, and nobody else's", async () => {
    const w = world();
    expect((await w.service.tutorClasses('u-meera', MON, MON, at(MON, '12:00'))).map((c) => [c.studentName, c.tutorName])).toEqual([['Synthetic Student A', 'Meera Thomas']]);
    expect((await w.service.tutorClasses('u-rahul', MON, MON, at(MON, '12:00'))).map((c) => c.studentName)).toEqual(['Synthetic Student B']);
    await expect(w.service.tutorClasses('u-mentor', MON, MON)).rejects.toThrow('You do not have a tutor profile.');
    await expect(w.service.tutorClasses('u-meera', MON, '2027-03-01')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('goes to the Mentor and does not complete the class: it awaits verification, no record, no pay', async () => {
    const w = world();
    await expect(w.submit()).resolves.toMatchObject({ status: 'AWAITING_MENTOR_VERIFICATION' });
    expect(w.session()).toMatchObject({ status: 'AWAITING_MENTOR_VERIFICATION', conducted: true, actualMinutes: 65, actualStartMinute: 905, actualEndMinute: 970, attendance: 'PRESENT', topicsCovered: 'Tenses', subjectCovered: 'English', tutorSubmittedByUserId: 'u-meera' });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_CLASS_UPDATE')).toMatchObject({ recipientUserId: 'mentor-1' });
    const c = (await w.service.daily('act-A', MON, {}, MENTOR, at(MON, '17:30'))).classes[0];
    expect(c).toMatchObject({ state: 'AWAITING_MENTOR_VERIFICATION', mentorVerification: 'PENDING', verified: null });
    expect(c.update).toMatchObject({ conducted: true, actualMinutes: 65, topicsCovered: 'Tenses' });
  });

  it('starts the two-working-hour clock for the Mentor, due two hours after the submission', async () => {
    const w = world();
    await w.submit(MON, good, 'u-meera', KEY, at(MON, '17:00'));
    const list = await w.sla.list(MENTOR, {}, at(MON, '17:30'));
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({ policyKey: 'CLASS_UPDATE_REVIEW', entityType: 'ClassSession', responsibleUserId: 'mentor-1', state: 'WITHIN_SLA' });
    expect(list.rows[0].dueAt).toBe(at('2026-11-10', '10:00').toISOString()); // 17:00 + 1 working hour left today + 1 hour tomorrow
  });

  it('keeps several activities, with a description for Other, and the two remarks separate', async () => {
    const w = world();
    await w.submit(MON, { ...good, activities: ['QUIZ', 'OTHER', 'HOMEWORK'], otherActivity: 'Role play', evaluationRemarks: 'Attentive, needs practice on tenses', coveredRemarks: 'Chapter 3, exercise 2, homework page 14', participation: 'GOOD' });
    expect(w.session()).toMatchObject({ activities: ['QUIZ', 'OTHER', 'HOMEWORK'], otherActivity: 'Role play', evaluationRemarks: 'Attentive, needs practice on tenses', coveredRemarks: 'Chapter 3, exercise 2, homework page 14', participation: 'GOOD' });
  });

  it('refuses a bad update with the reason, and changes nothing', async () => {
    const w = world();
    await expect(w.submit(MON, { ...good, topicsCovered: '' })).rejects.toThrow('Say which topics were covered.');
    await expect(w.submit(MON, { ...good, actualEnd: '15:00' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.submit(MON, { ...good, activities: ['OTHER'] })).rejects.toThrow('Describe the other activity.');
    expect(w.session().status).toBe('SCHEDULED');
    expect(w.session().tutorSubmittedAt).toBeNull();
    expect(w.db.rows('mentoringSlaItem')).toHaveLength(0);
  });

  it('is refused for a class that has not happened yet, for another tutor, and for one already verified', async () => {
    const w = world();
    await expect(w.service.tutorSubmitUpdate('u-meera', KEY, good, at(MON, '09:00'))).resolves.toBeDefined(); // the same day counts: it may already be over
    const w2 = world({ extraDays: true });
    await expect(w2.service.tutorSubmitUpdate('u-meera', `as-class-1~${TUE}~900`, good, at(MON, '17:00'))).rejects.toThrow('has not happened yet');
    await expect(w.service.tutorSubmitUpdate('u-rahul', KEY, good, at(MON, '17:00'))).rejects.toBeInstanceOf(ForbiddenException);
    await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    await expect(w.service.tutorSubmitUpdate('u-meera', KEY, good, at(MON, '19:00'))).rejects.toThrow('already been verified');
  });

  it('a class that was not conducted needs only a reason, and the Mentor still has to confirm it', async () => {
    const w = world();
    await w.submit(MON, { conducted: false, notConductedReason: 'Student unwell' });
    expect(w.session()).toMatchObject({ status: 'AWAITING_MENTOR_VERIFICATION', conducted: false, notConductedReason: 'Student unwell', actualMinutes: null });
    await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    expect(w.session()).toMatchObject({ status: 'NOT_CONDUCTED', verifiedMinutes: 0 });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0); // nothing to pay for a class that did not happen
  });

  it('the tutor can correct an update before it is verified', async () => {
    const w = world();
    await w.submit();
    await w.submit(MON, { ...good, actualEnd: '16:00' });
    expect(w.session().actualMinutes).toBe(55);
    expect(w.db.rows('mentoringSlaItem')).toHaveLength(1); // one clock, not two
  });
});

describe('the Mentor review', () => {
  it('the voice item is done only for a recording that was uploaded and shared, not for a tutor saying it was sent or the Mentor confirming it arrived', async () => {
    const w = world();
    await w.submit(MON, { ...good, voiceSent: true });
    const voice = async (now: string) => (await w.service.detail(w.session().id, MENTOR, at(MON, now))).checklist.find((i) => i.key === 'VOICE')!;
    expect(await voice('17:30')).toMatchObject({ done: false, detail: 'Not uploaded' });
    await w.service.mentorNotes(w.session().id, { voiceReceived: true, voiceRemarks: 'Clear and complete' }, 'mentor-1', at(MON, '17:40'));
    expect(await voice('17:45')).toMatchObject({ done: false, detail: 'Not uploaded' });
    w.db.seed('mentoringClassAttachment', { sessionId: w.session().id, kind: 'VOICE', fileKey: 'k1', fileName: 'v.mp3', fileSize: 10, mimeType: 'audio/mpeg', uploadedByUserId: 'u-meera' });
    expect(await voice('17:50')).toMatchObject({ done: false, detail: 'Uploaded, sharing in the group not confirmed' });
    w.db.rows('mentoringClassAttachment')[0].sharedAt = at(MON, '17:55');
    expect(await voice('18:00')).toMatchObject({ done: true, detail: 'Uploaded and shared in the group' });
    expect(w.session()).toMatchObject({ voiceReceivedByUserId: 'mentor-1', voiceRemarks: 'Clear and complete' });
  });

  it('lets the Mentor add remarks, activities and the two remarks, each on its own, until the class is verified', async () => {
    const w = world();
    await w.submit();
    await w.service.mentorNotes(w.session().id, { mentorRemarks: 'Good progress', activities: ['PRACTICE_QUESTIONS'], evaluationRemarks: 'Needs more practice', coveredRemarks: 'Chapter 3' }, 'mentor-1');
    expect(w.session()).toMatchObject({ mentorRemarks: 'Good progress', activities: ['PRACTICE_QUESTIONS'], evaluationRemarks: 'Needs more practice', coveredRemarks: 'Chapter 3' });
    await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    await expect(w.service.mentorNotes(w.session().id, { evaluationRemarks: 'Changed' }, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(w.service.mentorNotes(w.session().id, { mentorRemarks: 'Still allowed' }, 'mentor-1')).resolves.toBeDefined();
    await expect(w.service.mentorNotes(w.session().id, {}, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sends an update back for correction with a reason, notifies the tutor, and stops the review clock', async () => {
    const w = world();
    await w.submit();
    await expect(w.service.returnToTutor(w.session().id, '  ', 'CORRECTION', 'mentor-1')).rejects.toThrow('Say what the tutor needs to correct.');
    await w.service.returnToTutor(w.session().id, 'Please add the topics covered in more detail', 'CORRECTION', 'mentor-1', at(MON, '17:30'));
    expect(w.session()).toMatchObject({ status: 'RETURNED_FOR_CORRECTION', returnedReason: 'Please add the topics covered in more detail', returnedKind: 'CORRECTION' });
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_CLASS_RETURNED')).toMatchObject({ recipientUserId: 'u-meera', message: 'Your class update was returned: Please add the topics covered in more detail' });
    expect(w.db.rows('mentoringSlaItem')[0]).toMatchObject({ status: 'COMPLETED' });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
    const c = (await w.service.tutorClasses('u-meera', MON, MON, at(MON, '18:00')))[0];
    expect(c).toMatchObject({ state: 'RETURNED_FOR_CORRECTION', returned: { kind: 'CORRECTION' } });
  });

  it('marking an update incomplete is a separate kind of return, and a correction starts the returned-update clock', async () => {
    const w = world();
    await w.submit();
    await w.service.returnToTutor(w.session().id, 'Attendance and topics are missing', 'INCOMPLETE', 'mentor-1', at(MON, '17:30'));
    expect(w.session().returnedKind).toBe('INCOMPLETE');
    expect(w.db.rows('mentoringClassSessionEvent').map((e) => e.kind)).toContain('MARKED_INCOMPLETE');
    await w.submit(MON, good, 'u-meera', KEY, at(MON, '18:00'));
    expect(w.session()).toMatchObject({ status: 'AWAITING_MENTOR_VERIFICATION', returnedReason: null });
    expect(w.db.rows('mentoringSlaItem').find((i) => i.status === 'OPEN')).toMatchObject({ policyKey: 'RETURNED_UPDATE_ACTION', responsibleUserId: 'mentor-1' });
    expect(w.db.rows('mentoringClassSessionEvent').map((e) => e.kind)).toContain('TUTOR_RESUBMITTED');
  });

  it('only a submitted update can be returned or verified, and only by the assigned Mentor', async () => {
    const w = world();
    await w.service.sendReminder(KEY, 'mentor-1', at(MON, '12:00'));
    const id = w.session().id;
    await expect(w.service.verify(id, {}, 'mentor-1')).rejects.toThrow('Only a submitted update can be verified.');
    await expect(w.service.returnToTutor(id, 'x', 'CORRECTION', 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    await w.submit();
    await expect(w.service.verify(id, {}, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.verify(id, {}, 'u-meera')).rejects.toBeInstanceOf(ForbiddenException); // the tutor cannot verify their own class
    await expect(w.service.returnToTutor(id, 'x', 'CORRECTION', 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.verify('missing', {}, 'mentor-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(w.session().status).toBe('AWAITING_MENTOR_VERIFICATION');
  });
});

describe('verification and the tutor pay record', () => {
  it('only now is the class complete: the verified minutes become a payroll-ready class record, and nobody is paid', async () => {
    const w = world();
    await w.submit();
    const result = await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '17:45'));
    expect(result).toMatchObject({ status: 'VERIFIED', alreadyVerified: false });
    expect(w.session()).toMatchObject({ status: 'VERIFIED', verifiedMinutes: 65, verifiedByUserId: 'mentor-1' });
    const record = w.db.rows('tutorClassRecord')[0];
    expect(record).toMatchObject({
      businessId: 'TCR-0000001', sessionId: w.session().id, tutorId: 'u-meera', status: 'VERIFIED', cancellation: 'NOT_CANCELLED', workedMinutes: 65, isPayrollReady: true, verifiedByUserId: 'mentor-1',
      appliedRate: '50', currency: 'AED', rateSubject: 'English',
    });
    expect(record.scheduledStart.toISOString()).toBe(at(MON, '15:00').toISOString());
    expect(record.scheduledEnd.toISOString()).toBe(at(MON, '16:00').toISOString());
    expect(record.actualStart.toISOString()).toBe(at(MON, '15:05').toISOString());
    expect(w.session().tutorClassRecordId).toBe(record.id);
    expect(w.db.rows('tutorPayableRun')).toHaveLength(0); // nothing is paid and no payroll run is touched
    expect(w.db.rows('tutorPayableItem')).toHaveLength(0);
    expect(w.db.rows('mentoringSlaItem')[0]).toMatchObject({ status: 'COMPLETED' });
    expect(w.db.rows('mentoringClassSessionEvent').map((e) => e.kind)).toEqual(expect.arrayContaining(['TUTOR_SUBMITTED', 'COMPENSATION_RECORD_CREATED', 'MENTOR_VERIFIED']));
  });

  it('keeps the scheduled, actual and verified minutes apart', async () => {
    const w = world();
    await w.submit(MON, { ...good, actualStart: '15:00', actualEnd: '16:30' }); // the tutor says 90 for a 60 minute slot
    await w.service.verify(w.session().id, { verifiedMinutes: 60, reason: 'Only the first hour was billable' }, 'mentor-1', at(MON, '18:00'));
    const view = await w.service.detail(w.session().id, MENTOR, at(MON, '18:10'));
    expect([view.scheduledMinutes, view.update?.actualMinutes, view.verified?.minutes]).toEqual([60, 90, 60]);
    expect(w.db.rows('tutorClassRecord')[0].workedMinutes).toBe(60);
  });

  it('needs a reason when the verified time differs from the reported time, and refuses nonsense minutes', async () => {
    const w = world();
    await w.submit();
    const id = w.session().id;
    await expect(w.service.verify(id, { verifiedMinutes: 30 }, 'mentor-1')).rejects.toThrow('Say why the verified time differs');
    for (const bad of [-1, 721, 30.5, '30']) await expect(w.service.verify(id, { verifiedMinutes: bad, reason: 'x' }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.service.verify(id, { verifiedMinutes: 65 }, 'mentor-1')).resolves.toMatchObject({ status: 'VERIFIED' }); // the same figure needs no reason
    expect(w.session().status).toBe('VERIFIED');
  });

  it('verifying twice never makes a second record, a second id or a second event', async () => {
    const w = world();
    await w.submit();
    await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    const again = await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:30'));
    expect(again).toMatchObject({ status: 'VERIFIED', alreadyVerified: true });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(1);
    expect(w.ids.nextIdInTx).toHaveBeenCalledTimes(1);
    expect(w.db.rows('mentoringClassSessionEvent').filter((e) => e.kind === 'MENTOR_VERIFIED')).toHaveLength(1);
  });

  it('reuses a class record that already exists for the class instead of making another', async () => {
    const w = world();
    await w.submit();
    const existing = w.db.seed('tutorClassRecord', { id: 'tcr-old', businessId: 'TCR-OLD', sessionId: w.session().id, tutorId: 'u-meera', status: 'VERIFIED' });
    await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    expect(w.db.rows('tutorClassRecord')).toHaveLength(1);
    expect(w.session().tutorClassRecordId).toBe(existing.id);
  });

  it('with no hourly rate set it still verifies, records no rate, and warns instead of inventing one', async () => {
    const w = world({ rate: false });
    await w.submit();
    const result = await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    expect(result.warnings.join(' ')).toContain('No hourly rate is set');
    expect(w.db.rows('tutorClassRecord')[0]).toMatchObject({ appliedRate: null, currency: null, workedMinutes: 65 });
  });

  it('warns before verification about a missing voice update, activities and remarks, without blocking', async () => {
    const w = world();
    await w.submit();
    const detail = await w.service.detail(w.session().id, MENTOR, at(MON, '17:30'));
    expect(detail.warnings).toEqual(expect.arrayContaining(['The tutor voice update has not been confirmed as received.', 'No post-class activities are recorded.', 'The class evaluation remarks are empty.', 'The topics covered remarks are empty.']));
    await expect(w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'))).resolves.toMatchObject({ status: 'VERIFIED' });
  });

  it('a correction before payroll changes the record too, and one after payroll leaves the record and records an adjustment', async () => {
    const w = world();
    await w.submit();
    await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    await expect(w.service.adjustVerified(w.session().id, { minutes: 60 }, 'mentor-1')).rejects.toThrow('Say why');
    await expect(w.service.adjustVerified(w.session().id, { minutes: 65, reason: 'x' }, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(w.service.adjustVerified(w.session().id, { minutes: 60, reason: 'Class ended five minutes early' }, 'mentor-1')).resolves.toMatchObject({ previousMinutes: 65, newMinutes: 60, appliedToRecord: true });
    expect(w.db.rows('tutorClassRecord')[0]).toMatchObject({ workedMinutes: 60, isCorrected: true, correctionReason: 'Class ended five minutes early', isPayrollReady: true });

    // Payroll takes the class: a draft run now holds an item for it.
    const record = w.db.rows('tutorClassRecord')[0];
    w.db.seed('tutorPayableItem', { classRecordId: record.id, payableRun: { status: 'DRAFT' }, payableRunId: 'run-1', paymentStatus: 'UNPAID', amount: '50.00', currency: 'AED' });
    await expect(w.service.adjustVerified(w.session().id, { minutes: 0, reason: 'The class was found not to have happened' }, 'mentor-1')).resolves.toMatchObject({ newMinutes: 0, appliedToRecord: false });
    expect(w.db.rows('tutorClassRecord')[0]).toMatchObject({ workedMinutes: 60, isPayrollReady: true }); // payroll history is untouched
    expect(w.db.rows('mentoringClassCompensationAdjustment').map((a) => [a.previousMinutes, a.newMinutes, a.deltaMinutes, a.appliedToRecord, a.createdByUserId])).toEqual([[65, 60, -5, true, 'mentor-1'], [60, 0, -60, false, 'mentor-1']]);
    expect(w.session().verifiedMinutes).toBe(0);
    expect(w.db.rows('mentoringClassSessionEvent').filter((e) => e.kind === 'COMPENSATION_ADJUSTED')).toHaveLength(2);
  });

  it('cancelling the pay of a class not yet in payroll takes it out of the next payroll run', async () => {
    const w = world();
    await w.submit();
    await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    await w.service.adjustVerified(w.session().id, { minutes: 0, reason: 'Duplicate booking' }, 'mentor-1');
    expect(w.db.rows('tutorClassRecord')[0]).toMatchObject({ workedMinutes: 0, isPayrollReady: false });
  });

  it('refuses to adjust a class that is not verified, and bad minutes', async () => {
    const w = world();
    await w.submit();
    await expect(w.service.adjustVerified(w.session().id, { minutes: 30, reason: 'x' }, 'mentor-1')).rejects.toThrow('Only a verified class');
    await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    for (const bad of [-5, 800, 1.5, 'ten', undefined]) await expect(w.service.adjustVerified(w.session().id, { minutes: bad, reason: 'x' }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.service.adjustVerified(w.session().id, { minutes: 30, reason: 'x' }, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('my completed classes and earnings', () => {
  async function week() {
    const w = world({ extraDays: true });
    // 9 Nov English 1 hour, 10 Nov English 1 hour, 11 Nov English 1.5 hours
    const key = (d: string) => `as-class-1~${d}~900`;
    await w.service.tutorSubmitUpdate('u-meera', key(MON), good, at(MON, '17:00'));
    await w.service.tutorSubmitUpdate('u-meera', key(TUE), { ...good, actualStart: '15:00', actualEnd: '16:00' }, at(TUE, '17:00'));
    await w.service.tutorSubmitUpdate('u-meera', key(WED), { ...good, actualStart: '15:00', actualEnd: '16:30' }, at(WED, '17:00'));
    const ids = w.db.rows('mentoringClassSession').map((s) => s.id);
    await w.service.verify(ids[0], { verifiedMinutes: 60, reason: 'Billed as scheduled' }, 'mentor-1', at(WED, '18:00'));
    await w.service.verify(ids[1], {}, 'mentor-1', at(WED, '18:00'));
    return { w, ids };
  }

  it('shows verified time, the time pending verification, and an estimate, as in the example', async () => {
    const { w } = await week();
    const e = await w.service.tutorEarnings('u-meera', MON, WED, at(WED, '19:00'));
    expect(e.totals).toEqual({ verifiedMinutes: 120, pendingMinutes: 90, estimatedAmount: 100, classesWithoutRate: 0 });
    expect(e.verified.map((v) => [v.date, v.verifiedMinutes, v.estimatedAmount, v.payroll])).toEqual([[MON, 60, 50, null], [TUE, 60, 50, null]]);
    expect(e.pending.map((p) => [p.date, p.status, p.pendingMinutes])).toEqual([[WED, 'AWAITING_MENTOR_VERIFICATION', 90]]);
    expect(e.note).toContain('estimate');
  });

  it('shows what payroll has done with a class: its period, whether it is paid, and any correction', async () => {
    const { w, ids } = await week();
    const record = w.db.rows('tutorClassRecord')[0];
    w.db.seed('tutorPayableRun', { id: 'run-1', periodStart: '2026-11-01', periodEnd: '2026-11-30', status: 'FINALIZED' });
    w.db.seed('tutorPayableItem', { classRecordId: record.id, payableRunId: 'run-1', payableRun: { status: 'FINALIZED' }, paymentStatus: 'PAID', amount: '50.00', currency: 'AED', paidAt: new Date('2026-12-05T00:00:00Z') });
    await w.service.adjustVerified(ids[0], { minutes: 45, reason: 'Ended early' }, 'mentor-1');
    const e = await w.service.tutorEarnings('u-meera', MON, WED, at(WED, '19:00'));
    expect(e.verified[0].payroll).toEqual({ period: '2026-11-01 to 2026-11-30', runStatus: 'FINALIZED', paymentStatus: 'PAID', amount: 50, currency: 'AED', paidAt: '2026-12-05T00:00:00.000Z' });
    expect(e.verified[0].adjustments).toEqual([expect.objectContaining({ deltaMinutes: -15, reason: 'Ended early', appliedToRecord: false })]);
  });

  it('never invents an amount for a class with no rate', async () => {
    const w = world({ rate: false });
    await w.submit();
    await w.service.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    const e = await w.service.tutorEarnings('u-meera', MON, MON, at(MON, '19:00'));
    expect(e.totals).toMatchObject({ verifiedMinutes: 65, estimatedAmount: 0, classesWithoutRate: 1 });
    expect(e.verified[0].estimatedAmount).toBeNull();
  });

  it("shows a tutor only their own classes, never another tutor's students or pay", async () => {
    const { w } = await week();
    const other = await w.service.tutorEarnings('u-rahul', MON, WED, at(WED, '19:00'));
    expect(other.verified).toEqual([]);
    expect(other.pending).toEqual([]);
    expect(JSON.stringify(other)).not.toContain('Student A');
    await expect(w.service.tutorEarnings('u-mentor', MON, WED)).rejects.toThrow('You do not have a tutor profile.');
    await expect(w.service.tutorEarnings('u-meera', MON, '2027-03-01')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('rescheduling a class', () => {
  const move = (w: ReturnType<typeof world>, over: object = {}, user = 'mentor-1', now = at(MON, '12:00')) => w.service.reschedule(KEY, { newDate: MON, newStart: '17:00', newEnd: '18:00', reason: 'Student has an exam at 3 PM', ...over }, user, now);

  it('moves it to a free time, keeps the original slot, tells the tutor, and records who asked and why', async () => {
    const w = world();
    await expect(move(w)).resolves.toMatchObject({ from: { date: MON, start: 900, end: 960 }, to: { date: MON, startMinute: 1020, endMinute: 1080 }, notified: true });
    expect(w.session()).toMatchObject({ status: 'RESCHEDULED', startMinute: 1020, endMinute: 1080, originalStartMinute: 900 });
    expect(w.session().date).toEqual(day(MON));
    expect(w.session().originalDate).toEqual(day(MON));
    expect(w.db.rows('mentoringTutorAssignmentOverride')[0]).toMatchObject({ assignmentId: 'as-class-1', kind: 'RESCHEDULED', originalStartMinute: 900, newStartMinute: 1020, newEndMinute: 1080, reason: 'Student has an exam at 3 PM', createdByUserId: 'mentor-1' });
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_CLASS_RESCHEDULED')).toMatchObject({ recipientUserId: 'u-meera' });
    const event = w.db.rows('mentoringClassSessionEvent').find((e) => e.kind === 'RESCHEDULED')!;
    expect(event).toMatchObject({ actorUserId: 'mentor-1', reason: 'Student has an exam at 3 PM', fromStatus: 'SCHEDULED', toStatus: 'RESCHEDULED' });
    expect(event.payload).toMatchObject({ from: { date: MON, start: 900, end: 960 }, to: { date: MON, start: 1020, end: 1080 }, requestedByUserId: 'mentor-1', approvedByUserId: null, notification: { status: 'SENT' } });
  });

  it('then shows the class at its new time, still one class, and the original key keeps working', async () => {
    const w = world();
    await move(w, { newDate: TUE, newStart: '16:00', newEnd: '17:00' });
    expect((await w.service.daily('act-A', MON, {}, MENTOR, at(MON, '12:00'))).classes).toEqual([]);
    const moved = (await w.service.daily('act-A', TUE, {}, MENTOR, at(MON, '12:00'))).classes;
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ key: KEY, moved: true, status: 'RESCHEDULED', state: 'RESCHEDULED', startMinute: 960, endMinute: 1020 });
    await w.service.sendReminder(KEY, 'mentor-1', at(MON, '13:00'));
    expect(w.db.rows('mentoringClassSession')).toHaveLength(1);
    expect(w.db.rows('mentoringReminder')[0].message).toContain('2026-11-10, 4:00 PM to 5:00 PM');
  });

  it('withdraws a reminder not yet sent for the old time, and gives the new time its own', async () => {
    const w = world();
    await w.service.prepareReminder(KEY, 'mentor-1');
    await move(w);
    expect(w.db.rows('mentoringReminder').map((r) => r.status)).toEqual(['CANCELLED']);
    await w.service.sendReminder(KEY, 'mentor-1', at(MON, '12:30'));
    expect(w.db.rows('mentoringReminder').map((r) => r.status)).toEqual(['CANCELLED', 'SENT']);
    await move(w, { newStart: '18:00', newEnd: '19:00' }); // moved again: the sent one stays on record, a new one is needed
    expect(w.db.rows('mentoringReminder').map((r) => r.status)).toEqual(['CANCELLED', 'SENT']);
    expect((await w.service.daily('act-A', MON, {}, MENTOR, at(MON, '13:00'))).classes[0].tutorConfirmation).toBe('NOT_SENT');
    expect(w.db.rows('mentoringTutorAssignmentOverride')).toHaveLength(1); // one override, moved again, not a second one
  });

  it("refuses a time the tutor cannot take: leave, a holiday, outside hours, or another student's class", async () => {
    const w = world({ extraDays: true });
    w.db.seed('employeeLeaveRequest', { employeeId: 'e-meera', status: 'APPROVED', startDate: TUE, endDate: TUE });
    await expect(move(w, { newDate: TUE })).rejects.toThrow('The tutor is not free then. On leave');
    w.db.seed('tutorAvailabilityException', { tutorProfileId: null, date: day(WED), kind: 'HOLIDAY', note: 'Holiday' });
    await expect(move(w, { newDate: WED })).rejects.toThrow('Public holiday');
    await expect(move(w, { newStart: '21:00', newEnd: '22:00' })).rejects.toThrow('Outside working hours');
    // Another student already has this tutor on Monday 5 PM.
    const rahulStudent = w.db.rows('mentoringTutorAssignment').find((a) => a.id === 'as-class-2')!;
    rahulStudent.tutorProfileId = 'tp-meera';
    w.db.rows('mentoringTutorAssignmentSession').find((s) => s.assignmentId === 'as-class-2')!.tutorProfileId = 'tp-meera';
    w.db.rows('mentoringTutorAssignmentSession').find((s) => s.assignmentId === 'as-class-2')!.startMinute = m('17:00');
    w.db.rows('mentoringTutorAssignmentSession').find((s) => s.assignmentId === 'as-class-2')!.endMinute = m('18:00');
    await expect(move(w)).rejects.toThrow('The tutor is not free then. Already booked');
    expect(w.session().status).toBe('SCHEDULED');
    expect(w.db.rows('mentoringTutorAssignmentOverride')).toHaveLength(0);
  });

  it("refuses a time when the student already has another class then, and never moves a class onto itself", async () => {
    const w = world({ extraDays: true });
    await expect(w.service.reschedule(KEY, { newDate: MON, newStart: '15:00', newEnd: '16:00', reason: 'x' }, 'mentor-1', at(MON, '12:00'))).rejects.toThrow('already has');
    // Tuesday's own class is at 15:00; Monday's class cannot be moved on top of it.
    await expect(move(w, { newDate: TUE, newStart: '15:30', newEnd: '16:30' })).rejects.toThrow('This student already has another class at that time.');
  });

  it('needs a real date, real times, a reason, and a date that is not in the past', async () => {
    const w = world();
    await expect(move(w, { newDate: 'soon' })).rejects.toThrow('real new date');
    await expect(move(w, { newStart: 'late' })).rejects.toThrow('start and end time');
    await expect(move(w, { newStart: '18:00', newEnd: '17:00' })).rejects.toThrow('end after it starts');
    await expect(move(w, { reason: '  ' })).rejects.toThrow('Say why');
    await expect(move(w, { newDate: '2026-11-08' })).rejects.toThrow('today or a later date');
    await expect(move(w, { newStart: '15:00', newEnd: '16:00' })).rejects.toThrow('already has');
    expect(w.db.rows('mentoringClassSession').every((s) => s.status === 'SCHEDULED')).toBe(true);
  });

  it('only the assigned Mentor can move a class, and not one that has been reported', async () => {
    const w = world();
    await expect(move(w, {}, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await w.submit();
    await expect(move(w)).rejects.toThrow('Only a class that has not been reported yet');
  });
});

describe('the routes', () => {
  const mentorWrites = ['prepareReminder', 'sendReminder', 'reschedule', 'notes', 'verify', 'returnToTutor', 'adjust'];

  it('every Mentor change needs the Mentor work permission, and reading is scoped in the query', () => {
    const proto = MentoringClassController.prototype as any;
    for (const name of mentorWrites) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['mentoring.stage.work']);
    for (const name of ['daily', 'queue', 'detail']) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toBeUndefined();
  });

  it('the tutor routes need the tutor portal permission and cannot name a tutor', () => {
    const proto = TutorClassesController.prototype as any;
    for (const name of ['myClasses', 'submitUpdate', 'earnings']) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['tutor.portal.read']);
    const source = readFileSync(join(__dirname, 'tutor-classes.controller.ts'), 'utf8');
    expect(source).not.toMatch(/tutorProfileId|tutorId|tutorUserId/);
    expect((source.match(/@Param\(/g) ?? []).length).toBe(1); // the class key, and nothing else
  });

  it('has no route that verifies or pays on the tutor side, and none that creates a class by itself', () => {
    const tutorSource = readFileSync(join(__dirname, 'tutor-classes.controller.ts'), 'utf8');
    expect(tutorSource).not.toMatch(/verify|adjust|payroll|payable/i);
    const serviceSource = readFileSync(join(__dirname, 'mentoring-class.service.ts'), 'utf8');
    expect(serviceSource).not.toMatch(/tutorPayableRun\.(create|update)|tutorPayableItem\.(create|update)|paymentStatus:\s*'PAID'/);
  });
});
