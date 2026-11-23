"use server";

import { fetchApi } from '@/lib/api/client';

/** Tutor Coordination server actions. Errors are returned as values so business messages reach the UI. */
export type ActionResult<T = any> = { ok: true; data: T } | { ok: false; message: string; code?: string };

async function run<T = any>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Request failed', code: e?.code };
  }
}

const C = '/tutor-hr/coordination';
const json = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const getCoordinationDashboard = (qs: string) => run(() => fetchApi<any>(`${C}/dashboard?${qs}`));
export const listCoordinationTutors = (qs: string) => run(() => fetchApi<any>(`${C}/tutors?${qs}`));
export const getCoordinationTutor = (id: string) => run(() => fetchApi<any>(`${C}/tutors/${id}`));
export const listCoordinators = () => run(() => fetchApi<any[]>(`${C}/coordinators`));
export const assignCoordinator = (tutorProfileIds: string[], coordinatorUserId: string | null, reason?: string) =>
  run(() => fetchApi<any>(`${C}/assignments`, json('POST', { tutorProfileIds, coordinatorUserId, reason })));
export const createObservation = (id: string, body: { observedAt: string; positiveFeedback?: string; negativeFeedback?: string }) =>
  run(() => fetchApi<any>(`${C}/tutors/${id}/observations`, json('POST', body)));
export const editObservation = (id: string, body: { observedAt: string; positiveFeedback?: string; negativeFeedback?: string }) =>
  run(() => fetchApi<any>(`${C}/observations/${id}`, json('PATCH', body)));
export const deleteObservation = (id: string, reason: string) => run(() => fetchApi<any>(`${C}/observations/${id}`, json('DELETE', { reason })));
/** HR read-only view for the tutor profile's Feedback & Observations tab. */
export const getProfileObservations = (tutorProfileId: string) => run(() => fetchApi<any>(`/tutor-hr/tutors/${tutorProfileId}/observations`));
