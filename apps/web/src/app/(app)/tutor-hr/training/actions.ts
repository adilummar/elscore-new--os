"use server";

import { fetchApi } from '@/lib/api/client';

/** Training server actions. Errors are returned as values so business messages reach the UI. */
export type ActionResult<T = any> = { ok: true; data: T } | { ok: false; message: string; code?: string };

async function run<T = any>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Request failed', code: e?.code };
  }
}

const T = '/tutor-hr/training';
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown) => ({ method: 'PATCH', body: JSON.stringify(body) });

export const listSessions = (qs: string) => run(() => fetchApi<any[]>(`${T}/sessions?${qs}`));
export const listTrainees = (qs: string) => run(() => fetchApi<any[]>(`${T}/trainees?${qs}`));
export const getTrainee = (leadId: string) => run(() => fetchApi<any>(`${T}/trainees/${leadId}`));

export const createSession = (data: { sessionNumber: number; scheduledAt: string; conductorUserId: string }) =>
  run(() => fetchApi<any>(`${T}/sessions`, post(data)));
export const rescheduleSession = (id: string, data: { scheduledAt: string; conductorUserId?: string; reason: string }) =>
  run(() => fetchApi<any>(`${T}/sessions/${id}`, patch(data)));
export const addParticipants = (id: string, tutorLeadIds: string[]) =>
  run(() => fetchApi<any>(`${T}/sessions/${id}/participants`, post({ tutorLeadIds })));
export const recordAttempt = (id: string, data: { attendance: string; taskCompleted: boolean; remarks?: string }) =>
  run(() => fetchApi<any>(`${T}/attempts/${id}/attendance`, post(data)));
/** Final verification. The response carries the one-time temporary password; never cache or store it. */
export const markReadyForAssignment = (leadId: string) =>
  run(() => fetchApi<any>(`/tutor-hr/tutors/ready-for-assignment/${leadId}`, { method: 'POST', cache: 'no-store' }));
export const listTutors = (qs: string) => run(() => fetchApi<any[]>(`/tutor-hr/tutors?${qs}`));
export const correctAttempt = (id: string, data: { attendance: string; taskCompleted: boolean; remarks?: string; reason: string }) =>
  run(() => fetchApi<any>(`${T}/attempts/${id}/correction`, post(data)));
