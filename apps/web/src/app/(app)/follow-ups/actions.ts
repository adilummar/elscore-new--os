'use server';

import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

export async function getFollowUpsSummary() {
  return fetchApi<any>('/follow-ups/summary');
}

export async function getFollowUps(params: {
  view?: 'today' | 'upcoming' | 'overdue' | 'all';
  status?: string;
  cursor?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params.view) query.set('view', params.view);
  if (params.status) query.set('status', params.status);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', params.limit.toString());

  return fetchApi<any>(`/follow-ups?${query.toString()}`);
}

export async function completeFollowUp(leadId: string, id: string, data: any) {
  const result = await fetchApi<any>(`/leads/${leadId}/follow-ups/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/follow-ups');
  revalidatePath(`/leads/${leadId}`);
  return result;
}

export async function rescheduleFollowUp(leadId: string, id: string, data: any) {
  const result = await fetchApi<any>(`/leads/${leadId}/follow-ups/${id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/follow-ups');
  revalidatePath(`/leads/${leadId}`);
  return result;
}

export async function createFollowUp(leadId: string, data: any) {
  const result = await fetchApi<any>(`/leads/${leadId}/follow-ups`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/follow-ups');
  revalidatePath(`/leads/${leadId}`);
  return result;
}

export async function searchLeads(query: string) {
  return fetchApi<any>(`/leads?search=${encodeURIComponent(query)}&limit=5`);
}
