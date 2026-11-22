import { NotFoundException } from '@nestjs/common';

import { NotificationService } from './notification.service';

function build(o: { updated?: number; exists?: boolean } = {}) {
  const prisma: any = {
    notification: {
      findMany: jest.fn().mockResolvedValue([{ id: 'n1' }]),
      count: jest.fn().mockResolvedValue(3),
      updateMany: jest.fn().mockResolvedValue({ count: o.updated ?? 1 }),
      findFirst: jest.fn().mockResolvedValue(o.exists ? { id: 'n1' } : null),
    },
  };
  return { svc: new NotificationService(prisma), prisma };
}

describe('NotificationService', () => {
  it('lists only the caller\'s notifications', async () => {
    const { svc, prisma } = build();
    const r = await svc.list('u1', { unreadOnly: true, limit: 500 });
    expect(prisma.notification.findMany.mock.calls[0][0]).toMatchObject({ where: { recipientUserId: 'u1', readAt: null }, take: 100 });
    expect(r.unread).toBe(3);
  });
  it('marks read only for the recipient', async () => {
    const { svc, prisma } = build();
    await svc.markRead('u1', 'n1');
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ id: 'n1', recipientUserId: 'u1', readAt: null });
  });
  it('404s for someone else\'s or missing notification, but not when already read', async () => {
    await expect(build({ updated: 0, exists: false }).svc.markRead('u1', 'n1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(build({ updated: 0, exists: true }).svc.markRead('u1', 'n1')).resolves.toEqual({ id: 'n1', read: true });
  });
  it('marks all of the caller\'s unread notifications', async () => {
    const { svc, prisma } = build({ updated: 4 });
    expect(await svc.markAllRead('u1')).toEqual({ updated: 4 });
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ recipientUserId: 'u1', readAt: null });
  });
});
