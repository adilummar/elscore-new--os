"use server";
import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

export async function getUsersAction(query: string) { return fetchApi<any>('/users?' + query); }
export async function createUserAction(data: any) { const res = await fetchApi<any>('/users', { method: 'POST', body: JSON.stringify(data) }); revalidatePath('/settings/users'); return res; }
export async function updateUserStatusAction(id: string, status: string, reason?: string) { const res = await fetchApi<any>('/users/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status, reason }) }); revalidatePath('/settings/users'); return res; }
export async function assignRoleAction(userId: string, roleId: string) { const res = await fetchApi<any>('/users/' + userId + '/roles', { method: 'POST', body: JSON.stringify({ roleId }) }); revalidatePath('/settings/users'); return res; }

export async function getEmployeesAction(query: string) { return fetchApi<any>('/employees?' + query); }
export async function updateEmployeeStatusAction(id: string, status: string, reason?: string) { const res = await fetchApi<any>('/employees/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status, reason }) }); revalidatePath('/settings/employees'); return res; }

export async function getDepartmentsAction() { return fetchApi<any>('/departments'); }

export async function getRolesAction(query: string) { return fetchApi<any>('/roles?' + query); }
export async function createCustomRoleAction(data: any) { const res = await fetchApi<any>('/roles', { method: 'POST', body: JSON.stringify(data) }); revalidatePath('/settings/roles'); return res; }

export async function getPermissionsAction(query: string) { return fetchApi<any>('/permissions?' + query); }
export async function delegatePermissionAction(userId: string, permissionId: string) { const res = await fetchApi<any>('/users/' + userId + '/permissions', { method: 'POST', body: JSON.stringify({ permissionId }) }); revalidatePath('/settings/delegations'); return res; }
export async function revokeDelegationAction(userId: string, grantId: string) { const res = await fetchApi<any>('/users/' + userId + '/permissions/' + grantId, { method: 'DELETE' }); revalidatePath('/settings/delegations'); return res; }

export async function getSubjectsAction() { return fetchApi<any>('/reference/subjects'); }
export async function getGradesAction() { return fetchApi<any>('/reference/grades'); }
export async function getCurriculaAction() { return fetchApi<any>('/reference/curricula'); }
export async function createSubjectAction(data: any) { const res = await fetchApi<any>('/reference/subjects', { method: 'POST', body: JSON.stringify(data) }); revalidatePath('/settings/reference-data'); return res; }
export async function createGradeAction(data: any) { const res = await fetchApi<any>('/reference/grades', { method: 'POST', body: JSON.stringify(data) }); revalidatePath('/settings/reference-data'); return res; }
export async function createCurriculumAction(data: any) { const res = await fetchApi<any>('/reference/curricula', { method: 'POST', body: JSON.stringify(data) }); revalidatePath('/settings/reference-data'); return res; }
export async function updateSubjectStatusAction(id: string, status: boolean) { const res = await fetchApi<any>('/reference/subjects/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ isActive: status }) }); revalidatePath('/settings/reference-data'); return res; }
export async function updateGradeStatusAction(id: string, status: boolean) { const res = await fetchApi<any>('/reference/grades/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ isActive: status }) }); revalidatePath('/settings/reference-data'); return res; }
export async function updateCurriculumStatusAction(id: string, status: boolean) { const res = await fetchApi<any>('/reference/curricula/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ isActive: status }) }); revalidatePath('/settings/reference-data'); return res; }

export async function getAuditAction(query: string) { return fetchApi<any>('/audit?' + query); }
