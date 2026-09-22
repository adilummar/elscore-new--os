'use server';

import { fetchApi } from './client';

export async function getDistributionHistory(params: {
  date?: string;
  from?: string;
  to?: string;
  method?: string;
  counsellorId?: string;
  assignedTo?: string;
  leadId?: string;
  source?: string;
  cursor?: string | null;
}) {
  const query = new URLSearchParams();
  if (params.date) query.append('date', params.date);
  if (params.from) query.append('from', params.from);
  if (params.to) query.append('to', params.to);
  if (params.method) query.append('method', params.method);
  if (params.counsellorId) query.append('counsellorId', params.counsellorId);
  if (params.assignedTo) query.append('assignedTo', params.assignedTo);
  if (params.leadId) query.append('leadId', params.leadId);
  if (params.source) query.append('source', params.source);
  if (params.cursor) query.append('cursor', params.cursor);

  return fetchApi(`/round-robin/history?${query.toString()}`);
}
