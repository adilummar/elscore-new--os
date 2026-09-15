"use server";
import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

export async function getRoundRobinStateAction() { return fetchApi<any>('/round-robin/state'); }
export async function updateRoundRobinStateAction(isPaused: boolean) { const res = await fetchApi<any>('/round-robin/state', { method: 'PATCH', body: JSON.stringify({ isPaused }) }); revalidatePath('/sales/round-robin'); return res; }
export async function updateCounsellorStateAction(userId: string, data: any) { const res = await fetchApi<any>('/round-robin/counsellors/' + userId, { method: 'PATCH', body: JSON.stringify(data) }); revalidatePath('/sales/team'); revalidatePath('/sales/round-robin'); return res; }
