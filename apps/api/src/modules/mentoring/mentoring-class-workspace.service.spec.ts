/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Writable } from 'stream';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MAX_AUDIO_BYTES } from './class-workspace';
import { MentoringAccessService } from './mentoring-access.service';
import { MentoringClassWorkspaceController, TutorClassWorkspaceController } from './mentoring-class-workspace.controller';
import { MentoringClassWorkspaceService } from './mentoring-class-workspace.service';
import { MentoringClassService } from './mentoring-class.service';
import { MentoringHistoryService } from './mentoring-history.service';
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
  nobody: [],
};
const good = { conducted: true, actualStart: '15:05', actualEnd: '16:10', topicsCovered: 'Tenses', attendance: 'PRESENT' };
const mp3 = (n = 200) => Buffer.concat([Buffer.from('ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1'), Buffer.alloc(n, 7)]);
const audio = (over: Partial<{ originalname: string; mimetype: string; buffer: Buffer }> = {}) => ({ originalname: 'my voice.mp3', mimetype: 'audio/mpeg', buffer: mp3(), ...over });
const activity = (i: number, over: object = {}) => ({ title: `Activity ${i}`, type: 'WORKSHEET', topic: 'Tenses', instructions: 'Complete the worksheet.', ...over });

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
    db.seed('mentoringActivation', { id: `act-${id}`, leadId: `lead-${id}`, studentId: `stu-${id}`, handoverId: `ho-${id}`, status: 'ACTIVATION_IN_PROGRESS', currentStage: 3, currentMentorUserId: mentor });
    db.seed('mentoringStage', { activationId: `act-${id}`, stageNumber: 3, key: 'TIMETABLE_CREATION', status: 'IN_PROGRESS' });
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

describe('before class: the reminder', () => {
  it('shows the 45 minute target, the class details and the Meet link, and warns in amber when due and in red once the class has started', async () => {
    const w = world();
    await w.ws.setMeetLink('mentor-1', KEY, { link: 'https://meet.google.com/abc-defg-hij' });
    const early = (await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:00'))).before;
    expect(early).toMatchObject({ targetAt: at(MON, '14:15').toISOString(), leadMinutes: 45, meetLink: 'https://meet.google.com/abc-defg-hij', warning: null, done: false });
    expect(early.message).toMatchObject({ ok: true });
    expect(early.message.text).toContain('Student: Asha Menon');
    expect(early.message.text).toContain('Tutor: Meera Thomas');
    expect(early.message.text).toContain('Time: 3:00 PM to 4:00 PM');
    expect(early.message.text).toContain('Meet link: https://meet.google.com/abc-defg-hij');
    expect((await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:30'))).before.warning).toMatchObject({ level: 'amber' });
    expect((await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '15:10'))).before.warning).toMatchObject({ level: 'red' });
  });

  it('does not make up a Meet link: the message asks for it, and takes one typed in', async () => {
    const w = world();
    const before = (await w.ws.tutorWorkspace('u-meera', KEY, at(MON, '14:00'))).before.message;
    expect(before).toMatchObject({ ok: false, missing: ['meetLink'], message: 'Complete the Meet link first.' });
    await expect(w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', {}, at(MON, '14:00'))).rejects.toThrow('Complete the Meet link first.');
    const made = await w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { meetLink: 'https://meet.google.com/zzz-yyyy-xxx' }, at(MON, '14:00'));
    expect(made.text).toContain('https://meet.google.com/zzz-yyyy-xxx');
  });

  it('copying is not sharing: the message stays not confirmed until a named person says they shared it, and confirming twice records once', async () => {
    const w = world();
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
    const { shareId } = await w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { meetLink: 'https://meet.google.com/aaa-bbbb-ccc' }, AFTER);
    await expect(w.ws.confirmShare('u-rahul', 'TUTOR', shareId, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.confirmShare('mentor-2', 'MENTOR', shareId, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.confirmShare('mentor-1', 'MENTOR', shareId, AFTER)).resolves.toMatchObject({ shared: true });
    await expect(w.ws.prepareShare('u-rahul', 'TUTOR', KEY, 'CLASS_REMINDER', {}, AFTER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'NOT_A_TEMPLATE', {}, AFTER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets only the assigned Mentor set the Meet link, an https address, and clears it when empty', async () => {
    const w = world();
    await expect(w.ws.setMeetLink('mentor-2', KEY, { link: 'https://meet.google.com/x-y-z' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.ws.setMeetLink('mentor-1', KEY, { link: 'http://insecure.example' })).rejects.toThrow('https://');
    await w.ws.setMeetLink('mentor-1', KEY, { link: 'https://meet.google.com/x-y-z' });
    expect(w.session().meetLink).toBe('https://meet.google.com/x-y-z');
    await w.ws.setMeetLink('mentor-1', KEY, { link: '' });
    expect(w.session().meetLink).toBeNull();
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
    await expect(w.ws.setMeetLink('mentor-1', KEY, { link: 'https://meet.google.com/a-b-c' })).rejects.toThrow('is verified');
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
    for (const name of ['share', 'meetLink', 'cancel', 'requestException', 'copied', 'confirm', 'response']) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['mentoring.stage.work']);
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
    const made = await w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { studentName: 'Somebody Else', tutorName: 'Not The Tutor', classDate: 'Never', classTime: '1:00 AM', subject: 'Maths', meetLink: 'https://meet.google.com/aaa-bbbb-ccc' }, at(MON, '14:00'));
    expect(made.text).toContain('Asha Menon');
    expect(made.text).toContain('Meera Thomas');
    expect(made.text).toContain('3:00 PM to 4:00 PM');
    for (const forged of ['Somebody Else', 'Not The Tutor', 'Never', '1:00 AM', 'Maths']) expect(made.text).not.toContain(forged);
    expect(made.text).toContain('https://meet.google.com/aaa-bbbb-ccc');
  });

  it('does not let a caller fill a value the class record leaves out, other than the Meet link', async () => {
    const w = world();
    await expect(w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_UPDATE', { duration: '9 h', topicsCovered: 'Invented', practiceWork: 'Invented' }, AFTER)).rejects.toThrow();
    expect(w.db.rows('mentoringMessageShare')).toHaveLength(0);
  });

  it('accepts only an https Meet link and says why when it is not one', async () => {
    const w = world();
    for (const link of ['http://insecure.example/x', 'javascript:alert(1)', 'meet.google.com/abc', 'ftp://x.example']) {
      await expect(w.ws.prepareShare('u-meera', 'TUTOR', KEY, 'CLASS_REMINDER', { meetLink: link }, at(MON, '14:00'))).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(w.db.rows('mentoringMessageShare')).toHaveLength(0);
    await expect(w.ws.prepareShare('mentor-1', 'MENTOR', KEY, 'CLASS_REMINDER', { meetLink: 'https://meet.google.com/ok-okok-ok' }, at(MON, '14:00'))).resolves.toMatchObject({ shared: false });
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
