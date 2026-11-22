"use server";

import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

/**
 * Hiring server actions. Errors are returned as values (not thrown) because Next.js
 * strips the message of errors thrown from server actions in production builds, and
 * the UI needs business messages such as "Stages cannot be skipped".
 */
export type ActionResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string };

async function run<T = any>(fn: () => Promise<T>, revalidate?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    if (revalidate) revalidatePath(revalidate);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Request failed', code: e?.code };
  }
}

const H = '/tutor-hr/hiring';
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown) => ({ method: 'PATCH', body: JSON.stringify(body) });
const asList = (r: any): any[] => (Array.isArray(r) ? r : r?.data ?? r?.items ?? []);

// ── Reads ──
export const getDashboard = () => run(() => fetchApi<any>(`${H}/dashboard`));
export const getSources = () => run(() => fetchApi<any[]>(`${H}/sources`));
export const getAllSources = () => run(() => fetchApi<any[]>(`${H}/sources/all`));
export const listCandidates = (qs: string) => run(() => fetchApi<any>(`${H}/candidates?${qs}`));
export const getCandidate = (id: string) => run(() => fetchApi<any>(`${H}/candidates/${id}`));
export const getCandidateDemos = (id: string) => run(() => fetchApi<any[]>(`${H}/candidates/${id}/demos`));
export const getStaff = () => run(() => fetchApi<any[]>(`${H}/staff`));
export const getSlabs = () => run(() => fetchApi<any[]>(`${H}/salary-slabs`));
export const getWorkload = (qs: string) => run(() => fetchApi<any>(`${H}/demos/workload?${qs}`));
export const getPendingEvaluations = () => run(() => fetchApi<any[]>(`${H}/demos/pending-evaluations`));
export const getSchedule = () => run(() => fetchApi<any>(`${H}/schedule`));
export const getReport = (qs: string) => run(() => fetchApi<any>(`${H}/reports/summary?${qs}`));

/** Reference lists for the Details Shared form. Each list degrades to empty if the caller lacks access. */
export async function getReferenceLists(): Promise<ActionResult<Record<string, any[]>>> {
  const safe = async (path: string) => {
    try { return asList(await fetchApi<any>(path)); } catch { return []; }
  };
  const [subjects, grades, curricula, languages, motherTongues] = await Promise.all([
    safe('/reference/subjects?limit=100'),
    safe('/reference/grades?limit=100'),
    safe('/reference/curricula?limit=100'),
    safe('/tutor-hr/hiring/reference/communication-languages'),
    safe('/tutor-hr/hiring/reference/mother-tongues'),
  ]);
  return { ok: true, data: { subjects, grades, curricula, languages, motherTongues } };
}

// ── Candidates ──
export const checkDuplicate = (phone: string, countryCode?: string) =>
  run(() => fetchApi<any>(`${H}/candidates/check-duplicate`, post({ phone, countryCode })));
export const registerCandidate = (data: any) =>
  run(() => fetchApi<any>(`${H}/candidates`, post(data)), '/tutor-hr/hiring');
export const addEnquiry = (id: string, data: any) =>
  run(() => fetchApi<any>(`${H}/candidates/${id}/enquiries`, post(data)), `/tutor-hr/hiring/candidates/${id}`);
export const updateDetails = (id: string, data: any) =>
  run(() => fetchApi<any>(`${H}/candidates/${id}/details`, patch(data)));
export const setCvReceived = (id: string, cvReceivedAt: string) =>
  run(() => fetchApi<any>(`${H}/candidates/${id}/cv`, patch({ cvReceivedAt })));
export const advanceStage = (id: string, to: string, remarks?: string) =>
  run(() => fetchApi<any>(`${H}/candidates/${id}/stage`, post({ to, remarks })));
export const changeDecision = (id: string, decision: string, reason?: string) =>
  run(() => fetchApi<any>(`${H}/candidates/${id}/decision`, post({ decision, reason })));
export const logCall = (id: string, data: any) =>
  run(() => fetchApi<any>(`${H}/candidates/${id}/calls`, post(data)));

// ── Demos & evaluation ──
export const bookDemo = (id: string, data: { scheduledAt: string; assignedToUserId: string }) =>
  run(() => fetchApi<any>(`${H}/candidates/${id}/demos`, post(data)));
export const rescheduleDemo = (id: string, data: { scheduledAt: string; reason: string }) =>
  run(() => fetchApi<any>(`${H}/demos/${id}/reschedule`, post(data)));
export const reassignDemo = (id: string, data: { toUserId: string; reason: string }) =>
  run(() => fetchApi<any>(`${H}/demos/${id}/reassign`, post(data)));
export const recordAttendance = (id: string, data: any) =>
  run(() => fetchApi<any>(`${H}/demos/${id}/attendance`, post(data)));
export const submitEvaluation = (id: string, data: any) =>
  run(() => fetchApi<any>(`${H}/demos/${id}/evaluation`, post(data)));

// ── Settings & reports ──
export const setSchedule = (data: any) => run(() => fetchApi<any>(`${H}/schedule`, post(data)));
export const createSource = (name: string) => run(() => fetchApi<any>(`${H}/sources`, post({ name })));
export const addAdSpend = (data: any) => run(() => fetchApi<any>(`${H}/reports/ad-spend`, post(data)));
