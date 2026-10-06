"use server";

import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

// ── Tutor Lead CRUD ───────────────────────────────────────────────────────

export async function getTutorLeadsAction(query: string = "") {
  return fetchApi<any>('/tutor-hr/leads?' + query);
}

export async function getTutorLeadAction(id: string) {
  return fetchApi<any>('/tutor-hr/leads/' + id);
}

export async function createTutorLeadAction(data: any) {
  const res = await fetchApi<any>('/tutor-hr/leads', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/tutor-hr/leads');
  return res;
}

export async function updateTutorLeadAction(id: string, data: any) {
  const res = await fetchApi<any>('/tutor-hr/leads/' + id, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/tutor-hr/leads/' + id);
  return res;
}

export async function updateTutorLeadStageAction(id: string, stage: string, remarks?: string) {
  const res = await fetchApi<any>('/tutor-hr/leads/' + id + '/stage', {
    method: 'PATCH',
    body: JSON.stringify({ stage, remarks }),
  });
  revalidatePath('/tutor-hr/leads/' + id);
  return res;
}

// ── Sub-resource reads ─────────────────────────────────────────────────────

export async function getStageHistoryAction(leadId: string) {
  return fetchApi<any>('/tutor-hr/leads/' + leadId + '/stage-history');
}

export async function getCallsAction(leadId: string) {
  return fetchApi<any>('/tutor-hr/leads/' + leadId + '/calls');
}

export async function getDemosAction(leadId: string) {
  return fetchApi<any>('/tutor-hr/leads/' + leadId + '/demos');
}

export async function getTrainingSessionsAction(leadId: string) {
  return fetchApi<any>('/tutor-hr/leads/' + leadId + '/training-sessions');
}

// ── Sub-resource writes ────────────────────────────────────────────────────

export async function recordCallAction(leadId: string, data: { remark: string }) {
  const res = await fetchApi<any>('/tutor-hr/leads/' + leadId + '/calls', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/tutor-hr/leads/' + leadId);
  return res;
}

export async function recordDemoAction(leadId: string, data: {
  isLiveDemo: boolean;
  remarks: string;
  demoDate?: string;
  startTime?: string;
  endTime?: string;
}) {
  const res = await fetchApi<any>('/tutor-hr/leads/' + leadId + '/demos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/tutor-hr/leads/' + leadId);
  return res;
}

export async function addTrainingSessionAction(leadId: string, data: {
  sessionDate: string;
  attendanceStatus: string;
  taskStatus: string;
  remarks?: string;
}) {
  const res = await fetchApi<any>('/tutor-hr/leads/' + leadId + '/training-sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/tutor-hr/leads/' + leadId);
  return res;
}

export async function updateTrainingSessionAction(leadId: string, sessionId: string, data: {
  sessionDate: string;
  attendanceStatus: string;
  taskStatus: string;
  remarks?: string;
}) {
  const res = await fetchApi<any>('/tutor-hr/leads/' + leadId + '/training-sessions/' + sessionId, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/tutor-hr/leads/' + leadId);
  return res;
}

// ── Reviews / Approval ─────────────────────────────────────────────────────

export async function getPendingReviewsAction() {
  return fetchApi<any>('/tutor-hr/reviews');
}

/**
 * Approve a tutor lead and convert to TutorProfile.
 * NOTE: No password or login is created for the candidate.
 * Pass existingEmployeeId only if the person is already an employee.
 */
export async function approveTutorLeadAction(leadId: string, data: { existingEmployeeId?: string }) {
  const res = await fetchApi<any>('/tutor-hr/reviews/' + leadId + '/approve', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/tutor-hr/leads');
  revalidatePath('/tutor-hr/reviews');
  return res;
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function getMotherTonguesAction() {
  return fetchApi<any>('/tutor-hr/settings/mother-tongues');
}

export async function getCommunicationLanguagesAction() {
  return fetchApi<any>('/tutor-hr/settings/communication-languages');
}

export async function getSalarySlabsAction() {
  return fetchApi<any>('/tutor-hr/settings/salary-slabs');
}

export async function getSubjectsAction() {
  return fetchApi<any>('/reference-data/subjects');
}

export async function getGradesAction() {
  return fetchApi<any>('/reference-data/grades');
}