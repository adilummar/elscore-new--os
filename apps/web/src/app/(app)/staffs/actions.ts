'use server';

import { fetchApi } from '@/lib/api/client';

export type StaffAttendanceStatus = 'ACTIVE' | 'ON_BREAK' | 'COMPLETED' | null;

export interface StaffSummary {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string;
  email: string;
  userId: string;
  department: { id: string; name: string; code: string };
  roles: { id: string; name: string; code: string }[];
  todaySession: {
    id: string;
    status: StaffAttendanceStatus;
    note: string | null;
    isLate: boolean;
    lateMinutes: number;
    netDurationMinutes: number;
    breakDurationMinutes: number;
    checkInTime: string | null;
    checkOutTime: string | null;
  } | null;
}

export interface StaffDetail extends StaffSummary {
  todaySession: any;
  recentSessions: any[];
}

export async function getAllStaffsAction(departmentId?: string): Promise<StaffSummary[]> {
  const qs = departmentId ? `?departmentId=${departmentId}` : '';
  const data = await fetchApi<StaffSummary[]>(`/attendance/staffs${qs}`).catch(() => []);
  return data;
}

export async function getStaffDetailAction(employeeId: string): Promise<StaffDetail | null> {
  try {
    return await fetchApi<StaffDetail>(`/attendance/staffs/${employeeId}`);
  } catch {
    return null;
  }
}
