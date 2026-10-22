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
  isOnLeave?: boolean;
  isLeaveUnlocked?: boolean;
  todayLeave?: {
    id: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string | null;
  } | null;
  todayUnlock?: {
    id: string;
    calendarDate: string;
    reason: string | null;
    createdAt: string;
  } | null;
}

export interface StaffDetail extends StaffSummary {
  todaySession: any;
  recentSessions: any[];
  recentLeaves?: any[];
  recentUnlocks?: any[];
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

export async function unlockAttendanceLeaveAction(
  employeeId: string,
  calendarDate: string,
  reason: string,
  leaveRequestId?: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const data = await fetchApi('/attendance/unlock-leave', {
      method: 'POST',
      body: JSON.stringify({ employeeId, calendarDate, reason, leaveRequestId }),
    });
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to unlock check-in' };
  }
}
