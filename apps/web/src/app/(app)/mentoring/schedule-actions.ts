"use server";

import { fetchApi } from '@/lib/api/client';
import { ActionResult, toActionResult } from '@/lib/api/action-result';

/**
 * Adds a subject to the shared subject list from the schedule editor. Only this one reference-data call is exposed, and
 * the API still requires the reference data permission, so a Mentor without it gets the API's own refusal. It returns a
 * result instead of throwing, for the same reason as the Mentoring action: Next.js hides the message of a thrown error.
 */
export async function addSubjectToListAction(code: string, name: string): Promise<ActionResult<unknown>> {
  return toActionResult(() => fetchApi<unknown>('/reference/subjects', { method: 'POST', body: JSON.stringify({ code, name }) }));
}

const ID = /^[A-Za-z0-9-]{8,64}$/;
const badTutor = (): ActionResult<unknown> => ({ ok: false, message: 'This tutor could not be found.' });

/**
 * A tutor's weekly working hours. These forward to the existing tutor profile routes, which allow HR staff to read and
 * change any tutor and a tutor to read and change their own. A Mentor is refused by the API with its own message.
 */
export async function getTutorAvailabilityAction(tutorProfileId: string): Promise<ActionResult<unknown>> {
  if (!ID.test(tutorProfileId)) return badTutor();
  return toActionResult(() => fetchApi<unknown>(`/tutors/profile/${tutorProfileId}/availability`));
}

export async function saveTutorAvailabilityAction(tutorProfileId: string, windows: unknown[]): Promise<ActionResult<unknown>> {
  if (!ID.test(tutorProfileId)) return badTutor();
  return toActionResult(() => fetchApi<unknown>(`/tutors/profile/${tutorProfileId}/availability`, { method: 'PUT', body: JSON.stringify({ windows }) }));
}

export async function getMyAvailabilityAction(): Promise<ActionResult<unknown>> {
  return toActionResult(() => fetchApi<unknown>('/tutors/profile/me/availability'));
}

export async function saveMyAvailabilityAction(windows: unknown[]): Promise<ActionResult<unknown>> {
  return toActionResult(() => fetchApi<unknown>('/tutors/profile/me/availability', { method: 'PUT', body: JSON.stringify({ windows }) }));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The signed-in tutor's own classes. The route takes no tutor id: the API starts from who is signed in. */
export async function getMyCalendarAction(from: string, to: string): Promise<ActionResult<unknown>> {
  if (!DATE.test(from) || !DATE.test(to)) return { ok: false, message: 'Choose real dates.' };
  return toActionResult(() => fetchApi<unknown>(`/tutor-portal/calendar?from=${from}&to=${to}`));
}

/** A tutor's date-wise timetable. The API checks the permission, limits the range, and hides student names from people who may not see them. */
export async function getTutorCalendarAction(tutorProfileId: string, from: string, to: string): Promise<ActionResult<unknown>> {
  if (!ID.test(tutorProfileId) || !DATE.test(from) || !DATE.test(to)) return badTutor();
  return toActionResult(() => fetchApi<unknown>(`/tutors/profile/${tutorProfileId}/calendar?from=${from}&to=${to}`));
}
