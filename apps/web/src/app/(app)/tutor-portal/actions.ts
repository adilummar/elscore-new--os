"use server";

import { fetchApi } from '@/lib/api/client';
import { ActionResult, toActionResult } from '@/lib/api/action-result';

/**
 * Thin server-action bridge to the tutor portal API. It only forwards the signed-in user's own request, and only to the
 * tutor portal routes that read classes, exams and earnings or submit a class update, an exam receipt or an exam evaluation.
 * The API enforces the permission and starts every answer from who is signed in, so nothing here can name another tutor.
 */
const DATE = '\\d{4}-\\d{2}-\\d{2}';
const KEY = '[A-Za-z0-9-]{8,64}~\\d{4}-\\d{2}-\\d{2}~\\d{1,4}';
const ID = '[A-Za-z0-9_-]{8,64}';
const READ = [new RegExp(`^/tutor-portal/class-workspace/${KEY}$`), new RegExp(`^/tutor-portal/classes\\?from=${DATE}&to=${DATE}$`), new RegExp(`^/tutor-portal/earnings\\?from=${DATE}&to=${DATE}$`), new RegExp(`^/tutor-portal/exams\\?from=${DATE}&to=${DATE}$`)];
const WRITE: Array<[RegExp, 'PUT' | 'POST']> = [
  [new RegExp(`^/tutor-portal/class-workspace/${KEY}/(shares|activities|voice/shared)$`), 'POST'],
  [new RegExp(`^/tutor-portal/class-workspace/shares/${ID}/(copied|confirm)$`), 'POST'],
  [new RegExp(`^/tutor-portal/class-workspace/activities/${ID}/(remove|shared)$`), 'POST'],
  [new RegExp(`^/tutor-portal/class-workspace/activities/${ID}(/response)?$`), 'PUT'],
  [new RegExp(`^/tutor-portal/class-workspace/follow-ups/${ID}$`), 'PUT'],
  [/^\/tutor-portal\/classes\/[A-Za-z0-9-]{8,64}~\d{4}-\d{2}-\d{2}~\d{1,4}\/update$/, 'PUT'],
  [/^\/tutor-portal\/exams\/[A-Za-z0-9-]{8,64}\/receipt$/, 'POST'],
  [/^\/tutor-portal\/exams\/[A-Za-z0-9-]{8,64}\/evaluation$/, 'PUT'],
];

export async function tutorPortalApiAction(path: string, method: 'GET' | 'PUT' | 'POST' = 'GET', body?: unknown): Promise<ActionResult<any>> {
  const write = WRITE.find(([r]) => r.test(path));
  if (!write && !READ.some((r) => r.test(path))) return { ok: false, message: 'Invalid tutor portal path' };
  if (method !== (write ? write[1] : 'GET')) return { ok: false, message: 'Invalid tutor portal request' };
  return toActionResult(() => fetchApi<any>(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
}
