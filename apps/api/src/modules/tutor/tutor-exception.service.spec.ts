/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';
import { FakeDb } from '../mentoring/testing/mentoring-fake-db';

import { TutorExceptionService } from './tutor-exception.service';
import { TutorProfileController } from './tutor-profile.controller';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function build() {
  const db = new FakeDb();
  db.seed('tutorProfile', { id: 'tp-meera' });
  const audit = { recordInTx: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  return { db, audit, events, service: new TutorExceptionService(db as any, audit as any, events as any) };
}

describe('adding and removing dates that change a weekly pattern', () => {
  it('adds a day off for one tutor, records who did it, and tells the assignment checker', async () => {
    const { db, audit, events, service } = build();
    const view = await service.create('tp-meera', { date: '2026-11-16', kind: 'DAY_OFF', note: 'Special day off' }, 'hr-1');
    expect(view).toMatchObject({ tutorProfileId: 'tp-meera', date: '2026-11-16', kind: 'DAY_OFF', startMinute: null, endMinute: null, note: 'Special day off' });
    expect(db.rows('tutorAvailabilityException')).toHaveLength(1);
    expect(db.rows('tutorAvailabilityException')[0].createdByUserId).toBe('hr-1');
    expect(audit.recordInTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'TUTOR_EXCEPTION_ADDED', entityType: 'TutorProfile', entityId: 'tp-meera', actorUserId: 'hr-1' }));
    expect(events.emit).toHaveBeenCalledWith('tutor.availability.changed', { tutorProfileId: 'tp-meera', actorUserId: 'hr-1' });
  });

  it('adds a public holiday for everyone, with no tutor behind it', async () => {
    const { db, audit, events, service } = build();
    const view = await service.create(null, { date: '2026-11-25', kind: 'HOLIDAY', note: 'Synthetic public holiday (test)' }, 'hr-1');
    expect(view.tutorProfileId).toBeNull();
    expect(db.rows('tutorAvailabilityException')[0].tutorProfileId).toBeNull();
    expect(audit.recordInTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: 'TutorCalendar', entityId: 'organisation' }));
    expect(events.emit).toHaveBeenCalledWith('tutor.availability.changed', { tutorProfileId: null, actorUserId: 'hr-1' });
  });

  it('adds extra hours and blocked time with their times', async () => {
    const { service } = build();
    const extra = await service.create('tp-meera', { date: '2026-11-14', kind: 'EXTRA_HOURS', startMinute: m('14:00'), endMinute: m('18:00'), note: 'Additional availability' }, 'hr-1');
    expect(extra).toMatchObject({ kind: 'EXTRA_HOURS', startMinute: 840, endMinute: 1080 });
    const blocked = await service.create('tp-meera', { date: '2026-11-17', kind: 'BLOCKED', startMinute: m('16:00'), endMinute: m('17:00'), note: 'Training' }, 'hr-1');
    expect(blocked).toMatchObject({ kind: 'BLOCKED', startMinute: 960, endMinute: 1020 });
  });

  it.each([
    ['a date that is not real', { date: '2026-02-30', kind: 'DAY_OFF', note: 'x' }, 'real date'],
    ['a date in the wrong shape', { date: '16/11/2026', kind: 'DAY_OFF', note: 'x' }, 'real date'],
    ['no note', { date: '2026-11-16', kind: 'DAY_OFF', note: '   ' }, 'note'],
    ['a note that is too long', { date: '2026-11-16', kind: 'DAY_OFF', note: 'x'.repeat(201) }, '200 characters'],
    ['a whole day with times', { date: '2026-11-16', kind: 'DAY_OFF', startMinute: 600, endMinute: 700, note: 'x' }, 'no start or end'],
    ['extra hours with no times', { date: '2026-11-16', kind: 'EXTRA_HOURS', note: 'x' }, 'start time and an end time'],
    ['times that are not whole minutes', { date: '2026-11-16', kind: 'BLOCKED', startMinute: 600.5, endMinute: 700, note: 'x' }, 'start time and an end time'],
    ['an end before the start', { date: '2026-11-16', kind: 'BLOCKED', startMinute: 700, endMinute: 600, note: 'x' }, 'after the start'],
    ['an end past midnight', { date: '2026-11-16', kind: 'BLOCKED', startMinute: 600, endMinute: 1500, note: 'x' }, 'after the start'],
    ['a range under 15 minutes', { date: '2026-11-16', kind: 'BLOCKED', startMinute: 600, endMinute: 610, note: 'x' }, '15 minutes'],
  ] as const)('refuses %s', async (_label, input, message) => {
    const { db, service } = build();
    const call = service.create('tp-meera', input, 'hr-1');
    await expect(call).rejects.toBeInstanceOf(BadRequestException);
    await expect(call).rejects.toThrow(message);
    expect(db.rows('tutorAvailabilityException')).toHaveLength(0);
  });

  it('keeps a holiday for everyone and a day off for one tutor apart', async () => {
    const { service } = build();
    await expect(service.create('tp-meera', { date: '2026-11-25', kind: 'HOLIDAY', note: 'x' }, 'hr-1')).rejects.toThrow('applies to everyone');
    await expect(service.create(null, { date: '2026-11-25', kind: 'DAY_OFF', note: 'x' }, 'hr-1')).rejects.toThrow('Choose a tutor');
    await expect(service.create(null, { date: '2026-11-25', kind: 'BLOCKED', startMinute: 600, endMinute: 700, note: 'x' }, 'hr-1')).rejects.toThrow('Choose a tutor');
  });

  it('does not add the same holiday or day off twice, but a different date or tutor is fine', async () => {
    const { db, events, service } = build();
    db.seed('tutorProfile', { id: 'tp-rahul' });
    await service.create(null, { date: '2026-11-25', kind: 'HOLIDAY', note: 'Holiday' }, 'hr-1');
    await expect(service.create(null, { date: '2026-11-25', kind: 'HOLIDAY', note: 'Again' }, 'hr-1')).rejects.toBeInstanceOf(ConflictException);
    await service.create('tp-meera', { date: '2026-11-16', kind: 'DAY_OFF', note: 'Off' }, 'hr-1');
    await expect(service.create('tp-meera', { date: '2026-11-16', kind: 'DAY_OFF', note: 'Again' }, 'hr-1')).rejects.toThrow('already a day off');
    await service.create('tp-rahul', { date: '2026-11-16', kind: 'DAY_OFF', note: 'Off' }, 'hr-1');
    await service.create('tp-meera', { date: '2026-11-17', kind: 'DAY_OFF', note: 'Off' }, 'hr-1');
    expect(db.rows('tutorAvailabilityException')).toHaveLength(4);
    expect(events.emit).toHaveBeenCalledTimes(4);
  });

  it('refuses a tutor that does not exist and says nothing about it elsewhere', async () => {
    const { db, audit, events, service } = build();
    await expect(service.create('tp-missing', { date: '2026-11-16', kind: 'DAY_OFF', note: 'x' }, 'hr-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.rows('tutorAvailabilityException')).toHaveLength(0);
    expect(audit.recordInTx).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('locks the tutor row while it adds, so two people cannot add the same day off together', async () => {
    const { db, service } = build();
    await service.create('tp-meera', { date: '2026-11-16', kind: 'DAY_OFF', note: 'Off' }, 'hr-1');
    expect(db.$executeRaw.mock.calls.some(([strings]: any[]) => /FOR UPDATE/i.test(strings.join('?')))).toBe(true);
    const results = await Promise.allSettled([
      service.create('tp-meera', { date: '2026-11-18', kind: 'DAY_OFF', note: 'A' }, 'hr-1'),
      service.create('tp-meera', { date: '2026-11-18', kind: 'DAY_OFF', note: 'B' }, 'hr-2'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(db.rows('tutorAvailabilityException').filter((r) => r.date.getTime() === day('2026-11-18').getTime())).toHaveLength(1);
  });

  it('removes an exception by deactivating it: the row stays, the change is recorded, the checker is told', async () => {
    const { db, audit, events, service } = build();
    const added = await service.create('tp-meera', { date: '2026-11-16', kind: 'DAY_OFF', note: 'Off' }, 'hr-1');
    events.emit.mockClear();
    await expect(service.deactivate(added.id, 'hr-2')).resolves.toEqual({ removed: true });
    const row = db.rows('tutorAvailabilityException')[0];
    expect(row.isActive).toBe(false);
    expect(row.deactivatedAt).toBeInstanceOf(Date);
    expect(audit.recordInTx).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ action: 'TUTOR_EXCEPTION_REMOVED', actorUserId: 'hr-2', oldValue: expect.objectContaining({ date: '2026-11-16' }) }));
    expect(events.emit).toHaveBeenCalledWith('tutor.availability.changed', { tutorProfileId: 'tp-meera', actorUserId: 'hr-2' });
    // Removing it again changes nothing and tells nobody.
    events.emit.mockClear();
    await expect(service.deactivate(added.id, 'hr-2')).resolves.toEqual({ removed: false });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('can add the same day off again once the first one was removed', async () => {
    const { db, service } = build();
    const first = await service.create('tp-meera', { date: '2026-11-16', kind: 'DAY_OFF', note: 'Off' }, 'hr-1');
    await service.deactivate(first.id, 'hr-1');
    await service.create('tp-meera', { date: '2026-11-16', kind: 'DAY_OFF', note: 'Off again' }, 'hr-1');
    expect(db.rows('tutorAvailabilityException').filter((r) => r.isActive)).toHaveLength(1);
  });

  it('removing a holiday tells the checker it concerns every tutor', async () => {
    const { events, service } = build();
    const holiday = await service.create(null, { date: '2026-11-25', kind: 'HOLIDAY', note: 'Holiday' }, 'hr-1');
    events.emit.mockClear();
    await service.deactivate(holiday.id, 'hr-1');
    expect(events.emit).toHaveBeenCalledWith('tutor.availability.changed', { tutorProfileId: null, actorUserId: 'hr-1' });
  });

  it('refuses to remove an exception that does not exist', async () => {
    const { service } = build();
    await expect(service.deactivate('nope', 'hr-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only the active exceptions of that tutor inside the dates asked for', async () => {
    const { db, service } = build();
    const seed = (tutor: string | null, date: string, over: object = {}) => db.seed('tutorAvailabilityException', { tutorProfileId: tutor, date: day(date), kind: 'DAY_OFF', startMinute: null, endMinute: null, note: 'n', isActive: true, ...over });
    seed('tp-meera', '2026-11-16');
    seed('tp-meera', '2026-11-20');
    seed('tp-meera', '2026-12-01');
    seed('tp-meera', '2026-11-18', { isActive: false });
    seed('tp-rahul', '2026-11-17');
    const rows = await service.list('tp-meera', '2026-11-09', '2026-11-30');
    expect(rows.map((r) => r.date)).toEqual(['2026-11-16', '2026-11-20']);
    await expect(service.list('tp-meera', '2026-11-09', 'soon')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only people who manage tutor profiles can change these dates; reading needs only the read permission', () => {
    const proto = TutorProfileController.prototype as any;
    const need = (name: string) => Reflect.getMetadata(PERMISSIONS_KEY, proto[name]);
    expect(need('addHoliday')).toEqual(['tutor.profile.manage']);
    expect(need('addException')).toEqual(['tutor.profile.manage']);
    expect(need('removeException')).toEqual(['tutor.profile.manage']);
    expect(need('listExceptions')).toEqual(['tutor.profile.read']);
  });

  it('the holiday route can only make a holiday, whatever kind the request names', async () => {
    const { db, service } = build();
    const controller = new (TutorProfileController as any)({}, {}, {}, service);
    const user = { id: 'hr-1' };
    const view = await controller.addHoliday({ date: '2026-11-25', kind: 'DAY_OFF', note: 'Sneaky' }, user);
    expect(view.kind).toBe('HOLIDAY');
    expect(db.rows('tutorAvailabilityException')[0].tutorProfileId).toBeNull();
  });
});
