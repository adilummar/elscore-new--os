"use server";

import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

export async function getAttendanceStatusAction() {
  return fetchApi<any>('/attendance/status');
}

export async function getAttendanceHistoryAction() {
  return fetchApi<any>('/attendance/history');
}

export async function getMyMissedCheckoutAction() {
  return fetchApi<any>('/attendance/missed-checkouts/current');
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
    return {
      success: false,
      error: error.message || 'Action failed',
      code: error.code as string | undefined,
      details: error.details as Record<string, unknown> | undefined,
    };
  }
}

export async function requestMissedCheckoutApprovalAction(caseId: string) {
  try {
    const data = await fetchApi<any>(`/attendance/missed-checkouts/${caseId}/request`, {
      method: 'POST',
    });
    revalidatePath('/attendance');
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to request approval' };
  }
}

export async function getMissedCheckoutCasesAction() {
  return fetchApi<any[]>('/attendance/missed-checkouts');
}

export async function approveMissedCheckoutAction(caseId: string) {
  return manageMissedCheckout(caseId, 'approve');
}

export async function rejectMissedCheckoutAction(caseId: string, reason: string) {
  return manageMissedCheckout(caseId, 'reject', { reason });
}

export async function resolveMissedCheckoutAction(caseId: string) {
  return manageMissedCheckout(caseId, 'resolve');
}

async function manageMissedCheckout(caseId: string, action: 'approve' | 'reject' | 'resolve', body?: object) {
  try {
    const data = await fetchApi<any>(`/attendance/missed-checkouts/${caseId}/${action}`, {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    revalidatePath('/attendance/missed-checkouts');
    revalidatePath('/attendance');
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || `Failed to ${action} missed checkout` };
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
