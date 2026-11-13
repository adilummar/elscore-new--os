/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Writable } from 'stream';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { operationalAt } from './class-eligibility';
import { MAX_AUDIO_BYTES } from './class-workspace';
import { MentoringAccessService } from './mentoring-access.service';
import { MentoringClassWorkspaceController, TutorClassWorkspaceController } from './mentoring-class-workspace.controller';
import { MentoringClassWorkspaceService } from './mentoring-class-workspace.service';
import { MentoringClassController } from './mentoring-class.controller';
import { MentoringClassService, UPDATE_ESCALATION_HOURS, UPDATE_REMINDER_OFFSETS_MINUTES } from './mentoring-class.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringReminderJobsService } from './mentoring-reminder-jobs.service';
import { MentoringReminderProcessor, MentoringReminderScheduler, automaticRemindersEnabled } from './mentoring-reminder.processor';
import { MentoringReminderService } from './mentoring-reminder.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { MentoringStorageService } from './mentoring-storage.service';
import { MentoringTimetableService } from './mentoring-timetable.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { FakeDb } from './testing/mentoring-fake-db';

const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const slot = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const MON = '2026-11-09';
const KEY = `as-class-A~${MON}~900`;
const KEY_B = `as-class-B~${MON}~900`;
const KEY_H = `as-class-H~${MON}~1020`;
const AFTER = at(MON, '17:00');

const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work'],
  'mentor-2': ['mentoring.student.read-assigned', 'mentoring.stage.work'],
  'head-1': ['mentoring.student.read-all', 'mentoring.exception.authorize', 'mentoring.allocation.manage', 'mentoring.stage.work', 'mentoring.student.read-assigned'],
  'template-admin': ['mentoring.student.read-all', 'mentoring.template.manage'],
  'ceo-1': ['mentoring.student.read-all'],
  corrector: ['mentoring.student.read-all', 'mentoring.record.correct'],
  'narrow-corrector': ['mentoring.student.read-assigned', 'mentoring.record.correct'],
  nobody: [],
};
const good = { conducted: true, actualStart: '15:05', actualEnd: '16:10', topicsCovered: 'Tenses', attendance: 'PRESENT', participation: 'GOOD', portionsCompleted: 'Chapter 3', homework: 'Worksheet 4', classNotes: 'None', resubmitReason: 'Corrected as asked' };
const mp3 = (n = 200) => Buffer.concat([Buffer.from('ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1'), Buffer.alloc(n, 7)]);
const audio = (over: Partial<{ originalname: string; mimetype: string; buffer: Buffer }> = {}) => ({ originalname: 'my voice.mp3', mimetype: 'audio/mpeg', buffer: mp3(), ...over });
const activity = (i: number, over: object = {}) => ({ title: `Activity ${i}`, type: 'WORKSHEET', topic: 'Tenses', instructions: 'Complete the worksheet.', gradeId: 'g-8', learningLevel: 'ON_GRADE', ...over });

let root = '';
beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'mentoring-storage-')); process.env.MENTORING_STORAGE_DIR = root; });
afterAll(() => { rmSync(root, { recursive: true, force: true }); delete process.env.MENTORING_STORAGE_DIR; });

function world() {
  const db = new FakeDb();
  db.seed('subject', { id: 'sub-en', name: 'English', isActive: true });
  db.seed('grade', { id: 'g-8', name: 'Grade 8' });
  const tutor = (key: string, first: string, last: string) => {
    db.seed('user', { id: `u-${key}`, status: 'ACTIVE' });
    db.seed('employee', { id: `e-${key}`, userId: `u-${key}`, firstName: first, lastName: last, employmentStatus: 'ACTIVE' });
    db.seed('tutorProfile', { id: `tp-${key}`, employeeId: `e-${key}`, tutorOperationalStatus: 'ACTIVE', profilePhotoUrl: null });
    db.seed('tutorSubject', { tutorProfileId: `tp-${key}`, subjectId: 'sub-en' });
    db.seed('tutorGrade', { tutorProfileId: `tp-${key}`, gradeId: 'g-8' });
    for (const d of [1, 2, 3, 4, 5]) db.seed('tutorAvailabilitySlot', { tutorProfileId: `tp-${key}`, dayOfWeek: d, startTime: slot('14:00'), endTime: slot('20:00'), isActive: true });
  };
  tutor('meera', 'Meera', 'Thomas');
  tutor('rahul', 'Rahul', 'Nair');
  for (const [id, mentor] of [['mentor-1', 'Mira'], ['mentor-2', 'Mohan'], ['head-1', 'Hari']] as const) db.seed('employee', { id: `e-${id}`, userId: id, firstName: mentor, lastName: 'Staff', employmentStatus: 'ACTIVE' });
  const student = (id: string, first: string, last: string, mentor: string, tp: string, start: string, end: string) => {
    db.seed('lead', { id: `lead-${id}` });
    db.seed('student', { id: `stu-${id}`, firstName: first, lastName: last, businessId: `STU-000${id === 'A' ? 1 : id === 'B' ? 2 : 3}` });
    db.seed('mentoringActivation', { id: `act-${id}`, leadId: `lead-${id}`, studentId: `stu-${id}`, handoverId: `ho-${id}`, status: 'ACTIVATED', activatedAt: new Date('2026-11-01T00:00:00Z'), currentStage: 3, currentMentorUserId: mentor });
    db.seed('mentoringStage', { activationId: `act-${id}`, stageNumber: 3, key: 'TIMETABLE_CREATION', status: 'COMPLETED' });
    db.seed('enrollmentHandoverField', { handoverId: `ho-${id}`, fieldKey: 'timetable.schedule', value: { version: 2, subjects: [{ subjectId: 'sub-en', subjectName: 'English', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 60, distribution: 'EQUAL', sessions: [{ day: 'Monday', durationMinutes: m(end) - m(start), start, end }], startDate: MON }] }, origin: 'MENTOR_COLLECTED', updatedByUserId: mentor });
    const a = db.seed('mentoringTutorAssignment', { id: `as-class-${id}`, activationId: `act-${id}`, subjectId: 'sub-en', tutorProfileId: `tp-${tp}`, status: 'ACTIVE', currentKey: `act-${id}:sub-en`, startDate: day(MON), endDate: null, scheduleSnapshot: {} });
    db.seed('mentoringTutorAssignmentSession', { assignmentId: a.id, tutorProfileId: `tp-${tp}`, dayOfWeek: 1, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: m(start), endMinute: m(end) });
  };
  student('A', 'Asha', 'Menon', 'mentor-1', 'meera', '15:00', '16:00');
  student('B', 'Basil', 'Nair', 'mentor-2', 'rahul', '15:00', '16:00');
  student('H', 'Hema', 'Pillai', 'head-1', 'meera', '17:00', '18:00');

  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: (id: string) => Promise.resolve(new Set(PERMS[id] ?? [])) } as any);
  const sla = new MentoringSlaService(db as any, access);
  const reminders = new MentoringReminderService(db as any);
  let n = 0;
  const classes = new MentoringClassService(db as any, access, history, sla, reminders, { nextIdInTx: jest.fn(() => Promise.resolve(`TCR-${String(++n).padStart(7, '0')}`)) } as any, new MentoringTutorService(db as any, history));
  const storage = new MentoringStorageService();
  const ws = new MentoringClassWorkspaceService(db as any, access, classes, history, sla, storage);
  const scope = (u: string) => access.scopeFor(u);
  const session = (key = KEY) => db.rows('mentoringClassSession').find((s) => `${s.assignmentId}~${s.originalDate.toISOString().slice(0, 10)}~${s.originalStartMinute}` === key)!;
  const events = (id: string) => db.rows('mentoringClassSessionEvent').filter((e) => e.sessionId === id).map((e) => e.kind);
  const submit = (key = KEY, user = 'u-meera') => classes.tutorSubmitUpdate(user, key, good, AFTER);
  /** Voice uploaded and shared, three activities created and shared. */
  const prepare = async (key = KEY, user = 'u-meera') => {
    await ws.uploadVoice(user, key, audio(), AFTER);
    await ws.confirmVoiceShared(user, key, AFTER);
    for (const i of [1, 2, 3]) await ws.shareActivity(user, (await ws.addActivity(user, key, activity(i), AFTER)).activityId, AFTER);
  };
  return { db, ws, classes, access, scope, session, events, submit, prepare, storage };
}

describe('who can reach a class workspace', () => {
  it('shows a tutor only their own class, and the Mentor only their own students', async () => {
    const w = world();
    await expect(w.ws.tutorWorkspace('u-meera', KEY, AFTER)).resolves.toMatchObject({ student: { name: 'Asha Menon', studentId: 'stu-A' }, tutorName: 'Meera Thomas' });
    await expect(w.ws.tutorWorkspace('u-rahul', KEY, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.tutorWorkspace('mentor-1', KEY, AFTER)).rejects.toThrow('You do not have a tutor profile.');
    await expect(w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER)).resolves.toMatchObject({ canWork: true });
    await expect(w.ws.mentorWorkspace(await w.scope('mentor-2'), KEY, AFTER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.ws.mentorWorkspace(await w.scope('nobody'), KEY, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    const head = await w.ws.mentorWorkspace(await w.scope('ceo-1'), KEY, AFTER);
    expect(head.canWork).toBe(false); // read only
  });

  it('shows the tutor view without the response clock, and the Mentor view with the review checklist and blockers', async () => {
    const w = world();
    await w.submit();
    const tutor = await w.ws.tutorWorkspace('u-meera', KEY, AFTER);
    expect(tutor.class.sla).toBeNull();
    const mentor = await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER);
    expect(mentor.review.blockers.length).toBe(2); // the voice and the activities
    expect(mentor.review.canVerify).toBe(false);
    expect(mentor.class.checklist.map((c) => c.key)).toEqual(['REMINDER', 'UPDATE', 'VOICE', 'ACTIVITIES', 'EVALUATION', 'COVERED', 'MENTOR']);
  });
});

/** The Meet link of a subject lives on the student's tutor assignment (the subject schedule). */
const subjectLink = (w: ReturnType<typeof world>, link: string | null, id = 'A') => { w.db.rows('mentoringTutorAssignment').find((a) => a.id === `as-class-${id}`)!.meetLink = link; };

describe('before class: the reminder', () => {
  it('shows the 45 minute target, the class details and the Meet link, and warns in amber when due and in red once the class has started', async () => {
    const w = world();
    subjectLink(w, 'https://meet.google.com/abc-defg-hij');
    const early = (await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:00'))).before;
    expect(early).toMatchObject({ targetAt: at(MON, '14:15').toISOString(), leadMinutes: 45, meetLink: 'https://meet.google.com/abc-defg-hij', meetLinkSource: 'SUBJECT', warning: null, done: false });
    expect(early.message).toMatchObject({ ok: true });
    expect(early.message.text).toContain('Student: Asha Menon');
    expect(early.message.text).toContain('Tutor: Meera Thomas');
    expect(early.message.text).toContain('Time: 3:00 PM to 4:00 PM');
    expect(early.message.text).toContain('Meet link: https://meet.google.com/abc-defg-hij');
    expect((await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:30'))).before.warning).toMatchObject({ level: 'amber' });
    expect((await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '15:10'))).before.warning).toMatchObject({ level: 'red' });
  });

  it('does not make up a Meet link: without one on the subject the message asks for it, and a typed link is ignored', async () => {
    const w = world();
    const before = (await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:00'))).before;
    expect(before.message).toMatchObject({ ok: false, missing: ['meetLink'], message: 'Complete the Meet link first.' });
    expect(before).toMatchObject({ meetLink: null, meetLinkSource: null });
    await expect(w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', {}, at(MON, '14:00'))).rejects.toThrow('Complete the Meet link first.');
    await expect(w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { meetLink: 'https://meet.google.com/zzz-yyyy-xxx' }, at(MON, '14:00'))).rejects.toThrow('Complete the Meet link first.');
    expect(w.db.rows('mentoringMessageShare')).toHaveLength(0);
  });

  it('uses the subject link in the reminder, and a typed link never replaces it', async () => {
    const w = world();
    subjectLink(w, 'https://meet.google.com/aaa-bbbb-ccc');
    const made = await w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { meetLink: 'https://meet.google.com/forged-link' }, at(MON, '14:00'));
    expect(made.text).toContain('Meet link: https://meet.google.com/aaa-bbbb-ccc');
    expect(made.text).not.toContain('forged-link');
  });

  it('shows each class the link of its own subject, and no link for a subject that has none', async () => {
    const w = world();
    // Student A has English only in this world; give A a second subject with another link and another with none.
    const en = w.db.rows('mentoringTutorAssignment').find((x) => x.id === 'as-class-A')!;
    en.meetLink = 'https://meet.google.com/eng-lish-aaa';
    const maths: any = w.db.seed('mentoringTutorAssignment', { id: 'as-class-A-ma', activationId: 'act-A', subjectId: 'sub-ma', tutorProfileId: en.tutorProfileId, status: 'ACTIVE', currentKey: 'act-A:sub-ma', startDate: day(MON), endDate: null, scheduleSnapshot: {}, meetLink: 'https://meet.google.com/mat-hsss-bbb' });
    const science: any = w.db.seed('mentoringTutorAssignment', { id: 'as-class-A-sc', activationId: 'act-A', subjectId: 'sub-sc', tutorProfileId: en.tutorProfileId, status: 'ACTIVE', currentKey: 'act-A:sub-sc', startDate: day(MON), endDate: null, scheduleSnapshot: {}, meetLink: null });
    for (const [assignment, start] of [[maths, 18 * 60], [science, 19 * 60]] as const) w.db.seed('mentoringTutorAssignmentSession', { assignmentId: assignment.id, tutorProfileId: en.tutorProfileId, dayOfWeek: 1, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: start, endMinute: start + 60 });
    for (const [id, name] of [['sub-ma', 'Mathematics'], ['sub-sc', 'Science']] as const) if (!w.db.rows('subject').some((x) => x.id === id)) w.db.seed('subject', { id, name, isActive: true });
    const link = async (assignment: any, start: number) => (await w.ws.tutorWorkspace('u-meera', `${assignment.id}~${MON}~${start}`, at(MON, '14:00'))).before;
    expect(await link(en, 15 * 60)).toMatchObject({ meetLink: 'https://meet.google.com/eng-lish-aaa', meetLinkSource: 'SUBJECT' });
    expect(await link(maths, 18 * 60)).toMatchObject({ meetLink: 'https://meet.google.com/mat-hsss-bbb', meetLinkSource: 'SUBJECT' });
    expect(await link(science, 19 * 60)).toMatchObject({ meetLink: null, meetLinkSource: null });
  });

  it('falls back to a link saved on the single class only when the subject has none, and the subject link wins when both exist', async () => {
    const w = world();
    const first = await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:00'));
    expect(first.before.meetLink).toBeNull();
    w.session().meetLink = 'https://meet.google.com/old-class-link';
    expect((await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:00'))).before).toMatchObject({ meetLink: 'https://meet.google.com/old-class-link', meetLinkSource: 'CLASS' });
    subjectLink(w, 'https://meet.google.com/subject-link-1');
    expect((await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:00'))).before).toMatchObject({ meetLink: 'https://meet.google.com/subject-link-1', meetLinkSource: 'SUBJECT' });
  });

  it('copying is not sharing: the message stays not confirmed until a named person says they shared it, and confirming twice records once', async () => {
    const w = world();
    subjectLink(w, 'https://meet.google.com/aaa-bbbb-ccc');
    const { shareId } = await w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { meetLink: 'https://meet.google.com/aaa-bbbb-ccc' }, at(MON, '14:00'));
    await w.ws.markCopied('u-meera', 'TUTOR', shareId, at(MON, '14:01'));
    let share = (await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:02'))).before.message.share!;
    expect(share).toMatchObject({ copiedAt: at(MON, '14:01').toISOString(), confirmedAt: null, confirmedBy: null });
    expect((await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:02'))).before.done).toBe(false);
    await w.ws.confirmShare('u-meera', 'TUTOR', shareId, at(MON, '14:05'));
    const again = await w.ws.confirmShare('u-meera', 'TUTOR', shareId, at(MON, '14:30'));
    expect(again).toMatchObject({ already: true, confirmedAt: at(MON, '14:05').toISOString() });
    share = (await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:31'))).before.message.share!;
    expect(share).toMatchObject({ confirmedAt: at(MON, '14:05').toISOString(), confirmedBy: 'Meera Thomas' });
    expect(w.events(w.session().id).filter((e) => e === 'MESSAGE_SHARE_CONFIRMED')).toHaveLength(1);
    expect(JSON.stringify(w.db.rows('mentoringMessageShare'))).not.toMatch(/deliver|read/i); // nothing claims a delivery
  });

  it('only the tutor of the class can confirm a message of theirs, and a Mentor only for their own student', async () => {
    const w = world();
    subjectLink(w, 'https://meet.google.com/aaa-bbbb-ccc');
    const { shareId } = await w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { meetLink: 'https://meet.google.com/aaa-bbbb-ccc' }, AFTER);
    await expect(w.ws.confirmShare('u-rahul', 'TUTOR', shareId, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.confirmShare('mentor-2', 'MENTOR', shareId, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.confirmShare('mentor-1', 'MENTOR', shareId, AFTER)).resolves.toMatchObject({ shared: true });
    await expect(w.ws.prepareShare('u-rahul', 'TUTOR', KEY, 'CLASS_REMINDER', {}, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'NOT_A_TEMPLATE', {}, AFTER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('has no way to add or change a Meet link from a class: the link is managed in the subject schedule', () => {
    const w = world();
    expect('setMeetLink' in w.ws).toBe(false);
  });
});

describe('after class: the class update message', () => {
  it('uses the real class data in the approved format, never an example name, and asks for what is missing', async () => {
    const w = world();
    const early = (await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after.messages.find((x) => x.key === 'CLASS_UPDATE')!;
    expect(early).toMatchObject({ ok: false, missing: ['duration', 'topicsCovered', 'practiceWork'] });
    await w.submit();
    await w.ws.addActivity('u-meera', KEY, activity(1, { title: 'Tenses worksheet' }), AFTER);
    const msg = (await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after.messages.find((x) => x.key === 'CLASS_UPDATE')!;
    expect(msg.ok).toBe(true);
    expect(msg.text).toContain('𝐂𝐋𝐀𝐒𝐒 𝐔𝐏𝐃𝐀𝐓𝐄');
    expect(msg.text).toContain('Student Name'.split('').map(() => '').join('') + ': Asha Menon');
    expect(msg.text).toContain('Topic'.length ? ': Tenses' : '');
    expect(msg.text).toContain('Monday, 9 November 2026');
    expect(msg.text).toContain('1 h 5 min');
    expect(msg.text).toContain('Tenses worksheet');
    expect(msg.text).not.toContain('{{');
  });

  it('can be edited by someone with the template permission only, and a saved template replaces the built-in one', async () => {
    const w = world();
    await expect(w.ws.saveTemplate(await w.scope('mentor-1'), 'CLASS_REMINDER', { name: 'Reminder', body: 'Class for {{studentName}}' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.saveTemplate(await w.scope('head-1'), 'CLASS_REMINDER', { name: 'Reminder', body: 'Class for {{studentName}}' })).rejects.toBeInstanceOf(ForbiddenException);
    const admin = await w.scope('template-admin');
    await expect(w.ws.saveTemplate(admin, 'CLASS_REMINDER', { name: 'Reminder', body: 'Hello {{parentName}}' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.ws.saveTemplate(admin, 'NOPE', { name: 'x', body: '{{studentName}}' })).rejects.toBeInstanceOf(NotFoundException);
    await w.ws.saveTemplate(admin, 'CLASS_REMINDER', { name: 'Short reminder', body: 'Class for {{studentName}} at {{classTime}}' });
    const { text } = await w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', {}, AFTER);
    expect(text).toBe('Class for Asha Menon at 3:00 PM to 4:00 PM');
    expect((await w.ws.listTemplates(await w.scope('mentor-1'))).canEdit).toBe(false);
    expect((await w.ws.listTemplates(admin)).canEdit).toBe(true);
    expect((await w.ws.listTemplates(admin)).templates.find((t) => t.key === 'CLASS_REMINDER')).toMatchObject({ name: 'Short reminder', customised: true });
  });
});

describe('after class: post-class activities', () => {
  it('lets the tutor of a class that has happened create activities, with their details', async () => {
    const w = world();
    await expect(w.ws.addActivity('u-meera', KEY, activity(1), at('2026-11-08', '10:00'))).rejects.toThrow('has not happened yet');
    const made = await w.ws.addActivity('u-meera', KEY, activity(1, { dueDate: '2026-11-12' }), AFTER);
    expect(made.created).toBe(1);
    const a = (await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after.activities[0];
    expect(a).toMatchObject({ title: 'Activity 1', typeLabel: 'Worksheet', topic: 'Tenses', dueDate: '2026-11-12', completion: 'PENDING', sharedAt: null, studentResponse: null });
    await expect(w.ws.addActivity('u-meera', KEY, { ...activity(2), title: ' ' }, AFTER)).rejects.toThrow('Give the activity a title');
    await expect(w.ws.addActivity('u-meera', KEY, activity(2, { type: 'OTHER' }), AFTER)).rejects.toThrow('Describe the other kind');
    await expect(w.ws.addActivity('u-rahul', KEY, activity(2), AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.addActivity('mentor-1', KEY, activity(2), AFTER)).rejects.toThrow('You do not have a tutor profile.');
  });

  it('keeps a removed activity on record, and withdraws the sharing of an activity that is changed', async () => {
    const w = world();
    const { activityId } = await w.ws.addActivity('u-meera', KEY, activity(1), AFTER);
    await w.ws.shareActivity('u-meera', activityId, AFTER);
    const changed = await w.ws.updateActivity('u-meera', activityId, activity(1, { instructions: 'A different worksheet.' }));
    expect(changed.sharingWithdrawn).toBe(true);
    expect(w.db.rows('mentoringClassActivity')[0]).toMatchObject({ sharedAt: null, instructions: 'A different worksheet.' });
    await w.ws.removeActivity('u-meera', activityId, AFTER);
    expect(w.db.rows('mentoringClassActivity')).toHaveLength(1);
    expect(w.db.rows('mentoringClassActivity')[0]).toMatchObject({ removedByUserId: 'u-meera' });
    expect((await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after.activities).toEqual([]);
    await expect(w.ws.shareActivity('u-meera', activityId, AFTER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records sharing as a named person and a time, once, and only by the tutor of the class', async () => {
    const w = world();
    const { activityId } = await w.ws.addActivity('u-meera', KEY, activity(1), AFTER);
    await expect(w.ws.shareActivity('u-rahul', activityId, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await w.ws.shareActivity('u-meera', activityId, at(MON, '17:05'));
    await expect(w.ws.shareActivity('u-meera', activityId, at(MON, '18:00'))).resolves.toMatchObject({ already: true, sharedAt: at(MON, '17:05').toISOString() });
    expect((await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after.activities[0]).toMatchObject({ sharedBy: 'Meera Thomas' });
  });

  it('records what the student did, by the tutor or by the Mentor, each only their own remarks', async () => {
    const w = world();
    const { activityId } = await w.ws.addActivity('u-meera', KEY, activity(1), AFTER);
    await w.ws.recordResponse('u-meera', 'TUTOR', activityId, { response: 'Did pages 1 and 2', completion: 'COMPLETED', tutorRemarks: 'Good effort' }, at(MON, '19:00'));
    await w.ws.recordResponse('mentor-1', 'MENTOR', activityId, { completion: 'COMPLETED', mentorRemarks: 'Well done' }, at(MON, '19:30'));
    expect((await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER)).after.activities[0]).toMatchObject({ studentResponse: 'Did pages 1 and 2', completion: 'COMPLETED', completionLabel: 'Completed', tutorRemarks: 'Good effort', mentorRemarks: 'Well done' });
    await expect(w.ws.recordResponse('u-meera', 'TUTOR', activityId, { completion: 'PENDING', mentorRemarks: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.recordResponse('mentor-1', 'MENTOR', activityId, { completion: 'PENDING', tutorRemarks: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.recordResponse('mentor-2', 'MENTOR', activityId, { completion: 'COMPLETED' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.recordResponse('u-rahul', 'TUTOR', activityId, { completion: 'COMPLETED' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.recordResponse('u-meera', 'TUTOR', activityId, { completion: 'MAYBE' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows at most twenty activities for a class', async () => {
    const w = world();
    for (let i = 1; i <= 20; i++) await w.ws.addActivity('u-meera', KEY, activity(i), AFTER);
    await expect(w.ws.addActivity('u-meera', KEY, activity(21), AFTER)).rejects.toThrow('at most 20');
  });
});

describe('after class: the voice recording', () => {
  it('stores a real recording in private storage under a random name, and keeps the uploaded name only to show', async () => {
    const w = world();
    const r = await w.ws.uploadVoice('u-meera', KEY, audio({ originalname: '../../etc/passwd.mp3' }), AFTER);
    const row = w.db.rows('mentoringClassAttachment')[0];
    expect(r).toMatchObject({ uploaded: true, shared: false });
    expect(row).toMatchObject({ kind: 'VOICE', fileName: 'passwd.mp3', mimeType: 'audio/mpeg', uploadedByUserId: 'u-meera', sharedAt: null, mentorVerifiedAt: null });
    expect(row.fileKey).toMatch(/^class-audio\/[A-Za-z0-9-]+\/[0-9a-f-]{36}\.mp3$/);
    expect(row.fileKey).not.toContain('passwd');
    expect(existsSync(join(w.storage.getStorageRoot(), row.fileKey))).toBe(true);
    expect(readFileSync(join(w.storage.getStorageRoot(), row.fileKey)).length).toBe(row.fileSize);
    expect(w.storage.getStorageRoot().startsWith(root)).toBe(true);
  });

  it('refuses an empty file, a file that is too big, a file that is not audio, one that lies about its type, and no file, and stores nothing', async () => {
    const w = world();
    const audioDir = join(root, 'class-audio');
    const count = () => (existsSync(audioDir) ? readdirSync(audioDir, { recursive: true }).length : 0);
    const before = count();
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ buffer: Buffer.alloc(0) }), AFTER)).rejects.toMatchObject({ response: { code: 'EMPTY_FILE' } });
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ buffer: Buffer.concat([mp3(), Buffer.alloc(MAX_AUDIO_BYTES)]) }), AFTER)).rejects.toMatchObject({ response: { code: 'FILE_TOO_LARGE' } });
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ buffer: Buffer.from('%PDF-1.4'.padEnd(64, ' ')), mimetype: 'audio/mpeg' }), AFTER)).rejects.toMatchObject({ response: { code: 'NOT_AUDIO' } });
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ mimetype: 'audio/wav' }), AFTER)).rejects.toMatchObject({ response: { code: 'FORGED_MIME_TYPE' } });
    await expect(w.ws.uploadVoice('u-meera', KEY, null, AFTER)).rejects.toBeInstanceOf(BadRequestException);
    expect(w.db.rows('mentoringClassAttachment')).toHaveLength(0);
    expect(count()).toBe(before); // nothing from these refused uploads
  });

  it('is only for the tutor of the class, after the class has happened', async () => {
    const w = world();
    await expect(w.ws.uploadVoice('u-rahul', KEY, audio(), AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.uploadVoice('u-meera', KEY, audio(), at('2026-11-08', '10:00'))).rejects.toThrow('has not happened yet');
    expect(w.db.rows('mentoringClassAttachment')).toHaveLength(0);
  });

  it('keeps uploaded, shared in the group and verified by the Mentor as three separate facts', async () => {
    const w = world();
    await expect(w.ws.confirmVoiceShared('u-meera', KEY, AFTER)).rejects.toThrow('Upload the voice recording first');
    await w.ws.uploadVoice('u-meera', KEY, audio(), AFTER);
    let v = (await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after.voice!;
    expect(v).toMatchObject({ sharedAt: null, mentorVerifiedAt: null, uploadedBy: 'Meera Thomas' });
    await w.ws.confirmVoiceShared('u-meera', KEY, at(MON, '17:10'));
    v = (await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after.voice!;
    expect(v).toMatchObject({ sharedAt: at(MON, '17:10').toISOString(), sharedBy: 'Meera Thomas', mentorVerifiedAt: null });
    await expect(w.ws.confirmVoiceShared('u-rahul', KEY, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a newer recording replaces the old one, which stays on record, and sharing has to be confirmed again', async () => {
    const w = world();
    await w.ws.uploadVoice('u-meera', KEY, audio(), AFTER);
    await w.ws.confirmVoiceShared('u-meera', KEY, AFTER);
    await w.ws.uploadVoice('u-meera', KEY, audio({ originalname: 'second.mp3' }), at(MON, '17:30'));
    const rows = w.db.rows('mentoringClassAttachment');
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => !r.supersededAt)).toHaveLength(1);
    const view = (await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after;
    expect(view.voice).toMatchObject({ fileName: 'second.mp3', sharedAt: null });
    expect(view.earlierVoice).toBe(1);
  });
});

describe('playing a recording', () => {
  it('is allowed for the tutor of the class and for staff who may see the student, and for nobody else', async () => {
    const w = world();
    await w.ws.uploadVoice('u-meera', KEY, audio(), AFTER);
    const id = w.db.rows('mentoringClassAttachment')[0].id;
    const play = async (user: string, staffScope: string | null) => w.ws.voiceStream(id, user, staffScope ? await w.scope(staffScope) : null);
    const own = await play('u-meera', null);
    expect(own).toMatchObject({ mimeType: 'audio/mpeg', fileName: 'my_voice.mp3' });
    const chunks: Buffer[] = [];
    for await (const c of own.stream!) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).equals(mp3())).toBe(true);
    await expect(play('mentor-1', 'mentor-1')).resolves.toMatchObject({ mimeType: 'audio/mpeg' });
    await expect(play('head-1', 'head-1')).resolves.toBeDefined();
    await expect(play('ceo-1', 'ceo-1')).resolves.toBeDefined();
    await expect(play('mentor-2', 'mentor-2')).rejects.toBeInstanceOf(NotFoundException);
    await expect(play('u-rahul', null)).rejects.toBeInstanceOf(NotFoundException);
    await expect(play('nobody', 'nobody')).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.ws.voiceStream('no-such-id', 'u-meera', null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('has no address that works without a signed-in user, and never refers to a path the caller can choose', () => {
    const controller = readFileSync(join(__dirname, 'mentoring-class-workspace.controller.ts'), 'utf8');
    expect(controller).toContain("'X-Content-Type-Options': 'nosniff'");
    expect(controller).toContain("'Cache-Control': 'private, no-cache, no-store, must-revalidate'");
    const proto = TutorClassWorkspaceController.prototype as any;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.audio)).toEqual(['tutor.portal.read']);
    const storage = readFileSync(join(__dirname, 'mentoring-storage.service.ts'), 'utf8');
    expect(storage).toContain('PATH_TRAVERSAL_DETECTED');
    expect(storage).not.toMatch(/originalname|fileName/);
  });
});

describe('strict verification', () => {
  const verify = (w: ReturnType<typeof world>, user = 'mentor-1') => w.classes.verify(w.session().id, {}, user, at(MON, '18:00'));

  it('refuses a class whose tutor update, voice recording or activities are missing, and says which', async () => {
    const w = world();
    await w.submit();
    await expect(verify(w)).rejects.toThrow('The tutor voice recording has not been uploaded. At least 3 post-class activities are needed. 0 created.');
    await w.ws.uploadVoice('u-meera', KEY, audio(), AFTER);
    await expect(verify(w)).rejects.toThrow('Sharing the voice recording in the group has not been confirmed.');
    await w.ws.confirmVoiceShared('u-meera', KEY, AFTER);
    for (const i of [1, 2]) await w.ws.addActivity('u-meera', KEY, activity(i), AFTER);
    await expect(verify(w)).rejects.toThrow('At least 3 post-class activities are needed. 2 created.');
    await w.ws.addActivity('u-meera', KEY, activity(3), AFTER);
    await expect(verify(w)).rejects.toThrow('Sharing at least 3 activities in the group has not been confirmed. 0 confirmed.');
    expect(w.session().status).toBe('AWAITING_MENTOR_VERIFICATION');
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
  });

  it('verifies once everything is in, consumes the class, and records the Mentor and the time', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    expect((await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER)).review).toMatchObject({ blockers: [], canVerify: true });
    await expect(verify(w)).resolves.toMatchObject({ status: 'VERIFIED', alreadyVerified: false });
    expect(w.session()).toMatchObject({ status: 'VERIFIED', verifiedByUserId: 'mentor-1', verifiedMinutes: 65 });
    expect(w.session().verifiedAt).toEqual(at(MON, '18:00'));
    expect(w.db.rows('mentoringClassAttachment')[0]).toMatchObject({ mentorVerifiedByUserId: 'mentor-1' });
    const review = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, at(MON, '18:10'))).review;
    expect(review).toMatchObject({ consumption: 'CONSUMED', minutes: { scheduled: 60, reported: 65, verified: 65, consumed: 65 } });
  });

  it('does not consume a class on tutor submission, a conducted class that is unverified, or the passing of time', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    const view = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, at(MON, '23:30'))).review;
    expect(view).toMatchObject({ consumption: 'NOT_CONSUMED', minutes: { scheduled: 60, reported: 65, verified: null, consumed: 0 } });
    expect(w.session().status).toBe('AWAITING_MENTOR_VERIFICATION');
    expect((await w.ws.mentorWorkspace(await w.scope('mentor-2'), KEY_B, at('2026-11-12', '09:00'))).review.consumption).toBe('NOT_CONSUMED'); // a class whose time passed
  });

  it('verifies twice without making a second record, a second event or moving the verification', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    await verify(w);
    const second = await w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '19:00'));
    expect(second).toMatchObject({ alreadyVerified: true, status: 'VERIFIED' });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(1);
    expect(w.events(w.session().id).filter((e) => e === 'MENTOR_VERIFIED')).toHaveLength(1);
    expect(w.session().verifiedAt).toEqual(at(MON, '18:00'));
  });

  it('is only for the assigned Mentor', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    await expect(verify(w, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(verify(w, 'u-meera')).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.session().status).toBe('AWAITING_MENTOR_VERIFICATION');
  });

  it('does not wait for the student: activities with no response or completion still verify, and a response written later changes nothing', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    expect((await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after.activities.every((a) => a.completion === 'PENDING' && a.studentResponse === null)).toBe(true);
    await verify(w);
    const id = w.db.rows('mentoringClassActivity')[0].id;
    await expect(w.ws.recordResponse('u-meera', 'TUTOR', id, { response: 'Done', completion: 'COMPLETED' }, at(MON, '20:00'))).resolves.toMatchObject({ completion: 'COMPLETED', classStatus: 'VERIFIED' });
    await expect(w.ws.recordResponse('mentor-1', 'MENTOR', id, { completion: 'NOT_COMPLETED', mentorRemarks: 'Late' })).resolves.toBeDefined();
    expect(w.session()).toMatchObject({ status: 'VERIFIED', verifiedMinutes: 65 });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(1);
  });

  it('closes the class to changes after verification, except what the student did', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    await verify(w);
    await expect(w.ws.addActivity('u-meera', KEY, activity(4), AFTER)).rejects.toThrow('is verified');
    await expect(w.ws.uploadVoice('u-meera', KEY, audio(), AFTER)).rejects.toThrow('is verified');
    await expect(w.ws.removeActivity('u-meera', w.db.rows('mentoringClassActivity')[0].id)).rejects.toThrow('is verified');
  });

  it('does not need the voice or the activities to confirm that a class was not conducted, and never consumes it', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', KEY, { conducted: false, notConductedReason: 'Student was ill' }, AFTER);
    await expect(verify(w)).resolves.toMatchObject({ status: 'NOT_CONDUCTED' });
    const review = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, at(MON, '18:10'))).review;
    expect(review).toMatchObject({ consumption: 'NOT_CONSUMED', minutes: { verified: 0, consumed: 0 } });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
  });
});

describe('exceptions', () => {
  const asHead = async (w: ReturnType<typeof world>, key = KEY, body: object = { approve: true, note: 'Voice not possible, recorded by phone' }) => w.ws.decideException(await w.scope('head-1'), key, body, at(MON, '17:30'));

  it('needs a reason to ask, and is asked only by the assigned Mentor', async () => {
    const w = world();
    await w.submit();
    await expect(w.ws.requestException('mentor-1', KEY, { reason: ' ' })).rejects.toThrow('Say why the exception is needed');
    await expect(w.ws.requestException('mentor-2', KEY, { reason: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.requestException('u-meera', KEY, { reason: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await w.ws.requestException('mentor-1', KEY, { reason: 'The tutor has no data connection to upload audio' }, AFTER);
    expect(w.session()).toMatchObject({ exceptionStatus: 'REQUESTED', exceptionRequestedByUserId: 'mentor-1', exceptionReason: 'The tutor has no data connection to upload audio' });
    await expect(w.ws.requestException('mentor-1', KEY, { reason: 'again' })).rejects.toThrow('already been requested');
  });

  it('a requested exception does not lift anything until the Head decides', async () => {
    const w = world();
    await w.submit();
    await w.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, AFTER);
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'))).rejects.toThrow('cannot be verified yet');
  });

  it('only the Mentoring Head can approve it, not a Mentor, not the tutor, and not a reader', async () => {
    const w = world();
    await w.submit();
    await w.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, AFTER);
    for (const user of ['mentor-1', 'mentor-2', 'ceo-1', 'nobody']) await expect(w.ws.decideException(await w.scope(user), KEY, { approve: true }, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.session().exceptionStatus).toBe('REQUESTED');
  });

  it('lets the Head approve, which allows verification without voice or activities, and audits who, why and when', async () => {
    const w = world();
    await w.submit();
    await w.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, AFTER);
    await expect(asHead(w)).resolves.toMatchObject({ status: 'APPROVED' });
    expect(w.session()).toMatchObject({ exceptionStatus: 'APPROVED', exceptionDecidedByUserId: 'head-1', exceptionDecisionNote: 'Voice not possible, recorded by phone' });
    expect(w.session().exceptionDecidedAt).toEqual(at(MON, '17:30'));
    const event = w.db.rows('mentoringClassSessionEvent').find((e) => e.kind === 'EXCEPTION_APPROVED')!;
    expect(event).toMatchObject({ actorUserId: 'head-1', reason: 'Voice not possible, recorded by phone' });
    expect(event.payload).toMatchObject({ requestedBy: 'mentor-1', requestReason: 'No data connection' });
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_CLASS_EXCEPTION_APPROVED')).toMatchObject({ recipientUserId: 'mentor-1' });
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'))).resolves.toMatchObject({ status: 'VERIFIED' });
    expect(w.session().verifiedByUserId).toBe('mentor-1'); // the Mentor still verifies; the Head only waives the conditions
  });

  it('never lifts the need for the class to be conducted and the tutor update to be in', async () => {
    const w = world();
    await w.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, AFTER);
    await asHead(w);
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'))).rejects.toThrow('Only a submitted update can be verified');
  });

  it('cannot be decided by the person who asked, even a Head', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', KEY_H, good, at(MON, '19:00'));
    await w.ws.requestException('head-1', KEY_H, { reason: 'No data connection' }, at(MON, '19:00'));
    await expect(w.ws.decideException(await w.scope('head-1'), KEY_H, { approve: true }, at(MON, '19:10'))).rejects.toThrow('You cannot decide an exception you asked for.');
    expect(w.session(KEY_H).exceptionStatus).toBe('REQUESTED');
  });

  it('a rejection needs a reason, keeps the conditions, and can be asked again', async () => {
    const w = world();
    await w.submit();
    await w.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, AFTER);
    await expect(asHead(w, KEY, { approve: false })).rejects.toThrow('Say why the exception is rejected');
    await asHead(w, KEY, { approve: false, note: 'The voice can be recorded at any time' });
    expect(w.session()).toMatchObject({ exceptionStatus: 'REJECTED', exceptionDecidedByUserId: 'head-1' });
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'))).rejects.toThrow('cannot be verified yet');
    await expect(w.ws.requestException('mentor-1', KEY, { reason: 'Still no connection' }, at(MON, '18:30'))).resolves.toMatchObject({ status: 'REQUESTED' });
    await expect(w.ws.decideException(await w.scope('head-1'), KEY, { approve: 'yes' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('needs something waiting for a decision', async () => {
    const w = world();
    await w.submit();
    await expect(asHead(w)).rejects.toThrow('no exception waiting');
  });
});

describe('cancelling a class', () => {
  it('needs a reason, records who and when, keeps the scheduled slot, tells the tutor and withdraws a reminder not yet sent', async () => {
    const w = world();
    await w.classes.prepareReminder(KEY, 'mentor-1');
    await expect(w.classes.cancel(KEY, '  ', 'mentor-1', at(MON, '09:00'))).rejects.toThrow('Say why the class is being cancelled.');
    expect(w.db.rows('mentoringClassSession')[0].status).toBe('SCHEDULED');
    await expect(w.classes.cancel(KEY, 'The tutor is ill', 'mentor-1', at(MON, '09:00'))).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(w.session()).toMatchObject({ status: 'CANCELLED', cancelledByUserId: 'mentor-1', cancelReason: 'The tutor is ill', startMinute: 900, endMinute: 960 });
    expect(w.session().cancelledAt).toEqual(at(MON, '09:00'));
    expect(w.session().date).toEqual(day(MON));
    expect(w.db.rows('mentoringReminder').map((r) => r.status)).toEqual(['CANCELLED']);
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_CLASS_CANCELLED')).toMatchObject({ recipientUserId: 'u-meera' });
    expect(w.db.rows('mentoringClassSessionEvent').find((e) => e.kind === 'CANCELLED')).toMatchObject({ actorUserId: 'mentor-1', reason: 'The tutor is ill', fromStatus: 'SCHEDULED', toStatus: 'CANCELLED' });
  });

  it('shows the class as cancelled everywhere, keeps it on the schedule as history, and never consumes it', async () => {
    const w = world();
    await w.classes.cancel(KEY, 'Holiday declared', 'mentor-1', at(MON, '09:00'));
    const daily = await w.classes.daily('act-A', MON, {}, await w.scope('mentor-1'), at(MON, '10:00'));
    expect(daily.classes[0]).toMatchObject({ state: 'CANCELLED', stateLabel: 'Cancelled', status: 'CANCELLED', consumption: 'NOT_CONSUMED', cancelled: { reason: 'Holiday declared' }, startMinute: 900 });
    expect((await w.classes.tutorClasses('u-meera', MON, MON, at(MON, '10:00')))[0]).toMatchObject({ state: 'CANCELLED', consumption: 'NOT_CONSUMED' });
    const view = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, at(MON, '10:00'))).review;
    expect(view.cancelled).toMatchObject({ reason: 'Holiday declared', by: 'Mira Staff' });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
  });

  it('cannot be updated, reminded, verified, rescheduled or cancelled again, and is only for the assigned Mentor', async () => {
    const w = world();
    await expect(w.classes.cancel(KEY, 'x', 'mentor-2', AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.classes.cancel(KEY, 'x', 'u-meera', AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await w.classes.cancel(KEY, 'Holiday', 'mentor-1', at(MON, '09:00'));
    await expect(w.classes.cancel(KEY, 'again', 'mentor-1', AFTER)).rejects.toThrow('already cancelled');
    await expect(w.submit()).rejects.toThrow('was cancelled');
    await expect(w.classes.reschedule(KEY, { newDate: '2026-11-10', newStart: '15:00', newEnd: '16:00', reason: 'x' }, 'mentor-1', AFTER)).rejects.toThrow('Only a class that has not been reported yet');
    await expect(w.classes.sendReminder(KEY, 'mentor-1', AFTER)).rejects.toThrow('only for a class that has not been reported');
    await expect(w.ws.addActivity('u-meera', KEY, activity(1), AFTER)).rejects.toThrow('was cancelled');
    await expect(w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { meetLink: 'https://meet.google.com/a-b-c' }, AFTER)).rejects.toThrow('was cancelled');
  });

  it('cannot cancel a class that has been reported', async () => {
    const w = world();
    await w.submit();
    await expect(w.classes.cancel(KEY, 'x', 'mentor-1', AFTER)).rejects.toThrow('Only a class that has not been reported yet can be cancelled');
  });
});

describe('rescheduling and the workspace', () => {
  it('keeps the original slot and history, and the workspace follows the class to its new time', async () => {
    const w = world();
    await w.classes.reschedule(KEY, { newDate: MON, newStart: '18:00', newEnd: '19:00', reason: 'Student has an exam' }, 'mentor-1', at(MON, '10:00'));
    const s = w.session();
    expect(s).toMatchObject({ status: 'RESCHEDULED', startMinute: 1080, originalStartMinute: 900 });
    expect(s.originalDate).toEqual(day(MON));
    const view = await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, at(MON, '10:30'));
    expect(view.class).toMatchObject({ key: KEY, startMinute: 1080, status: 'RESCHEDULED' });
    expect(view.before.targetAt).toBe(at(MON, '17:15').toISOString());
    expect(w.db.rows('mentoringTutorAssignmentOverride')[0]).toMatchObject({ originalStartMinute: 900, newStartMinute: 1080, reason: 'Student has an exam' });
    await w.ws.addActivity('u-meera', KEY, activity(1), at(MON, '18:30'));
    expect(w.db.rows('mentoringClassActivity')[0].sessionId).toBe(s.id); // still the one class row
  });
});

describe('one class record for the student, the tutor and the Mentor', () => {
  it('shows the same consumed state in the student timetable, the tutor classes and the Mentor list, from one stored row', async () => {
    const w = world();
    const timetables = new MentoringTimetableService(w.db as any, w.access, new MentoringTutorService(w.db as any, new MentoringHistoryService({ recordInTx: jest.fn() } as any)));
    const student = async () => (await timetables.timetable('act-A', { view: 'weekly', from: MON }, await w.scope('mentor-1'))).events[0];
    const tutor = async (now: Date) => (await w.classes.tutorClasses('u-meera', MON, MON, now))[0];
    const mentor = async (now: Date) => (await w.classes.daily('act-A', MON, {}, await w.scope('mentor-1'), now)).classes[0];

    expect(await student()).toMatchObject({ consumption: 'NOT_CONSUMED', classRecordStatus: null });
    await w.submit();
    await w.prepare();
    expect(await student()).toMatchObject({ consumption: 'NOT_CONSUMED', classRecordStatus: 'AWAITING_MENTOR_VERIFICATION' });
    expect(await tutor(AFTER)).toMatchObject({ consumption: 'NOT_CONSUMED' });

    await w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    const now = at(MON, '18:30');
    expect(await student()).toMatchObject({ consumption: 'CONSUMED', classRecordStatus: 'VERIFIED', sessionId: w.session().id });
    expect(await tutor(now)).toMatchObject({ consumption: 'CONSUMED', sessionId: w.session().id });
    expect(await mentor(now)).toMatchObject({ consumption: 'CONSUMED', sessionId: w.session().id });
    expect(w.db.rows('mentoringClassSession')).toHaveLength(1);
  });

  it('shows a cancelled class as not consumed in the student timetable too', async () => {
    const w = world();
    const timetables = new MentoringTimetableService(w.db as any, w.access, new MentoringTutorService(w.db as any, new MentoringHistoryService({ recordInTx: jest.fn() } as any)));
    await w.classes.cancel(KEY, 'Holiday', 'mentor-1', at(MON, '09:00'));
    expect((await timetables.timetable('act-A', { view: 'weekly', from: MON }, await w.scope('mentor-1'))).events[0]).toMatchObject({ consumption: 'NOT_CONSUMED', classRecordStatus: 'CANCELLED' });
  });
});

describe('the daily class list', () => {
  it('gives the Head every class and a Mentor only their own, filtered and paged in the query', async () => {
    const w = world();
    const head = await w.scope('head-1');
    expect((await w.ws.list(await w.scope('mentor-1'), { date: MON }, AFTER)).rows.map((r) => r.studentName)).toEqual(['Asha Menon']);
    expect((await w.ws.list(await w.scope('mentor-2'), { date: MON }, AFTER)).rows.map((r) => r.studentName)).toEqual(['Basil Nair']);
    const all = await w.ws.list(head, { date: MON }, AFTER);
    expect(all.rows.map((r) => [r.startMinute, r.studentName, r.studentId, r.mentorName, r.tutorName])).toEqual([[900, 'Asha Menon', 'STU-0001', 'Mira Staff', 'Meera Thomas'], [900, 'Basil Nair', 'STU-0002', 'Mohan Staff', 'Rahul Nair'], [1020, 'Hema Pillai', 'STU-0003', 'Hari Staff', 'Meera Thomas']]);
    expect((await w.ws.list(head, { date: MON, mentorUserId: 'mentor-2' }, AFTER)).rows.map((r) => r.studentName)).toEqual(['Basil Nair']);
    expect((await w.ws.list(head, { date: MON, studentQuery: 'stu-0003' }, AFTER)).rows.map((r) => r.studentName)).toEqual(['Hema Pillai']);
    expect((await w.ws.list(head, { date: MON, tutorProfileId: 'tp-rahul' }, AFTER)).total).toBe(1);
    expect((await w.ws.list(head, { date: MON, subjectId: 'sub-xx' }, AFTER)).total).toBe(0);
    expect((await w.ws.list(head, { date: MON, pageSize: 2 }, AFTER))).toMatchObject({ total: 3, pages: 2 });
    expect((await w.ws.list(head, { date: '2026-11-10' }, AFTER)).total).toBe(0);
    await expect(w.ws.list(head, { date: 'soon' }, AFTER)).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.ws.list(await w.scope('nobody'), {}, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await w.ws.list(await w.scope('mentor-1'), { date: MON, mentorUserId: 'mentor-2' }, AFTER)).total).toBe(0); // a filter never reaches another Mentor
  });

  it('shows the state of each class: scheduled, awaiting update, awaiting verification, verified, cancelled', async () => {
    const w = world();
    await w.submit();
    await w.classes.cancel(KEY_B, 'Holiday', 'mentor-2', at(MON, '09:00'));
    const rows = (await w.ws.list(await w.scope('head-1'), { date: MON }, AFTER)).rows;
    expect(rows.map((r) => [r.studentName, r.state])).toEqual([['Asha Menon', 'AWAITING_MENTOR_VERIFICATION'], ['Basil Nair', 'CANCELLED'], ['Hema Pillai', 'SCHEDULED']]);
  });
});

describe('the routes', () => {
  it('every Mentor change needs the Mentor work permission, the Head decision needs the exception permission, and templates need their own', () => {
    const proto = MentoringClassWorkspaceController.prototype as any;
    for (const name of ['share', 'cancel', 'requestException', 'copied', 'confirm', 'response']) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['mentoring.stage.work']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.decideException)).toEqual(['mentoring.exception.authorize']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.saveTemplate)).toEqual(['mentoring.template.manage']);
    for (const name of ['list', 'templates', 'audio', 'one']) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toBeUndefined();
  });

  it('every tutor route needs the tutor portal permission and cannot name a tutor', () => {
    const proto = TutorClassWorkspaceController.prototype as any;
    const names = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    expect(names.length).toBeGreaterThanOrEqual(12);
    for (const name of names) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['tutor.portal.read']);
    const source = readFileSync(join(__dirname, 'mentoring-class-workspace.controller.ts'), 'utf8');
    const tutorPart = source.slice(source.indexOf('class TutorClassWorkspaceController'));
    expect(tutorPart).not.toMatch(/tutorProfileId|tutorId|tutorUserId/);
  });

  it('has no WhatsApp integration, nothing that says a message was delivered, and no permission grant', () => {
    for (const file of ['mentoring-class-workspace.service.ts', 'mentoring-class-workspace.controller.ts', 'class-workspace.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      expect(source).not.toMatch(/api\.whatsapp|graph\.facebook|twilio|wa\.me|whatsapp-web|sendMessage\(/i);
      expect(source).not.toMatch(/\b(deliveredAt|readAt)\b/);
      expect(source).not.toMatch(/rolePermission|permission\.create|INSERT INTO/i);
    }
  });
});

// ─── Remediation of the Stage D review ───────────────────────────────────────────────────────────────────────────
const readAll = async (stream: NodeJS.ReadableStream | null) => {
  const chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
};
/** A response that records what the controller sent, with a real writable body. */
function fakeRes() {
  const sent: { status: number; headers: Record<string, string>; body: Buffer[] } = { status: 200, headers: {}, body: [] };
  const res: any = new Writable({ write(chunk, _enc, cb) { sent.body.push(Buffer.from(chunk)); cb(); } });
  res.status = (s: number) => { sent.status = s; return res; };
  res.set = (h: Record<string, string>) => { Object.assign(sent.headers, h); return res; };
  return { res, sent, done: () => new Promise<void>((r) => { if (res.writableFinished) r(); else res.on('finish', () => r()); }) };
}

describe('C1: the exception contract (null means no exception)', () => {
  it('sends null, never a made up value, for a class nobody asked an exception for, in every view the web reads', async () => {
    const w = world();
    await w.submit();
    const mentor = await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER);
    expect(mentor.review.exception.status).toBeNull();
    expect((await w.classes.daily('act-A', MON, {}, await w.scope('mentor-1'), AFTER)).classes[0].exception.status).toBeNull();
    expect((await w.ws.list(await w.scope('head-1'), { date: MON }, AFTER)).rows.every((r) => r.exception.status === null)).toBe(true);
  });

  it('sends the decision words once there is one, and the web contract names exactly those words', async () => {
    const w = world();
    await w.submit();
    await w.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, AFTER);
    expect((await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER)).review.exception.status).toBe('REQUESTED');
    const web = readFileSync(join(__dirname, '../../../../web/src/app/(app)/mentoring/workspace-view.ts'), 'utf8');
    expect(web).toMatch(/interface ExceptionInfo { status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | null;/);
  });
});

describe('13: an exception stops applying when the update it was decided on changes', () => {
  const returnIt = (w: ReturnType<typeof world>) => w.classes.returnToTutor(w.session().id, 'Please correct the end time', 'CORRECTION', 'mentor-1', at(MON, '17:30'));
  const approve = async (w: ReturnType<typeof world>) => {
    await w.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, at(MON, '17:35'));
    await w.ws.decideException(await w.scope('head-1'), KEY, { approve: true, note: 'Agreed' }, at(MON, '17:40'));
  };

  it('clears an approved exception when the Mentor returns the update, keeps the whole history, and needs a new decision', async () => {
    const w = world();
    await w.submit();
    await approve(w);
    expect(w.session().exceptionStatus).toBe('APPROVED');
    await returnIt(w);
    expect(w.session()).toMatchObject({ exceptionStatus: null, exceptionRequestedByUserId: null, exceptionReason: null, exceptionDecidedByUserId: null, exceptionDecisionNote: null });
    const kinds = w.events(w.session().id);
    expect(kinds).toEqual(expect.arrayContaining(['EXCEPTION_REQUESTED', 'EXCEPTION_APPROVED', 'EXCEPTION_INVALIDATED']));
    const event = w.db.rows('mentoringClassSessionEvent').find((e) => e.kind === 'EXCEPTION_INVALIDATED')!;
    expect(event.payload).toMatchObject({ was: 'APPROVED', requestedBy: 'mentor-1', requestReason: 'No data connection', decidedBy: 'head-1', decisionNote: 'Agreed' });
    expect(w.db.rows('mentoringClassSessionEvent').find((e) => e.kind === 'EXCEPTION_APPROVED')).toMatchObject({ actorUserId: 'head-1' }); // the approval itself is still on record
    // Back with the tutor and resubmitted, the voice and activities are needed again until the Head decides a new request.
    await w.submit(KEY, 'u-meera');
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:30'))).rejects.toThrow('cannot be verified yet');
    await w.ws.requestException('mentor-1', KEY, { reason: 'Still no connection' }, at(MON, '18:35'));
    await w.ws.decideException(await w.scope('head-1'), KEY, { approve: true }, at(MON, '18:40'));
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:45'))).resolves.toMatchObject({ status: 'VERIFIED' });
  });

  it('also withdraws a request that was still waiting, and does nothing when there was no exception', async () => {
    const w = world();
    await w.submit();
    await returnIt(w);
    expect(w.events(w.session().id)).not.toContain('EXCEPTION_INVALIDATED');
    await w.submit();
    await w.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, at(MON, '17:35'));
    await returnIt(w);
    expect(w.session().exceptionStatus).toBeNull();
    expect(w.events(w.session().id)).toContain('EXCEPTION_INVALIDATED');
  });

  it('clears an approval when the corrected update changes whether or when the class took place, and keeps it when it does not', async () => {
    const same = world();
    await same.submit();
    await returnIt(same);
    await approve(same);
    await same.classes.tutorSubmitUpdate('u-meera', KEY, good, at(MON, '18:00')); // the same facts again
    expect(same.session().exceptionStatus).toBe('APPROVED');

    const changed = world();
    await changed.submit();
    await returnIt(changed);
    await approve(changed);
    await changed.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, actualEnd: '16:30' }, at(MON, '18:00'));
    expect(changed.session()).toMatchObject({ exceptionStatus: null, actualEndMinute: 990 });
    expect(changed.db.rows('mentoringClassSessionEvent').find((e) => e.kind === 'EXCEPTION_INVALIDATED')).toMatchObject({ actorUserId: 'u-meera' });
  });

  it('can be requested, rejected and decided again in the same way after an invalidation', async () => {
    const w = world();
    await w.submit();
    await approve(w);
    await returnIt(w);
    await w.submit();
    await w.ws.requestException('mentor-1', KEY, { reason: 'Second ask' }, at(MON, '19:00'));
    await w.ws.decideException(await w.scope('head-1'), KEY, { approve: false, note: 'Record the voice instead' }, at(MON, '19:05'));
    expect(w.session().exceptionStatus).toBe('REJECTED');
    expect(w.events(w.session().id).filter((e) => e === 'EXCEPTION_REQUESTED')).toHaveLength(2);
  });
});

describe('H1: playback ranges', () => {
  const upload = async (w: ReturnType<typeof world>) => {
    await w.ws.uploadVoice('u-meera', KEY, audio(), AFTER);
    return w.db.rows('mentoringClassAttachment')[0].id as string;
  };
  const file = mp3();

  it('sends the whole file with 200 when no range is asked for, and ignores a range it does not understand', async () => {
    const w = world();
    const id = await upload(w);
    for (const header of [undefined, 'items=0-5', 'bytes=0-5,10-15', 'bytes=abc', '']) {
      const r = await w.ws.voiceStream(id, 'u-meera', null, header);
      expect(r).toMatchObject({ status: 200, start: 0, end: file.length - 1, size: file.length });
      expect((await readAll(r.stream)).equals(file)).toBe(true);
    }
  });

  it('sends only the part asked for with 206: from a start, a closed range, a suffix and an end beyond the file', async () => {
    const w = world();
    const id = await upload(w);
    const part = async (header: string) => { const r = await w.ws.voiceStream(id, 'u-meera', null, header); return { r, bytes: await readAll(r.stream) }; };
    let p = await part('bytes=0-9');
    expect(p.r).toMatchObject({ status: 206, start: 0, end: 9 });
    expect(p.bytes.equals(file.subarray(0, 10))).toBe(true);
    p = await part('bytes=100-');
    expect(p.r).toMatchObject({ status: 206, start: 100, end: file.length - 1 });
    expect(p.bytes.equals(file.subarray(100))).toBe(true);
    p = await part('bytes=-20');
    expect(p.r).toMatchObject({ status: 206, start: file.length - 20, end: file.length - 1 });
    expect(p.bytes.equals(file.subarray(file.length - 20))).toBe(true);
    p = await part('bytes=150-99999');
    expect(p.r).toMatchObject({ status: 206, start: 150, end: file.length - 1 });
    expect(p.bytes.length).toBe(file.length - 150);
  });

  it('answers 416 for a range that starts past the end, without opening the file', async () => {
    const w = world();
    const id = await upload(w);
    for (const header of [`bytes=${file.length}-`, 'bytes=99999-100000', 'bytes=-0']) {
      const r = await w.ws.voiceStream(id, 'u-meera', null, header);
      expect(r).toMatchObject({ status: 416, stream: null, size: file.length });
    }
  });

  it('checks who is asking before it looks at the range, so a refused caller learns nothing, with or without a range', async () => {
    const w = world();
    const id = await upload(w);
    for (const header of [undefined, 'bytes=0-9', 'bytes=99999-']) {
      await expect(w.ws.voiceStream(id, 'u-rahul', null, header)).rejects.toBeInstanceOf(NotFoundException);
      await expect(w.ws.voiceStream(id, 'mentor-2', await w.scope('mentor-2'), header)).rejects.toBeInstanceOf(NotFoundException);
      await expect(w.ws.voiceStream(id, 'nobody', await w.scope('nobody'), header)).rejects.toBeInstanceOf(NotFoundException);
      await expect(w.ws.voiceStream('no-such-id', 'u-meera', null, header)).rejects.toBeInstanceOf(NotFoundException);
    }
    for (const [user, scope] of [['mentor-1', 'mentor-1'], ['head-1', 'head-1'], ['ceo-1', 'ceo-1']] as const) {
      await expect(w.ws.voiceStream(id, user, await w.scope(scope), 'bytes=0-4')).resolves.toMatchObject({ status: 206 });
    }
  });

  it('sets 206 with Content-Range and Accept-Ranges, 416 with the size, and 200 with Accept-Ranges, on both the tutor and the Mentor route', async () => {
    const w = world();
    const id = await upload(w);
    const tutor = new TutorClassWorkspaceController(w.ws);
    const mentor = new MentoringClassWorkspaceController(w.ws, w.classes, w.access);

    let out = fakeRes();
    await tutor.audio(id, out.res, { id: 'u-meera' } as any, 'bytes=0-9');
    await out.done();
    expect(out.sent.status).toBe(206);
    expect(out.sent.headers).toMatchObject({ 'Content-Range': `bytes 0-9/${file.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': '10', 'Content-Type': 'audio/mpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-cache, no-store, must-revalidate' });
    expect(Buffer.concat(out.sent.body).equals(file.subarray(0, 10))).toBe(true);

    out = fakeRes();
    await mentor.audio(id, out.res, { id: 'mentor-1' } as any, 'bytes=99999-');
    await out.done();
    expect(out.sent.status).toBe(416);
    expect(out.sent.headers).toMatchObject({ 'Content-Range': `bytes */${file.length}`, 'Accept-Ranges': 'bytes' });
    expect(Buffer.concat(out.sent.body)).toHaveLength(0);

    out = fakeRes();
    await mentor.audio(id, out.res, { id: 'mentor-1' } as any, undefined);
    await out.done();
    expect(out.sent.status).toBe(200);
    expect(out.sent.headers).toMatchObject({ 'Accept-Ranges': 'bytes', 'Content-Length': String(file.length) });
    expect(out.sent.headers['Content-Range']).toBeUndefined();

    await expect(tutor.audio(id, fakeRes().res, { id: 'u-rahul' } as any, 'bytes=0-9')).rejects.toBeInstanceOf(NotFoundException);
    await expect(mentor.audio(id, fakeRes().res, { id: 'mentor-2' } as any, 'bytes=0-9')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('7: what a message may state', () => {
  it('ignores any value a caller sends for the student, tutor, date, time or subject, and states the recorded ones', async () => {
    const w = world();
    subjectLink(w, 'https://meet.google.com/aaa-bbbb-ccc');
    const made = await w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { studentName: 'Somebody Else', tutorName: 'Not The Tutor', classDate: 'Never', classTime: '1:00 AM', subject: 'Maths', meetLink: 'https://meet.google.com/forged-link' }, at(MON, '14:00'));
    expect(made.text).toContain('Asha Menon');
    expect(made.text).toContain('Meera Thomas');
    expect(made.text).toContain('3:00 PM to 4:00 PM');
    for (const forged of ['Somebody Else', 'Not The Tutor', 'Never', '1:00 AM', 'Maths']) expect(made.text).not.toContain(forged);
    expect(made.text).toContain('https://meet.google.com/aaa-bbbb-ccc');
    expect(made.text).not.toContain('forged-link');
  });

  it('does not let a caller fill a value the class record leaves out', async () => {
    const w = world();
    await expect(w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_UPDATE', { duration: '9 h', topicsCovered: 'Invented', practiceWork: 'Invented' }, AFTER)).rejects.toThrow();
    expect(w.db.rows('mentoringMessageShare')).toHaveLength(0);
  });

  it('ignores a typed Meet link of any kind, so the message always states the subject link', async () => {
    const w = world();
    subjectLink(w, 'https://meet.google.com/ok-okok-ok');
    for (const link of ['http://insecure.example/x', 'javascript:alert(1)', 'meet.google.com/abc', 'ftp://x.example', 'https://meet.google.com/forged-link']) {
      const made = await w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { meetLink: link }, at(MON, '14:00'));
      expect(made.text).toContain('Meet link: https://meet.google.com/ok-okok-ok');
      expect(made.text).not.toContain(link);
    }
  });
});

describe('8: an audio file whose record could not be saved is removed', () => {
  const count = () => (existsSync(join(root, 'class-audio')) ? (readdirSync(join(root, 'class-audio'), { recursive: true }) as string[]).filter((f) => /\.\w{2,5}$/.test(f)).length : 0);

  it('deletes the file when the attachment record is refused, and leaves nothing that refers to it', async () => {
    const w = world();
    const before = count();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = FakeDb.prototype.model;
    const spy = jest.spyOn(FakeDb.prototype, 'model').mockImplementation(function (this: FakeDb, table: string) {
      const m = original.call(this, table);
      return (table === 'mentoringClassAttachment' ? { ...m, create: jest.fn(() => Promise.reject(new Error('database refused'))) } : m) as typeof m;
    });
    await expect(w.ws.uploadVoice('u-meera', KEY, audio(), AFTER)).rejects.toThrow('database refused');
    spy.mockRestore();
    expect(count()).toBe(before);
    expect(w.db.rows('mentoringClassAttachment')).toHaveLength(0);
  });

  it('deletes the file when a later step of the same save fails, and keeps the earlier recording', async () => {
    const w = world();
    await w.ws.uploadVoice('u-meera', KEY, audio(), AFTER);
    const before = count();
    const spy = jest.spyOn(w.classes, 'logEvent').mockRejectedValueOnce(new Error('event refused'));
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ originalname: 'second.mp3' }), at(MON, '17:30'))).rejects.toThrow('event refused');
    spy.mockRestore();
    expect(count()).toBe(before);
    expect(existsSync(join(w.storage.getStorageRoot(), w.db.rows('mentoringClassAttachment')[0].fileKey))).toBe(true);
  });

  it('only ever removes a file inside the store', async () => {
    const w = world();
    await expect(w.storage.deleteQuietly('../../outside.txt')).resolves.toBeUndefined();
    await expect(w.storage.deleteQuietly('class-audio/does/not/exist.mp3')).resolves.toBeUndefined();
  });
});

describe('9: video is not a voice recording', () => {
  const box = (type: string, body: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32BE(8 + body.length, 0); h.write(type, 4, 'latin1'); return Buffer.concat([h, body]); };
  const hdlr = (handler: string) => box('hdlr', Buffer.concat([Buffer.alloc(8), Buffer.from(handler, 'latin1'), Buffer.alloc(12)]));
  const mp4 = (handler: string) => Buffer.concat([box('ftyp', Buffer.from('M4A \u0000\u0000\u0000\u0000isom', 'latin1')), box('moov', hdlr(handler)), box('mdat', Buffer.alloc(300, 1))]);
  const webm = (codec: string) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(16), Buffer.from(codec, 'latin1'), Buffer.alloc(300, 2)]);
  const ogg = (marker: string) => Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(20), Buffer.from(marker, 'latin1'), Buffer.alloc(300, 3)]);

  it('refuses a video MIME type whatever the content, and a video container whose type says audio', async () => {
    const w = world();
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ mimetype: 'video/mp4' }), AFTER)).rejects.toMatchObject({ response: { code: 'VIDEO_NOT_ALLOWED' } });
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ mimetype: 'video/webm', buffer: webm('A_OPUS') }), AFTER)).rejects.toMatchObject({ response: { code: 'VIDEO_NOT_ALLOWED' } });
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ mimetype: 'audio/mp4', buffer: mp4('vide'), originalname: 'clip.m4a' }), AFTER)).rejects.toMatchObject({ response: { code: 'VIDEO_NOT_ALLOWED' } });
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ mimetype: 'audio/webm', buffer: webm('V_VP9'), originalname: 'clip.webm' }), AFTER)).rejects.toMatchObject({ response: { code: 'VIDEO_NOT_ALLOWED' } });
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ mimetype: 'audio/ogg', buffer: ogg('\u0080theora'), originalname: 'clip.ogg' }), AFTER)).rejects.toMatchObject({ response: { code: 'VIDEO_NOT_ALLOWED' } });
    expect(w.db.rows('mentoringClassAttachment')).toHaveLength(0);
  });

  it('still accepts real audio in the same containers', async () => {
    const w = world();
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ mimetype: 'audio/mp4', buffer: mp4('soun'), originalname: 'voice.m4a' }), AFTER)).resolves.toMatchObject({ uploaded: true });
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ mimetype: 'audio/webm', buffer: webm('A_OPUS'), originalname: 'voice.webm' }), at(MON, '17:10'))).resolves.toMatchObject({ uploaded: true });
    await expect(w.ws.uploadVoice('u-meera', KEY, audio({ mimetype: 'audio/ogg', buffer: ogg('OpusHead'), originalname: 'voice.ogg' }), at(MON, '17:20'))).resolves.toMatchObject({ uploaded: true });
  });
});

describe('11: a class verified for no minutes is not consumed and earns nothing', () => {
  it('refuses to verify a conducted class for 0 minutes, and points to the not conducted route', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    await expect(w.classes.verify(w.session().id, { verifiedMinutes: 0, reason: 'Checked' }, 'mentor-1', at(MON, '18:00'))).rejects.toThrow('more than 0 verified minutes');
    expect(w.session().status).toBe('AWAITING_MENTOR_VERIFICATION');
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
  });

  it('shows a class corrected to 0 minutes as not consumed in every view, with no payable record left behind', async () => {
    const w = world();
    const timetables = new MentoringTimetableService(w.db as any, w.access, new MentoringTutorService(w.db as any, new MentoringHistoryService({ recordInTx: jest.fn() } as any)));
    await w.submit();
    await w.prepare();
    await w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    expect((await w.classes.tutorClasses('u-meera', MON, MON, at(MON, '18:30')))[0].consumption).toBe('CONSUMED');
    await w.classes.adjustVerified(w.session().id, { minutes: 0, reason: 'The class was found not to have taken place' }, 'mentor-1');
    const now = at(MON, '19:00');
    expect(w.session()).toMatchObject({ status: 'VERIFIED', verifiedMinutes: 0 });
    expect((await w.classes.tutorClasses('u-meera', MON, MON, now))[0].consumption).toBe('NOT_CONSUMED');
    expect((await w.classes.daily('act-A', MON, {}, await w.scope('mentor-1'), now)).classes[0].consumption).toBe('NOT_CONSUMED');
    expect((await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, now)).review).toMatchObject({ consumption: 'NOT_CONSUMED', minutes: { verified: 0, consumed: 0 } });
    expect((await timetables.timetable('act-A', { view: 'weekly', from: MON }, await w.scope('mentor-1'))).events[0]).toMatchObject({ consumption: 'NOT_CONSUMED' });
    expect(w.db.rows('tutorClassRecord').filter((r) => (r.workedMinutes ?? 0) > 0 && r.status !== 'CANCELLED')).toEqual([]);
  });
});

describe('12: two verifications at once make one record and one payment', () => {
  it('locks the class before it reads it, so the second verification waits and sees the first', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    w.db.$executeRaw.mockClear();
    const results = await Promise.all([w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00')), w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'))]);
    expect(results.filter((r) => r.alreadyVerified)).toHaveLength(1);
    expect(results.filter((r) => !r.alreadyVerified)).toHaveLength(1);
    expect(w.db.rows('tutorClassRecord')).toHaveLength(1);
    expect(w.events(w.session().id).filter((e) => e === 'MENTOR_VERIFIED')).toHaveLength(1);
    expect(w.events(w.session().id).filter((e) => e === 'COMPENSATION_RECORD_CREATED')).toHaveLength(1);
    expect(w.session().tutorClassRecordId).toBe(w.db.rows('tutorClassRecord')[0].id);
    const locks = w.db.$executeRaw.mock.calls.map((c: any[]) => (c[0] as string[]).join('?')).filter((s: string) => /mentoring_class_sessions/.test(s) && /FOR UPDATE/.test(s));
    expect(locks.length).toBeGreaterThanOrEqual(2);
  });

  it('is backed by a unique constraint on the class and tutor in the real schema, and the record is looked up first', () => {
    const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    const model = schema.slice(schema.indexOf('model TutorClassRecord'), schema.indexOf('@@map("tutor_class_records")'));
    expect(model).toContain('@@unique([sessionId, tutorId])');
    expect(readFileSync(join(__dirname, 'mentoring-class.service.ts'), 'utf8')).toContain('sessionId_tutorId');
  });

  it('keeps pay unchanged when an already verified class is verified again, even after a correction', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    await w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    await w.classes.adjustVerified(w.session().id, { minutes: 50, reason: 'Ended early' }, 'mentor-1');
    await w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '19:00'));
    expect(w.db.rows('tutorClassRecord')).toHaveLength(1);
    expect(w.session().verifiedMinutes).toBe(50);
  });
});

describe('H2: the daily class list opens exactly what a card counted', () => {
  const NOV = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;
  async function scene() {
    const w = world();
    await w.submit(KEY, 'u-meera'); // A: conducted, waiting for the Mentor, nothing else done
    await w.classes.cancel(KEY_B, 'Holiday', 'mentor-2', at(MON, '09:00')); // B: cancelled; H stays scheduled
    return w;
  }
  const keys = async (w: ReturnType<typeof world>, scopeUser: string, f: object, now = AFTER) => (await w.ws.list(await w.scope(scopeUser), f, now)).rows.map((r) => r.key).sort();

  it('gives each card the classes the shared definition puts in it, for a range of dates', async () => {
    const w = await scene();
    const range = { from: MON, to: NOV(15) };
    expect(await keys(w, 'head-1', { ...range, card: 'classes_today' })).toEqual([KEY, KEY_H].sort());
    expect(await keys(w, 'head-1', { ...range, card: 'classes_cancelled' })).toEqual([KEY_B]);
    expect(await keys(w, 'head-1', { ...range, card: 'classes_conducted' })).toEqual([KEY]);
    expect(await keys(w, 'head-1', { ...range, card: 'classes_voice_pending' })).toEqual([KEY]);
    expect(await keys(w, 'head-1', { ...range, card: 'classes_awaiting_activities' })).toEqual([KEY]);
    expect(await keys(w, 'head-1', { ...range, card: 'classes_awaiting_verification' })).toEqual([KEY]);
    expect(await keys(w, 'head-1', { ...range, card: 'classes_verified' })).toEqual([]);
    expect(await w.ws.list(await w.scope('head-1'), { ...range, card: 'classes_cancelled' }, AFTER)).toMatchObject({ card: 'classes_cancelled', from: MON, to: NOV(15), total: 1 });
  });

  it('empties the voice and activity cards once the tutor has done those things, and when an exception is approved', async () => {
    const w = await scene();
    await w.prepare();
    expect(await keys(w, 'head-1', { from: MON, to: MON, card: 'classes_voice_pending' })).toEqual([]);
    expect(await keys(w, 'head-1', { from: MON, to: MON, card: 'classes_awaiting_activities' })).toEqual([]);
    const x = world();
    await x.submit();
    await x.ws.requestException('mentor-1', KEY, { reason: 'No connection' }, AFTER);
    await x.ws.decideException(await x.scope('head-1'), KEY, { approve: true }, AFTER);
    expect(await keys(x, 'head-1', { from: MON, to: MON, card: 'classes_voice_pending' })).toEqual([]);
  });

  it('still lists a class waiting for the Mentor when its date is outside the window, as the dashboard counts it', async () => {
    const w = await scene();
    const later = at(NOV(12), '09:00');
    expect(await keys(w, 'head-1', { from: NOV(11), to: NOV(13), card: 'classes_awaiting_verification' }, later)).toEqual([KEY]);
    expect(await keys(w, 'head-1', { from: NOV(11), to: NOV(13), card: 'classes_verified' }, later)).toEqual([]);
  });

  it('keeps the state, student and Mentor filters with a card, and never reaches another Mentor', async () => {
    const w = await scene();
    const range = { from: MON, to: NOV(15) };
    expect(await keys(w, 'head-1', { ...range, card: 'classes_today', state: 'SCHEDULED' })).toEqual([KEY_H]);
    expect(await keys(w, 'head-1', { ...range, card: 'classes_today', studentQuery: 'asha' })).toEqual([KEY]);
    expect(await keys(w, 'head-1', { ...range, card: 'classes_today', mentorUserId: 'head-1' })).toEqual([KEY_H]);
    expect(await keys(w, 'mentor-1', { ...range, card: 'classes_today' })).toEqual([KEY]);
    expect(await keys(w, 'mentor-1', { ...range, card: 'classes_today', mentorUserId: 'mentor-2' })).toEqual([]);
    expect(await keys(w, 'mentor-2', { ...range, card: 'classes_cancelled' })).toEqual([KEY_B]);
    expect(await keys(w, 'mentor-1', { ...range, card: 'classes_cancelled' })).toEqual([]);
  });

  it('refuses a card that does not exist, a bad date and a range that is too long, and treats a start with no end as one day', async () => {
    const w = await scene();
    const head = await w.scope('head-1');
    await expect(w.ws.list(head, { card: 'classes_everything' }, AFTER)).rejects.toThrow('That is not a class card.');
    await expect(w.ws.list(head, { from: 'soon' }, AFTER)).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.ws.list(head, { from: MON, to: '2027-03-01' }, AFTER)).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.ws.list(head, { from: NOV(15), to: MON }, AFTER)).rejects.toBeInstanceOf(BadRequestException);
    expect(await w.ws.list(head, { from: MON }, AFTER)).toMatchObject({ from: MON, to: MON, total: 3 });
  });

  it('uses the same card definition as the dashboard, from one place', () => {
    const dashboard = readFileSync(join(__dirname, 'mentoring-dashboard.service.ts'), 'utf8');
    expect(dashboard).toContain("import { classCardsOf } from './class-workspace'");
    expect(dashboard).toContain('classCardsOf(k, c.today)');
    expect(dashboard).not.toContain('out.classes_voice_pending.push');
  });
});

describe('legacy classes (no voice upload, no activities) with strict verification', () => {
  it('keeps a class that was already reported waiting, says exactly what is missing, and changes nothing by refusing', async () => {
    const w = world();
    // A class reported under the old flow: the update is in, the old voice tick is set, and nothing exists in the new tables.
    await w.submit();
    Object.assign(w.session(), { voiceSentAt: at(MON, '17:00'), voiceReceivedAt: at(MON, '17:30'), activities: ['WORKSHEET', 'QUIZ', 'READING'] });
    const before = JSON.stringify(w.session());
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'))).rejects.toThrow('The tutor voice recording has not been uploaded. At least 3 post-class activities are needed. 0 created.');
    expect(w.session().status).toBe('AWAITING_MENTOR_VERIFICATION');
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
    const review = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, at(MON, '18:00'))).review;
    expect(review).toMatchObject({ canVerify: false, blockers: ['The tutor voice recording has not been uploaded.', 'At least 3 post-class activities are needed. 0 created.'] });
    expect(JSON.stringify(w.session())).toBe(before);
    // The tutor adds what is missing, late, and then it can be verified.
    await w.prepare();
    expect((await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, at(MON, '19:00'))).review.canVerify).toBe(true);
  });

  it('lets the Head approve an exception for a legacy class, which verifies it without the missing items and not without the tutor update', async () => {
    const w = world();
    await w.submit();
    await w.ws.requestException('mentor-1', KEY, { reason: 'Reported before the voice and activity rules began' }, AFTER);
    await w.ws.decideException(await w.scope('head-1'), KEY, { approve: true, note: 'Legacy class' }, AFTER);
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'))).resolves.toMatchObject({ status: 'VERIFIED' });
    const unreported = world();
    await unreported.ws.requestException('mentor-1', KEY, { reason: 'Reported before the rules began' }, AFTER);
    await unreported.ws.decideException(await unreported.scope('head-1'), KEY, { approve: true }, AFTER);
    await expect(unreported.classes.verify(unreported.session().id, {}, 'mentor-1', at(MON, '18:00'))).rejects.toThrow('Only a submitted update can be verified');
  });

  it('lets the Mentor send it back to the tutor, who then supplies the voice and activities and resubmits', async () => {
    const w = world();
    await w.submit();
    await w.classes.returnToTutor(w.session().id, 'Please add the recording and the activities', 'INCOMPLETE', 'mentor-1', at(MON, '17:30'));
    expect(w.session().status).toBe('RETURNED_FOR_CORRECTION');
    await w.prepare();
    await w.submit();
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:30'))).resolves.toMatchObject({ status: 'VERIFIED' });
  });
});

// ─── Step 1: who is eligible for operational classes (activation, approved timetable, pause) ───────────────────────
describe('eligibility: classes exist only for an Active student with an approved timetable', () => {
  const setStatus = (w: ReturnType<typeof world>, id: string, status: string) => { w.db.rows('mentoringActivation').find((a) => a.id === id)!.status = status; };
  const setStage = (w: ReturnType<typeof world>, id: string, status: string | null) => {
    const rows = w.db.rows('mentoringStage');
    const found = rows.find((s) => s.activationId === id && s.stageNumber === 3);
    if (status === null) { if (found) rows.splice(rows.indexOf(found), 1); } else if (found) found.status = status; else w.db.seed('mentoringStage', { activationId: id, stageNumber: 3, key: 'TIMETABLE_CREATION', status });
  };
  const listed = async (w: ReturnType<typeof world>, id = 'act-A') => (await w.classes.daily(id, MON, {}, await w.scope('head-1'), AFTER)).classes.map((c) => c.key);

  it('lists and generates classes in no status but Active, and only once the timetable stage is completed', async () => {
    for (const status of ['AWAITING_ALLOCATION', 'ACTIVATION_IN_PROGRESS', 'PENDING_FINAL_APPROVAL', 'ACTIVATION_ON_HOLD', 'ACTIVATION_BLOCKED', 'CANCELLED']) {
      const w = world();
      setStatus(w, 'act-A', status);
      expect(await listed(w)).toEqual([]);
    }
    const w = world();
    expect(await listed(w)).toEqual([KEY]);
    setStage(w, 'act-A', 'IN_PROGRESS');
    expect(await listed(w)).toEqual([]); // Active, but the timetable is not approved
    setStage(w, 'act-A', null);
    expect(await listed(w)).toEqual([]);
    setStage(w, 'act-A', 'COMPLETED');
    expect(await listed(w)).toEqual([KEY]);
  });

  it('does not show a student awaiting activation in the operational list, the Head list or the dashboard cards', async () => {
    const w = world();
    setStatus(w, 'act-B', 'PENDING_FINAL_APPROVAL');
    expect((await w.ws.list(await w.scope('head-1'), { date: MON }, AFTER)).rows.map((r) => r.studentName)).toEqual(['Asha Menon', 'Hema Pillai']);
    expect((await w.ws.list(await w.scope('mentor-2'), { date: MON }, AFTER)).rows).toEqual([]);
    expect(await w.ws.list(await w.scope('head-1'), { from: MON, to: MON, card: 'classes_today' }, AFTER)).toMatchObject({ total: 2 });
  });

  it('refuses every operational action on a class of a student who is not eligible', async () => {
    const w = world();
    await w.submit();
    const id = w.session().id;
    setStatus(w, 'act-A', 'ACTIVATION_IN_PROGRESS');
    // By class key the class is simply not on the schedule, so nothing can be reminded, updated or changed.
    await expect(w.submit()).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.ws.addActivity('u-meera', KEY, activity(1), AFTER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.ws.uploadVoice('u-meera', KEY, audio(), AFTER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.classes.cancel(KEY, 'x', 'mentor-1', AFTER)).rejects.toBeInstanceOf(NotFoundException);
    // By a stored class the reason is given.
    await expect(w.classes.verify(id, {}, 'mentor-1', AFTER)).rejects.toThrow('This student has not been activated yet, so classes cannot be changed.');
    await expect(w.classes.returnToTutor(id, 'x', 'CORRECTION', 'mentor-1', AFTER)).rejects.toThrow('has not been activated yet');
    setStatus(w, 'act-A', 'ACTIVATION_ON_HOLD');
    await expect(w.classes.verify(id, {}, 'mentor-1', AFTER)).rejects.toThrow('This student is paused, so classes cannot be changed.');
    setStatus(w, 'act-A', 'ACTIVATED');
    setStage(w, 'act-A', 'IN_PROGRESS');
    await expect(w.classes.verify(id, {}, 'mentor-1', AFTER)).rejects.toThrow('does not have an approved timetable yet');
    expect(w.session().status).toBe('AWAITING_MENTOR_VERIFICATION');
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
  });

  it('keeps a paused or cancelled student history, and shows a class that was only scheduled again on resume with no duplicate', async () => {
    const w = world();
    await w.submit(); // Asha has a reported class (history)
    await w.classes.prepareReminder(KEY_H, 'head-1'); // Hema's class gets a stored row, still only scheduled
    const stored = w.db.rows('mentoringClassSession').length;
    for (const status of ['ACTIVATION_ON_HOLD', 'CANCELLED']) {
      setStatus(w, 'act-A', status);
      setStatus(w, 'act-H', status);
      expect(await listed(w, 'act-A')).toEqual([KEY]); // reported class stays as history
      expect(await listed(w, 'act-H')).toEqual([]); // a class that was only scheduled is not operational
      expect(w.db.rows('mentoringClassSession')).toHaveLength(stored); // nothing deleted
    }
    setStatus(w, 'act-H', 'ACTIVATED');
    expect(await listed(w, 'act-H')).toEqual([KEY_H]);
    expect(w.db.rows('mentoringClassSession')).toHaveLength(stored); // the same stored row, no duplicate
  });

  it('creates no class rows when activation is approved, twice or at once', async () => {
    const w = world();
    setStatus(w, 'act-A', 'PENDING_FINAL_APPROVAL');
    expect(await listed(w)).toEqual([]);
    setStatus(w, 'act-A', 'ACTIVATED');
    const before = w.db.rows('mentoringClassSession').length;
    await Promise.all([listed(w), listed(w), listed(w)]);
    setStatus(w, 'act-A', 'ACTIVATED');
    await listed(w);
    expect(w.db.rows('mentoringClassSession')).toHaveLength(before);
    expect(await listed(w)).toEqual([KEY]);
  });

  it('refuses a class by its key for a student who is not eligible, so nothing can be reminded, updated or verified', async () => {
    const w = world();
    setStatus(w, 'act-A', 'ACTIVATION_IN_PROGRESS');
    await expect(w.classes.prepareReminder(KEY, 'mentor-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.ws.tutorWorkspace('u-meera', KEY, AFTER)).rejects.toBeInstanceOf(NotFoundException);
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0);
  });
});

// ─── Step 1: the automatic 45 minute class reminder ─────────────────────────────────────────────────────────────────
describe('automatic class reminders', () => {
  const jobs = (w: ReturnType<typeof world>) => new MentoringReminderJobsService(w.db as any, w.classes, new MentoringReminderService(w.db as any), new MentoringSlaService(w.db as any, w.access));
  const reminders = (w: ReturnType<typeof world>) => w.db.rows('mentoringReminder');
  const setStatus = (w: ReturnType<typeof world>, id: string, status: string) => { w.db.rows('mentoringActivation').find((a) => a.id === id)!.status = status; };
  const EARLY = at(MON, '09:00');

  it('prepares one reminder for each class in the next days of an eligible student, 45 minutes before it starts, for the tutor', async () => {
    const w = world();
    const r = await jobs(w).run(EARLY);
    expect(r).toMatchObject({ withdrawn: 0, sent: 0, failed: 0 });
    const rows = reminders(w);
    expect(rows.length).toBeGreaterThanOrEqual(3); // A, B and H today, and the same classes a week later
    const asha = rows.find((x) => x.activationId === 'act-A' && x.kind === `CLASS_REMINDER:${MON}:900`)!;
    expect(asha).toMatchObject({ status: 'PREPARED', recipientUserId: 'u-meera', entityType: 'ClassSession', preparedByUserId: 'system' });
    expect(asha.scheduledFor).toEqual(at(MON, '14:15'));
    expect(rows.find((x) => x.activationId === 'act-H' && x.kind === `CLASS_REMINDER:${MON}:1020`)!.scheduledFor).toEqual(at(MON, '16:15'));
    expect(rows.find((x) => x.activationId === 'act-B' && x.kind === `CLASS_REMINDER:${MON}:900`)!.recipientUserId).toBe('u-rahul');
    expect(rows.find((x) => x.kind === `CLASS_REMINDER:2026-11-16:900`)).toBeDefined(); // the next Monday is inside the next seven days
    expect(rows.every((x) => x.status === 'PREPARED' && x.sentAt === null)).toBe(true); // nothing is sent early
  });

  it('prepares nothing for a student who is not eligible, and nothing for a class that has started', async () => {
    const w = world();
    setStatus(w, 'act-B', 'ACTIVATION_IN_PROGRESS');
    await jobs(w).run(at(MON, '15:05')); // Asha and Basil started at 15:00, Hema starts at 17:00
    const rows = reminders(w);
    expect(rows.filter((x) => x.kind === `CLASS_REMINDER:${MON}:900`)).toEqual([]);
    expect(rows.find((x) => x.activationId === 'act-H' && x.kind === `CLASS_REMINDER:${MON}:1020`)).toBeDefined();
    expect(rows.some((x) => x.activationId === 'act-B')).toBe(false);
  });

  it('sends it when its time comes, once, as an in-app notification, and never earlier', async () => {
    const w = world();
    const j = jobs(w);
    await j.run(EARLY);
    expect((await j.run(at(MON, '14:14'))).sent).toBe(0);
    const at1415 = await j.run(at(MON, '14:15'));
    expect(at1415.sent).toBeGreaterThanOrEqual(2); // Asha and Basil (both 15:00)
    const sent = reminders(w).filter((x) => x.status === 'SENT');
    const asha = sent.find((x) => x.activationId === 'act-A' && x.kind.endsWith(`${MON}:900`))!;
    expect(asha).toMatchObject({ sentAt: at(MON, '14:15'), sentByUserId: 'system' });
    const notes = w.db.rows('notification').filter((n) => n.recipientUserId === 'u-meera' && n.entityId === asha.entityId);
    expect(notes).toHaveLength(1);
    expect(asha.notificationId).toBe(notes[0].id);
    const again = await j.run(at(MON, '14:30'));
    expect(again.sent).toBe(0);
    expect(w.db.rows('notification').filter((n) => n.entityId === asha.entityId)).toHaveLength(1);
  });

  it('is safe to run again and at the same time: one reminder and one notification per class', async () => {
    const w = world();
    const j = jobs(w);
    await Promise.all([j.run(EARLY), j.run(EARLY), j.run(EARLY)]);
    const keys = reminders(w).map((x) => x.currentKey);
    expect(new Set(keys).size).toBe(keys.length);
    await Promise.all([j.run(at(MON, '14:16')), j.run(at(MON, '14:16'))]);
    const sent = reminders(w).filter((x) => x.status === 'SENT');
    expect(w.db.rows('notification').filter((n) => sent.some((s) => s.entityId === n.entityId && n.recipientUserId === s.recipientUserId))).toHaveLength(sent.length);
  });

  it('reminds a class created less than 45 minutes before it starts at once, once, and says it was late', async () => {
    const w = world();
    const j = jobs(w);
    const r = await j.run(at(MON, '14:50'));
    expect(r.late).toBeGreaterThanOrEqual(2);
    expect(r.sent).toBeGreaterThanOrEqual(2);
    const asha = reminders(w).find((x) => x.activationId === 'act-A' && x.kind.endsWith(`${MON}:900`))!;
    expect(asha).toMatchObject({ status: 'SENT', sentAt: at(MON, '14:50') });
    expect((await j.run(at(MON, '14:51'))).sent).toBe(0);
  });

  it('gives a reminder a Mentor prepared by hand its time, so it goes out by itself, and a Send now afterwards sends nothing twice', async () => {
    const w = world();
    await w.classes.prepareReminder(KEY, 'mentor-1'); // no time on it
    expect(reminders(w)[0].scheduledFor).toBeNull();
    const j = jobs(w);
    await j.run(EARLY);
    expect(reminders(w).filter((x) => x.entityType === 'ClassSession' && x.kind.endsWith(`${MON}:900`) && x.activationId === 'act-A')).toHaveLength(1);
    await j.run(at(MON, '14:20'));
    const sent = reminders(w).find((x) => x.activationId === 'act-A' && x.kind.endsWith(`${MON}:900`))!;
    expect(sent.status).toBe('SENT');
    const manual = await w.classes.sendReminder(KEY, 'mentor-1', at(MON, '14:25'));
    expect(manual).toMatchObject({ reminderId: sent.id, status: 'SENT' });
    expect(w.db.rows('notification').filter((n) => n.entityId === sent.entityId && n.recipientUserId === 'u-meera')).toHaveLength(1);
  });

  it('withdraws a prepared reminder when the student is paused, and prepares it again on resume', async () => {
    const w = world();
    const j = jobs(w);
    await j.run(EARLY);
    setStatus(w, 'act-A', 'ACTIVATION_ON_HOLD');
    const r = await j.run(at(MON, '14:15'));
    expect(r.withdrawn).toBeGreaterThanOrEqual(2);
    const asha = reminders(w).filter((x) => x.activationId === 'act-A');
    expect(asha.every((x) => x.status === 'CANCELLED')).toBe(true);
    expect(w.db.rows('notification').some((n) => n.recipientUserId === 'u-meera' && n.entityId === w.session().id)).toBe(false);
    setStatus(w, 'act-A', 'ACTIVATED');
    await j.run(EARLY);
    expect(reminders(w).filter((x) => x.activationId === 'act-A' && x.status === 'PREPARED').length).toBeGreaterThanOrEqual(1);
  });

  it('withdraws it when the class is cancelled or reported, and prepares the new slot when a class is moved', async () => {
    const w = world();
    const j = jobs(w);
    await j.run(EARLY);
    await w.classes.cancel(KEY_B, 'Holiday', 'mentor-2', EARLY);
    await w.classes.tutorSubmitUpdate('u-meera', KEY, good, at(MON, '17:00'));
    await j.run(at(MON, '17:01'));
    const state = (id: string, key: string) => reminders(w).filter((x) => x.activationId === id && x.kind.endsWith(key)).map((x) => x.status);
    expect(state('act-B', `${MON}:900`)).toEqual(['CANCELLED']);
    expect(state('act-A', `${MON}:900`)).toEqual(['CANCELLED']);

    const m = world();
    const jm = jobs(m);
    await jm.run(EARLY);
    await m.classes.reschedule(KEY, { newDate: MON, newStart: '18:00', newEnd: '19:00', reason: 'Exam' }, 'mentor-1', EARLY);
    await jm.run(at(MON, '09:05'));
    const slots = reminders(m).filter((x) => x.activationId === 'act-A' && x.kind.includes(MON));
    expect(slots.find((x) => x.kind.endsWith(':900'))!.status).toBe('CANCELLED');
    expect(slots.find((x) => x.kind.endsWith(':1080'))).toMatchObject({ status: 'PREPARED', scheduledFor: at(MON, '17:15') });
  });

  it('does nothing for a class that is only history, and leaves a sent reminder alone', async () => {
    const w = world();
    const j = jobs(w);
    await j.run(EARLY);
    await j.run(at(MON, '14:20'));
    setStatus(w, 'act-A', 'CANCELLED');
    const before = reminders(w).filter((x) => x.status === 'SENT').length;
    await j.run(at(MON, '14:30'));
    expect(reminders(w).filter((x) => x.status === 'SENT')).toHaveLength(before);
  });

  it('never goes near WhatsApp, and says so in what it records', () => {
    const source = readFileSync(join(__dirname, 'mentoring-reminder-jobs.service.ts'), 'utf8') + readFileSync(join(__dirname, 'mentoring-reminder.processor.ts'), 'utf8');
    expect(source).not.toMatch(/api\.whatsapp|graph\.facebook|twilio|wa\.me|whatsapp-web|sendMessage\(/i);
    expect(JSON.stringify(reminders(world()))).not.toMatch(/whatsapp/i);
  });
});

describe('the reminder job and its schedule', () => {
  const job = (name: string) => ({ id: '1', name, data: { idempotencyKey: 'mentoring-reminders' }, attemptsMade: 0 }) as any;

  it('runs one pass for its own job only, and not at all when switched off', async () => {
    const run = jest.fn().mockResolvedValue({});
    const processor = new MentoringReminderProcessor({ run } as any);
    await processor.process(job('something-else'));
    expect(run).not.toHaveBeenCalled();
    await processor.process(job('mentoring-reminders'));
    expect(run).toHaveBeenCalledTimes(1);
    process.env.MENTORING_AUTOMATIC_REMINDERS = 'false';
    try {
      await processor.process(job('mentoring-reminders'));
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.MENTORING_AUTOMATIC_REMINDERS;
    }
  });

  it('is on unless it says false, and registers one fixed schedule that a restart does not duplicate', async () => {
    expect(automaticRemindersEnabled({})).toBe(true);
    expect(automaticRemindersEnabled({ MENTORING_AUTOMATIC_REMINDERS: 'true' })).toBe(true);
    expect(automaticRemindersEnabled({ MENTORING_AUTOMATIC_REMINDERS: 'FALSE' })).toBe(false);
    const queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new MentoringReminderScheduler(queue as any);
    await scheduler.onApplicationBootstrap();
    await new MentoringReminderScheduler(queue as any).onApplicationBootstrap();
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    for (const call of queue.upsertJobScheduler.mock.calls) {
      expect(call[0]).toBe('mentoring-reminders-every-minute');
      expect(call[1]).toEqual({ pattern: '* * * * *' });
      expect(call[2]).toMatchObject({ name: 'mentoring-reminders' });
    }
  });

  it('does not schedule when switched off, and does not fail the application when the queue is down', async () => {
    const queue = { upsertJobScheduler: jest.fn().mockRejectedValue(new Error('redis down')) };
    await expect(new MentoringReminderScheduler(queue as any).onApplicationBootstrap()).resolves.toBeUndefined();
    process.env.MENTORING_AUTOMATIC_REMINDERS = 'false';
    try {
      const off = { upsertJobScheduler: jest.fn() };
      await new MentoringReminderScheduler(off as any).onApplicationBootstrap();
      expect(off.upsertJobScheduler).not.toHaveBeenCalled();
    } finally {
      delete process.env.MENTORING_AUTOMATIC_REMINDERS;
    }
  });

  it('is registered with the Mentoring module and its own queue', () => {
    const module = readFileSync(join(__dirname, 'mentoring.module.ts'), 'utf8');
    expect(module).toContain('BullModule.registerQueue({ name: QUEUES.MENTORING })');
    expect(module).toContain('MentoringReminderProcessor');
    expect(module).toContain('MentoringReminderScheduler');
    expect(readFileSync(join(__dirname, '../../common/queue/queue.constants.ts'), 'utf8')).toContain("MENTORING: 'mentoring'");
  });
});

// ─── Step 1: the Mentoring Head returns a record for correction (permission mentoring.record.correct) ────────────
describe('the Head returns an update for correction', () => {
  const head = async (w: ReturnType<typeof world>, user = 'corrector') => w.access.scopeFor(user);
  const waiting = async () => { const w = world(); await w.submit(); return w; };
  const returnAs = (w: ReturnType<typeof world>, scope: any, reason: unknown = 'The end time is wrong', kind: 'CORRECTION' | 'INCOMPLETE' = 'CORRECTION') => w.classes.returnToTutorAsHead(w.session().id, reason, kind, scope, at(MON, '17:30'));

  it('is refused for anyone without the correction permission: the Head as granted today, a Mentor, the CEO, the tutor and a stranger', async () => {
    const w = await waiting();
    for (const user of ['head-1', 'mentor-1', 'mentor-2', 'ceo-1', 'nobody']) await expect(returnAs(w, await w.access.scopeFor(user))).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.session().status).toBe('AWAITING_MENTOR_VERIFICATION');
  });

  it('needs department wide access as well as the permission', async () => {
    const w = await waiting();
    await expect(returnAs(w, await w.access.scopeFor('narrow-corrector'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('works on another Mentor student with a reason, tells the tutor it was the Head, and records who did it', async () => {
    const w = await waiting();
    await expect(returnAs(w, await head(w))).resolves.toMatchObject({ status: 'RETURNED_FOR_CORRECTION' });
    expect(w.session()).toMatchObject({ status: 'RETURNED_FOR_CORRECTION', returnedReason: 'The end time is wrong', returnedKind: 'CORRECTION' });
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_CLASS_RETURNED')).toMatchObject({ recipientUserId: 'u-meera' });
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_CLASS_RETURNED')!.message).toContain('by the Mentoring Head');
    const event = w.db.rows('mentoringClassSessionEvent').find((e) => e.kind === 'RETURNED_FOR_CORRECTION')!;
    expect(event).toMatchObject({ actorUserId: 'corrector', reason: 'The end time is wrong' });
    expect(event.payload).toMatchObject({ byHead: true });
  });

  it('can mark it incomplete, and the tutor can then correct and resubmit', async () => {
    const w = await waiting();
    await returnAs(w, await head(w), 'The topics are missing', 'INCOMPLETE');
    expect(w.session()).toMatchObject({ returnedKind: 'INCOMPLETE' });
    expect(w.events(w.session().id)).toContain('MARKED_INCOMPLETE');
    await w.submit();
    expect(w.session().status).toBe('AWAITING_MENTOR_VERIFICATION');
  });

  it('needs a reason, and one that is not too long', async () => {
    const w = await waiting();
    for (const reason of ['', '   ', null, 42]) await expect(returnAs(w, await head(w), reason)).rejects.toBeInstanceOf(BadRequestException);
    await expect(returnAs(w, await head(w), 'x'.repeat(1001))).rejects.toThrow('1000 characters');
    expect(w.session().status).toBe('AWAITING_MENTOR_VERIFICATION');
  });

  it('is refused for a class that is not waiting for review, for a student who is not eligible, and for a class that does not exist', async () => {
    const fresh = world();
    await fresh.classes.prepareReminder(KEY, 'mentor-1');
    await expect(fresh.classes.returnToTutorAsHead(fresh.session().id, 'x', 'CORRECTION', await head(fresh), AFTER)).rejects.toThrow('Only an update waiting for review can be returned.');
    const w = await waiting();
    w.db.rows('mentoringActivation').find((a) => a.id === 'act-A')!.status = 'ACTIVATION_ON_HOLD';
    await expect(returnAs(w, await head(w))).rejects.toThrow('This student is paused');
    await expect(w.classes.returnToTutorAsHead('no-such-class', 'x', 'CORRECTION', await head(w), AFTER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clears an exception that was decided on the update it returns', async () => {
    const w = await waiting();
    await w.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, AFTER);
    await w.ws.decideException(await w.scope('head-1'), KEY, { approve: true }, AFTER);
    await returnAs(w, await head(w));
    expect(w.session().exceptionStatus).toBeNull();
    expect(w.events(w.session().id)).toContain('EXCEPTION_INVALIDATED');
  });

  it('leaves the Mentor own return and the compensation rules as they were', async () => {
    const w = await waiting();
    await w.classes.returnToTutor(w.session().id, 'Please correct', 'CORRECTION', 'mentor-1', at(MON, '17:30'));
    expect(w.session().status).toBe('RETURNED_FOR_CORRECTION');
    expect(w.events(w.session().id).filter((e) => e === 'RETURNED_FOR_CORRECTION')).toHaveLength(1);
    expect(w.db.rows('mentoringClassSessionEvent').find((e) => e.kind === 'RETURNED_FOR_CORRECTION')!.payload ?? {}).not.toMatchObject({ byHead: true });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
  });

  it('has a route that needs exactly the correction permission, and the permission is defined but granted to no role', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, (MentoringClassController.prototype as any).headReturn)).toEqual(['mentoring.record.correct']);
    const seed = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8');
    expect(seed).toContain("code: 'mentoring.record.correct'");
    const exclusion = seed.slice(seed.indexOf('const MENTORING_OPERATIONAL_CODES'), seed.indexOf(']);', seed.indexOf('const MENTORING_OPERATIONAL_CODES')));
    expect(exclusion).toContain("'mentoring.record.correct'");
    const roles = seed.slice(seed.indexOf('MENTORING_HEAD: ['));
    expect(roles.slice(0, roles.indexOf('\n  ],'))).not.toContain('mentoring.record.correct');
    expect((seed.match(/'mentoring\.record\.correct'/g) ?? []).length).toBe(2); // the exclusion list and nowhere else
  });
});

// ─── Stage 1: independent statuses, update fields and versions, activity rules, update reminders, follow-ups ──────
describe('Stage 1: the class status and the documentation status are independent', () => {
  const view = async (w: ReturnType<typeof world>, now = AFTER) => (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, now)).class;
  const both = (c: any) => [c.classStatus, c.documentation.status];

  it('starts as scheduled and not started, and a class that ended with no report is report pending, not documented', async () => {
    const w = world();
    expect(both(await view(w, at(MON, '09:00')))).toEqual(['SCHEDULED', 'NOT_STARTED']);
    expect(both(await view(w, at(MON, '17:00')))).toEqual(['PENDING_REPORT', 'NOT_STARTED']);
    expect((await view(w, at(MON, '17:00'))).documentation.missing).toContain('The tutor class update has not been submitted.');
  });

  it('a conducted class is conducted whether or not its paperwork is done, and paperwork never makes a class conducted', async () => {
    const w = world();
    await w.submit();
    expect(both(await view(w))).toEqual(['CONDUCTED', 'IN_PROGRESS']);
    expect((await view(w)).documentation.missing).toEqual(['The tutor voice recording has not been uploaded.', 'At least 3 post-class activities are needed. 0 created.']);
    // Paperwork done with no tutor report: documentation is still not complete, and the class is not conducted.
    const other = world();
    await other.ws.uploadVoice('u-meera', KEY, audio(), at(MON, '17:00'));
    await other.ws.confirmVoiceShared('u-meera', KEY, at(MON, '17:00'));
    await other.prepare();
    const c = await view(other, at(MON, '17:00'));
    expect(c.classStatus).toBe('PENDING_REPORT');
    expect(c.documentation.status).toBe('IN_PROGRESS');
    expect(c.documentation.missing).toEqual(['The tutor class update has not been submitted.']);
  });

  it('is complete when the update, the voice and its sharing, and three shared activities are in, while the class is still unverified and not consumed', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    const c = await view(w);
    expect(both(c)).toEqual(['CONDUCTED', 'COMPLETE']);
    expect(c).toMatchObject({ status: 'AWAITING_MENTOR_VERIFICATION', consumption: 'NOT_CONSUMED' });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0); // completing the paperwork pays nothing
    await w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    const verified = await view(w, at(MON, '18:10'));
    expect(both(verified)).toEqual(['CONDUCTED', 'COMPLETE']);
    expect(verified.consumption).toBe('CONSUMED');
  });

  it('is not required for a class that was not conducted or was cancelled, and is returned when it is sent back', async () => {
    const a = world();
    await a.classes.tutorSubmitUpdate('u-meera', KEY, { conducted: false, notConductedReason: 'Student was ill' }, AFTER);
    expect(both(await view(a))).toEqual(['NOT_CONDUCTED', 'NOT_REQUIRED']);
    const b = world();
    await b.classes.cancel(KEY, 'Holiday', 'mentor-1', at(MON, '09:00'));
    expect(both(await view(b))).toEqual(['CANCELLED', 'NOT_REQUIRED']);
    const c = world();
    await c.submit();
    await c.classes.returnToTutor(c.session().id, 'Please correct', 'CORRECTION', 'mentor-1', at(MON, '17:30'));
    expect(both(await view(c))).toEqual(['CONDUCTED', 'RETURNED']);
  });

  it('lets an approved exception lift the voice and activity items only, never the tutor update', async () => {
    const w = world();
    await w.submit();
    await w.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, AFTER);
    await w.ws.decideException(await w.scope('head-1'), KEY, { approve: true }, AFTER);
    expect(both(await view(w))).toEqual(['CONDUCTED', 'COMPLETE']);
    const none = world();
    await none.ws.requestException('mentor-1', KEY, { reason: 'No data connection' }, AFTER);
    await none.ws.decideException(await none.scope('head-1'), KEY, { approve: true }, AFTER);
    expect((await view(none)).documentation.status).toBe('NOT_STARTED'); // the tutor update is still missing, so nothing is complete
    expect((await view(none)).documentation.missing).toEqual(['The tutor class update has not been submitted.']);
  });

  it('shows both statuses to the tutor, the Mentor, the list and the dashboard rows, from the same record', async () => {
    const w = world();
    await w.submit();
    const tutor = (await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).class;
    const mentor = await view(w);
    expect(both(tutor)).toEqual(both(mentor));
    const row = (await w.ws.list(await w.scope('head-1'), { date: MON }, AFTER)).rows.find((r) => r.key === KEY)!;
    expect([row.classStatus, row.documentation.status]).toEqual(both(mentor));
    expect((await w.classes.tutorClasses('u-meera', MON, MON, AFTER))[0].documentation.status).toBe('IN_PROGRESS');
  });

  it('leaves compensation and consumption exactly as before: only a verified class with minutes is consumed and only then is a record made', async () => {
    const w = world();
    await w.submit();
    await w.prepare();
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
    await w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    expect(w.db.rows('tutorClassRecord')).toHaveLength(1);
    expect(w.db.rows('tutorClassRecord')[0]).toMatchObject({ workedMinutes: 65, status: 'VERIFIED' });
  });
});

describe('Stage 1: the tutor class update fields and its versions', () => {
  it('saves the homework, the portions completed, the chapters and the remarks, and shows them to the Mentor', async () => {
    const w = world();
    await w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, chapters: ['Tenses', ' Nouns ', 'Tenses'], homework: 'Worksheet 4', portionsCompleted: 'Chapters 1 and 2', classNotes: 'Calm class' }, AFTER);
    expect(w.session()).toMatchObject({ homework: 'Worksheet 4', portionsCompleted: 'Chapters 1 and 2', classNotes: 'Calm class', participation: 'GOOD', updateVersion: 1 });
    expect(w.db.rows('mentoringClassPortion').map((p) => p.chapter).sort()).toEqual(['Nouns', 'Tenses']);
    const update = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER)).after.update!;
    expect(update).toMatchObject({ homework: 'Worksheet 4', portionsCompleted: 'Chapters 1 and 2', chapters: expect.arrayContaining(['Nouns', 'Tenses']), version: 1 });
  });

  it('needs the homework, the portions, the additional remarks and the participation, and accepts None', async () => {
    const w = world();
    for (const [field, message] of [['homework', 'homework or assignments given'], ['portionsCompleted', 'Say which portions were completed'], ['classNotes', 'additional remarks'], ['participation', 'student participation']] as const) {
      await expect(w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, [field]: '' }, AFTER)).rejects.toThrow(message);
      await expect(w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, [field]: undefined }, AFTER)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(w.db.rows('mentoringClassSession')[0]?.tutorSubmittedAt ?? null).toBeNull();
    await expect(w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, homework: 'None', classNotes: 'None' }, AFTER)).resolves.toMatchObject({ status: 'AWAITING_MENTOR_VERIFICATION' });
  });

  it('asks for none of the new fields when the class was not conducted, and checks the chapters', async () => {
    const w = world();
    await expect(w.classes.tutorSubmitUpdate('u-meera', KEY, { conducted: false, notConductedReason: 'Student was ill' }, AFTER)).resolves.toBeDefined();
    const x = world();
    await expect(x.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, chapters: 'Tenses' }, AFTER)).rejects.toThrow('list of text');
    await expect(x.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, chapters: Array.from({ length: 21 }, (_, i) => `C${i}`) }, AFTER)).rejects.toThrow('at most 20');
    await expect(x.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, chapters: ['x'.repeat(201)] }, AFTER)).rejects.toThrow('200 characters');
  });

  it('keeps every submission whole as a version, with who sent it and why, and shows what changed', async () => {
    const w = world();
    await w.submit();
    await w.classes.returnToTutor(w.session().id, 'Fix the end time', 'CORRECTION', 'mentor-1', at(MON, '17:30'));
    await w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, actualEnd: '16:20', resubmitReason: 'The end time was 16:20' }, at(MON, '18:00'));
    await w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, actualEnd: '16:20', homework: 'Worksheet 5', resubmitReason: 'Changed the homework' }, at(MON, '18:10'));
    expect(w.session().updateVersion).toBe(3);
    const versions = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, at(MON, '18:20'))).after.versions;
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(versions.map((v) => v.resubmission)).toEqual([false, true, true]);
    expect(versions[1]).toMatchObject({ by: 'Meera Thomas', reason: 'The end time was 16:20' });
    expect(versions[0].snapshot).toMatchObject({ actualEndMinute: 970, homework: 'Worksheet 4' }); // the first version is exactly as it was sent
    expect(versions[1].snapshot).toMatchObject({ actualEndMinute: 980 });
    expect(versions[1].changed).toEqual(expect.arrayContaining(['actualEndMinute', 'actualMinutes']));
    expect(versions[2].changed).toEqual(['homework']);
    expect(w.session().homework).toBe('Worksheet 5');
  });

  it('needs the reason whenever an update is sent again, whether it was returned or the tutor is correcting it first', async () => {
    const w = world();
    await w.submit();
    await expect(w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, resubmitReason: '   ' }, at(MON, '17:30'))).rejects.toThrow('Say what you changed');
    await w.classes.returnToTutor(w.session().id, 'Please correct', 'CORRECTION', 'mentor-1', at(MON, '17:35'));
    await expect(w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, resubmitReason: undefined }, at(MON, '17:40'))).rejects.toThrow('because the update was returned');
    await expect(w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, resubmitReason: 'y'.repeat(1001) }, at(MON, '17:40'))).rejects.toThrow('1000 characters');
    expect(w.session().updateVersion).toBe(1);
  });

  it('refuses a save made on an older version, so nothing is silently overwritten', async () => {
    const w = world();
    await w.submit();
    await expect(w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, expectedVersion: 0, resubmitReason: 'x' }, at(MON, '17:30'))).rejects.toThrow('changed since you opened it');
    await expect(w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, expectedVersion: 'one' }, at(MON, '17:30'))).rejects.toThrow('whole number');
    await expect(w.classes.tutorSubmitUpdate('u-meera', KEY, { ...good, expectedVersion: 1, resubmitReason: 'Corrected' }, at(MON, '17:30'))).resolves.toBeDefined();
    expect(w.session().updateVersion).toBe(2);
  });

  it('counts an update made before versions as version 1, and its history still lists', async () => {
    const w = world();
    await w.submit();
    w.session().updateVersion = 0; // as an update submitted before this change
    const mentor = await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER);
    expect(mentor.after.update!.version).toBe(1);
  });
});

describe('Stage 1: activity topic, grade, level and option groups', () => {
  const add = (w: ReturnType<typeof world>, i: number, over: object = {}) => w.ws.addActivity('u-meera', KEY, activity(i, over), AFTER);

  it('needs the topic, the grade and the learning level, and a grade that exists', async () => {
    const w = world();
    await expect(add(w, 1, { topic: '' })).rejects.toThrow('Say which topic');
    await expect(add(w, 1, { gradeId: undefined })).rejects.toThrow('Choose the grade');
    await expect(add(w, 1, { learningLevel: undefined })).rejects.toThrow('Choose the learning level');
    await expect(add(w, 1, { learningLevel: 'HARD' })).rejects.toThrow('below grade, on grade or above grade');
    await expect(add(w, 1, { gradeId: 'g-99' })).rejects.toThrow('That grade does not exist.');
    for (const level of ['BELOW_GRADE', 'ON_GRADE', 'ABOVE_GRADE']) await expect(add(w, 2, { learningLevel: level })).resolves.toBeDefined();
    expect(w.db.rows('mentoringClassActivity')).toHaveLength(3);
    expect(w.db.rows('mentoringClassActivity')[0]).toMatchObject({ gradeId: 'g-8', learningLevel: 'BELOW_GRADE', topic: 'Tenses' });
  });

  it('asks why when the grade is not the student own grade, and accepts it with a reason', async () => {
    const w = world();
    w.db.seed('grade', { id: 'g-7', name: 'Grade 7' });
    await expect(add(w, 1, { gradeId: 'g-7' })).rejects.toThrow('different grade from the student');
    await expect(add(w, 1, { gradeId: 'g-7', suitabilityNote: 'Revision of an earlier chapter' })).resolves.toBeDefined();
    expect(w.db.rows('mentoringClassActivity')[0]).toMatchObject({ gradeId: 'g-7', suitabilityNote: 'Revision of an earlier chapter' });
    await expect(add(w, 2, { gradeId: 'g-8' })).resolves.toBeDefined(); // the student's own grade needs no note
    await expect(add(w, 3, { suitabilityNote: 'z'.repeat(1001) })).rejects.toThrow('1000 characters');
  });

  it('counts the options of one group once, so three options of one activity are not three activities', async () => {
    const w = world();
    await w.submit();
    await w.ws.uploadVoice('u-meera', KEY, audio(), AFTER);
    await w.ws.confirmVoiceShared('u-meera', KEY, AFTER);
    const ids: string[] = [];
    for (const label of ['A', 'B', 'C']) ids.push((await add(w, 1, { optionGroupKey: 'Practice', optionLabel: `Option ${label}` })).activityId);
    for (const id of ids) await w.ws.shareActivity('u-meera', id, AFTER);
    let counts = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER)).after.activityCounts;
    expect(counts).toEqual({ created: 1, shared: 1 });
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'))).rejects.toThrow('At least 3 post-class activities are needed. 1 created.');
    expect((await w.classes.daily('act-A', MON, {}, await w.scope('mentor-1'), AFTER)).classes[0].activityCounts).toMatchObject({ created: 1, shared: 1 });
    // Two more separate activities make three.
    for (const i of [2, 3]) await w.ws.shareActivity('u-meera', (await add(w, i)).activityId, AFTER);
    counts = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER)).after.activityCounts;
    expect(counts).toEqual({ created: 3, shared: 3 });
    await expect(w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'))).resolves.toMatchObject({ status: 'VERIFIED' });
  });

  it('counts a group as shared only when every option in it is shared', async () => {
    const w = world();
    await w.submit();
    const a = (await add(w, 1, { optionGroupKey: 'G', optionLabel: 'One' })).activityId;
    await add(w, 1, { optionGroupKey: 'G', optionLabel: 'Two' });
    await add(w, 2);
    await add(w, 3);
    await w.ws.shareActivity('u-meera', a, AFTER);
    expect((await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER)).after.activityCounts).toEqual({ created: 3, shared: 0 });
  });

  it('allows at most three options in a group, each with its own label, and needs a group name and a label together', async () => {
    const w = world();
    for (const label of ['A', 'B', 'C']) await add(w, 1, { optionGroupKey: 'G', optionLabel: label });
    await expect(add(w, 1, { optionGroupKey: 'G', optionLabel: 'D' })).rejects.toThrow('at most 3 options');
    await expect(add(w, 1, { optionGroupKey: 'H', optionLabel: 'a' })).resolves.toBeDefined();
    await expect(add(w, 1, { optionGroupKey: 'H', optionLabel: 'A' })).rejects.toThrow('already has that label');
    await expect(add(w, 1, { optionGroupKey: 'H' })).rejects.toThrow('both a group name and its own label');
    await expect(add(w, 1, { optionLabel: 'x' })).rejects.toThrow('both a group name and its own label');
    await expect(add(w, 1, { optionGroupKey: 'bad/name', optionLabel: 'x' })).rejects.toThrow('letters, numbers');
  });

  it('keeps an activity made before grade and level were required: it still counts, and can be edited without them', async () => {
    const w = world();
    const legacy = w.db.seed('mentoringClassActivity', { sessionId: (await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).class.sessionId, position: 1, title: 'Old', type: 'WORKSHEET', topic: null, instructions: 'Old instructions', createdByUserId: 'u-meera', sharedAt: AFTER, sharedByUserId: 'u-meera' });
    expect((await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after.activityCounts).toEqual({ created: 1, shared: 1 });
    await expect(w.ws.updateActivity('u-meera', legacy.id, { title: 'Old, edited', type: 'WORKSHEET', instructions: 'Old instructions' })).resolves.toMatchObject({ sharingWithdrawn: true });
    // A newer activity keeps the new rules when it is edited.
    const fresh = (await add(w, 2)).activityId;
    await expect(w.ws.updateActivity('u-meera', fresh, { title: 'x', type: 'WORKSHEET', instructions: 'y' })).rejects.toThrow('Say which topic');
    await expect(w.ws.updateActivity('u-meera', fresh, activity(2, { title: 'Renamed', optionGroupKey: 'G', optionLabel: 'Only' }))).resolves.toBeDefined();
    expect(w.db.rows('mentoringClassActivity').find((r) => r.id === fresh)).toMatchObject({ title: 'Renamed', optionGroupKey: 'G' });
  });

  it('offers the form the grades, the student own grade, the levels and the option limit', async () => {
    const w = world();
    const options = (await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).after.activityOptions;
    expect(options).toMatchObject({ studentGradeId: 'g-8', maxOptionsPerGroup: 3 });
    expect(options.grades).toEqual(expect.arrayContaining([{ id: 'g-8', name: 'Grade 8' }]));
    expect(options.levels.map((l) => l.value)).toEqual(['BELOW_GRADE', 'ON_GRADE', 'ABOVE_GRADE']);
  });
});

describe('Stage 1: the pending update reminder schedule', () => {
  const jobs = (w: ReturnType<typeof world>) => new MentoringReminderJobsService(w.db as any, w.classes, new MentoringReminderService(w.db as any), new MentoringSlaService(w.db as any, w.access));
  const rows = (w: ReturnType<typeof world>, prefix: string, activation = 'act-A') => w.db.rows('mentoringReminder').filter((r) => r.kind.startsWith(prefix) && r.activationId === activation && r.kind.includes(`${MON}:900`));
  const due = (w: ReturnType<typeof world>) => rows(w, 'CLASS_UPDATE_DUE').sort((a, b) => a.kind.localeCompare(b.kind));
  const tutorNotes = (w: ReturnType<typeof world>) => w.db.rows('notification').filter((n) => n.recipientUserId === 'u-meera' && n.message.includes('Class update pending: English with Asha'));
  // The class ends at 16:00 on Monday 9 November. The three reminders are due 30 minutes, 24 hours and 48 hours after that.
  const T1 = at(MON, '16:30');
  const T2 = at('2026-11-10', '16:00');
  const T3 = at('2026-11-11', '16:00');
  const minute = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);

  it('sends nothing before 30 minutes after the class ends, then the first reminder to the tutor, at exactly that time', async () => {
    const w = world();
    const j = jobs(w);
    await j.run(minute(T1, -1));
    expect(due(w)).toEqual([]);
    const r = await j.run(T1);
    expect(r.sent).toBeGreaterThanOrEqual(1);
    expect(due(w)).toHaveLength(1);
    expect(due(w)[0]).toMatchObject({ status: 'SENT', recipientUserId: 'u-meera', kind: `CLASS_UPDATE_DUE:${MON}:900:0`, scheduledFor: T1, sentAt: T1 });
    expect(due(w)[0].message).toContain('Class update pending: English with Asha Menon');
    expect(tutorNotes(w)).toHaveLength(1);
  });

  it('sends exactly three reminders at 30 minutes, 24 hours and 48 hours after the class ends, none earlier, and no fourth', async () => {
    const w = world();
    const j = jobs(w);
    await j.run(minute(T1, -1));
    await j.run(T1);
    await j.run(minute(T2, -1));
    expect(due(w)).toHaveLength(1); // not before 24 hours
    await j.run(T2);
    await j.run(minute(T3, -1));
    expect(due(w)).toHaveLength(2); // not before 48 hours
    await j.run(T3);
    expect(due(w).map((r) => r.kind.split(':').pop())).toEqual(['0', '1', '2']);
    expect(due(w).map((r) => r.scheduledFor)).toEqual([T1, T2, T3]);
    expect(due(w).map((r) => r.sentAt)).toEqual([T1, T2, T3]);
    expect(due(w).every((r) => r.status === 'SENT' && r.recipientUserId === 'u-meera')).toBe(true);
    for (const later of [minute(T3, 1), at('2026-11-11', '23:00'), at('2026-11-12', '16:00'), at('2026-11-13', '16:00')]) await j.run(later);
    expect(due(w)).toHaveLength(3);
    expect(due(w).some((r) => r.kind.endsWith(':3'))).toBe(false);
    expect(tutorNotes(w)).toHaveLength(3);
  });

  it('tells the Mentor once, 24 hours after the class ended, together with the second tutor reminder and not before', async () => {
    const w = world();
    w.db.seed('user', { id: 'mentor-1', status: 'ACTIVE' });
    const j = jobs(w);
    await j.run(T1);
    await j.run(minute(T2, -1));
    expect(rows(w, 'CLASS_UPDATE_ESCALATION')).toEqual([]);
    await j.run(T2);
    for (const later of [minute(T2, 5), T3, at('2026-11-12', '09:00')]) await j.run(later);
    const esc = rows(w, 'CLASS_UPDATE_ESCALATION');
    expect(esc).toHaveLength(1);
    expect(esc[0]).toMatchObject({ status: 'SENT', recipientUserId: 'mentor-1', scheduledFor: T2, sentAt: T2 });
    expect(esc[0].message).toContain('The tutor update is still missing for English with Asha Menon');
    expect(w.db.rows('notification').filter((n) => n.recipientUserId === 'mentor-1' && n.message.includes('still missing'))).toHaveLength(1);
    expect(due(w).find((r) => r.kind.endsWith(':1'))).toMatchObject({ scheduledFor: T2 }); // the second tutor reminder is due at the same moment
  });

  it('is safe to run again and at the same time: three reminders and three notifications, never more', async () => {
    const w = world();
    w.db.seed('user', { id: 'mentor-1', status: 'ACTIVE' });
    const j = jobs(w);
    for (const t of [T1, T2, T3]) {
      await Promise.all([j.run(t), j.run(t), j.run(t)]);
      await j.run(t);
    }
    const keys = w.db.rows('mentoringReminder').map((r) => r.currentKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(due(w)).toHaveLength(3);
    expect(tutorNotes(w)).toHaveLength(3);
    expect(rows(w, 'CLASS_UPDATE_ESCALATION')).toHaveLength(1);
  });

  it('survives a restart of the job: running again after a pause in the schedule adds nothing that was already done', async () => {
    const w = world();
    await jobs(w).run(T1);
    await jobs(w).run(minute(T1, 1)); // a new instance, as after a restart
    await jobs(w).run(T2);
    await jobs(w).run(minute(T2, 1));
    expect(due(w).map((r) => r.kind.split(':').pop())).toEqual(['0', '1']);
    expect(tutorNotes(w)).toHaveLength(2);
  });

  it('stops when the update is submitted: the reminders still to come are not made, and one prepared but not sent is withdrawn', async () => {
    const w = world();
    const j = jobs(w);
    await j.run(T1);
    await w.submit(KEY, 'u-meera');
    await j.run(T2);
    await j.run(T3);
    expect(due(w)).toHaveLength(1);
    expect(rows(w, 'CLASS_UPDATE_ESCALATION')).toEqual([]);
    const prepared = world();
    prepared.db.seed('user', { id: 'mentor-1', status: 'ACTIVE' });
    await prepared.classes.prepareUpdateReminders(prepared.db as any, (await prepared.classes.eligibleOccurrences(prepared.db as any, MON, MON))[0], T2, 'system');
    expect(due(prepared)[0].status).toBe('PREPARED');
    await prepared.submit();
    await jobs(prepared).withdrawNoLongerApplicable();
    expect(due(prepared).every((r) => r.status === 'CANCELLED')).toBe(true);
    await jobs(prepared).run(T3);
    expect(tutorNotes(prepared)).toHaveLength(0);
  });

  it('sends no more once the class is cancelled after the first reminder, and none for a class cancelled before', async () => {
    const early = world();
    await early.classes.cancel(KEY, 'Holiday', 'mentor-1', at(MON, '09:00'));
    for (const t of [T1, T2, T3]) await jobs(early).run(t);
    expect(due(early)).toEqual([]);
    expect(rows(early, 'CLASS_UPDATE_ESCALATION')).toEqual([]);
    const late = world();
    await jobs(late).run(T1);
    expect(due(late)).toHaveLength(1);
    // A class that was reported is no longer cancellable, so the follow-on case is the Mentor confirming it was not conducted.
    await late.classes.tutorSubmitUpdate('u-meera', KEY, { conducted: false, notConductedReason: 'Ill' }, minute(T1, 5));
    for (const t of [T2, T3]) await jobs(late).run(t);
    expect(due(late)).toHaveLength(1);
  });

  it('follows a class that was moved: nothing for the old time, and the three reminders from the end of the new time', async () => {
    const w = world();
    const j = jobs(w);
    await j.run(at(MON, '09:00'));
    await w.classes.reschedule(KEY, { newDate: MON, newStart: '18:00', newEnd: '19:00', reason: 'Exam' }, 'mentor-1', at(MON, '09:05'));
    await j.run(T1); // 16:30 is after the old end, but the class now ends at 19:00
    expect(due(w)).toEqual([]);
    const newEnd = at(MON, '19:00');
    await j.run(minute(newEnd, 29));
    expect(due(w)).toEqual([]);
    await j.run(minute(newEnd, 30));
    expect(w.db.rows('mentoringReminder').filter((r) => r.kind.startsWith('CLASS_UPDATE_DUE') && r.activationId === 'act-A')).toMatchObject([{ kind: `CLASS_UPDATE_DUE:${MON}:1080:0`, scheduledFor: minute(newEnd, 30), status: 'SENT' }]);
    await j.run(minute(newEnd, 24 * 60));
    await j.run(minute(newEnd, 48 * 60));
    expect(w.db.rows('mentoringReminder').filter((r) => r.kind.startsWith('CLASS_UPDATE_DUE') && r.activationId === 'act-A').map((r) => r.kind.split(':').pop())).toEqual(['0', '1', '2']);
  });

  it('after the job was down it sends only the latest reminder that is due, and starts none more than a day after the last one was due', async () => {
    const w = world();
    await jobs(w).run(minute(T3, 5)); // down since the class
    expect(due(w).map((r) => r.kind.split(':').pop())).toEqual(['2']);
    const old = world();
    old.db.seed('user', { id: 'mentor-1', status: 'ACTIVE' });
    await jobs(old).run(at('2026-11-12', '17:00')); // more than a day after the third was due
    expect(due(old)).toEqual([]);
    expect(tutorNotes(old)).toHaveLength(0);
  });

  it('sends nothing for a student who is paused or not eligible', async () => {
    const p = world();
    p.db.rows('mentoringActivation').find((a) => a.id === 'act-A')!.status = 'ACTIVATION_ON_HOLD';
    for (const t of [T1, T2, T3]) await jobs(p).run(t);
    expect(due(p)).toEqual([]);
    expect(rows(p, 'CLASS_UPDATE_ESCALATION')).toEqual([]);
  });

  it('keeps the existing retry behaviour for a failed send: it stays prepared, is tried again on the next run, and is sent once', async () => {
    const w = world();
    const j = jobs(w);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = FakeDb.prototype.model;
    let fail = true;
    const spy = jest.spyOn(FakeDb.prototype, 'model').mockImplementation(function (this: FakeDb, table: string) {
      const m = original.call(this, table);
      return (table === 'notification' ? { ...m, create: jest.fn((args: any) => (fail ? Promise.reject(new Error('notification refused')) : m.create(args))) } : m);
    });
    const first = await j.run(T1);
    expect(first.failed).toBeGreaterThanOrEqual(1);
    expect(due(w)[0]).toMatchObject({ status: 'PREPARED', sentAt: null });
    expect(tutorNotes(w)).toHaveLength(0);
    fail = false;
    const second = await j.run(minute(T1, 1));
    spy.mockRestore();
    expect(second.sent).toBeGreaterThanOrEqual(1);
    expect(due(w)).toHaveLength(1);
    expect(due(w)[0]).toMatchObject({ status: 'SENT', scheduledFor: T1, sentAt: minute(T1, 1) });
    expect(tutorNotes(w)).toHaveLength(1);
    await j.run(minute(T1, 2));
    expect(tutorNotes(w)).toHaveLength(1);
  });

  it('uses the three offsets from the class end in the constants, and no fourth', () => {
    expect([...UPDATE_REMINDER_OFFSETS_MINUTES]).toEqual([30, 24 * 60, 48 * 60]);
    expect(UPDATE_ESCALATION_HOURS).toBe(24);
    const source = readFileSync(join(__dirname, 'mentoring-class.service.ts'), 'utf8');
    expect(source).not.toContain('UPDATE_DAILY_REMINDERS');
    expect(source).not.toContain('UPDATE_FIRST_REMINDER_MINUTES');
  });
});

describe('Stage 1: follow-up tasks of a class', () => {
  const create = (w: ReturnType<typeof world>, over: object = {}, user = 'mentor-1', now = AFTER) => w.ws.createFollowUp(user, KEY, { title: 'Practise fractions', description: 'Ten questions', dueDate: '2026-11-12', ...over }, now);
  const tasks = (w: ReturnType<typeof world>) => w.db.rows('mentoringTask');

  it('lets the assigned Mentor give a follow-up to the tutor, as a normal task linked to the class, and tells the tutor', async () => {
    const w = world();
    const made = await create(w, { priority: 'HIGH' });
    expect(made.status).toBe('OPEN');
    expect(tasks(w)[0]).toMatchObject({ activationId: 'act-A', assigneeUserId: 'u-meera', assignedByUserId: 'mentor-1', sourceType: 'CLASS', sourceId: w.session().id, priority: 'HIGH', status: 'OPEN', title: 'Practise fractions' });
    expect(tasks(w)[0].dueAt).toEqual(at('2026-11-12', '23:59'));
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_CLASS_FOLLOW_UP')).toMatchObject({ recipientUserId: 'u-meera' });
    expect(w.events(w.session().id)).toContain('FOLLOW_UP_CREATED');
    const mentor = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER)).review.followUps;
    expect(mentor).toEqual([expect.objectContaining({ title: 'Practise fractions', assignee: 'Meera Thomas', assigneeRole: 'TUTOR', status: 'OPEN', overdue: false })]);
    expect((await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).review.followUps).toHaveLength(1);
  });

  it('lets the Mentor keep it for themselves, which tells nobody and which the tutor does not see', async () => {
    const w = world();
    await create(w, { assignee: 'MENTOR' });
    expect(tasks(w)[0].assigneeUserId).toBe('mentor-1');
    expect(w.db.rows('notification').some((n) => n.type === 'MENTORING_CLASS_FOLLOW_UP')).toBe(false);
    expect((await w.ws.tutorWorkspace('u-meera', KEY, AFTER)).review.followUps).toEqual([]);
    expect((await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, AFTER)).review.followUps).toHaveLength(1);
  });

  it('is only for the assigned Mentor of an eligible student, and needs a title, a priority and a due date that is not in the past', async () => {
    const w = world();
    for (const user of ['mentor-2', 'u-meera', 'head-1', 'ceo-1']) await expect(create(w, {}, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(create(w, { title: ' ' })).rejects.toThrow('Give the follow-up a title');
    await expect(create(w, { dueDate: undefined })).rejects.toThrow('Choose a due date');
    await expect(create(w, { dueDate: '2026-11-08' })).rejects.toThrow('cannot be in the past');
    await expect(create(w, { priority: 'SOON' })).rejects.toThrow('low, medium, high or urgent');
    await expect(create(w, { assignee: 'PARENT' })).rejects.toThrow('tutor or keep it yourself');
    expect(tasks(w)).toHaveLength(0);
    w.db.rows('mentoringActivation').find((a) => a.id === 'act-A')!.status = 'ACTIVATION_ON_HOLD';
    await expect(create(w)).rejects.toBeInstanceOf(NotFoundException); // not on the schedule any more
  });

  it('lets the tutor start it and hand it in with a note, and only the tutor it was given to', async () => {
    const w = await (async () => { const x = world(); await create(x); return x; })();
    const id = tasks(w)[0].id;
    await expect(w.ws.tutorUpdateFollowUp('u-rahul', id, { status: 'IN_PROGRESS' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.tutorUpdateFollowUp('u-meera', id, { status: 'SUBMITTED' })).rejects.toThrow('Write what was done');
    await expect(w.ws.tutorUpdateFollowUp('u-meera', id, { status: 'VERIFIED' })).rejects.toThrow('started it or handed it in');
    await w.ws.tutorUpdateFollowUp('u-meera', id, { status: 'IN_PROGRESS', note: 'Started' });
    await w.ws.tutorUpdateFollowUp('u-meera', id, { status: 'SUBMITTED', note: 'Did all ten questions' }, at('2026-11-10', '10:00'));
    expect(tasks(w)[0]).toMatchObject({ status: 'SUBMITTED', submittedAt: at('2026-11-10', '10:00') });
    expect(tasks(w)[0].evidence).toEqual({ note: 'Did all ten questions' });
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_CLASS_FOLLOW_UP_DONE')).toMatchObject({ recipientUserId: 'mentor-1' });
    await expect(w.ws.tutorUpdateFollowUp('u-meera', id, { status: 'IN_PROGRESS' })).rejects.toThrow('already handed in or closed');
  });

  it('lets the Mentor verify it, send it back with a reason, or cancel it with a reason, and nobody else', async () => {
    const w = world();
    await create(w);
    const id = tasks(w)[0].id;
    await expect(w.ws.mentorDecideFollowUp('mentor-1', id, { decision: 'VERIFIED' })).rejects.toThrow('Only a follow-up that was handed in can be verified');
    await w.ws.tutorUpdateFollowUp('u-meera', id, { status: 'SUBMITTED', note: 'Done' });
    for (const user of ['mentor-2', 'u-meera', 'head-1']) await expect(w.ws.mentorDecideFollowUp(user, id, { decision: 'VERIFIED' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.mentorDecideFollowUp('mentor-1', id, { decision: 'RETURNED' })).rejects.toThrow('what needs to be done again');
    await w.ws.mentorDecideFollowUp('mentor-1', id, { decision: 'RETURNED', reason: 'Show the working' });
    expect(tasks(w)[0]).toMatchObject({ status: 'RETURNED', returnReason: 'Show the working' });
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_CLASS_FOLLOW_UP_DECIDED')!.message).toContain('sent back: Show the working');
    await w.ws.tutorUpdateFollowUp('u-meera', id, { status: 'SUBMITTED', note: 'With working' });
    await w.ws.mentorDecideFollowUp('mentor-1', id, { decision: 'VERIFIED' }, at('2026-11-11', '09:00'));
    expect(tasks(w)[0]).toMatchObject({ status: 'VERIFIED', verifiedByUserId: 'mentor-1', verifiedAt: at('2026-11-11', '09:00') });
    await expect(w.ws.mentorDecideFollowUp('mentor-1', id, { decision: 'CANCELLED', reason: 'x' })).rejects.toThrow('already closed');
    expect(w.events(w.session().id)).toEqual(expect.arrayContaining(['FOLLOW_UP_CREATED', 'FOLLOW_UP_SUBMITTED', 'FOLLOW_UP_RETURNED', 'FOLLOW_UP_VERIFIED']));
  });

  it('can be cancelled with a reason, and a follow-up the Mentor kept can be verified directly', async () => {
    const w = world();
    await create(w);
    await create(w, { title: 'My own', assignee: 'MENTOR' });
    const [forTutor, own] = tasks(w);
    await expect(w.ws.mentorDecideFollowUp('mentor-1', forTutor.id, { decision: 'CANCELLED' })).rejects.toThrow('Say why it is cancelled');
    await w.ws.mentorDecideFollowUp('mentor-1', forTutor.id, { decision: 'CANCELLED', reason: 'No longer needed' });
    await w.ws.mentorDecideFollowUp('mentor-1', own.id, { decision: 'VERIFIED' });
    expect(tasks(w).map((t) => t.status)).toEqual(['CANCELLED', 'VERIFIED']);
  });

  it('shows a follow-up past its due time as overdue, and an old task with no class source is not mistaken for one', async () => {
    const w = world();
    await create(w);
    w.db.seed('mentoringTask', { activationId: 'act-A', title: 'Ordinary task', assigneeUserId: 'mentor-1', assignedByUserId: 'head-1' });
    const late = (await w.ws.mentorWorkspace(await w.scope('mentor-1'), KEY, at('2026-11-14', '10:00'))).review.followUps;
    expect(late).toHaveLength(1);
    expect(late[0].overdue).toBe(true);
    await expect(w.ws.mentorDecideFollowUp('mentor-1', tasks(w)[1].id, { decision: 'VERIFIED' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('has routes that need the Mentor work permission and the tutor portal permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, (MentoringClassWorkspaceController.prototype as any).createFollowUp)).toEqual(['mentoring.stage.work']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, (MentoringClassWorkspaceController.prototype as any).decideFollowUp)).toEqual(['mentoring.stage.work']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, (TutorClassWorkspaceController.prototype as any).followUp)).toEqual(['tutor.portal.read']);
  });
});

describe('Stage 1: pause handling and make-up classes', () => {
  it('lets the Mentor move a class after the student resumes, and a class inside the pause is not made up by itself', async () => {
    const w = world();
    const act = w.db.rows('mentoringActivation').find((a) => a.id === 'act-A')!;
    act.status = 'ACTIVATION_ON_HOLD';
    expect((await w.classes.daily('act-A', MON, {}, await w.scope('head-1'), AFTER)).classes).toEqual([]); // dropped during the pause
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0); // and nothing was created for it
    act.status = 'ACTIVATED';
    await expect(w.classes.reschedule(KEY, { newDate: MON, newStart: '18:00', newEnd: '19:00', reason: 'Make-up for the pause' }, 'mentor-1', at(MON, '09:00'))).resolves.toMatchObject({ notified: true });
    expect(w.session()).toMatchObject({ status: 'RESCHEDULED', startMinute: 1080, originalStartMinute: 900 });
    expect(w.db.rows('mentoringTutorAssignmentOverride')[0]).toMatchObject({ reason: 'Make-up for the pause' });
  });
});

// ─── Blocker fix: classes before activation and inside a pause are never operational ───────────────────────────────
describe('classes are operational only after activation and outside every pause', () => {
  const MONDAYS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
  const keyOf = (d: string) => `as-class-A~${d}~900`;
  const LATER = at('2026-12-01', '10:00');
  const jobs = (w: ReturnType<typeof world>) => new MentoringReminderJobsService(w.db as any, w.classes, new MentoringReminderService(w.db as any), new MentoringSlaService(w.db as any, w.access));

  /** Asha's English class every Monday at 15:00, assigned from 5 October, activated at the given moment, with the given pauses (from, to). */
  const setup = (activatedAt: string | null, holds: Array<[string, string | null]> = []) => {
    const w = world();
    w.db.seed('user', { id: 'mentor-1', status: 'ACTIVE' });
    // The other two students are not active, so everything these tests count belongs to Asha.
    for (const id of ['act-B', 'act-H']) w.db.rows('mentoringActivation').find((a) => a.id === id)!.status = 'PENDING_FINAL_APPROVAL';
    w.db.rows('mentoringTutorAssignment').find((a) => a.id === 'as-class-A')!.startDate = day('2026-10-05');
    w.db.rows('mentoringActivation').find((a) => a.id === 'act-A')!.activatedAt = activatedAt ? new Date(activatedAt) : null;
    for (const [from, to] of holds) w.db.seed('workflowHold', { activationId: 'act-A', kind: 'HOLD', reason: 'Pause', previousActivationStatus: 'ACTIVATION_IN_PROGRESS', createdByUserId: 'head-1', createdAt: new Date(from), resolvedAt: to ? new Date(to) : null });
    return w;
  };
  const shown = async (w: ReturnType<typeof world>, date: string, now = LATER) => (await w.classes.daily('act-A', date, {}, await w.scope('head-1'), now)).classes.map((c) => c.key);
  const shownAll = async (w: ReturnType<typeof world>) => { const out: string[] = []; for (const d of MONDAYS) out.push(...(await shown(w, d))); return out; };
  const reminderDates = (w: ReturnType<typeof world>) => [...new Set(w.db.rows('mentoringReminder').filter((r) => r.activationId === 'act-A').map((r) => r.kind.split(':')[1]))].sort();

  it('never shows a class before the activation, and shows the classes after it normally, when the assignment starts earlier', async () => {
    const w = setup('2026-11-04T08:00:00Z');
    expect(await shownAll(w)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'].map(keyOf));
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0);
  });

  it('cannot be reached by its key either: nothing can be reminded, reported, written or opened for a class before activation', async () => {
    const w = setup('2026-11-04T08:00:00Z');
    const before = keyOf('2026-10-26');
    await expect(w.classes.prepareReminder(before, 'mentor-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.classes.tutorSubmitUpdate('u-meera', before, good, at('2026-10-26', '17:00'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.ws.tutorWorkspace('u-meera', before, LATER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.ws.addActivity('u-meera', before, activity(1), LATER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.classes.cancel(before, 'x', 'mentor-1', LATER)).rejects.toBeInstanceOf(NotFoundException);
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0);
    await expect(w.ws.tutorWorkspace('u-meera', keyOf('2026-11-09'), LATER)).resolves.toMatchObject({ student: { name: 'Asha Menon' } });
  });

  it('uses the exact moment of activation: a class that started before it is excluded, one that starts after it is included', async () => {
    const early = setup('2026-11-09T09:00:00Z'); // 14:30 in India, before the 15:00 class
    expect(await shown(early, '2026-11-09')).toEqual([keyOf('2026-11-09')]);
    const late = setup('2026-11-09T10:00:00Z'); // 15:30, after the class started
    expect(await shown(late, '2026-11-09')).toEqual([]);
    expect(await shown(late, '2026-11-16')).toEqual([keyOf('2026-11-16')]);
    const exact = setup('2026-11-09T09:30:00Z'); // the class starts at the very moment of activation
    expect(await shown(exact, '2026-11-09')).toEqual([keyOf('2026-11-09')]);
  });

  it('shows no class of a student whose activation moment was never recorded, and invents no date for one', async () => {
    const w = setup(null);
    expect(await shownAll(w)).toEqual([]);
    expect(w.db.rows('mentoringClassSession')).toHaveLength(0);
    await jobs(w).run(at('2026-11-09', '14:20'));
    expect(w.db.rows('mentoringReminder')).toHaveLength(0);
  });

  it('makes no reminder and no Mentor alert for a class before activation, and does for the classes after it', async () => {
    const w = setup('2026-11-03T00:00:00Z');
    const j = jobs(w);
    // On Tuesday 3 November the Monday class of 2 November is 24 hours old, which would be a reminder and a Mentor alert if it counted.
    await j.run(at('2026-11-03', '17:00'));
    await j.run(at('2026-11-03', '18:00'));
    // Only the class of 9 November, which is after activation, is prepared. Nothing for 2 November or any Monday before it.
    expect(reminderDates(w)).toEqual(['2026-11-09']);
    expect(w.db.rows('mentoringReminder').filter((r) => r.kind.startsWith('CLASS_UPDATE'))).toEqual([]);
    expect(w.db.rows('notification').filter((n) => n.recipientUserId === 'mentor-1')).toEqual([]);
    await j.run(at('2026-11-09', '14:20'));
    expect(reminderDates(w)).toEqual(['2026-11-09', '2026-11-16']);
    await j.run(at('2026-11-10', '16:00')); // the update for 9 November is 24 hours late
    expect(w.db.rows('notification').filter((n) => n.recipientUserId === 'mentor-1' && n.message.includes('still missing'))).toHaveLength(1);
    expect(reminderDates(w)).not.toContain('2026-11-02');
  });

  it('keeps a class inside a pause out after the student resumes, and shows the classes before and after the pause', async () => {
    const w = setup('2026-11-01T00:00:00Z', [['2026-11-14T00:00:00Z', '2026-11-20T00:00:00Z']]);
    expect(await shownAll(w)).toEqual(['2026-11-02', '2026-11-09', '2026-11-23', '2026-11-30'].map(keyOf));
    expect(await shown(w, '2026-11-16')).toEqual([]);
  });

  it('never restores a class of a historical pause, however often it is listed, generated or run again', async () => {
    const w = setup('2026-11-01T00:00:00Z', [['2026-11-14T00:00:00Z', '2026-11-20T00:00:00Z']]);
    const j = jobs(w);
    for (let i = 0; i < 3; i++) {
      expect(await shown(w, '2026-11-16')).toEqual([]);
      for (const t of [at('2026-11-14', '12:00'), at('2026-11-15', '14:20'), at('2026-11-16', '14:20'), at('2026-11-16', '17:00'), at('2026-11-17', '16:00'), at('2026-11-18', '16:00'), at('2026-11-19', '16:00'), at('2026-11-21', '10:00')]) await Promise.all([j.run(t), j.run(t)]);
    }
    expect(reminderDates(w)).not.toContain('2026-11-16');
    expect(w.db.rows('mentoringClassSession').filter((s) => s.date.toISOString().startsWith('2026-11-16'))).toEqual([]);
    expect(w.db.rows('notification').filter((n) => n.recipientUserId === 'mentor-1' && n.message.includes('2026-11-16'))).toEqual([]);
    expect((await w.ws.list(await w.scope('head-1'), { from: '2026-11-02', to: '2026-11-30' }, LATER)).rows.map((r) => r.key)).toEqual(['2026-11-02', '2026-11-09', '2026-11-23', '2026-11-30'].map(keyOf));
    expect((await w.classes.tutorClasses('u-meera', '2026-11-14', '2026-11-20', LATER)).map((c) => c.key)).toEqual([]);
  });

  it('starts a pause at the first moment and ends it at the last: a class at the start of the pause is out, one at its end is in', async () => {
    const w = setup('2026-11-01T00:00:00Z', [['2026-11-16T09:30:00Z', '2026-11-23T09:30:00Z']]);
    expect(await shown(w, '2026-11-09')).toEqual([keyOf('2026-11-09')]);
    expect(await shown(w, '2026-11-16')).toEqual([]); // starts exactly when the pause begins
    expect(await shown(w, '2026-11-23')).toEqual([keyOf('2026-11-23')]); // starts exactly when it ends
  });

  it('keeps every class inside two separate pauses out, and the classes between them in', async () => {
    const w = setup('2026-11-01T00:00:00Z', [['2026-11-08T00:00:00Z', '2026-11-12T00:00:00Z'], ['2026-11-22T00:00:00Z', '2026-11-25T00:00:00Z']]);
    expect(await shownAll(w)).toEqual(['2026-11-02', '2026-11-16', '2026-11-30'].map(keyOf));
  });

  it('stays out while a pause is still open, and an open pause ends the class day for all classes after it', async () => {
    const w = setup('2026-11-01T00:00:00Z', [['2026-11-12T00:00:00Z', null]]);
    expect(await shownAll(w)).toEqual(['2026-11-02', '2026-11-09'].map(keyOf));
    expect(operationalAt({ activatedAt: new Date('2026-11-01T00:00:00Z'), holds: [{ from: new Date('2026-11-12T00:00:00Z'), to: null }] }, new Date('2026-12-30T00:00:00Z'))).toBe(false);
  });

  it('leaves a class that was already reported or cancelled inside a pause as history, unchanged, with no reminders, and drops one that was only scheduled', async () => {
    const w = setup('2026-11-01T00:00:00Z');
    await w.classes.tutorSubmitUpdate('u-meera', keyOf('2026-11-16'), good, at('2026-11-16', '17:00')); // reported
    await w.classes.cancel(keyOf('2026-11-23'), 'Holiday', 'mentor-1', at('2026-11-20', '10:00')); // cancelled
    await w.classes.prepareReminder(keyOf('2026-11-30'), 'mentor-1'); // only scheduled, with a reminder prepared
    const before = JSON.stringify(w.db.rows('mentoringClassSession').map((s) => [s.id, s.status, s.verifiedMinutes]));
    // A pause is recorded afterwards that covers all three Mondays.
    w.db.seed('workflowHold', { activationId: 'act-A', kind: 'HOLD', reason: 'Pause', previousActivationStatus: 'ACTIVATION_IN_PROGRESS', createdByUserId: 'head-1', createdAt: new Date('2026-11-14T00:00:00Z'), resolvedAt: new Date('2026-12-05T00:00:00Z') });
    expect(await shown(w, '2026-11-16')).toEqual([keyOf('2026-11-16')]);
    expect(await shown(w, '2026-11-23')).toEqual([keyOf('2026-11-23')]);
    expect(await shown(w, '2026-11-30')).toEqual([]);
    expect(JSON.stringify(w.db.rows('mentoringClassSession').map((s) => [s.id, s.status, s.verifiedMinutes]))).toBe(before);
    expect(w.db.rows('tutorClassRecord')).toHaveLength(0);
    const r = await jobs(w).run(at('2026-11-30', '10:00'));
    expect(r.withdrawn).toBeGreaterThanOrEqual(1);
    expect(w.db.rows('mentoringReminder').filter((x) => x.kind.includes('2026-11-30') && x.status === 'PREPARED')).toEqual([]);
    expect(w.db.rows('mentoringReminder').filter((x) => x.kind.startsWith('CLASS_UPDATE') && x.kind.includes('2026-11-16'))).toEqual([]);
  });

  it('keeps the compensation and consumption of a verified class that falls inside a pause recorded later', async () => {
    const w = setup('2026-11-01T00:00:00Z');
    await w.classes.tutorSubmitUpdate('u-meera', KEY, good, AFTER);
    await w.prepare();
    await w.classes.verify(w.session().id, {}, 'mentor-1', at(MON, '18:00'));
    w.db.seed('workflowHold', { activationId: 'act-A', kind: 'HOLD', reason: 'Pause', previousActivationStatus: 'ACTIVATION_IN_PROGRESS', createdByUserId: 'head-1', createdAt: new Date('2026-11-08T00:00:00Z'), resolvedAt: new Date('2026-11-12T00:00:00Z') });
    expect(await shown(w, MON)).toEqual([KEY]);
    const c = (await w.classes.daily('act-A', MON, {}, await w.scope('head-1'), at('2026-12-01', '10:00'))).classes[0];
    expect(c).toMatchObject({ status: 'VERIFIED', consumption: 'CONSUMED' });
    expect(w.db.rows('tutorClassRecord')).toHaveLength(1);
    expect(w.db.rows('tutorClassRecord')[0]).toMatchObject({ workedMinutes: 65, status: 'VERIFIED' });
  });

  it('refuses to move a class to a time inside a pause or before activation, and allows a time after the pause', async () => {
    const w = setup('2026-11-01T00:00:00Z', [['2026-11-12T00:00:00Z', '2026-11-13T12:00:00Z']]);
    const move = (date: string, start: string, end: string) => w.classes.reschedule(keyOf('2026-11-09'), { newDate: date, newStart: start, newEnd: end, reason: 'Make-up' }, 'mentor-1', at('2026-11-09', '09:00'));
    await expect(move('2026-11-12', '18:00', '19:00')).rejects.toThrow('before the student was activated or during a pause');
    await expect(move('2026-11-13', '16:00', '17:00')).rejects.toThrow('before the student was activated or during a pause');
    await expect(move('2026-11-13', '18:30', '19:30')).resolves.toMatchObject({ notified: true });
    const early = setup('2026-11-10T00:00:00Z'); // activated after the class that would be moved
    await expect(early.classes.reschedule(keyOf('2026-11-16'), { newDate: '2026-11-09', newStart: '18:00', newEnd: '19:00', reason: 'Earlier' }, 'mentor-1', at('2026-11-09', '09:00'))).rejects.toThrow('before the student was activated');
  });

  it('shows the same classes in the daily list, the tutor classes, the Mentor list and the dashboard queue', async () => {
    const w = setup('2026-11-04T08:00:00Z', [['2026-11-14T00:00:00Z', '2026-11-20T00:00:00Z']]);
    const keys = ['2026-11-09', '2026-11-23', '2026-11-30'].map(keyOf);
    expect((await w.ws.list(await w.scope('head-1'), { from: '2026-10-05', to: '2026-11-04' }, LATER)).rows).toEqual([]);
    expect((await w.ws.list(await w.scope('head-1'), { from: '2026-11-05', to: '2026-12-04' }, LATER)).rows.map((r) => r.key)).toEqual(keys);
    expect((await w.classes.tutorClasses('u-meera', '2026-11-05', '2026-12-04', LATER)).map((c) => c.key)).toEqual(keys);
    expect((await w.classes.range(await w.scope('mentor-1'), '2026-11-05', '2026-12-04', null, {}, LATER)).map((c) => c.key)).toEqual(keys);
  });
});
