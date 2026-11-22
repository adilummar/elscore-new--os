"use server";

import { fetchApi } from '@/lib/api/client';

export type NotificationActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function run<T>(fn: () => Promise<T>): Promise<NotificationActionResult<T>> {
  try { return { ok: true, data: await fn() }; } catch (e: any) { return { ok: false, message: e?.message || 'Request failed' }; }
}

export const listMyNotifications = () =>
  run(() => fetchApi<{ items: any[]; unread: number }>('/notifications?limit=30'));

export const getUnreadCount = () =>
  run(() => fetchApi<{ unread: number }>('/notifications/unread-count'));

export const markNotificationRead = (id: string) =>
  run(() => fetchApi<any>(`/notifications/${id}/read`, { method: 'POST' }));

export const markAllNotificationsRead = () =>
  run(() => fetchApi<any>('/notifications/read-all', { method: 'POST' }));

/** Candidate, demo, manager and overdue context for the caller's overdue-evaluation notifications. */
export const listOverdueEvaluationContext = () =>
  run(() => fetchApi<any[]>('/tutor-hr/hiring/notifications/overdue-evaluations'));
