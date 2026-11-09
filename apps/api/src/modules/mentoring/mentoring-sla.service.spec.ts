/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringOperationsController } from './mentoring-operations.controller';
import { MentoringSlaService } from './mentoring-sla.service';
import { FakeDb } from './testing/mentoring-fake-db';

const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const MON = '2026-11-09';
const TUE = '2026-11-10';

const scope = (userId: string, perms: string[], all = false): MentoringScope => ({ userId, perms: new Set(perms), all, assigned: perms.includes('mentoring.student.read-assigned') });
const MENTOR = scope('mentor-1', ['mentoring.student.read-assigned']);
const OTHER = scope('mentor-2', ['mentoring.student.read-assigned']);
const HEAD = scope('head-1', ['mentoring.student.read-all'], true);
const NOBODY = scope('nobody', []);

function world() {
  const db = new FakeDb();
  for (const [id, mentor] of [['act-1', 'mentor-1'], ['act-2', 'mentor-2']]) db.seed('mentoringActivation', { id, studentId: `stu-${id}`, leadId: 'l', handoverId: 'h', status: 'ACTIVATION_IN_PROGRESS', currentMentorUserId: mentor });
  db.seed('employee', { id: 'e1', userId: 'mentor-1', firstName: 'Mira', lastName: 'Mentor' });
  db.seed('employee', { id: 'e2', userId: 'mentor-2', firstName: 'Omar', lastName: 'Other' });
  const access = new MentoringAccessService({ getPermissionsForUser: jest.fn() } as any);
  const service = new MentoringSlaService(db as any, access);
  const start = (over: object = {}) => service.start(db as any, { policyKey: 'CLASS_UPDATE_REVIEW', entityType: 'ClassSession', entityId: 'cs-1', activationId: 'act-1', startedAt: at(MON, '10:00'), ...over });
  return { db, service, start };
}

describe('starting a response clock', () => {
  it('is due two working hours later and goes to the assigned Mentor', async () => {
    const w = world();
    const item = await w.start();
    expect(item.dueAt.toISOString()).toBe(at(MON, '12:00').toISOString());
    expect(item).toMatchObject({ status: 'OPEN', targetMinutes: 120, responsibleUserId: 'mentor-1', currentKey: 'CLASS_UPDATE_REVIEW:ClassSession:cs-1' });
  });

  it('counts working hours only: work arriving at 17:30 is due at 10:30 the next morning', async () => {
    const w = world();
    expect((await w.start({ startedAt: at(MON, '17:30') })).dueAt.toISOString()).toBe(at(TUE, '10:30').toISOString());
  });

  it('starting the same work again returns the clock already running, never a second one', async () => {
    const w = world();
    const first = await w.start();
    const again = await w.start({ startedAt: at(MON, '15:00') });
    expect(again.id).toBe(first.id);
    expect(w.db.rows('mentoringSlaItem')).toHaveLength(1);
  });

  it('follows the saved working schedule when there is one', async () => {
    const w = world();
    w.db.seed('globalWorkingSchedule', { startTime: '10:00', endTime: '14:00', timezone: 'Asia/Kolkata', effectiveFrom: new Date('2026-01-01T00:00:00Z') });
    expect((await w.start({ startedAt: at(MON, '13:00') })).dueAt.toISOString()).toBe(at(TUE, '11:00').toISOString());
    w.db.seed('globalWorkingSchedule', { startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata', effectiveFrom: new Date('2026-06-01T00:00:00Z') });
    expect((await w.start({ entityId: 'cs-2', startedAt: at(MON, '13:00') })).dueAt.toISOString()).toBe(at(MON, '15:00').toISOString()); // the later schedule wins
  });

  it('uses a saved policy row over the default, can count calendar hours, and refuses an unknown or switched-off kind', async () => {
    const w = world();
    w.db.seed('mentoringSlaPolicy', { key: 'CLASS_UPDATE_REVIEW', label: 'Review', targetMinutes: 60, mode: 'CALENDAR', measure: 'COMPLETION', approachingPercent: 75, isActive: true });
    expect((await w.start({ startedAt: at(MON, '17:30') })).dueAt.toISOString()).toBe(at(MON, '18:30').toISOString());
    await expect(w.start({ policyKey: 'MADE_UP', entityId: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    w.db.seed('mentoringSlaPolicy', { key: 'RETURNED_UPDATE_ACTION', label: 'Off', targetMinutes: 120, mode: 'WORKING_HOURS', measure: 'COMPLETION', approachingPercent: 75, isActive: false });
    await expect(w.start({ policyKey: 'RETURNED_UPDATE_ACTION', entityId: 'y' })).rejects.toThrow('no active response-time target');
    w.db.seed('mentoringSlaPolicy', { key: 'PARENT_CALLBACK', label: 'Parent call back', targetMinutes: 120, mode: 'WORKING_HOURS', measure: 'FIRST_RESPONSE', approachingPercent: 75, isActive: true });
    await expect(w.start({ policyKey: 'PARENT_CALLBACK', entityId: 'z' })).resolves.toMatchObject({ policyKey: 'PARENT_CALLBACK' }); // another configured task
  });

  it('stops the clock at the first response, or at completion, and then a new clock can start for new work', async () => {
    const w = world();
    await w.start();
    await w.service.respond(w.db as any, 'CLASS_UPDATE_REVIEW', 'ClassSession', 'cs-1', at(MON, '10:20'));
    await w.service.respond(w.db as any, 'CLASS_UPDATE_REVIEW', 'ClassSession', 'cs-1', at(MON, '11:00')); // a later response changes nothing
    expect(w.db.rows('mentoringSlaItem')[0].firstResponseAt.toISOString()).toBe(at(MON, '10:20').toISOString());
    await w.service.complete(w.db as any, 'CLASS_UPDATE_REVIEW', 'ClassSession', 'cs-1', at(MON, '11:30'));
    expect(w.db.rows('mentoringSlaItem')[0]).toMatchObject({ status: 'COMPLETED', currentKey: null });
    expect((await w.start({ startedAt: at(TUE, '10:00') })).id).not.toBe(w.db.rows('mentoringSlaItem')[0].id);
    await expect(w.service.complete(w.db as any, 'CLASS_UPDATE_REVIEW', 'ClassSession', 'nothing')).resolves.toBeNull();
  });

  it('completing records a response too, and cancelling ends the clock without a verdict', async () => {
    const w = world();
    await w.start();
    await w.service.complete(w.db as any, 'CLASS_UPDATE_REVIEW', 'ClassSession', 'cs-1', at(MON, '11:00'));
    expect(w.db.rows('mentoringSlaItem')[0].firstResponseAt.toISOString()).toBe(at(MON, '11:00').toISOString());
    await w.start({ entityId: 'cs-9' });
    await w.service.cancel(w.db as any, 'CLASS_UPDATE_REVIEW', 'ClassSession', 'cs-9', at(MON, '10:30'));
    expect(w.db.rows('mentoringSlaItem').find((i) => i.entityId === 'cs-9')).toMatchObject({ status: 'CANCELLED', currentKey: null });
  });
});

describe('listing response clocks', () => {
  async function busy() {
    const w = world();
    await w.start({ entityId: 'a', startedAt: at(MON, '09:00') }); // due 11:00
    await w.start({ entityId: 'b', startedAt: at(MON, '10:00') }); // due 12:00
    await w.start({ entityId: 'c', startedAt: at(MON, '10:45') }); // due 12:45
    await w.start({ entityId: 'd', policyKey: 'COMPLAINT_ACKNOWLEDGEMENT', entityType: 'Complaint', startedAt: at(MON, '09:00') });
    await w.start({ entityId: 'e', activationId: 'act-2', startedAt: at(MON, '09:00') });
    return w;
  }
  const NOW = at(MON, '11:45');

  it('classes each item as within, approaching or breached, with the overdue time, and counts them', async () => {
    const w = await busy();
    const list = await w.service.list(HEAD, {}, NOW);
    const by = (id: string) => list.rows.find((r) => r.entityId === id)!;
    expect(by('a')).toMatchObject({ state: 'BREACHED', stateLabel: 'SLA breached', overdueMinutes: 45 });
    expect(by('b')).toMatchObject({ state: 'APPROACHING', remainingMinutes: 15 });
    expect(by('c')).toMatchObject({ state: 'WITHIN_SLA', remainingMinutes: 60 });
    expect(list.counts).toEqual({ WITHIN_SLA: 1, APPROACHING: 1, BREACHED: 3, RESOLVED: 0 });
    expect(list.rows.map((r) => r.entityId)).toEqual(['a', 'd', 'e', 'b', 'c']); // soonest due first
    expect(list.workingHours).toEqual({ start: '09:00', end: '18:00', timeZone: 'Asia/Kolkata', offDays: [0] });
  });

  it('filters on the server by state, kind, person and dates', async () => {
    const w = await busy();
    expect((await w.service.list(HEAD, { state: 'BREACHED' }, NOW)).rows.map((r) => r.entityId)).toEqual(['a', 'd', 'e']);
    expect((await w.service.list(HEAD, { state: 'APPROACHING' }, NOW)).rows.map((r) => r.entityId)).toEqual(['b']);
    expect((await w.service.list(HEAD, { policyKey: 'COMPLAINT_ACKNOWLEDGEMENT' }, NOW)).rows.map((r) => r.entityId)).toEqual(['d']);
    expect((await w.service.list(HEAD, { responsibleUserId: 'mentor-2' }, NOW)).rows.map((r) => r.entityId)).toEqual(['e']);
    expect((await w.service.list(HEAD, { from: TUE }, NOW)).rows).toHaveLength(0);
    expect((await w.service.list(HEAD, { from: MON, to: MON, limit: 2 }, NOW)).rows).toHaveLength(2);
  });

  it('shows finished work as resolved only when asked, and an acknowledgement stops at the first response', async () => {
    const w = await busy();
    await w.service.respond(w.db as any, 'COMPLAINT_ACKNOWLEDGEMENT', 'Complaint', 'd', at(MON, '09:30'));
    await w.service.complete(w.db as any, 'CLASS_UPDATE_REVIEW', 'ClassSession', 'a', at(MON, '10:30'));
    const open = await w.service.list(HEAD, {}, NOW);
    expect(open.rows.find((r) => r.entityId === 'a')).toBeUndefined();
    expect(open.rows.find((r) => r.entityId === 'd')).toMatchObject({ state: 'RESOLVED', metSla: true }); // acknowledged in time, still open for resolution
    const all = await w.service.list(HEAD, { status: 'ALL', state: 'RESOLVED' }, NOW);
    expect(all.rows.map((r) => r.entityId).sort()).toEqual(['a', 'd']);
    expect(all.rows.find((r) => r.entityId === 'a')).toMatchObject({ metSla: true, overdueMinutes: 0 });
  });

  it('shows a Mentor only the work on their own students, and no one without access anything', async () => {
    const w = await busy();
    expect((await w.service.list(MENTOR, {}, NOW)).rows.map((r) => r.entityId).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect((await w.service.list(OTHER, {}, NOW)).rows.map((r) => r.entityId)).toEqual(['e']);
    await expect(w.service.list(NOBODY, {}, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.list(OTHER, { activationId: 'act-1' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect((await w.service.list(OTHER, { responsibleUserId: 'mentor-1' }, NOW)).rows).toEqual([]); // a filter cannot widen the scope
  });

  it('names the responsible person and refuses filters it does not understand', async () => {
    const w = await busy();
    expect((await w.service.list(HEAD, {}, NOW)).rows.find((r) => r.entityId === 'e')!.responsibleName).toBe('Omar Other');
    await expect(w.service.list(HEAD, { state: 'LATE' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.service.list(HEAD, { status: 'DONE' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.service.list(HEAD, { from: 'soon' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reads only: listing writes nothing', async () => {
    const w = await busy();
    const snap = () => JSON.stringify(Object.fromEntries(Object.entries(w.db.tables).filter(([, r]) => r.length)));
    const before = snap();
    await w.service.list(HEAD, {}, NOW);
    expect(snap()).toBe(before);
  });

  it('the route is scoped by the query, not by a write permission', () => {
    const proto = MentoringOperationsController.prototype as any;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.slaList)).toBeUndefined();
  });
});
