"use server";

import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

export async function getLeadsAction(query: string) {
  return fetchApi<any>(`/leads?${query}`);
}

export async function createLeadAction(data: any) {
  const res = await fetchApi<any>('/leads', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/leads');
  return res;
}

export async function getLeadAction(id: string) {
  return fetchApi<any>(`/leads/${id}`);
}

export async function getLeadTimelineAction(id: string) {
  return fetchApi<any>(`/leads/${id}/timeline`);
}

export async function updateLeadDetailsAction(id: string, data: any) {
  const res = await fetchApi<any>(`/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath(`/leads/${id}`);
  return res;
}

export async function updateLeadStatusAction(id: string, status: string, reason: string) {
  const res = await fetchApi<any>(`/leads/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, reason }),
  });
  revalidatePath(`/leads/${id}`);
  return res;
}

export async function reassignLeadAction(id: string, assignedToUserId: string, reason: string) {
  const res = await fetchApi<any>(`/leads/${id}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ assignedToUserId, reason }),
  });
  revalidatePath(`/leads/${id}`);
  return res;
}

export async function archiveLeadAction(id: string) {
  const res = await fetchApi<any>(`/leads/${id}/archive`, {
    method: 'POST',
  });
  revalidatePath('/leads');
  return res;
}

export async function reopenLeadAction(id: string) {
  const res = await fetchApi<any>(`/leads/${id}/reopen`, {
    method: 'POST',
  });
  revalidatePath('/leads');
  return res;
}

// Follow-ups
export async function getFollowUpsAction(leadId: string) {
  return fetchApi<any>(`/leads/${leadId}/follow-ups?status=SCHEDULED`);
}

export async function createFollowUpAction(leadId: string, scheduledAt: string, remarks: string) {
  const res = await fetchApi<any>(`/leads/${leadId}/follow-ups`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt, remarks }),
  });
  revalidatePath(`/leads/${leadId}`);
  return res;
}

export async function completeFollowUpAction(leadId: string, id: string, classification: string, remarks: string) {
  const res = await fetchApi<any>(`/leads/${leadId}/follow-ups/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ classification, remarks }),
  });
  revalidatePath(`/leads/${leadId}`);
  return res;
}

export async function rescheduleFollowUpAction(leadId: string, id: string, newScheduledAt: string, reason: string) {
  const res = await fetchApi<any>(`/leads/${leadId}/follow-ups/${id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ newScheduledAt, reason }),
  });
  revalidatePath(`/leads/${leadId}`);
  return res;
}

// Notes
export async function createNoteAction(leadId: string, content: string) {
  const res = await fetchApi<any>(`/leads/${leadId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  revalidatePath(`/leads/${leadId}`);
  return res;
}

export async function deleteNoteAction(leadId: string, noteId: string) {
  const res = await fetchApi<any>(`/leads/${leadId}/notes/${noteId}`, {
    method: 'DELETE',
  });
  revalidatePath(`/leads/${leadId}`);
  return res;
}

// Demos
export async function bookDemoAction(studentId: string, requirementId: string, scheduledAt: string, durationMinutes: number) {
  const res = await fetchApi<any>(`/demos`, {
    method: 'POST',
    body: JSON.stringify({ studentId, requirementId, scheduledAt, durationMinutes }),
  });
  revalidatePath(`/leads`);
  return res;
}

// Students
export async function createStudentAction(data: any) {
  const res = await fetchApi<any>('/students', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (data.leadId) revalidatePath(`/leads/${data.leadId}`);
  return res;
}

export async function updateStudentAction(id: string, data: any, leadId?: string) {
  const res = await fetchApi<any>(`/students/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (leadId) revalidatePath(`/leads/${leadId}`);
  return res;
}

// Requirements
export async function createRequirementAction(studentId: string, data: any, leadId?: string) {
  const res = await fetchApi<any>(`/students/${studentId}/requirements`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (leadId) revalidatePath(`/leads/${leadId}`);
  return res;
}

export async function updateRequirementAction(id: string, data: any, leadId?: string) {
  const res = await fetchApi<any>(`/requirements/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (leadId) revalidatePath(`/leads/${leadId}`);
  return res;
}

export async function saveStudentBundleAction(data: any) {
  const res = await fetchApi<any>('/students/bundle', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (data.leadId) revalidatePath(`/leads/${data.leadId}`);
  return res;
}

// Reference / Directory
export async function getEmployeesAction() {
  return fetchApi<any>('/employees?limit=100');
}

export async function getReferenceDataAction(endpoint: string) {
  return fetchApi<any>(`/reference/${endpoint}?limit=100`);
}

export async function getLeadAssignmentHistoryAction(leadId: string) {
  return fetchApi<any>(/leads/\/assignments);
}
