"use server";

import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

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

export async function updateTutorLeadStageAction(id: string, stage: string) {
  const res = await fetchApi<any>('/tutor-hr/leads/' + id + '/stage', {
    method: 'POST',
    body: JSON.stringify({ stage }),
  });
  revalidatePath('/tutor-hr/leads/' + id);
  return res;
}

export async function approveTutorLeadAction(id: string, data: any) {
  const res = await fetchApi<any>('/tutor-hr/reviews/' + id + '/approve', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/tutor-hr/leads');
  return res;
}

export async function getDepartmentsAction() {
  return fetchApi<any>('/departments');
}

export async function getRolesAction() {
  return fetchApi<any>('/roles');
}

export async function getMotherTonguesAction() {
  return fetchApi<any>('/tutor-hr/settings/mother-tongues');
}