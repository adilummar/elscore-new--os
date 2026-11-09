/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { MentoringReminderService } from './mentoring-reminder.service';
import { FakeDb } from './testing/mentoring-fake-db';

const NOW = new Date('2026-11-09T04:30:00Z');

function world() {
  const db = new FakeDb();
  db.seed('user', { id: 'tutor-1', status: 'ACTIVE' });
  db.seed('user', { id: 'tutor-2', status: 'ACTIVE' });
  db.seed('user', { id: 'mentor-1', status: 'ACTIVE' });
  const service = new MentoringReminderService(db as any);
  const prepare = (over: object = {}) => service.prepare(db as any, { kind: 'CLASS_REMINDER', entityType: 'ClassSession', entityId: 'cs-1', activationId: 'act-1', recipientUserId: 'tutor-1', message: 'English with Student A at 3:00 PM today.', ...over }, 'mentor-1');
  const send = (id: string, at = NOW) => service.send(db as any, id, 'mentor-1', '/tutor-portal', at);
  return { db, service, prepare, send };
}

describe('preparing a reminder', () => {
  it('prepares it for one person about one thing, and nothing is delivered yet', async () => {
    const w = world();
    const r = await w.prepare();
    expect(r).toMatchObject({ status: 'PREPARED', recipientUserId: 'tutor-1', preparedByUserId: 'mentor-1', sentAt: null, notificationId: null });
    expect(w.db.rows('notification')).toHaveLength(0);
    expect((await w.service.about('ClassSession', 'cs-1')).map((x) => x.statusLabel)).toEqual(['Reminder prepared']);
  });

  it('preparing the same reminder again returns the one that is there, but another person or another thing is separate', async () => {
    const w = world();
    const first = await w.prepare();
    expect((await w.prepare()).id).toBe(first.id);
    await w.prepare({ recipientUserId: 'tutor-2' });
    await w.prepare({ entityId: 'cs-2' });
    expect(w.db.rows('mentoringReminder')).toHaveLength(3);
  });

  it('needs a message of a sensible length and a person who exists', async () => {
    const w = world();
    await expect(w.prepare({ message: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.prepare({ message: 'x'.repeat(501) })).rejects.toThrow('500 characters');
    await expect(w.prepare({ recipientUserId: 'nobody' })).rejects.toThrow('does not exist');
    expect(w.db.rows('mentoringReminder')).toHaveLength(0);
  });
});

describe('sending a reminder', () => {
  it('is sent only when the notification exists, and that notification is the evidence', async () => {
    const w = world();
    const r = await w.prepare();
    const sent = await w.send(r.id);
    const notification = w.db.rows('notification')[0];
    expect(notification).toMatchObject({ recipientUserId: 'tutor-1', type: 'MENTORING_REMINDER', entityType: 'ClassSession', entityId: 'cs-1', action: '/tutor-portal', message: 'English with Student A at 3:00 PM today.', dedupeKey: `reminder:${r.id}` });
    expect(sent).toMatchObject({ status: 'SENT', sentAt: NOW, sentByUserId: 'mentor-1', notificationId: notification.id });
    expect((await w.service.about('ClassSession', 'cs-1'))[0]).toMatchObject({ status: 'SENT', statusLabel: 'Reminder sent', deliveryEvidence: notification.id });
  });

  it('sending twice sends once', async () => {
    const w = world();
    const r = await w.prepare();
    await w.send(r.id);
    await w.send(r.id);
    expect(w.db.rows('notification')).toHaveLength(1);
  });

  it('stays prepared, not sent, when the notification cannot be created', async () => {
    const w = world();
    const r = await w.prepare();
    w.db.seed('notification', { recipientUserId: 'tutor-1', type: 'X', message: 'clash', dedupeKey: `reminder:${r.id}` }); // the key is already taken
    await expect(w.send(r.id)).rejects.toThrow();
    expect(w.db.rows('mentoringReminder')[0]).toMatchObject({ status: 'PREPARED' });
    expect(w.db.rows('mentoringReminder')[0].notificationId ?? null).toBeNull();
    expect(w.db.rows('mentoringReminder')[0].sentAt ?? null).toBeNull();
  });

  it('a missing or cancelled reminder cannot be sent', async () => {
    const w = world();
    await expect(w.send('missing')).rejects.toBeInstanceOf(NotFoundException);
    const r = await w.prepare();
    await w.service.cancel(w.db as any, r.id);
    await expect(w.send(r.id)).rejects.toBeInstanceOf(ConflictException);
    expect(w.db.rows('notification')).toHaveLength(0);
  });

  it('cancelling frees the key so a new reminder can be prepared, and a sent reminder cannot be cancelled', async () => {
    const w = world();
    const first = await w.prepare();
    await w.service.cancel(w.db as any, first.id);
    expect(w.db.rows('mentoringReminder')[0]).toMatchObject({ status: 'CANCELLED', currentKey: null });
    const second = await w.prepare();
    expect(second.id).not.toBe(first.id);
    await w.send(second.id);
    await expect(w.service.cancel(w.db as any, second.id)).rejects.toThrow('cannot be cancelled');
  });

  it('sends the reminders whose time has come, and only those, counting any that fail', async () => {
    const w = world();
    const early = await w.prepare({ scheduledFor: new Date('2026-11-09T03:00:00Z') });
    await w.prepare({ entityId: 'cs-2', scheduledFor: new Date('2026-11-09T09:00:00Z') });
    await w.prepare({ entityId: 'cs-3' }); // no time: sent by hand only
    const clash = await w.prepare({ entityId: 'cs-4', scheduledFor: new Date('2026-11-09T04:00:00Z') });
    w.db.seed('notification', { recipientUserId: 'tutor-1', type: 'X', message: 'clash', dedupeKey: `reminder:${clash.id}` });
    await expect(w.service.sendDue('system', NOW)).resolves.toEqual({ sent: 1, failed: 1 });
    expect(w.db.rows('mentoringReminder').find((r) => r.id === early.id)).toMatchObject({ status: 'SENT' });
    expect(w.db.rows('mentoringReminder').filter((r) => r.status === 'PREPARED')).toHaveLength(3);
  });
});

describe('acknowledging and reading reminders', () => {
  it('only the person it was for can acknowledge it, and then the notification is marked read', async () => {
    const w = world();
    const r = await w.prepare();
    await w.send(r.id);
    await expect(w.service.acknowledge(r.id, 'tutor-2', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.acknowledge(r.id, 'mentor-1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    const done = await w.service.acknowledge(r.id, 'tutor-1', NOW);
    expect(done).toMatchObject({ status: 'ACKNOWLEDGED', statusLabel: 'Acknowledged', acknowledgedAt: NOW.toISOString() });
    expect(w.db.rows('notification')[0].readAt).toEqual(NOW);
    expect((await w.service.acknowledge(r.id, 'tutor-1', new Date('2026-11-10T00:00:00Z'))).acknowledgedAt).toBe(NOW.toISOString()); // saying it again changes nothing
  });

  it('an unsent reminder cannot be acknowledged, and a missing one is not theirs', async () => {
    const w = world();
    const r = await w.prepare();
    await expect(w.service.acknowledge(r.id, 'tutor-1', NOW)).rejects.toThrow('has not been sent yet');
    await expect(w.service.acknowledge('missing', 'tutor-1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a person sees only the reminders that were sent to them, never one still being prepared or another person\'s', async () => {
    const w = world();
    const sent = await w.prepare();
    await w.prepare({ entityId: 'cs-2' }); // prepared only
    const other = await w.prepare({ recipientUserId: 'tutor-2', entityId: 'cs-3' });
    await w.send(sent.id);
    await w.send(other.id);
    const mine = await w.service.mine('tutor-1');
    expect(mine.map((x) => [x.entityId, x.status])).toEqual([['cs-1', 'SENT']]);
    expect((await w.service.mine('tutor-2')).map((x) => x.entityId)).toEqual(['cs-3']);
    expect(await w.service.mine('mentor-1')).toEqual([]);
  });
});
