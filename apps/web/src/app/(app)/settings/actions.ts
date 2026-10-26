"use server";
import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

export async function getUsersAction(query: string) { return fetchApi<any>('/users?' + query); }
export async function createUserAction(data: any) { const res = await fetchApi<any>('/users', { method: 'POST', body: JSON.stringify(data) }); revalidatePath('/settings/users'); return res; }
export async function updateUserStatusAction(id: string, status: string, reason?: string) { const res = await fetchApi<any>('/users/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status, reason }) }); revalidatePath('/settings/users'); return res; }
export async function assignRoleAction(userId: string, roleId: string) { const res = await fetchApi<any>('/users/' + userId + '/roles', { method: 'POST', body: JSON.stringify({ roleId }) }); revalidatePath('/settings/users'); return res; }

export async function getEmployeesAction(query: string) { return fetchApi<any>('/employees?' + query); }
export async function getEmployeeAction(id: string) { return fetchApi<any>('/employees/' + id); }
export async function updateEmployeeProfileAction(id: string, data: any) { const res = await fetchApi<any>('/employees/' + id, { method: 'PATCH', body: JSON.stringify(data) }); revalidatePath('/settings/employees'); return res; }
export async function transitionEmployeeStatusAction(id: string, data: any) { const res = await fetchApi<any>('/employees/' + id + '/transition', { method: 'PATCH', body: JSON.stringify(data) }); revalidatePath('/settings/employees'); return res; }
export async function getEmployeeHistoryAction(id: string) { return fetchApi<any>('/employees/' + id + '/history'); }
export async function getEmployeeCompensationAction(id: string) { return fetchApi<any>('/employees/' + id + '/compensation/active'); }
export async function getEmployeeCompensationHistoryAction(id: string) { return fetchApi<any>('/employees/' + id + '/compensation/history'); }
export async function requestCompensationChangeAction(id: string, data: any) { const res = await fetchApi<any>('/employees/' + id + '/compensation/request', { method: 'POST', body: JSON.stringify(data) }); revalidatePath('/settings/employees'); return res; }
export async function getCompensationRequestsAction(query: string = '') { return fetchApi<any>('/compensation/requests?' + query); }
export async function reviewCompensationRequestAction(requestId: string, data: any) { const res = await fetchApi<any>('/compensation/requests/' + requestId + '/review', { method: 'PATCH', body: JSON.stringify(data) }); revalidatePath('/settings/employees'); return res; }

export async function getTutorRateRequestsAction(query: string = '') { return fetchApi<any>('/tutors/rates/requests?' + query); }
export async function requestTutorRateChangeAction(profileId: string, data: any) { const res = await fetchApi<any>('/tutors/profile/' + profileId + '/rates/request', { method: 'POST', body: JSON.stringify(data) }); revalidatePath('/tutor-hr'); return res; }
export async function reviewTutorRateChangeAction(requestId: string, data: any) { const res = await fetchApi<any>('/tutors/rates/requests/' + requestId + '/review', { method: 'PATCH', body: JSON.stringify(data) }); revalidatePath('/tutor-hr'); return res; }
export async function updateEmployeeStatusAction(id: string, status: string, reason?: string) { const res = await fetchApi<any>('/employees/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status, reason }) }); revalidatePath('/settings/employees'); return res; }

export async function getDepartmentsAction() { return fetchApi<any>('/departments'); }

export async function getRolesAction(query: string) { return fetchApi<any>('/roles?' + query); }
export async function createCustomRoleAction(data: any) { const res = await fetchApi<any>('/roles', { method: 'POST', body: JSON.stringify(data) }); revalidatePath('/settings/roles'); return res; }
export async function updateRolePermissionAction(roleId: string, action: 'ADD' | 'REMOVE', permissionId: string) { const res = await fetchApi<any>('/roles/' + roleId + '/permissions', { method: 'PATCH', body: JSON.stringify({ action, permissionId }) }); revalidatePath('/settings/roles'); return res; }

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

export async function getPricingSlabsAction() {
  return fetchApi<any[]>('/pricing/slabs');
}

export async function createPricingSlabAction(data: {
  curriculumId: string;
  gradeFrom: number;
  gradeTo: number;
  hourlyRate: number;
}) {
  const res = await fetchApi<any>('/pricing/slabs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/pricing');
  return res;
}

export async function updatePricingSlabAction(
  id: string,
  data: {
    curriculumId: string;
    gradeFrom: number;
    gradeTo: number;
    hourlyRate: number;
  },
) {
  const res = await fetchApi<any>(`/pricing/slabs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/pricing');
  return res;
}

export async function updatePricingSlabStatusAction(id: string, isActive: boolean) {
  const res = await fetchApi<any>(`/pricing/slabs/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
  revalidatePath('/settings/pricing');
  return res;
}

export async function getExceptionalRatesAction() {
  return fetchApi<any[]>('/pricing/exceptional-rates');
}

export async function createExceptionalRateAction(data: { subjectId: string; hourlyRate: number }) {
  const res = await fetchApi<any>('/pricing/exceptional-rates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/pricing');
  return res;
}

export async function updateExceptionalRateStatusAction(id: string, isActive: boolean) {
  const res = await fetchApi<any>(`/pricing/exceptional-rates/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
  revalidatePath('/settings/pricing');
  return res;
}

export async function getFinanceSettingAction() {
  return fetchApi<any>('/pricing/finance-settings');
}

export async function upsertFinanceSettingAction(data: {
  registrationFee: number;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  currency?: string;
}) {
  const res = await fetchApi<any>('/pricing/finance-settings', {
    method: 'PATCH',
    body: JSON.stringify({ ...data, currency: data.currency || 'AED' }),
  });
  revalidatePath('/settings/pricing');
  return res;
}

// ── Payroll & Tutor Payable Actions ──────────────────────────────────────────
export async function getPayrollRunsAction(status?: string) {
  try {
    const query = status ? `?status=${status}` : '';
    const res = await fetchApi<any>(`/payroll/runs${query}`);
    return { success: true, data: Array.isArray(res) ? res : [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load payroll runs', data: [] };
  }
}

export async function getPayrollRunDetailsAction(id: string) {
  try {
    const res = await fetchApi<any>(`/payroll/runs/${id}`);
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load payroll run details', data: null };
  }
}

export async function createPayrollRunAction(data: { periodStart: string; periodEnd: string; notes?: string }) {
  try {
    const res = await fetchApi<any>('/payroll/runs', { method: 'POST', body: JSON.stringify(data) });
    revalidatePath('/settings/payroll');
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to generate employee payroll cycle' };
  }
}

export async function finalizePayrollRunAction(id: string) {
  try {
    const res = await fetchApi<any>(`/payroll/runs/${id}/finalize`, { method: 'PATCH' });
    revalidatePath('/settings/payroll');
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to finalize payroll run' };
  }
}

export async function cancelPayrollRunAction(id: string) {
  try {
    const res = await fetchApi<any>(`/payroll/runs/${id}/cancel`, { method: 'PATCH' });
    revalidatePath('/settings/payroll');
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to cancel payroll run' };
  }
}

export async function recordPayrollPaymentAction(
  itemId: string,
  data: { paymentReference?: string; paymentNotes?: string },
) {
  try {
    const res = await fetchApi<any>(`/payroll/items/${itemId}/payment`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    revalidatePath('/settings/payroll');
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to record payroll payment' };
  }
}

export async function getTutorPayableRunsAction(status?: string) {
  try {
    const query = status ? `?status=${status}` : '';
    const res = await fetchApi<any>(`/tutor-payables/runs${query}`);
    return { success: true, data: Array.isArray(res) ? res : [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load tutor payable runs', data: [] };
  }
}

export async function getTutorPayableRunDetailsAction(id: string) {
  try {
    const res = await fetchApi<any>(`/tutor-payables/runs/${id}`);
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load tutor payable run details', data: null };
  }
}

export async function createTutorPayableRunAction(data: { periodStart: string; periodEnd: string; notes?: string }) {
  try {
    const res = await fetchApi<any>('/tutor-payables/runs', { method: 'POST', body: JSON.stringify(data) });
    revalidatePath('/settings/payroll');
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to generate tutor payable batch' };
  }
}

export async function finalizeTutorPayableRunAction(id: string) {
  try {
    const res = await fetchApi<any>(`/tutor-payables/runs/${id}/finalize`, { method: 'PATCH' });
    revalidatePath('/settings/payroll');
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to finalize tutor payable run' };
  }
}

export async function cancelTutorPayableRunAction(id: string) {
  try {
    const res = await fetchApi<any>(`/tutor-payables/runs/${id}/cancel`, { method: 'PATCH' });
    revalidatePath('/settings/payroll');
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to cancel tutor payable run' };
  }
}

export async function recordTutorPayablePaymentAction(
  itemId: string,
  data: { paymentReference?: string; paymentNotes?: string },
) {
  try {
    const res = await fetchApi<any>(`/tutor-payables/items/${itemId}/payment`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    revalidatePath('/settings/payroll');
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to record tutor payable payment' };
  }
}

// ── Workforce Vacancies (HR Phase 4) ─────────────────────────────────────────

export async function getVacanciesAction(query: string = '') {
  return fetchApi<any>('/vacancies?' + query);
}

export async function getVacancyAction(id: string) {
  return fetchApi<any>(`/vacancies/${id}`);
}

export async function createVacancyAction(data: any) {
  const res = await fetchApi<any>('/vacancies', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/vacancies');
  return res;
}

export async function updateVacancyAction(id: string, data: any) {
  const res = await fetchApi<any>(`/vacancies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/vacancies');
  return res;
}

export async function submitVacancyForApprovalAction(id: string) {
  const res = await fetchApi<any>(`/vacancies/${id}/submit`, {
    method: 'POST',
  });
  revalidatePath('/settings/vacancies');
  return res;
}

export async function reviewVacancyAction(
  id: string,
  data: { action: 'APPROVE' | 'REJECT'; reviewNote?: string },
) {
  const res = await fetchApi<any>(`/vacancies/${id}/review`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/vacancies');
  return res;
}

export async function transitionVacancyStatusAction(
  id: string,
  data: { status: string; note?: string; filledHeadcount?: number },
) {
  const res = await fetchApi<any>(`/vacancies/${id}/status`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/vacancies');
  return res;
}

// ── Candidate Selection & Offers (HR Phase 5) ───────────────────────────────

export async function getCandidatesAction(query: string = '') {
  return fetchApi<any>('/candidates?' + query);
}

export async function getCandidateAction(id: string) {
  return fetchApi<any>(`/candidates/${id}`);
}

export async function createCandidateAction(data: any) {
  const res = await fetchApi<any>('/candidates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function getApplicationsAction(query: string = '') {
  return fetchApi<any>('/applications?' + query);
}

export async function getApplicationAction(id: string) {
  return fetchApi<any>(`/applications/${id}`);
}

export async function createApplicationAction(vacancyId: string, data: any) {
  const res = await fetchApi<any>(`/vacancies/${vacancyId}/applications`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  revalidatePath('/settings/vacancies');
  return res;
}

export async function transitionApplicationStageAction(id: string, data: any) {
  const res = await fetchApi<any>(`/applications/${id}/stage`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function scheduleInterviewAction(applicationId: string, data: any) {
  const res = await fetchApi<any>(`/applications/${applicationId}/interviews`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function recordInterviewFeedbackAction(interviewId: string, data: any) {
  const res = await fetchApi<any>(`/interviews/${interviewId}/feedback`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function getOffersAction(query: string = '') {
  return fetchApi<any>('/offers?' + query);
}

export async function getOfferAction(id: string) {
  return fetchApi<any>(`/offers/${id}`);
}

export async function createOfferAction(applicationId: string, data: any) {
  const res = await fetchApi<any>(`/applications/${applicationId}/offers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function updateOfferAction(id: string, data: any) {
  const res = await fetchApi<any>(`/offers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function reviseOfferAction(id: string, data: any) {
  const res = await fetchApi<any>(`/offers/${id}/revise`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function submitOfferAction(id: string) {
  const res = await fetchApi<any>(`/offers/${id}/submit`, {
    method: 'POST',
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function reviewOfferAction(id: string, data: { action: 'APPROVE' | 'REJECT'; approvalNotes?: string }) {
  const res = await fetchApi<any>(`/offers/${id}/review`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function sendOfferAction(id: string) {
  const res = await fetchApi<any>(`/offers/${id}/send`, {
    method: 'POST',
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function recordOfferResponseAction(
  id: string,
  data: { decision: 'ACCEPT' | 'DECLINE'; responseNotes?: string; declineReason?: string },
) {
  const res = await fetchApi<any>(`/offers/${id}/response`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function withdrawOfferAction(id: string, data: { withdrawalReason: string }) {
  const res = await fetchApi<any>(`/offers/${id}/withdraw`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/candidates');
  return res;
}

export async function expireOfferAction(id: string) {
  const res = await fetchApi<any>(`/offers/${id}/expire`, {
    method: 'POST',
  });
  revalidatePath('/settings/candidates');
  return res;
}

// ── Onboarding & Probation Actions ──────────────────────────────────────────

export async function getOnboardingReadyQueueAction() {
  return fetchApi<any[]>('/onboarding/ready');
}

export async function getOnboardingCasesAction(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('search', params.search);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return fetchApi<any>(`/onboarding/cases${qs ? `?${qs}` : ''}`);
}

export async function getOnboardingCaseDetailAction(id: string) {
  return fetchApi<any>(`/onboarding/cases/${id}`);
}

export async function createOnboardingCaseAction(data: {
  applicationId: string;
  targetJoiningDate: string;
  probationDurationMonths?: number;
  notes?: string;
}) {
  const res = await fetchApi<any>('/onboarding/cases', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/onboarding');
  revalidatePath('/settings/candidates');
  return res;
}

export async function updateOnboardingCaseAction(
  id: string,
  data: {
    targetJoiningDate?: string;
    confirmedJoiningDate?: string;
    probationDurationMonths?: number;
    notes?: string;
  },
) {
  const res = await fetchApi<any>(`/onboarding/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/onboarding');
  return res;
}

export async function uploadOnboardingDocumentAction(
  caseId: string,
  formData: FormData,
) {
  const res = await fetchApi<any>(`/onboarding/cases/${caseId}/documents`, {
    method: 'POST',
    body: formData,
  });
  revalidatePath('/settings/onboarding');
  return res;
}

export async function verifyOnboardingDocumentAction(
  caseId: string,
  docId: string,
  data: {
    status: 'VERIFIED' | 'REJECTED';
    verificationNotes?: string;
  },
) {
  const res = await fetchApi<any>(`/onboarding/cases/${caseId}/documents/${docId}/verify`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/onboarding');
  return res;
}

export async function createOnboardingTaskAction(
  caseId: string,
  data: {
    title: string;
    category: string;
    assignedToUserId?: string;
    dueDate?: string;
    notes?: string;
  },
) {
  const res = await fetchApi<any>(`/onboarding/cases/${caseId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/onboarding');
  return res;
}

export async function updateOnboardingTaskAction(
  caseId: string,
  taskId: string,
  data: {
    title?: string;
    category?: string;
    assignedToUserId?: string;
    dueDate?: string;
    status?: string;
    notes?: string;
  },
) {
  const res = await fetchApi<any>(`/onboarding/cases/${caseId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/onboarding');
  return res;
}

export async function cancelOnboardingCaseAction(
  caseId: string,
  data: {
    status: 'WITHDRAWN' | 'NO_SHOW' | 'REJECTED';
    reason: string;
  },
) {
  const res = await fetchApi<any>(`/onboarding/cases/${caseId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/onboarding');
  revalidatePath('/settings/candidates');
  return res;
}

export async function finalizeOnboardingCaseAction(
  caseId: string,
  data: {
    confirmedJoiningDate: string;
    departmentId?: string;
    roleId?: string;
    jobTitle?: string;
    personalEmail?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: string;
    address?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelation?: string;
    notes?: string;
  },
) {
  const res = await fetchApi<any>(`/onboarding/cases/${caseId}/finalize`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/onboarding');
  revalidatePath('/settings/employees');
  return res;
}

export async function recordProbationReviewAction(
  employeeId: string,
  data: {
    reviewDate: string;
    outcome: 'CONFIRMED' | 'EXTENDED' | 'TERMINATED';
    extendedEndDate?: string;
    notes: string;
  },
) {
  const res = await fetchApi<any>(`/onboarding/employees/${employeeId}/probation/reviews`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/onboarding');
  revalidatePath('/settings/employees');
  return res;
}

export async function getProbationReviewsAction(employeeId: string) {
  return fetchApi<any>(`/onboarding/employees/${employeeId}/probation/reviews`);
}

// ── HR Phase 7: Performance Management Actions ──────────────────────────────

export async function getPerformanceDashboardAction() {
  return fetchApi<any>('/performance/dashboard');
}

export async function getPerformanceCyclesAction(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return fetchApi<any>(`/performance/cycles${query}`);
}

export async function createPerformanceCycleAction(data: any) {
  const res = await fetchApi<any>('/performance/cycles', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function updatePerformanceCycleAction(id: string, data: any) {
  const res = await fetchApi<any>(`/performance/cycles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function getPerformanceGoalsAction(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return fetchApi<any>(`/performance/goals${query}`);
}

export async function createPerformanceGoalAction(data: any) {
  const res = await fetchApi<any>('/performance/goals', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function updatePerformanceGoalAction(id: string, data: any) {
  const res = await fetchApi<any>(`/performance/goals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function getPerformanceReviewsAction(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return fetchApi<any>(`/performance/reviews${query}`);
}

export async function getPerformanceReviewDetailAction(id: string) {
  return fetchApi<any>(`/performance/reviews/${id}`);
}

export async function createPerformanceReviewAction(data: any) {
  const res = await fetchApi<any>('/performance/reviews', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function updateSelfReviewAction(id: string, data: { employeeComments: string }) {
  const res = await fetchApi<any>(`/performance/reviews/${id}/self-review`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function evaluatePerformanceReviewAction(id: string, data: any) {
  const res = await fetchApi<any>(`/performance/reviews/${id}/evaluate`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function finalizePerformanceReviewAction(id: string, data: any) {
  const res = await fetchApi<any>(`/performance/reviews/${id}/finalize`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function acknowledgePerformanceReviewAction(id: string, data: any) {
  const res = await fetchApi<any>(`/performance/reviews/${id}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function amendPerformanceReviewAction(id: string, data: any) {
  const res = await fetchApi<any>(`/performance/reviews/${id}/amend`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function getPerformancePipsAction(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return fetchApi<any>(`/performance/pips${query}`);
}

export async function getPerformancePipDetailAction(id: string) {
  return fetchApi<any>(`/performance/pips/${id}`);
}

export async function createPerformancePipAction(data: any) {
  const res = await fetchApi<any>('/performance/pips', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function updatePerformancePipAction(id: string, data: any) {
  const res = await fetchApi<any>(`/performance/pips/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function transitionPerformancePipStatusAction(id: string, data: any) {
  const res = await fetchApi<any>(`/performance/pips/${id}/transition`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings/performance');
  return res;
}

export async function updatePipObjectiveStatusAction(pipId: string, objectiveId: string, status: string) {
  const res = await fetchApi<any>(`/performance/pips/${pipId}/objectives/${objectiveId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidatePath('/settings/performance');
  return res;
}




