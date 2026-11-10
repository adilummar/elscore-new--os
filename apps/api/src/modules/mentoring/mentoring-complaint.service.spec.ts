/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringComplaintController } from './mentoring-complaint.controller';
import { MentoringComplaintService } from './mentoring-complaint.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { FakeDb } from './testing/mentoring-fake-db';

const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const DAY0 = '2026-11-10'; // a Tuesday
const NOW = at(DAY0, '10:00');

const HANDLE = 'mentoring.complaint.handle';
const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work', HANDLE],
  'mentor-2': ['mentoring.student.read-assigned', 'mentoring.stage.work', HANDLE],
  'head-1': ['mentoring.student.read-all', 'mentoring.allocation.manage', HANDLE],
  'counselor-1': ['mentoring.student.read-assigned'],
  'ceo-1': ['mentoring.student.read-all'],
  nobody: [],
};
const good = { title: 'Tutor joins late', category: 'TUTOR', description: 'The tutor joined 20 minutes late twice this week.', parentName: 'Parent A', channel: 'PHONE' };
const resolution = { remarks: 'The tutor was spoken to and the class time was fixed.', how: 'The class moved to a time the tutor can keep', communication: 'INFORMED' };

function world() {
  const db = new FakeDb();
  db.seed('subject', { id: 'sub-en', name: 'English', isActive: true });
  db.seed('subject', { id: 'sub-ma', name: 'Mathematics', isActive: true });
  for (const [id, mentor] of [['A', 'mentor-1'], ['B', 'mentor-2']] as const) {
    db.seed('lead', { id: `lead-${id}` });
    db.seed('student', { id: `stu-${id}`, firstName: 'Synthetic', lastName: `Student ${id}` });
    db.seed('mentoringActivation', { id: `act-${id}`, leadId: `lead-${id}`, studentId: `stu-${id}`, handoverId: `ho-${id}`, status: 'ACTIVATION_IN_PROGRESS', currentMentorUserId: mentor });
    db.seed('enrollmentHandoverField', { handoverId: `ho-${id}`, fieldKey: 'timetable.schedule', value: { version: 2, subjects: [{ subjectId: 'sub-en', subjectName: 'English' }] }, origin: 'MENTOR_COLLECTED', updatedByUserId: mentor });
  }
  for (const [userId, first, last] of [['mentor-1', 'Mira', 'Mentor'], ['mentor-2', 'Mohan', 'Mentor'], ['head-1', 'Hari', 'Head'], ['counselor-1', 'Chitra', 'Counselor'], ['u-meera', 'Meera', 'Thomas'], ['u-other', 'Omar', 'Tutor']] as const) {
    db.seed('employee', { id: `e-${userId}`, userId, firstName: first, lastName: last, employmentStatus: 'ACTIVE' });
  }
  db.seed('mentoringStaffProfile', { userId: 'mentor-1', role: 'MENTOR', isActive: true });
  db.seed('mentoringStaffProfile', { userId: 'mentor-2', role: 'MENTOR', isActive: true });
  db.seed('mentoringStaffProfile', { userId: 'counselor-1', role: 'DEMO_COUNSELOR', isActive: true });
  db.seed('role', { id: 'r-head', code: 'MENTORING_HEAD' });
  db.seed('userRole', { userId: 'head-1', roleId: 'r-head' });
  db.seed('tutorProfile', { id: 'tp-meera', employeeId: 'e-u-meera', tutorOperationalStatus: 'ACTIVE' });
  db.seed('mentoringTutorAssignment', { id: 'as-1', activationId: 'act-A', subjectId: 'sub-en', tutorProfileId: 'tp-meera', status: 'ACTIVE', currentKey: 'act-A:sub-en' });

  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: (id: string) => Promise.resolve(new Set(PERMS[id] ?? [])) } as any);
  const sla = new MentoringSlaService(db as any, access);
  const service = new MentoringComplaintService(db as any, access, history, sla);
  const scope = (user: string) => access.scopeFor(user);
  const log = async (over: object = {}, act = 'act-A', user = 'mentor-1', now = NOW) => (await service.create(act, { ...good, ...over }, user, now)).complaintId;
  const row = (id?: string) => db.rows('mentoringComplaint').find((c) => !id || c.id === id)!;
  const entries = (id: string) => db.rows('mentoringComplaintEntry').filter((e) => e.complaintId === id);
  const clocks = (id: string) => db.rows('mentoringSlaItem').filter((i) => i.entityId === id);
  const detail = async (id: string, now = NOW, user = 'mentor-1') => service.detail(id, await scope(user), now);
  const ack = (id: string, now = NOW, user = 'mentor-1') => service.acknowledge(id, { channel: 'PHONE', note: 'Called the parent' }, user, now);
  return { db, service, access, scope, log, row, entries, clocks, detail, ack };
}

describe('logging a complaint for the parent', () => {
  it('records the title, category, description, student, parent, date, priority and assigned Mentor, with status New', async () => {
    const w = world();
    const id = await w.log({ priority: 'HIGH', supportingNote: 'Screenshot kept by the Mentor' });
    const d = await w.detail(id);
    expect(d).toMatchObject({
      number: `CMP-${id.slice(0, 8).toUpperCase()}`, title: 'Tutor joins late', category: 'TUTOR', categoryLabel: 'Tutor', description: good.description, priority: 'HIGH', priorityLabel: 'High', studentName: 'Synthetic Student A', parentName: 'Parent A',
      status: 'NEW', statusLabel: 'New', stage: 'STARTED', stageLabel: 'Started', assignedToUserId: 'mentor-1', assignedToName: 'Mira Mentor', receivedAt: NOW.toISOString(), channel: 'PHONE', supportingNote: 'Screenshot kept by the Mentor', loggedByName: 'Mira Mentor',
    });
    expect(w.row()).toMatchObject({ status: 'NEW', assignedToUserId: 'mentor-1', loggedByUserId: 'mentor-1' });
  });

  it('starts the two working hour acknowledgement clock from when the parent complained, and says so', async () => {
    const w = world();
    const id = await w.log();
    const d = await w.detail(id);
    expect(d.ack).toMatchObject({ startedAt: NOW.toISOString(), dueAt: at(DAY0, '12:00').toISOString(), state: 'WITHIN_SLA', stateLabel: 'Within SLA', acknowledgedAt: null, firstResponseAt: null, target: { targetMinutes: 120, mode: 'WORKING_HOURS' } });
    expect(w.clocks(id)).toHaveLength(1);
    expect(w.clocks(id)[0]).toMatchObject({ policyKey: 'COMPLAINT_ACKNOWLEDGEMENT', entityType: 'Complaint', responsibleUserId: 'mentor-1', status: 'OPEN' });
  });

  it('counts working hours only: a complaint late in the day is due the next morning', async () => {
    const w = world();
    const id = await w.log({}, 'act-A', 'mentor-1', at(DAY0, '17:30'));
    expect((await w.detail(id, at(DAY0, '17:45'))).ack.dueAt).toBe(at('2026-11-11', '10:30').toISOString());
  });

  it('starts the clock from an earlier time when the parent complained before it could be written down, so a late log is visible, not hidden', async () => {
    const w = world();
    const id = await w.log({ receivedAt: at(DAY0, '09:00').toISOString() });
    const d = await w.detail(id, at(DAY0, '10:30'));
    expect(d.ack).toMatchObject({ startedAt: at(DAY0, '09:00').toISOString(), dueAt: at(DAY0, '11:00').toISOString(), state: 'APPROACHING' });
    expect(d.loggedAt).toBe(NOW.toISOString());
    await expect(w.log({ receivedAt: at(DAY0, '11:00').toISOString() })).rejects.toThrow('cannot be in the future');
    await expect(w.log({ receivedAt: '2026-09-01T00:00:00Z' })).rejects.toThrow('30 days');
  });

  it('adds what the parent can see: the complaint was recorded', async () => {
    const w = world();
    const id = await w.log();
    expect(w.entries(id)).toHaveLength(1);
    expect(w.entries(id)[0]).toMatchObject({ kind: 'LOGGED', visibility: 'PARENT', text: 'Complaint recorded: Tutor joins late', actorUserId: 'mentor-1' });
  });

  it('refuses a complaint without what it needs, with a clear message', async () => {
    const w = world();
    await expect(w.log({ title: ' ' })).rejects.toThrow('Give the complaint a title');
    await expect(w.log({ category: 'WEATHER' })).rejects.toThrow('Choose a category');
    await expect(w.log({ description: '' })).rejects.toThrow('Write what the parent complained about');
    await expect(w.log({ parentName: '' })).rejects.toThrow('name of the parent');
    await expect(w.log({ channel: 'FAX' })).rejects.toThrow('how the parent made the complaint');
    expect(w.db.rows('mentoringComplaint')).toHaveLength(0);
    expect(w.db.rows('mentoringSlaItem')).toHaveLength(0);
  });

  it('links a complaint to a subject of the schedule and to a tutor who teaches the student, and refuses others', async () => {
    const w = world();
    const id = await w.log({ subjectId: 'sub-en', tutorUserId: 'u-meera' });
    expect(await w.detail(id)).toMatchObject({ subjectName: 'English', tutorName: 'Meera Thomas' });
    await expect(w.log({ subjectId: 'sub-ma' })).rejects.toThrow('not in the student');
    await expect(w.log({ tutorUserId: 'u-other' })).rejects.toThrow('does not teach this student');
  });

  it('only the assigned Mentor or the Mentoring Head can log one, and nobody without the complaint permission', async () => {
    const w = world();
    await expect(w.log({}, 'act-A', 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.log({}, 'act-A', 'counselor-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.log({}, 'act-A', 'ceo-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.log({}, 'act-A', 'head-1')).resolves.toBeDefined();
    expect(w.db.rows('mentoringComplaint')).toHaveLength(1);
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_COMPLAINT_LOGGED')).toMatchObject({ recipientUserId: 'mentor-1' });
  });

  it('can be logged while the workflow is on hold, because a parent complaint must still be handled', async () => {
    const w = world();
    w.db.rows('mentoringActivation')[0].status = 'ACTIVATION_ON_HOLD';
    await expect(w.log()).resolves.toBeDefined();
  });
});

describe('acknowledging a complaint', () => {
  it('stops the acknowledgement clock, records how and when, and makes the complaint acknowledged', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.ack(id, at(DAY0, '10:45'))).resolves.toMatchObject({ state: 'RESOLVED', stateLabel: 'Resolved', metSla: true, overdueMinutes: 0 });
    const d = await w.detail(id, at(DAY0, '11:00'));
    expect(d).toMatchObject({ status: 'ACKNOWLEDGED', stage: 'STARTED' });
    expect(d.acknowledged).toMatchObject({ at: at(DAY0, '10:45').toISOString(), byName: 'Mira Mentor', channelLabel: 'Phone call', note: 'Called the parent' });
    expect(d.ack).toMatchObject({ firstResponseAt: at(DAY0, '10:45').toISOString(), metSla: true });
    expect(w.entries(id).find((e) => e.kind === 'ACKNOWLEDGED')).toMatchObject({ visibility: 'PARENT', text: 'Acknowledged by phone call. Called the parent' });
  });

  it('shows a late acknowledgement as a missed target, by how long, instead of hiding it', async () => {
    const w = world();
    const id = await w.log();
    expect(await w.ack(id, at(DAY0, '13:00'))).toMatchObject({ metSla: false, overdueMinutes: 60 });
    expect((await w.detail(id, at(DAY0, '14:00'))).ack).toMatchObject({ metSla: false, overdueMinutes: 60, stateLabel: 'Resolved' });
  });

  it('shows within SLA, approaching and breached on the way, from the clock', async () => {
    const w = world();
    const id = await w.log();
    expect((await w.detail(id, at(DAY0, '10:30'))).ack.state).toBe('WITHIN_SLA');
    expect((await w.detail(id, at(DAY0, '11:35'))).ack).toMatchObject({ state: 'APPROACHING', stateLabel: 'Approaching SLA' });
    expect((await w.detail(id, at(DAY0, '12:30'))).ack).toMatchObject({ state: 'BREACHED', stateLabel: 'SLA breached', overdueMinutes: 30 });
  });

  it('needs to say how the parent was told, can be done once, and not on a resolved complaint', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.service.acknowledge(id, { channel: 'SMOKE' }, 'mentor-1', NOW)).rejects.toThrow('how you told the parent');
    await w.ack(id);
    await expect(w.ack(id)).rejects.toThrow('already been acknowledged');
    await w.service.resolve(id, resolution, 'mentor-1', NOW);
    const other = await w.log({ title: 'Second' });
    await w.ack(other);
    await w.service.resolve(other, resolution, 'mentor-1', NOW);
    await expect(w.service.acknowledge(other, { channel: 'PHONE' }, 'mentor-1', NOW)).rejects.toThrow('resolved');
  });
});

describe('writing on a complaint', () => {
  it('keeps internal remarks and actions out of what the parent sees', async () => {
    const w = world();
    const id = await w.log();
    await w.service.addRemark(id, { text: 'The tutor has complained about this family before' }, 'mentor-1');
    await w.service.addAction(id, { text: 'Spoke to the tutor' }, 'mentor-1');
    const d = await w.detail(id);
    expect(d.entries.map((e) => [e.kind, e.visibility])).toEqual([['LOGGED', 'PARENT'], ['INTERNAL_REMARK', 'INTERNAL'], ['ACTION_TAKEN', 'INTERNAL']]);
    expect(d.parentView.history.map((h) => h.kind)).toEqual(['LOGGED']);
    expect(JSON.stringify(d.parentView)).not.toContain('complained about this family');
    expect(JSON.stringify(d.parentView)).not.toContain('Spoke to the tutor');
  });

  it('needs an acknowledgement before a response to the parent, then shows it as the parent communication history, and counts it as the response', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.service.respondToParent(id, { text: 'We are looking into it' }, 'mentor-1', NOW)).rejects.toThrow('Acknowledge the complaint first');
    await w.ack(id, at(DAY0, '10:20'));
    await w.service.respondToParent(id, { text: 'We moved the class time' }, 'mentor-1', at(DAY0, '11:00'));
    await w.service.recordParentMessage(id, { text: 'Thank you, that works for us', channel: 'WHATSAPP' }, 'mentor-1', at(DAY0, '11:30'));
    const d = await w.detail(id, at(DAY0, '12:00'));
    expect(d.parentView.history.map((h) => [h.kind, h.text])).toEqual([['LOGGED', 'Complaint recorded: Tutor joins late'], ['ACKNOWLEDGED', 'Acknowledged by phone call. Called the parent'], ['PARENT_RESPONSE', 'We moved the class time'], ['PARENT_MESSAGE', 'Thank you, that works for us']]);
    expect(d.parentView.history.every((h) => h.by === 'Mira Mentor')).toBe(true);
    expect(w.clocks(id)[0].firstResponseAt).toEqual(at(DAY0, '10:20')); // the first response, not the later ones
  });

  it('needs words, and says what is wrong', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.service.addRemark(id, { text: ' ' }, 'mentor-1')).rejects.toThrow('Write the remark');
    await expect(w.service.addAction(id, { text: 5 }, 'mentor-1')).rejects.toThrow('must be text');
    await expect(w.service.addRemark(id, null, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('assigning and escalating', () => {
  it('assigns to a staff member who holds the complaint permission, tells them in the app, and moves the response clock to them', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.service.assign(id, { userId: 'mentor-2' }, 'mentor-1', NOW)).resolves.toMatchObject({ assignedToName: 'Mohan Mentor', escalated: false });
    expect(w.row()).toMatchObject({ assignedToUserId: 'mentor-2', status: 'ASSIGNED' });
    expect(w.clocks(id)[0].responsibleUserId).toBe('mentor-2');
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_COMPLAINT_ASSIGNED')).toMatchObject({ recipientUserId: 'mentor-2', action: '/mentoring/students/act-A' });
    expect((await w.detail(id)).stage).toBe('STARTED'); // assigned is still a started complaint to the parent
  });

  it('escalates with a reason, to the Mentoring Head, who can then work it', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.service.assign(id, { userId: 'head-1', escalate: true }, 'mentor-1', NOW)).rejects.toThrow('Say why the complaint is being escalated');
    await w.service.assign(id, { userId: 'head-1', escalate: true, reason: 'The parent asked for the Head' }, 'mentor-1', NOW);
    expect(w.row()).toMatchObject({ assignedToUserId: 'head-1', escalatedAt: NOW });
    expect(w.entries(id).find((e) => e.kind === 'ESCALATED')).toMatchObject({ visibility: 'INTERNAL', text: 'Escalated to Hari Head. The parent asked for the Head' });
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_COMPLAINT_ESCALATED')).toMatchObject({ recipientUserId: 'head-1' });
    await expect(w.ack(id, NOW, 'head-1')).resolves.toBeDefined();
  });

  it('lets the person it was assigned to read and work it even though the student is not theirs, and nobody else of that Mentor', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.detail(id, NOW, 'mentor-2')).rejects.toBeInstanceOf(NotFoundException);
    await w.service.assign(id, { userId: 'mentor-2' }, 'mentor-1', NOW);
    await expect(w.detail(id, NOW, 'mentor-2')).resolves.toMatchObject({ actions: { canHandle: true } });
    await expect(w.ack(id, NOW, 'mentor-2')).resolves.toBeDefined();
    expect((await w.detail(id, NOW, 'mentor-1')).actions.canHandle).toBe(true); // the student's own Mentor still can
  });

  it('refuses someone who is not an authorized staff member, or who already has it', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.service.assign(id, { userId: 'counselor-1' }, 'mentor-1', NOW)).rejects.toThrow('not an authorized staff member');
    await expect(w.service.assign(id, { userId: 'ghost' }, 'mentor-1', NOW)).rejects.toThrow('not an authorized staff member');
    await expect(w.service.assign(id, { userId: 'mentor-1' }, 'mentor-1', NOW)).rejects.toThrow('already assigned');
    expect(w.row().assignedToUserId).toBe('mentor-1');
  });

  it('lists as choices only the staff who really hold the permission', async () => {
    const w = world();
    expect((await w.service.handlers(await w.scope('mentor-1'))).map((h) => h.name)).toEqual(['Hari Head', 'Mira Mentor', 'Mohan Mentor']);
  });
});

describe('moving a complaint along', () => {
  it('needs the acknowledgement first, then moves to in progress and tells the parent it is ongoing', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.service.setStatus(id, { status: 'IN_PROGRESS' }, 'mentor-1')).rejects.toThrow('Acknowledge the complaint first');
    await w.ack(id);
    await w.service.setStatus(id, { status: 'IN_PROGRESS', note: 'Looking at the timetable' }, 'mentor-1');
    const d = await w.detail(id);
    expect(d).toMatchObject({ status: 'IN_PROGRESS', stage: 'ONGOING', stageLabel: 'Ongoing' });
    expect(d.parentView.history.map((h) => h.text)).toContain('Status: Ongoing');
    expect(d.entries.find((e) => e.text === 'Looking at the timetable')?.visibility).toBe('INTERNAL');
  });

  it('keeps the parent informed only when the stage changes, not for waiting on the parent or the tutor', async () => {
    const w = world();
    const id = await w.log();
    await w.ack(id);
    await w.service.setStatus(id, { status: 'IN_PROGRESS' }, 'mentor-1');
    await w.service.setStatus(id, { status: 'WAITING_FOR_PARENT' }, 'mentor-1');
    await w.service.setStatus(id, { status: 'WAITING_FOR_TUTOR' }, 'mentor-1');
    const d = await w.detail(id);
    expect(d.stage).toBe('ONGOING');
    expect(d.parentView.history.filter((h) => h.kind === 'STATUS_CHANGED')).toHaveLength(1);
    expect(d.entries.filter((e) => e.kind === 'STATUS_CHANGED').map((e) => e.visibility)).toEqual(['PARENT', 'INTERNAL', 'INTERNAL']);
    await expect(w.service.setStatus(id, { status: 'WAITING_FOR_TUTOR' }, 'mentor-1')).rejects.toThrow('already has that status');
  });

  it('cannot set new, resolved, assigned or reopened by hand', async () => {
    const w = world();
    const id = await w.log();
    await w.ack(id);
    for (const status of ['NEW', 'RESOLVED', 'ASSIGNED', 'REOPENED']) await expect(w.service.setStatus(id, { status }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('resolving a complaint', () => {
  it('is refused without the explanation, the way it was resolved, or whether the parent was told, and nothing changes', async () => {
    const w = world();
    const id = await w.log();
    await w.ack(id);
    for (const [over, message] of [[{ remarks: '' }, 'Explain how the complaint was resolved'], [{ remarks: 'done' }, 'Explain how'], [{ how: ' ' }, 'Say how the problem was resolved'], [{ communication: undefined }, 'whether the parent has been told'], [{ communication: 'NOT_REACHABLE' }, 'Say why the parent has not been told']] as const) {
      await expect(w.service.resolve(id, { ...resolution, ...over }, 'mentor-1', NOW)).rejects.toThrow(message);
    }
    await expect(w.service.resolve(id, null, 'mentor-1', NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect(w.row()).toMatchObject({ status: 'ACKNOWLEDGED', resolvedAt: null, resolutionRemarks: null });
    expect(w.clocks(id)[0].status).toBe('OPEN');
  });

  it('needs the acknowledgement first', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.service.resolve(id, resolution, 'mentor-1', NOW)).rejects.toThrow('Acknowledge the complaint first');
  });

  it('records the remarks, how, the date, who resolved it and what the parent was told, and shows the resolution time as measured, not promised', async () => {
    const w = world();
    const id = await w.log();
    await w.ack(id, at(DAY0, '10:20'));
    await expect(w.service.resolve(id, resolution, 'mentor-1', at(DAY0, '13:30'))).resolves.toMatchObject({ resolutionMinutes: 210 });
    const d = await w.detail(id, at(DAY0, '14:00'));
    expect(d).toMatchObject({ status: 'RESOLVED', stage: 'RESOLVED', stageLabel: 'Resolved', resolutionMinutes: 210 });
    expect(d.resolution).toMatchObject({ resolvedAt: at(DAY0, '13:30').toISOString(), resolvedByName: 'Mira Mentor', date: DAY0, remarks: resolution.remarks, how: resolution.how, communication: 'INFORMED', communicationLabel: 'The parent has been told', minutes: 210 });
    expect(d.resolutionNote).toContain('measured from when the parent complained');
    expect(d.resolutionNote).toContain('No resolution target is promised');
    expect(d.ack).toMatchObject({ metSla: true }); // the acknowledgement target is judged on its own
    expect(w.entries(id).find((e) => e.kind === 'RESOLVED')).toMatchObject({ visibility: 'PARENT', text: `Resolved: ${resolution.how}` });
    expect(d.parentView.history.map((h) => h.text).join(' ')).not.toContain('spoken to'); // the internal remarks are not the parent view
  });

  it('keeps acknowledgement and resolution apart: a quick acknowledgement and a slow resolution are two different facts', async () => {
    const w = world();
    const id = await w.log();
    await w.ack(id, at(DAY0, '10:10'));
    await w.service.resolve(id, resolution, 'mentor-1', at('2026-11-12', '15:00'));
    const d = await w.detail(id, at('2026-11-12', '16:00'));
    expect(d.ack.metSla).toBe(true);
    expect(d.resolutionMinutes).toBeGreaterThan(2 * 24 * 60);
  });

  it('asks for a reason when the parent has not been told, takes a real date, and cannot be done twice', async () => {
    const w = world();
    const id = await w.log();
    await w.ack(id);
    await w.service.resolve(id, { ...resolution, communication: 'NOT_YET_INFORMED', communicationNote: 'Will call tomorrow', resolutionDate: DAY0 }, 'mentor-1', NOW);
    expect(w.row()).toMatchObject({ parentCommunication: 'NOT_YET_INFORMED', parentCommunicationNote: 'Will call tomorrow' });
    await expect(w.service.resolve(id, resolution, 'mentor-1', NOW)).rejects.toThrow('already resolved');
    const second = await w.log({ title: 'Two' });
    await w.ack(second);
    await expect(w.service.resolve(second, { ...resolution, resolutionDate: '2026-11-12' }, 'mentor-1', NOW)).rejects.toThrow('cannot be in the future');
    await expect(w.service.resolve(second, { ...resolution, resolutionDate: '2026-11-09' }, 'mentor-1', NOW)).rejects.toThrow('before the complaint');
  });

  it('cannot be moved on while resolved', async () => {
    const w = world();
    const id = await w.log();
    await w.ack(id);
    await w.service.resolve(id, resolution, 'mentor-1', NOW);
    await expect(w.service.setStatus(id, { status: 'IN_PROGRESS' }, 'mentor-1')).rejects.toThrow('Reopen it first');
    await expect(w.service.assign(id, { userId: 'mentor-2' }, 'mentor-1', NOW)).rejects.toThrow('Reopen it first');
  });
});

describe('reopening a complaint', () => {
  const resolved = async (w: ReturnType<typeof world>) => {
    const id = await w.log();
    await w.ack(id);
    await w.service.resolve(id, resolution, 'mentor-1', NOW);
    return id;
  };

  it('needs a reason, and only a resolved complaint can be reopened', async () => {
    const w = world();
    const open = await w.log();
    await expect(w.service.reopen(open, { reason: 'x' }, 'mentor-1', NOW)).rejects.toThrow('Only a resolved complaint');
    const id = await resolved(w);
    await expect(w.service.reopen(id, { reason: ' ' }, 'mentor-1', NOW)).rejects.toThrow('Say why the complaint is being reopened');
    expect(w.row(id).status).toBe('RESOLVED');
  });

  it('moves it back to reopened and ongoing, keeps the earlier resolution in the history, and starts a new response clock', async () => {
    const w = world();
    const id = await resolved(w);
    const later = at('2026-11-12', '10:00');
    await w.service.reopen(id, { reason: 'The tutor was late again' }, 'mentor-1', later);
    const d = await w.detail(id, later);
    expect(d).toMatchObject({ status: 'REOPENED', stage: 'ONGOING', reopenCount: 1, resolution: null, resolutionMinutes: null });
    expect(w.entries(id).find((e) => e.kind === 'RESOLVED')).toBeDefined(); // the first resolution is still on record
    expect(w.entries(id).find((e) => e.kind === 'RESOLVED')!.payload).toMatchObject({ how: resolution.how, remarks: resolution.remarks });
    expect(w.entries(id).find((e) => e.kind === 'REOPENED')).toMatchObject({ visibility: 'PARENT', text: 'The complaint was reopened for further action' });
    expect(d.entries.find((e) => e.text === 'Reopened: The tutor was late again')?.visibility).toBe('INTERNAL');
    expect(w.clocks(id)).toHaveLength(2);
    expect(d.ack).toMatchObject({ startedAt: later.toISOString(), state: 'WITHIN_SLA' });
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_COMPLAINT_REOPENED')).toMatchObject({ recipientUserId: 'mentor-1' });
  });

  it('stops the new clock when the parent is answered, and can be resolved again', async () => {
    const w = world();
    const id = await resolved(w);
    const later = at('2026-11-12', '10:00');
    await w.service.reopen(id, { reason: 'Again' }, 'mentor-1', later);
    await w.service.respondToParent(id, { text: 'We are on it' }, 'mentor-1', at('2026-11-12', '10:30'));
    expect((await w.detail(id, at('2026-11-12', '11:00'))).ack).toMatchObject({ state: 'RESOLVED', metSla: true });
    await expect(w.service.resolve(id, resolution, 'mentor-1', at('2026-11-12', '12:00'))).resolves.toBeDefined();
    expect(w.row()).toMatchObject({ status: 'RESOLVED', reopenCount: 1 });
  });

  it('is allowed for thirty days after it was resolved, and then a new complaint is logged instead', async () => {
    const w = world();
    const id = await resolved(w);
    const d29 = new Date(NOW.getTime() + 29 * 86_400_000);
    const d31 = new Date(NOW.getTime() + 31 * 86_400_000);
    expect((await w.detail(id, d29)).actions).toMatchObject({ canReopen: true, reopenProblem: null });
    expect((await w.detail(id, d31)).actions).toMatchObject({ canReopen: false });
    expect((await w.detail(id, d31)).actions.reopenProblem).toContain('Log a new complaint instead');
    await expect(w.service.reopen(id, { reason: 'Late' }, 'mentor-1', d31)).rejects.toThrow('Log a new complaint instead');
  });
});

describe('what the parent is shown', () => {
  it('moves from started to ongoing to resolved, in the parent words, with only the communication meant for them', async () => {
    const w = world();
    const id = await w.log();
    expect((await w.detail(id)).parentView).toMatchObject({ stageLabel: 'Started', title: 'Tutor joins late', categoryLabel: 'Tutor' });
    await w.ack(id);
    await w.service.addRemark(id, { text: 'Internal only' }, 'mentor-1');
    await w.service.setStatus(id, { status: 'IN_PROGRESS' }, 'mentor-1');
    expect((await w.detail(id)).parentView.stageLabel).toBe('Ongoing');
    await w.service.resolve(id, resolution, 'mentor-1', NOW);
    const view = (await w.detail(id)).parentView;
    expect(view.stageLabel).toBe('Resolved');
    expect(view.history.map((h) => h.kind)).toEqual(['LOGGED', 'ACKNOWLEDGED', 'STATUS_CHANGED', 'RESOLVED']);
    expect(JSON.stringify(view)).not.toContain('Internal only');
    expect(view.note).toContain('Parents have no login');
  });
});

describe('finding complaints on the server', () => {
  async function many() {
    const w = world();
    const a = await w.log({ title: 'Tutor late', category: 'TUTOR', priority: 'URGENT' });
    const b = await w.log({ title: 'Bill wrong', category: 'PAYMENT', priority: 'LOW' }, 'act-A', 'mentor-1', at(DAY0, '09:00'));
    const c = await w.log({ title: 'Timetable clash', category: 'TIMETABLE' }, 'act-B', 'mentor-2');
    await w.ack(b, at(DAY0, '09:30'));
    await w.service.setStatus(b, { status: 'IN_PROGRESS' }, 'mentor-1');
    await w.ack(c, at(DAY0, '10:20'), 'mentor-2');
    await w.service.resolve(c, resolution, 'mentor-2', at(DAY0, '11:00'));
    return { w, a, b, c };
  }
  const titles = async (w: ReturnType<typeof world>, f: object, user = 'mentor-1', now = at(DAY0, '10:30')) => (await w.service.list(await w.scope(user), f, now)).rows.map((r) => r.title);

  it('shows a Mentor only their own students, the Head everyone, and nobody without access anything', async () => {
    const { w } = await many();
    expect((await titles(w, {})).sort()).toEqual(['Bill wrong', 'Tutor late']);
    expect(await titles(w, {}, 'mentor-2')).toEqual(['Timetable clash']);
    expect((await titles(w, {}, 'head-1')).sort()).toEqual(['Bill wrong', 'Timetable clash', 'Tutor late']);
    await expect(titles(w, {}, 'nobody')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('shows open work first, urgent before low, and resolved last', async () => {
    const { w } = await many();
    expect(await titles(w, {}, 'head-1')).toEqual(['Tutor late', 'Bill wrong', 'Timetable clash']);
  });

  it('filters by stage, status, category, priority, student, assignee and date, in the query', async () => {
    const { w } = await many();
    expect(await titles(w, { stage: 'RESOLVED' }, 'head-1')).toEqual(['Timetable clash']);
    expect(await titles(w, { stage: 'ONGOING' }, 'head-1')).toEqual(['Bill wrong']);
    expect(await titles(w, { stage: 'STARTED' }, 'head-1')).toEqual(['Tutor late']);
    expect(await titles(w, { status: 'NEW' }, 'head-1')).toEqual(['Tutor late']);
    expect(await titles(w, { category: 'PAYMENT' }, 'head-1')).toEqual(['Bill wrong']);
    expect(await titles(w, { priority: 'URGENT' }, 'head-1')).toEqual(['Tutor late']);
    expect((await titles(w, { activationId: 'act-B' }, 'head-1'))).toEqual(['Timetable clash']);
    expect((await titles(w, { assignedToUserId: 'mentor-2' }, 'head-1'))).toEqual(['Timetable clash']);
    expect((await titles(w, { mine: 'true' }, 'mentor-1')).sort()).toEqual(['Bill wrong', 'Tutor late']);
    expect(await titles(w, { from: '2026-11-11' }, 'head-1')).toEqual([]);
    expect((await titles(w, { from: DAY0, to: DAY0 }, 'head-1')).length).toBe(3);
  });

  it('filters by response time state, which needs the clock, and counts every state', async () => {
    const { w } = await many();
    const late = at(DAY0, '12:30');
    expect(await titles(w, { sla: 'BREACHED' }, 'head-1', late)).toEqual(['Tutor late']);
    expect(await titles(w, { sla: 'RESOLVED' }, 'head-1', late)).toEqual(['Bill wrong', 'Timetable clash']);
    const result = await w.service.list(await w.scope('head-1'), {}, late);
    expect(result.counts).toMatchObject({ STARTED: 1, ONGOING: 1, RESOLVED: 1, new: 1, BREACHED: 1, SLA_RESOLVED: 2, WITHIN_SLA: 0, APPROACHING: 0 });
    expect((await w.service.list(await w.scope('head-1'), {}, at(DAY0, '11:35'))).counts).toMatchObject({ APPROACHING: 1 });
  });

  it('refuses a filter that is not real, saying what is wrong', async () => {
    const { w } = await many();
    for (const f of [{ status: 'LOST' }, { stage: 'DONE' }, { category: 'WEATHER' }, { priority: 'SOON' }, { sla: 'LATE' }, { from: 'x' }]) await expect(titles(w, f)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('shows each row with its stage, status, assignee, the acknowledgement target and the resolution time', async () => {
    const { w } = await many();
    const rows = (await w.service.list(await w.scope('head-1'), {}, at(DAY0, '12:30'))).rows;
    const c = rows.find((r) => r.title === 'Timetable clash')!;
    expect(c).toMatchObject({ stage: 'RESOLVED', status: 'RESOLVED', assignedToName: 'Mohan Mentor', studentName: 'Synthetic Student B', resolutionMinutes: 60, ack: { state: 'RESOLVED', metSla: true } });
    expect(rows.find((r) => r.title === 'Tutor late')!.ack).toMatchObject({ state: 'BREACHED', overdueMinutes: 30 });
  });
});

describe('who can see and act on a complaint', () => {
  it('hides a complaint from a Mentor who is not involved, and shows the Head all of it', async () => {
    const w = world();
    const id = await w.log();
    await expect(w.detail(id, NOW, 'mentor-2')).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.detail(id, NOW, 'counselor-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.detail(id, NOW, 'nobody')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.detail('nope', NOW, 'head-1')).rejects.toBeInstanceOf(NotFoundException);
    expect((await w.detail(id, NOW, 'head-1')).actions.canHandle).toBe(true);
    expect((await w.detail(id, NOW, 'ceo-1')).actions).toMatchObject({ canHandle: false, canAcknowledge: false, canResolve: false });
  });

  it('refuses every change from someone who is not handling the complaint, and leaves it as it was', async () => {
    const w = world();
    const id = await w.log();
    await w.ack(id);
    for (const run of [
      () => w.service.acknowledge(id, { channel: 'PHONE' }, 'mentor-2', NOW), () => w.service.addRemark(id, { text: 'x' }, 'mentor-2'), () => w.service.addAction(id, { text: 'x' }, 'mentor-2'),
      () => w.service.respondToParent(id, { text: 'x' }, 'mentor-2'), () => w.service.recordParentMessage(id, { text: 'x' }, 'mentor-2'), () => w.service.assign(id, { userId: 'mentor-2' }, 'mentor-2', NOW),
      () => w.service.setStatus(id, { status: 'IN_PROGRESS' }, 'mentor-2'), () => w.service.resolve(id, resolution, 'mentor-2', NOW), () => w.service.reopen(id, { reason: 'x' }, 'mentor-2', NOW),
      () => w.service.resolve(id, resolution, 'counselor-1', NOW), () => w.service.addRemark(id, { text: 'x' }, 'ceo-1'),
    ]) await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.row()).toMatchObject({ status: 'ACKNOWLEDGED', assignedToUserId: 'mentor-1', resolvedAt: null });
    expect(w.entries(id).map((e) => e.kind)).toEqual(['LOGGED', 'ACKNOWLEDGED']);
  });
});

describe('the routes', () => {
  const writes = ['create', 'acknowledge', 'remark', 'action', 'respond', 'parentMessage', 'assign', 'status', 'resolve', 'reopen'];

  it('every change needs the complaint permission, and reading is scoped in the query', () => {
    const proto = MentoringComplaintController.prototype as any;
    for (const name of writes) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['mentoring.complaint.handle']);
    for (const name of ['list', 'handlers', 'detail']) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toBeUndefined();
  });

  it('has no route for a parent or a tutor, no way to delete a complaint, and nothing that pays', () => {
    const controller = readFileSync(join(__dirname, 'mentoring-complaint.controller.ts'), 'utf8');
    expect(controller).not.toMatch(/tutor-portal|tutor\.portal|@Delete|@Put/);
    const service = readFileSync(join(__dirname, 'mentoring-complaint.service.ts'), 'utf8');
    expect(service).not.toMatch(/\.delete\(|tutorPayable|tutorClassRecord|paymentStatus/);
  });
});
