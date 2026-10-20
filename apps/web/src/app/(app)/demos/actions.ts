'use server';

import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

export async function getDemos(params: {
  view?: string;
  stage?: string;
  state?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params.view) query.set('view', params.view);
  if (params.stage) query.set('stage', params.stage);
  if (params.state) query.set('state', params.state);
  if (params.status) query.set('status', params.status);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', params.limit.toString());

  return fetchApi<any>(`/demos?${query.toString()}`);
}

export async function getTutorSuggestions(demoId: string) {
  return fetchApi<any>(`/demos/${demoId}/tutor-suggestions`);
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
  try {
    const result = await fetchApi<any>(`/demos/${id}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    revalidatePath('/demos');
    revalidatePath(`/demos/${id}`);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to reschedule demo' };
  }
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
  try {
    const result = await fetchApi<any>(`/demos/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ tutorId }),
    });
    revalidatePath('/demos');
    revalidatePath(`/demos/${id}`);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to assign tutor' };
  }
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
  return fetchApi<any>(`/demos/tutors/search?search=${encodeURIComponent(query)}`);
}

export async function searchLeads(query: string) {
  return fetchApi<any>(`/leads?search=${encodeURIComponent(query)}&limit=5`);
}

export async function savePreparation(id: string, data: { preparationNotes: string }) {
  try {
    const result = await fetchApi<any>(`/demos/${id}/preparation`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    revalidatePath('/demos');
    revalidatePath(`/demos/${id}`);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save preparation instructions' };
  }
}

export async function recordMeetingLink(id: string, data: { meetingLink: string; meetingPlatform?: string; sessionId?: string; changeReason?: string }) {
  try {
    const result = await fetchApi<any>(`/demos/${id}/meeting-link`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    revalidatePath('/demos');
    revalidatePath(`/demos/${id}`);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record meeting link' };
  }
}

export async function getWhatsAppPreview(id: string) {
  try {
    const result = await fetchApi<any>(`/demos/${id}/whatsapp-preview`);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch WhatsApp preview' };
  }
}

export async function recordWhatsAppOutreach(id: string) {
  try {
    const result = await fetchApi<any>(`/demos/${id}/whatsapp-share`, {
      method: 'POST',
    });
    revalidatePath('/demos');
    revalidatePath(`/demos/${id}`);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to initiate WhatsApp share' };
  }
}

export async function confirmParentMeeting(id: string, data: { confirmationChannel: string; confirmationNotes?: string }) {
  try {
    const result = await fetchApi<any>(`/demos/${id}/parent-confirmation`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    revalidatePath('/demos');
    revalidatePath(`/demos/${id}`);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record parent confirmation' };
  }
}

export async function reassignCoordinator(id: string, data: { coordinatorId: string; reason: string }) {
  try {
    const result = await fetchApi<any>(`/demos/${id}/reassign-coordinator`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    revalidatePath('/demos');
    revalidatePath(`/demos/${id}`);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to reassign coordinator' };
  }
}

export async function getCoordinators() {
  return fetchApi<any>('/demos/coordinators/list');
}

