'use server';

import { fetchApi } from '@/lib/api/client';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: 'CASUAL' | 'SICK' | 'UNPAID' | 'OTHER';
  startDate: string;
  endDate: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  employee?: {
    id: string;
    businessId: string;
    firstName: string;
    lastName: string;
    department?: {
      id: string;
      name: string;
      code: string;
    };
  };
  reviewedByUser?: {
    id: string;
    email: string;
  } | null;
}

export async function getMyLeaveRequestsAction(): Promise<LeaveRequest[]> {
  try {
    return await fetchApi<LeaveRequest[]>('/leaves/my');
  } catch (e) {
    console.error('Failed to fetch my leave requests', e);
    return [];
  }
}

export async function getAllLeaveRequestsAction(status?: string): Promise<LeaveRequest[]> {
  try {
    const qs = status && status !== 'ALL' ? `?status=${status}` : '';
    return await fetchApi<LeaveRequest[]>(`/leaves${qs}`);
  } catch (e) {
    console.error('Failed to fetch all leave requests', e);
    return [];
  }
}

export async function createLeaveRequestAction(dto: {
  leaveType: 'CASUAL' | 'SICK' | 'UNPAID' | 'OTHER';
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<{ success: boolean; data?: LeaveRequest; error?: string }> {
  try {
    const data = await fetchApi<LeaveRequest>('/leaves', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to submit leave request' };
  }
}

export async function reviewLeaveRequestAction(
  requestId: string,
  action: 'APPROVE' | 'REJECT',
  reviewNote?: string,
): Promise<{ success: boolean; data?: LeaveRequest; error?: string }> {
  try {
    const data = await fetchApi<LeaveRequest>(`/leaves/${requestId}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ action, reviewNote }),
    });
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to review leave request' };
  }
}

export async function cancelLeaveRequestAction(
  requestId: string,
): Promise<{ success: boolean; data?: LeaveRequest; error?: string }> {
  try {
    const data = await fetchApi<LeaveRequest>(`/leaves/${requestId}/cancel`, {
      method: 'PATCH',
    });
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to cancel leave request' };
  }
}
