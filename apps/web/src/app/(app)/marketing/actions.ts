'use server';

import { fetchApi } from '../../../lib/api/client';

export async function getMarketingSummaryAction() {
  return fetchApi<any>('/marketing/summary');
}

export async function getMarketingActivityAction(cursor?: string, limit?: number) {
  const searchParams = new URLSearchParams();
  if (cursor) searchParams.set('cursor', cursor);
  if (limit) searchParams.set('limit', limit.toString());
  
  const q = searchParams.toString();
  return fetchApi<any>(`/marketing/activity${q ? `?${q}` : ''}`);
}

export async function getMarketingLeadsAction(search?: string, status?: any, cursor?: string, limit?: number) {
  const searchParams = new URLSearchParams();
  searchParams.set('hasMarketingAttribution', 'true');
  if (search) searchParams.set('search', search);
  if (status) searchParams.set('status', status);
  if (cursor) searchParams.set('cursor', cursor);
  if (limit) searchParams.set('limit', limit.toString());
  
  const q = searchParams.toString();
  return fetchApi<any>(`/leads?${q}`);
}
