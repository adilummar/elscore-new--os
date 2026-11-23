"use server";

import { fetchApi } from '@/lib/api/client';

/** Tutors server actions. Errors are returned as values so business messages reach the UI. */
export type ActionResult<T = any> = { ok: true; data: T } | { ok: false; message: string; code?: string };

async function run<T = any>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Request failed', code: e?.code };
  }
}

const B = '/tutor-hr/tutors';
const json = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store' as const });

export const getTutorSummary = (qs: string) => run(() => fetchApi<any>(`${B}/summary?${qs}`));
export const searchTutors = (qs: string) => run(() => fetchApi<any[]>(`${B}?${qs}`));
export const getTutorProfile = (id: string) => run(() => fetchApi<any>(`${B}/${id}`, { cache: 'no-store' }));
export const updateTutorProfile = (id: string, body: any) => run(() => fetchApi<any>(`${B}/${id}`, json('PATCH', body)));
export const addQualification = (id: string, body: any) => run(() => fetchApi<any>(`${B}/${id}/qualifications`, json('POST', body)));
export const updateQualification = (id: string, qid: string, body: any) => run(() => fetchApi<any>(`${B}/${id}/qualifications/${qid}`, json('PUT', body)));
export const removeQualification = (id: string, qid: string) => run(() => fetchApi<any>(`${B}/${id}/qualifications/${qid}`, json('DELETE')));
export const changeTutorStatus = (id: string, status: string, reason: string) => run(() => fetchApi<any>(`${B}/${id}/status`, json('POST', { status, reason })));
export const getTutorHistory = (id: string) => run(() => fetchApi<any[]>(`${B}/${id}/history`, { cache: 'no-store' }));
export const listHrNotes = (id: string) => run(() => fetchApi<any[]>(`${B}/${id}/notes`, { cache: 'no-store' }));
export const addHrNote = (id: string, body: string) => run(() => fetchApi<any>(`${B}/${id}/notes`, json('POST', { body })));
export const editHrNote = (id: string, noteId: string, body: string) => run(() => fetchApi<any>(`${B}/${id}/notes/${noteId}`, json('PATCH', { body })));
