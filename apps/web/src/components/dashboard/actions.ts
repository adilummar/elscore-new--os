'use server';

import { fetchApi } from '@/lib/api/client';

export interface DelayedLeadAssignee {
  id: string;
  email: string;
  employee: { firstName: string | null; lastName: string | null } | null;
}

export interface DelayedLead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  primaryPhone: string;
  whatsappNumber: string | null;
  assignedToUser: DelayedLeadAssignee | null;
}

export interface DelayedLeadsResponse {
  delayedCount: number;
  delayedLeads: DelayedLead[];
}

export async function getDelayedLeadsAction(): Promise<DelayedLeadsResponse> {
  return fetchApi<DelayedLeadsResponse>('/dashboard/delayed-leads');
}
