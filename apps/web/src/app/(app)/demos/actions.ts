'use server';

import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

export async function getDemos(params: {
  view?: 'today' | 'upcoming' | 'completed' | 'all';
  state?: string;
  cursor?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params.view) query.set('view', params.view);
  if (params.state) query.set('state', params.state);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', params.limit.toString());

  return fetchApi<any>(`/demos?${query.toString()}`);
}

export async function getDemosSummary() {
  return fetchApi<any>('/demos/summary');
}

export async function getDemoById(id: string) {
  return fetchApi<any>(`/demos/${id}`);
}

export async function bookDemo(data: any) {
  const result = await fetchApi<any>('/demos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/demos');
  revalidatePath('/leads'); // Preemptively if called from lead detail
  return result;
}

export async function rescheduleDemo(id: string, data: any) {
  const result = await fetchApi<any>(`/demos/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/demos');
  revalidatePath(`/demos/${id}`);
  return result;
}

export async function editDemo(id: string, data: any) {
  const result = await fetchApi<any>(`/demos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/demos');
  revalidatePath(`/demos/${id}`);
  return result;
}

export async function cancelDemo(id: string, data: any) {
  const result = await fetchApi<any>(`/demos/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/demos');
  revalidatePath(`/demos/${id}`);
  return result;
}

export async function markNoShowDemo(id: string, data: any) {
  const result = await fetchApi<any>(`/demos/${id}/no-show`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/demos');
  revalidatePath(`/demos/${id}`);
  return result;
}

export async function assignTutor(id: string, tutorId: string) {
  const result = await fetchApi<any>(`/demos/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ tutorId }),
  });
  revalidatePath('/demos');
  revalidatePath(`/demos/${id}`);
  return result;
}

export async function completeDemo(id: string, data: any) {
  const result = await fetchApi<any>(`/demos/${id}/complete`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/demos');
  revalidatePath(`/demos/${id}`);
  return result;
}

export async function searchTutors(query: string) {
  return fetchApi<any>(`/tutors?search=${encodeURIComponent(query)}&limit=5`);
}

export async function searchLeads(query: string) {
  return fetchApi<any>(`/leads?search=${encodeURIComponent(query)}&limit=5`);
}
