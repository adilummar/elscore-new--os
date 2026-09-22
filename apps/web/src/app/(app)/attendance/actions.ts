"use server";

import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

export async function getAttendanceStatusAction() {
  return fetchApi<any>('/attendance/status');
}

export async function getAttendanceHistoryAction() {
  return fetchApi<any>('/attendance/history');
}

export async function getDailySummaryAction() {
  return fetchApi<any>('/attendance/daily-summary');
}

export async function performAttendanceAction(actionStr: string, note?: string) {
  try {
    const res = await fetchApi<any>('/attendance/action', {
      method: 'POST',
      body: JSON.stringify({ action: actionStr, ...(note ? { note } : {}) }),
    });
    revalidatePath('/attendance');
    return { success: true, data: res };
  } catch (error: any) {
    return { success: false, error: error.message || 'Action failed' };
  }
}

export async function getTeamAttendanceAction(date: string) {
  return fetchApi<any>(`/attendance/team?date=${date}`);
}

export async function correctAttendanceEventAction(eventId: string, sessionId: string, newTimestamp: string, reason: string) {
  const res = await fetchApi<any>(`/attendance/event/${eventId}/correct`, {
    method: 'PATCH',
    body: JSON.stringify({ sessionId, newTimestamp, reason }),
  });
  revalidatePath('/attendance/management');
  return res;
}

export async function getAttendanceSettingsAction() {
  return fetchApi<any>('/attendance/settings').catch(() => []);
}

export async function updateAttendanceSettingsAction(data: any) {
  const res = await fetchApi<any>('/attendance/settings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/attendance');
  return res;
}
