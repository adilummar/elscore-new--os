"use server";

import { fetchApi } from '@/lib/api/client';

/** Pay Slab server actions. Errors come back as values so business messages (duplicate name, 409s) reach the UI. */
export type ActionResult<T = any> = { ok: true; data: T } | { ok: false; message: string; code?: string };

async function run<T = any>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Request failed', code: e?.code };
  }
}

const S = '/tutor-hr/pay-slabs';
const T = '/tutor-hr/tutors';
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), cache: 'no-store' as const });
const get = { cache: 'no-store' as const };

// Slabs have no update or delete action here, on purpose: the API has none either.
export const listPaySlabs = () => run(() => fetchApi<any[]>(S, get));
export const getPaySlab = (id: string) => run(() => fetchApi<any>(`${S}/${id}`, get));
export const getSlabTutors = (id: string) => run(() => fetchApi<any[]>(`${S}/${id}/tutors`, get));
export const createPaySlab = (body: { name: string; currency: string; rates: Array<{ gradeCode: string; rate: number }> }) =>
  run(() => fetchApi<any>(S, post(body)));

export const getTutorSalary = (tutorId: string) => run(() => fetchApi<any>(`${T}/${tutorId}/salary`, get));
export const assignTutorSlab = (tutorId: string, body: { slabId: string; reason: string }) =>
  run(() => fetchApi<any>(`${T}/${tutorId}/slab-assignments`, post(body)));
export const cancelSlabChange = (tutorId: string, assignmentId: string, reason: string) =>
  run(() => fetchApi<any>(`${T}/${tutorId}/slab-assignments/${assignmentId}/cancel`, post({ reason })));
