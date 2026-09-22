"use server";
import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

export async function getRoundRobinStateAction() { return fetchApi<any>('/round-robin/state'); }
export async function updateRoundRobinStateAction(isPaused: boolean) { const res = await fetchApi<any>('/round-robin/state', { method: 'PATCH', body: JSON.stringify({ isPaused }) }); revalidatePath('/sales/round-robin'); return res; }
export async function updateCounsellorStateAction(userId: string, data: any) {
  const res = await fetchApi<any>(`/round-robin/counsellors/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/sales/team');
  revalidatePath('/sales/round-robin');
  return res;
}

export async function getMyTargetProgressAction(month?: string, year?: string) {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (year) params.append('year', year);
  return fetchApi<any>(`/sales-targets/my-progress?${params.toString()}`);
}

export async function getAllTargetsAction(month?: string, year?: string) {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (year) params.append('year', year);
  return fetchApi<any>(`/sales-targets/all?${params.toString()}`);
}

export async function setTargetAction(userId: string, periodMonth: number, periodYear: number, targetType: string, targetValue: number) {
  const res = await fetchApi<any>('/sales-targets', {
    method: 'POST',
    body: JSON.stringify({ userId, periodMonth, periodYear, targetType, targetValue }),
  });
  revalidatePath('/sales/targets');
  return res;
}

export async function getTeamTargetAction(departmentId: string, month?: string, year?: string) {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (year) params.append('year', year);
  return fetchApi<any>(`/sales-targets/team/${departmentId}?${params.toString()}`);
}

export async function setTeamTargetAction(departmentId: string, periodMonth: number, periodYear: number, targetType: string, targetValue: number) {
  const res = await fetchApi<any>('/sales-targets/team', {
    method: 'POST',
    body: JSON.stringify({ departmentId, periodMonth, periodYear, targetType, targetValue }),
  });
  revalidatePath('/sales/targets');
  return res;
}

export async function setTeamBundleAction(departmentId: string, periodMonth: number, periodYear: number, targetType: string, targetValue: number, allocations: any[]) {
  const res = await fetchApi<any>('/sales-targets/team-bundle', {
    method: 'POST',
    body: JSON.stringify({ departmentId, periodMonth, periodYear, targetType, targetValue, allocations }),
  });
  revalidatePath('/sales/targets');
  return res;
}

export async function getMomReportsAction(month?: string, year?: string) {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (year) params.append('year', year);
  return fetchApi<any>(`/sales-targets/reports/mom?${params.toString()}`);
}
