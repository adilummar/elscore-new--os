"use client";

import * as React from 'react';
import {
  getEmployeesAction,
  getEmployeeAction,
  getDepartmentsAction,
  updateEmployeeProfileAction,
  transitionEmployeeStatusAction,
  getEmployeeHistoryAction,
  getEmployeeCompensationAction,
  getEmployeeCompensationHistoryAction,
  requestCompensationChangeAction,
  getCompensationRequestsAction,
  reviewCompensationRequestAction,
  getTutorRateRequestsAction,
  reviewTutorRateChangeAction,
} from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAuth, usePermissions } from '@/components/providers/AuthProvider';
import {
  User,
  Briefcase,
  History,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  Building2,
} from 'lucide-react';

interface EmployeeItem {
  id: string;
  businessId: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  personalEmail?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  jobTitle?: string | null;
  employmentType?: string | null;
  noticePeriodDays?: number | null;
  probationEndDate?: string | null;
  confirmationDate?: string | null;
  resignationDate?: string | null;
  lastWorkingDate?: string | null;
  employmentStatus: string;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  reportingManagerId?: string | null;
  reportingManager?: {
    id: string;
    businessId: string;
    firstName: string;
    lastName: string;
    jobTitle?: string | null;
  } | null;
  directReports?: Array<{
    id: string;
    businessId: string;
    firstName: string;
    lastName: string;
    jobTitle?: string | null;
  }>;
  user?: {
    id: string;
    email: string;
    status: string;
    userRoles?: Array<{ role: { code: string; name: string } }>;
  };
}

/**
 * Safely masks a bank account number showing only the last 4 digits.
 * Handles null, undefined, empty, short (<= 4 chars), and malformed strings safely.
 */
function maskBankAccount(account?: string | null): string {
  if (!account) return '—';
  const clean = account.trim();
  if (clean.length === 0) return '—';
  if (clean.length <= 4) return '•••• ' + clean;
  return '•••• ' + clean.slice(-4);
}

/**
 * Safely masks a PAN number showing only the last 4 characters.
 * Handles null, undefined, empty, short, and malformed strings safely.
 */
function maskPanNumber(pan?: string | null): string {
  if (!pan) return '—';
  const clean = pan.trim();
  if (clean.length === 0) return '—';
  if (clean.length <= 4) return '•••• ' + clean;
  return '••••••' + clean.slice(-4);
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();

  const [employees, setEmployees] = React.useState<EmployeeItem[]>([]);
  const [departments, setDepartments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

  // Profile Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);
  const [selectedEmp, setSelectedEmp] = React.useState<EmployeeItem | null>(null);
  const [profileForm, setProfileForm] = React.useState<any>({});
  const [profileTab, setProfileTab] = React.useState<'personal' | 'employment' | 'hierarchy' | 'compensation'>('personal');
  const [savingProfile, setSavingProfile] = React.useState(false);

  // Compensation State within Profile Modal
  const [activeCompensation, setActiveCompensation] = React.useState<any>(null);
  const [compensationHistory, setCompensationHistory] = React.useState<any[]>([]);
  const [loadingCompensation, setLoadingCompensation] = React.useState(false);
  const [isSalaryChangeModalOpen, setIsSalaryChangeModalOpen] = React.useState(false);
  const [salaryChangeForm, setSalaryChangeForm] = React.useState({
    requestedBaseSalary: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    reason: '',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    panNumber: '',
  });
  const [submittingSalaryChange, setSubmittingSalaryChange] = React.useState(false);

  // CEO Approvals Modal State
  const [isApprovalsModalOpen, setIsApprovalsModalOpen] = React.useState(false);
  const [pendingCompRequests, setPendingCompRequests] = React.useState<any[]>([]);
  const [pendingTutorRequests, setPendingTutorRequests] = React.useState<any[]>([]);
  const [loadingApprovals, setLoadingApprovals] = React.useState(false);
  const [rejectingRequestId, setRejectingRequestId] = React.useState<string | null>(null);
  const [rejectType, setRejectType] = React.useState<'EMP' | 'TUTOR'>('EMP');
  const [rejectionNote, setRejectionNote] = React.useState('');
  const [isRejectModalOpen, setIsRejectModalOpen] = React.useState(false);
  const [submittingReview, setSubmittingReview] = React.useState(false);

  // Transition Modal State
  const [isTransitionModalOpen, setIsTransitionModalOpen] = React.useState(false);
  const [transitionEmp, setTransitionEmp] = React.useState<EmployeeItem | null>(null);
  const [transitionForm, setTransitionForm] = React.useState({
    status: 'ACTIVE',
    effectiveDate: new Date().toISOString().split('T')[0],
    reason: '',
    notes: '',
    restrictAccess: false,
    probationEndDate: '',
    confirmationDate: '',
    resignationDate: '',
    lastWorkingDate: '',
    noticePeriodDays: '',
  });
  const [submittingTransition, setSubmittingTransition] = React.useState(false);

  // History Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = React.useState(false);
  const [historyEmp, setHistoryEmp] = React.useState<EmployeeItem | null>(null);
  const [historyRecords, setHistoryRecords] = React.useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  const canManageStatus = hasPermission('employee.manage-status');
  const canUpdateProfile = hasPermission('employee.update');
  const canReadHistory = hasPermission('employee.history.read');
  const canReadCompensation = hasPermission('compensation.read');
  const canManageCompensation = hasPermission('compensation.manage');
  const canApproveCompensation = hasPermission('compensation.approve') || user?.roles?.includes('CEO');

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, deptRes] = await Promise.all([
        getEmployeesAction('limit=100'),
        getDepartmentsAction(),
      ]);
      setEmployees((empRes as any)?.data || []);
      const deptList = Array.isArray(deptRes) ? deptRes : (deptRes as any)?.data || (deptRes as any)?.items || [];
      setDepartments(deptList.filter((d: any) => d.status === 'ACTIVE' || !d.status));

      if (canApproveCompensation) {
        loadPendingApprovals();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingApprovals = async () => {
    try {
      const [compRes, tutorRes] = await Promise.all([
        getCompensationRequestsAction('status=PENDING'),
        getTutorRateRequestsAction('status=PENDING'),
      ]);
      setPendingCompRequests(Array.isArray(compRes) ? compRes : []);
      setPendingTutorRequests(Array.isArray(tutorRes) ? tutorRes : []);
    } catch (e) {
      console.error('Error loading pending approvals:', e);
    }
  };

  React.useEffect(() => {
    loadData();
  }, []);

  const totalPendingApprovals = pendingCompRequests.length + pendingTutorRequests.length;

  // Filtered employees
  const filteredEmployees = React.useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch =
        `${emp.firstName} ${emp.lastName} ${emp.businessId} ${emp.jobTitle || ''}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || emp.employmentStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [employees, searchTerm, statusFilter]);

  // Load employee compensation
  const loadEmployeeCompensation = async (employeeId: string) => {
    if (!canReadCompensation) return;
    setLoadingCompensation(true);
    try {
      const [active, history] = await Promise.all([
        getEmployeeCompensationAction(employeeId),
        getEmployeeCompensationHistoryAction(employeeId),
      ]);
      setActiveCompensation(active || null);
      setCompensationHistory(Array.isArray(history) ? history : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCompensation(false);
    }
  };

  // Open Profile View/Edit
  const handleOpenProfile = async (emp: EmployeeItem) => {
    try {
      const detailed = await getEmployeeAction(emp.id);
      setSelectedEmp(detailed || emp);
      setProfileForm({
        firstName: detailed?.firstName || emp.firstName || '',
        lastName: detailed?.lastName || emp.lastName || '',
        phone: detailed?.phone || emp.phone || '',
        personalEmail: detailed?.personalEmail || emp.personalEmail || '',
        dateOfBirth: detailed?.dateOfBirth || emp.dateOfBirth || '',
        gender: detailed?.gender || emp.gender || '',
        address: detailed?.address || emp.address || '',
        emergencyContactName: detailed?.emergencyContactName || emp.emergencyContactName || '',
        emergencyContactPhone: detailed?.emergencyContactPhone || emp.emergencyContactPhone || '',
        emergencyContactRelation: detailed?.emergencyContactRelation || emp.emergencyContactRelation || '',
        jobTitle: detailed?.jobTitle || emp.jobTitle || '',
        employmentType: detailed?.employmentType || emp.employmentType || 'FULL_TIME',
        noticePeriodDays: detailed?.noticePeriodDays !== undefined ? detailed.noticePeriodDays : (emp.noticePeriodDays ?? 30),
        departmentId: detailed?.departmentId || emp.departmentId || '',
        reportingManagerId: detailed?.reportingManagerId || emp.reportingManagerId || '',
      });
      setProfileTab('personal');
      setIsProfileModalOpen(true);

      if (canReadCompensation) {
        loadEmployeeCompensation(emp.id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to fetch employee details');
    }
  };

  // Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    setSavingProfile(true);
    try {
      const payload: any = {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        phone: profileForm.phone || null,
        personalEmail: profileForm.personalEmail || null,
        dateOfBirth: profileForm.dateOfBirth || null,
        gender: profileForm.gender || null,
        address: profileForm.address || null,
        emergencyContactName: profileForm.emergencyContactName || null,
        emergencyContactPhone: profileForm.emergencyContactPhone || null,
        emergencyContactRelation: profileForm.emergencyContactRelation || null,
        jobTitle: profileForm.jobTitle || null,
        employmentType: profileForm.employmentType || null,
        noticePeriodDays: profileForm.noticePeriodDays ? Number(profileForm.noticePeriodDays) : null,
        departmentId: profileForm.departmentId || null,
        reportingManagerId: profileForm.reportingManagerId || null,
      };

      await updateEmployeeProfileAction(selectedEmp.id, payload);
      setIsProfileModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update employee profile');
    } finally {
      setSavingProfile(false);
    }
  };

  // Submit Compensation Change Request
  const handleSubmitSalaryChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    if (!salaryChangeForm.requestedBaseSalary || Number(salaryChangeForm.requestedBaseSalary) <= 0) {
      alert('Requested base salary must be a positive amount');
      return;
    }
    if (!salaryChangeForm.reason.trim()) {
      alert('Reason is mandatory for compensation changes');
      return;
    }

    setSubmittingSalaryChange(true);
    try {
      await requestCompensationChangeAction(selectedEmp.id, {
        requestedBaseSalary: Number(salaryChangeForm.requestedBaseSalary),
        effectiveDate: salaryChangeForm.effectiveDate,
        reason: salaryChangeForm.reason.trim(),
        bankName: salaryChangeForm.bankName || undefined,
        bankAccountNumber: salaryChangeForm.bankAccountNumber || undefined,
        bankIfsc: salaryChangeForm.bankIfsc || undefined,
        panNumber: salaryChangeForm.panNumber || undefined,
      });

      alert('✅ Compensation change request submitted for CEO approval.');
      setIsSalaryChangeModalOpen(false);
      await loadEmployeeCompensation(selectedEmp.id);
      if (canApproveCompensation) {
        await loadPendingApprovals();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit compensation change request');
    } finally {
      setSubmittingSalaryChange(false);
    }
  };

  // Approve Compensation Request
  const handleApproveCompRequest = async (req: any) => {
    if (req.requestedByUserId === user?.id || req.employee?.userId === user?.id) {
      alert('Self-approval is forbidden: you cannot approve your own compensation request');
      return;
    }
    if (!confirm(`Approve salary revision for ${req.employee?.firstName} ${req.employee?.lastName} to ₹${req.requestedBaseSalary} INR effective ${req.effectiveDate}?`)) {
      return;
    }

    try {
      await reviewCompensationRequestAction(req.id, { status: 'APPROVED' });
      alert('✅ Compensation change request approved.');
      await loadPendingApprovals();
      if (selectedEmp && selectedEmp.id === req.employeeId) {
        await loadEmployeeCompensation(selectedEmp.id);
      }
    } catch (err: any) {
      alert(err.message || 'Error approving compensation request');
    }
  };

  // Approve Tutor Rate Request
  const handleApproveTutorRequest = async (req: any) => {
    if (req.requestedByUserId === user?.id || req.tutorProfile?.employee?.userId === user?.id) {
      alert('Self-approval is forbidden: you cannot approve your own tutor rate request');
      return;
    }
    if (!confirm(`Approve tutor hourly rate revision for ${req.tutorProfile?.employee?.firstName} ${req.tutorProfile?.employee?.lastName} to ${req.requestedHourlyRate} AED effective ${req.effectiveDate}?`)) {
      return;
    }

    try {
      await reviewTutorRateChangeAction(req.id, { status: 'APPROVED' });
      alert('✅ Tutor rate change request approved.');
      await loadPendingApprovals();
    } catch (err: any) {
      alert(err.message || 'Error approving tutor rate request');
    }
  };

  // Open Rejection Dialog
  const handleOpenRejectDialog = (reqId: string, type: 'EMP' | 'TUTOR') => {
    setRejectingRequestId(reqId);
    setRejectType(type);
    setRejectionNote('');
    setIsRejectModalOpen(true);
  };

  // Confirm Rejection
  const handleConfirmRejection = async () => {
    if (!rejectingRequestId || !rejectionNote.trim()) {
      alert('A rejection reason note is mandatory');
      return;
    }

    setSubmittingReview(true);
    try {
      if (rejectType === 'EMP') {
        await reviewCompensationRequestAction(rejectingRequestId, {
          status: 'REJECTED',
          reviewNote: rejectionNote.trim(),
        });
      } else {
        await reviewTutorRateChangeAction(rejectingRequestId, {
          status: 'REJECTED',
          reviewNote: rejectionNote.trim(),
        });
      }
      alert('Request rejected with reason recorded.');
      setIsRejectModalOpen(false);
      await loadPendingApprovals();
      if (selectedEmp) {
        await loadEmployeeCompensation(selectedEmp.id);
      }
    } catch (err: any) {
      alert(err.message || 'Error rejecting request');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Open Transition Modal
  const handleOpenTransition = (emp: EmployeeItem) => {
    setTransitionEmp(emp);
    const today = new Date().toISOString().split('T')[0];
    setTransitionForm({
      status: emp.employmentStatus === 'PROBATION' ? 'ACTIVE' : emp.employmentStatus,
      effectiveDate: today,
      reason: '',
      notes: '',
      restrictAccess: false,
      probationEndDate: emp.probationEndDate || '',
      confirmationDate: emp.confirmationDate || (emp.employmentStatus === 'PROBATION' ? today : ''),
      resignationDate: emp.resignationDate || '',
      lastWorkingDate: emp.lastWorkingDate || '',
      noticePeriodDays: emp.noticePeriodDays ? String(emp.noticePeriodDays) : '30',
    });
    setIsTransitionModalOpen(true);
  };

  // Submit Status Transition
  const handleSubmitTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitionEmp) return;
    if (!transitionForm.reason.trim()) {
      alert('A valid reason is mandatory for any lifecycle transition');
      return;
    }

    setSubmittingTransition(true);
    try {
      const payload: any = {
        status: transitionForm.status,
        effectiveDate: transitionForm.effectiveDate,
        reason: transitionForm.reason.trim(),
        notes: transitionForm.notes.trim() || undefined,
        restrictAccess: transitionForm.status === 'TERMINATED' ? true : Boolean(transitionForm.restrictAccess),
      };

      if (transitionForm.status === 'ACTIVE' && transitionForm.confirmationDate) {
        payload.confirmationDate = transitionForm.confirmationDate;
      }
      if (transitionForm.status === 'PROBATION' && transitionForm.probationEndDate) {
        payload.probationEndDate = transitionForm.probationEndDate;
      }
      if (transitionForm.status === 'NOTICE_PERIOD') {
        if (transitionForm.resignationDate) payload.resignationDate = transitionForm.resignationDate;
        if (transitionForm.lastWorkingDate) payload.lastWorkingDate = transitionForm.lastWorkingDate;
        if (transitionForm.noticePeriodDays) payload.noticePeriodDays = Number(transitionForm.noticePeriodDays);
      }

      await transitionEmployeeStatusAction(transitionEmp.id, payload);
      setIsTransitionModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Status transition failed');
    } finally {
      setSubmittingTransition(false);
    }
  };

  // Open History Modal
  const handleOpenHistory = async (emp: EmployeeItem) => {
    setHistoryEmp(emp);
    setLoadingHistory(true);
    setIsHistoryModalOpen(true);
    try {
      const records = await getEmployeeHistoryAction(emp.id);
      setHistoryRecords(records || []);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch status history');
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Employee Management & Lifecycle</h1>
          <p className="text-sm text-slate-500 mt-1">
            Maintain employee profiles, manage employment lifecycle stages, and monitor governance transitions.
          </p>
        </div>

        {/* CEO Approvals Pill / Action */}
        {canApproveCompensation && (
          <Button
            variant="primary"
            onClick={() => {
              loadPendingApprovals();
              setIsApprovalsModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            <span>CEO Approvals</span>
            {totalPendingApprovals > 0 && (
              <span className="bg-amber-400 text-slate-900 font-bold px-2 py-0.5 rounded-full text-xs ml-1">
                {totalPendingApprovals}
              </span>
            )}
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="w-full sm:w-72">
            <Input
              type="text"
              placeholder="Search by name, ID, or job title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Filter Status:</span>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-44"
            >
              <option value="ALL">All Statuses</option>
              <option value="PROBATION">Probation</option>
              <option value="ACTIVE">Active</option>
              <option value="NOTICE_PERIOD">Notice Period</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="TERMINATED">Terminated</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ON_LEAVE">On Leave</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Employee Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Job Title & Department</TableHead>
                <TableHead>Employment Type</TableHead>
                <TableHead>Reporting Manager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-400">
                    Loading employee records...
                  </TableCell>
                </TableRow>
              ) : filteredEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-400">
                    No employees matching current criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEmployees.map((emp) => {
                  const isSelf = user?.id === emp.userId;
                  return (
                    <TableRow key={emp.id} className="hover:bg-slate-50/70">
                      <TableCell className="font-mono text-xs font-semibold text-slate-700">
                        {emp.businessId}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {emp.firstName} {emp.lastName}
                          {isSelf && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{emp.user?.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-slate-800">{emp.jobTitle || '—'}</div>
                        <div className="text-xs text-slate-500">{emp.department?.name || 'No Department'}</div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {emp.employmentType ? emp.employmentType.replace('_', ' ') : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {emp.reportingManager ? (
                          <div>
                            <span className="font-medium text-slate-800">
                              {emp.reportingManager.firstName} {emp.reportingManager.lastName}
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              ({emp.reportingManager.businessId})
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={emp.employmentStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenProfile(emp)}
                            title="View or edit employee details"
                          >
                            <User className="w-3.5 h-3.5 mr-1" />
                            Profile
                          </Button>

                          {canManageStatus && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isSelf}
                              onClick={() => handleOpenTransition(emp)}
                              title={isSelf ? 'Cannot transition own lifecycle status' : 'Change employment status'}
                              className={isSelf ? 'opacity-40 cursor-not-allowed' : ''}
                            >
                              <Briefcase className="w-3.5 h-3.5 mr-1" />
                              Transition
                            </Button>
                          )}

                          {canReadHistory && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenHistory(emp)}
                              title="View confidential status history"
                            >
                              <History className="w-3.5 h-3.5 mr-1" />
                              History
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* 1. EMPLOYEE PROFILE MODAL (Includes Personal, Employment, Hierarchy, Compensation) */}
      <Modal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        size="xl"
      >
        <div>
          <div className="flex items-center justify-between border-b pb-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Employee Profile: {selectedEmp?.firstName} {selectedEmp?.lastName}
              </h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-mono">
                <span>{selectedEmp?.businessId}</span>
                <span>•</span>
                <StatusBadge status={selectedEmp?.employmentStatus || 'ACTIVE'} />
              </div>
            </div>
          </div>

          {/* Section Navigation Tabs */}
          <div className="flex border-b border-slate-200 mb-6 gap-6">
            <button
              type="button"
              onClick={() => setProfileTab('personal')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                profileTab === 'personal'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Personal Details
            </button>
            <button
              type="button"
              onClick={() => setProfileTab('employment')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                profileTab === 'employment'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Employment & Role
            </button>
            <button
              type="button"
              onClick={() => setProfileTab('hierarchy')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                profileTab === 'hierarchy'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Reporting Hierarchy
            </button>
            {canReadCompensation && (
              <button
                type="button"
                onClick={() => setProfileTab('compensation')}
                className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                  profileTab === 'compensation'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Compensation & Payroll
              </button>
            )}
          </div>

          {/* Tab: Compensation & Payroll */}
          {profileTab === 'compensation' ? (
            <div className="space-y-6">
              {loadingCompensation ? (
                <div className="text-center py-8 text-slate-400">Loading compensation records...</div>
              ) : (
                <>
                  {/* Current Active Compensation Card */}
                  <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-emerald-600" />
                        <h3 className="text-sm font-bold text-emerald-950 uppercase tracking-wide">
                          Active Base Salary (INR)
                        </h3>
                      </div>
                      {canManageCompensation && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSalaryChangeForm({
                              requestedBaseSalary: activeCompensation ? String(activeCompensation.baseSalary) : '',
                              effectiveDate: new Date().toISOString().split('T')[0],
                              reason: '',
                              bankName: activeCompensation?.bankName || '',
                              bankAccountNumber: activeCompensation?.bankAccountNumber || '',
                              bankIfsc: activeCompensation?.bankIfsc || '',
                              panNumber: activeCompensation?.panNumber || '',
                            });
                            setIsSalaryChangeModalOpen(true);
                          }}
                        >
                          Request Salary Revision
                        </Button>
                      )}
                    </div>

                    {activeCompensation ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
                        <div>
                          <span className="text-slate-500 block">Monthly Base</span>
                          <span className="text-lg font-bold text-slate-900">
                            ₹{Number(activeCompensation.baseSalary).toLocaleString('en-IN')} {activeCompensation.currency}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Effective From</span>
                          <span className="font-semibold text-slate-800">{activeCompensation.effectiveFrom}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Payment Frequency</span>
                          <span className="font-semibold text-slate-800">{activeCompensation.paymentFrequency || 'MONTHLY'}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        No active compensation record on file for this employee. Submit a revision request to establish base salary.
                      </p>
                    )}

                    {/* Bank & Payment Information */}
                    {activeCompensation && (
                      <div className="mt-4 pt-3 border-t border-emerald-200/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-slate-500 block">Bank Name</span>
                          <span className="font-medium text-slate-800">{activeCompensation.bankName || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Account Number</span>
                          <span className="font-mono text-slate-800">{maskBankAccount(activeCompensation.bankAccountNumber)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">IFSC Code</span>
                          <span className="font-mono text-slate-800">{activeCompensation.bankIfsc || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">PAN Number</span>
                          <span className="font-mono text-slate-800">{maskPanNumber(activeCompensation.panNumber)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Compensation History Timeline */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                      Historical Salary Records
                    </h3>
                    {compensationHistory.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No historical compensation entries.</p>
                    ) : (
                      <div className="border rounded-md divide-y divide-slate-100 bg-white">
                        {compensationHistory.map((item) => (
                          <div key={item.id} className="p-3 text-xs flex items-center justify-between">
                            <div>
                              <span className="font-bold text-slate-900">
                                ₹{Number(item.baseSalary).toLocaleString('en-IN')} {item.currency}
                              </span>
                              <span className="text-slate-500 ml-2">
                                ({item.effectiveFrom} {item.effectiveTo ? `to ${item.effectiveTo}` : '— Present'})
                              </span>
                              {item.notes && <p className="text-slate-400 text-[11px] mt-0.5">{item.notes}</p>}
                            </div>
                            <div>
                              {item.isActive ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                  CURRENT
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                  CLOSED
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Tab: Personal Details */}
              {profileTab === 'personal' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">First Name *</label>
                      <Input
                        required
                        disabled={!canUpdateProfile}
                        value={profileForm.firstName || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name *</label>
                      <Input
                        required
                        disabled={!canUpdateProfile}
                        value={profileForm.lastName || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email</label>
                      <Input disabled value={selectedEmp?.user?.email || '—'} className="bg-slate-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Work Phone</label>
                      <Input
                        disabled={!canUpdateProfile}
                        value={profileForm.phone || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        placeholder="+91..."
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Confidential Personal Information
                      </h3>
                      <span className="text-[11px] text-slate-400">Field-level privacy protected</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Personal Email</label>
                        <Input
                          type="email"
                          disabled={!canUpdateProfile}
                          value={profileForm.personalEmail || ''}
                          onChange={(e) => setProfileForm({ ...profileForm, personalEmail: e.target.value })}
                          placeholder="personal@example.com"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
                        <Input
                          type="date"
                          disabled={!canUpdateProfile}
                          value={profileForm.dateOfBirth || ''}
                          onChange={(e) => setProfileForm({ ...profileForm, dateOfBirth: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                        <Select
                          disabled={!canUpdateProfile}
                          value={profileForm.gender || ''}
                          onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                        >
                          <option value="">Select Gender</option>
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                          <option value="NON_BINARY">Non-binary</option>
                          <option value="OTHER">Other / Prefer not to say</option>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Residential Address</label>
                      <Input
                        disabled={!canUpdateProfile}
                        value={profileForm.address || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                        placeholder="Street, City, Postal Code"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Emergency Contact Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Name</label>
                        <Input
                          disabled={!canUpdateProfile}
                          value={profileForm.emergencyContactName || ''}
                          onChange={(e) => setProfileForm({ ...profileForm, emergencyContactName: e.target.value })}
                          placeholder="Primary contact name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                        <Input
                          disabled={!canUpdateProfile}
                          value={profileForm.emergencyContactPhone || ''}
                          onChange={(e) => setProfileForm({ ...profileForm, emergencyContactPhone: e.target.value })}
                          placeholder="+91..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Relationship</label>
                        <Input
                          disabled={!canUpdateProfile}
                          value={profileForm.emergencyContactRelation || ''}
                          onChange={(e) => setProfileForm({ ...profileForm, emergencyContactRelation: e.target.value })}
                          placeholder="e.g. Spouse, Parent, Sibling"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Employment & Role */}
              {profileTab === 'employment' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Job Title</label>
                      <Input
                        disabled={!canUpdateProfile}
                        value={profileForm.jobTitle || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, jobTitle: e.target.value })}
                        placeholder="e.g. Academic Coordinator"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                      <Select
                        disabled={!canUpdateProfile}
                        value={profileForm.departmentId || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, departmentId: e.target.value })}
                      >
                        <option value="">No Department Assigned</option>
                        {departments.map((dept) => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Employment Type</label>
                      <Select
                        disabled={!canUpdateProfile}
                        value={profileForm.employmentType || 'FULL_TIME'}
                        onChange={(e) => setProfileForm({ ...profileForm, employmentType: e.target.value })}
                      >
                        <option value="FULL_TIME">Full Time</option>
                        <option value="PART_TIME">Part Time</option>
                        <option value="CONTRACT">Contract</option>
                        <option value="INTERN">Intern</option>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Notice Period (Days)</label>
                      <Input
                        type="number"
                        min={0}
                        disabled={!canUpdateProfile}
                        value={profileForm.noticePeriodDays ?? 30}
                        onChange={(e) => setProfileForm({ ...profileForm, noticePeriodDays: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Read-only Lifecycle Milestones */}
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Lifecycle Milestone Dates (Managed via Status Transitions)
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-2">
                      <div>
                        <span className="text-slate-400 block">Probation End</span>
                        <span className="font-semibold text-slate-800">{selectedEmp?.probationEndDate || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Confirmation Date</span>
                        <span className="font-semibold text-slate-800">{selectedEmp?.confirmationDate || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Resignation Date</span>
                        <span className="font-semibold text-slate-800">{selectedEmp?.resignationDate || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Last Working Date</span>
                        <span className="font-semibold text-slate-800">{selectedEmp?.lastWorkingDate || '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Reporting Hierarchy */}
              {profileTab === 'hierarchy' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Reporting Manager</label>
                    <Select
                      disabled={!canUpdateProfile}
                      value={profileForm.reportingManagerId || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, reportingManagerId: e.target.value })}
                    >
                      <option value="">No Direct Manager (Top-level / Autonomous)</option>
                      {employees
                        .filter((e) => e.id !== selectedEmp?.id && e.employmentStatus !== 'TERMINATED')
                        .map((mgr) => (
                          <option key={mgr.id} value={mgr.id}>
                            {mgr.firstName} {mgr.lastName} ({mgr.businessId}) — {mgr.jobTitle || 'No Title'}
                          </option>
                        ))}
                    </Select>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                      Direct Reports ({selectedEmp?.directReports?.length || 0})
                    </h3>
                    {selectedEmp?.directReports && selectedEmp.directReports.length > 0 ? (
                      <div className="border rounded-md divide-y divide-slate-100 bg-white">
                        {selectedEmp.directReports.map((report) => (
                          <div key={report.id} className="p-2.5 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-semibold text-slate-800">
                                {report.firstName} {report.lastName}
                              </span>
                              <span className="text-slate-400 ml-2 font-mono">({report.businessId})</span>
                            </div>
                            <span className="text-slate-500">{report.jobTitle || '—'}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No direct reports currently reporting to this employee.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsProfileModalOpen(false)}>
                  Cancel
                </Button>
                {canUpdateProfile && (
                  <Button type="submit" variant="primary" disabled={savingProfile}>
                    {savingProfile ? 'Saving...' : 'Save Profile Changes'}
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* 2. REQUEST COMPENSATION REVISION MODAL */}
      <Modal
        isOpen={isSalaryChangeModalOpen}
        onClose={() => setIsSalaryChangeModalOpen(false)}
        size="md"
      >
        <div className="space-y-4">
          <div className="border-b pb-4 mb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Request Salary Revision (CEO Approval Required)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Employee: <strong>{selectedEmp?.firstName} {selectedEmp?.lastName}</strong> ({selectedEmp?.businessId})
            </p>
          </div>

          <form onSubmit={handleSubmitSalaryChange} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Requested Monthly Base Salary (INR) *
              </label>
              <Input
                type="number"
                min={1}
                required
                placeholder="e.g. 65000"
                value={salaryChangeForm.requestedBaseSalary}
                onChange={(e) => setSalaryChangeForm({ ...salaryChangeForm, requestedBaseSalary: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Effective Date *</label>
              <Input
                type="date"
                required
                value={salaryChangeForm.effectiveDate}
                onChange={(e) => setSalaryChangeForm({ ...salaryChangeForm, effectiveDate: e.target.value })}
              />
              <p className="text-[11px] text-slate-500 mt-0.5">
                Will activate on this date once approved by CEO.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border rounded-md">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Bank Name</label>
                <Input
                  placeholder="HDFC Bank"
                  value={salaryChangeForm.bankName}
                  onChange={(e) => setSalaryChangeForm({ ...salaryChangeForm, bankName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Account Number</label>
                <Input
                  placeholder="00123456789"
                  value={salaryChangeForm.bankAccountNumber}
                  onChange={(e) => setSalaryChangeForm({ ...salaryChangeForm, bankAccountNumber: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">IFSC Code</label>
                <Input
                  placeholder="HDFC0001234"
                  value={salaryChangeForm.bankIfsc}
                  onChange={(e) => setSalaryChangeForm({ ...salaryChangeForm, bankIfsc: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">PAN Number</label>
                <Input
                  placeholder="ABCDE1234F"
                  value={salaryChangeForm.panNumber}
                  onChange={(e) => setSalaryChangeForm({ ...salaryChangeForm, panNumber: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Revision *</label>
              <Input
                required
                placeholder="e.g. Annual merit increase, promotion"
                value={salaryChangeForm.reason}
                onChange={(e) => setSalaryChangeForm({ ...salaryChangeForm, reason: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setIsSalaryChangeModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submittingSalaryChange}>
                {submittingSalaryChange ? 'Submitting...' : 'Submit for CEO Approval'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* 3. CEO COMPENSATION & RATE APPROVALS MODAL */}
      <Modal
        isOpen={isApprovalsModalOpen}
        onClose={() => setIsApprovalsModalOpen(false)}
        size="2xl"
      >
        <div>
          <div className="border-b pb-4 mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-brand-600" />
                CEO Compensation Approvals
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Review and approve/reject pending employee salary revisions and tutor rate change requests.
              </p>
            </div>
          </div>

          <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-1">
            {/* Section: Employee Salary Requests */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-brand-600" />
                Employee Salary Revisions ({pendingCompRequests.length})
              </h3>

              {pendingCompRequests.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded border">
                  No pending employee compensation requests.
                </p>
              ) : (
                <div className="space-y-3">
                  {pendingCompRequests.map((req) => {
                    const isSelf = req.requestedByUserId === user?.id || req.employee?.userId === user?.id;
                    return (
                      <div key={req.id} className="p-4 border rounded-lg bg-white shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900">
                              {req.employee?.firstName} {req.employee?.lastName}
                            </span>
                            <span className="text-xs text-slate-500 font-mono ml-2">({req.employee?.businessId})</span>
                            <span className="text-xs text-slate-500 ml-2">— {req.employee?.jobTitle || 'No Title'}</span>
                          </div>
                          <div className="text-xs font-mono text-slate-500">
                            Effective: <span className="font-bold text-slate-800">{req.effectiveDate}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-slate-50 p-2.5 rounded">
                          <div>
                            <span className="text-slate-400 block">Current Base</span>
                            <span className="font-semibold text-slate-700">
                              {req.currentBaseSalary ? `₹${Number(req.currentBaseSalary).toLocaleString('en-IN')}` : 'None'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Requested Base</span>
                            <span className="font-bold text-emerald-700 text-sm">
                              ₹{Number(req.requestedBaseSalary).toLocaleString('en-IN')} INR
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Requested By</span>
                            <span className="text-slate-700">{req.requestedBy?.email}</span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-700">
                          <strong>Reason: </strong> {req.reason}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t">
                          {isSelf ? (
                            <span className="text-xs text-amber-600 font-medium italic">
                              Self-approval prohibited
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Awaiting your approval</span>
                          )}

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenRejectDialog(req.id, 'EMP')}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" />
                              Reject
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isSelf}
                              onClick={() => handleApproveCompRequest(req)}
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              Approve
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section: Tutor Rate Requests */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-brand-600" />
                Tutor Hourly Rate Revisions ({pendingTutorRequests.length})
              </h3>

              {pendingTutorRequests.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded border">
                  No pending tutor rate change requests.
                </p>
              ) : (
                <div className="space-y-3">
                  {pendingTutorRequests.map((req) => {
                    const isSelf = req.requestedByUserId === user?.id || req.tutorProfile?.employee?.userId === user?.id;
                    return (
                      <div key={req.id} className="p-4 border rounded-lg bg-white shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900">
                              {req.tutorProfile?.employee?.firstName} {req.tutorProfile?.employee?.lastName}
                            </span>
                            <span className="text-xs text-slate-500 font-mono ml-2">
                              ({req.tutorProfile?.employee?.businessId})
                            </span>
                          </div>
                          <div className="text-xs font-mono text-slate-500">
                            Effective: <span className="font-bold text-slate-800">{req.effectiveDate}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-slate-50 p-2.5 rounded">
                          <div>
                            <span className="text-slate-400 block">Current Rate</span>
                            <span className="font-semibold text-slate-700">
                              {req.currentHourlyRate ? `${req.currentHourlyRate} AED/hr` : 'None'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Requested Rate</span>
                            <span className="font-bold text-emerald-700 text-sm">
                              {req.requestedHourlyRate} AED/hr
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Requested By</span>
                            <span className="text-slate-700">{req.requestedBy?.email}</span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-700">
                          <strong>Reason: </strong> {req.reason}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t">
                          {isSelf ? (
                            <span className="text-xs text-amber-600 font-medium italic">
                              Self-approval prohibited
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Awaiting your approval</span>
                          )}

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenRejectDialog(req.id, 'TUTOR')}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" />
                              Reject
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isSelf}
                              onClick={() => handleApproveTutorRequest(req)}
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              Approve
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setIsApprovalsModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* 4. REJECTION REASON MODAL */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        size="md"
      >
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-red-600 mb-2">Reject Compensation Request</h3>
          <p className="text-xs text-slate-600 mb-4">
            Provide a mandatory reason for rejecting this change request. The requester will be notified with this note.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rejection Reason (Mandatory) *
              </label>
              <textarea
                rows={3}
                required
                className="w-full text-sm rounded-lg border border-slate-300 p-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-sm"
                placeholder="State clearly why this request cannot be approved..."
                value={rejectionNote}
                onChange={(e) => setRejectionNote(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={submittingReview || !rejectionNote.trim()}
                onClick={handleConfirmRejection}
              >
                {submittingReview ? 'Rejecting...' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* 5. GOVERNED STATUS TRANSITION MODAL */}
      <Modal
        isOpen={isTransitionModalOpen}
        onClose={() => setIsTransitionModalOpen(false)}
        size="lg"
      >
        <div>
          <div className="border-b pb-4 mb-5">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-brand-600" />
              Transition Employment Status
            </h2>
            <div className="mt-1 text-sm text-slate-600">
              Employee: <strong>{transitionEmp?.firstName} {transitionEmp?.lastName}</strong> ({transitionEmp?.businessId})
            </div>
          </div>

          <form onSubmit={handleSubmitTransition} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Status *</label>
                <Select
                  value={transitionForm.status}
                  onChange={(e) =>
                    setTransitionForm({
                      ...transitionForm,
                      status: e.target.value,
                      restrictAccess: e.target.value === 'TERMINATED' ? true : transitionForm.restrictAccess,
                    })
                  }
                  required
                >
                  <option value="PROBATION">Probation</option>
                  <option value="ACTIVE">Active</option>
                  <option value="NOTICE_PERIOD">Notice Period</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="TERMINATED">Terminated</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="ON_LEAVE">On Leave</option>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Effective Date *</label>
                <Input
                  type="date"
                  required
                  value={transitionForm.effectiveDate}
                  onChange={(e) => setTransitionForm({ ...transitionForm, effectiveDate: e.target.value })}
                />
              </div>
            </div>

            {transitionForm.status === 'ACTIVE' && transitionEmp?.employmentStatus === 'PROBATION' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                <label className="block text-xs font-semibold text-emerald-900 mb-1">
                  Confirmation Date (Probation Completion)
                </label>
                <Input
                  type="date"
                  value={transitionForm.confirmationDate}
                  onChange={(e) => setTransitionForm({ ...transitionForm, confirmationDate: e.target.value })}
                />
              </div>
            )}

            {transitionForm.status === 'PROBATION' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <label className="block text-xs font-semibold text-amber-900 mb-1">Probation End Date</label>
                <Input
                  type="date"
                  value={transitionForm.probationEndDate}
                  onChange={(e) => setTransitionForm({ ...transitionForm, probationEndDate: e.target.value })}
                />
              </div>
            )}

            {transitionForm.status === 'NOTICE_PERIOD' && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-md space-y-3">
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">Notice Period Milestones</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Resignation Date</label>
                    <Input
                      type="date"
                      value={transitionForm.resignationDate}
                      onChange={(e) => setTransitionForm({ ...transitionForm, resignationDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Last Working Date</label>
                    <Input
                      type="date"
                      value={transitionForm.lastWorkingDate}
                      onChange={(e) => setTransitionForm({ ...transitionForm, lastWorkingDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Notice Days</label>
                    <Input
                      type="number"
                      min={0}
                      value={transitionForm.noticePeriodDays}
                      onChange={(e) => setTransitionForm({ ...transitionForm, noticePeriodDays: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {transitionForm.status === 'TERMINATED' ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-800">
                  <strong>Automatic Access Revocation:</strong> Terminating an employee sets their user account to <code>INACTIVE</code>, revokes all active session refresh tokens immediately, and invalidates delegated permissions.
                </div>
              </div>
            ) : transitionForm.status === 'SUSPENDED' || transitionForm.status === 'NOTICE_PERIOD' ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    checked={transitionForm.restrictAccess}
                    onChange={(e) => setTransitionForm({ ...transitionForm, restrictAccess: e.target.checked })}
                  />
                  <div className="text-xs text-slate-700">
                    <span className="font-semibold block">Restrict System Access Immediately</span>
                    By default, suspended or notice period employees retain read/system access unless restricted. Checking this will immediately suspend their login and revoke all active refresh tokens.
                  </div>
                </label>
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Transition (Mandatory) *
              </label>
              <Input
                required
                placeholder="e.g. Completed 90-day probation successfully; Submitted formal resignation"
                value={transitionForm.reason}
                onChange={(e) => setTransitionForm({ ...transitionForm, reason: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Internal Governance Notes (Optional)
              </label>
              <textarea
                rows={2}
                className="w-full text-xs rounded-md border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Additional audit or contextual notes..."
                value={transitionForm.notes}
                onChange={(e) => setTransitionForm({ ...transitionForm, notes: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsTransitionModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={transitionForm.status === 'TERMINATED' ? 'danger' : 'primary'}
                disabled={submittingTransition || !transitionForm.reason.trim()}
              >
                {submittingTransition ? 'Applying Transition...' : 'Confirm Transition'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* 6. CONFIDENTIAL STATUS HISTORY MODAL */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        size="lg"
      >
        <div>
          <div className="border-b pb-4 mb-5">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-brand-600" />
              Employment Status History
            </h2>
            <div className="mt-1 text-sm text-slate-600">
              Employee: <strong>{historyEmp?.firstName} {historyEmp?.lastName}</strong> ({historyEmp?.businessId})
            </div>
          </div>

          {loadingHistory ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              Loading confidential lifecycle history...
            </div>
          ) : historyRecords.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              No recorded status transitions for this employee.
            </div>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {historyRecords.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.previousStatus} />
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      <StatusBadge status={item.newStatus} />
                    </div>
                    <div className="text-xs font-mono text-slate-500">
                      Effective: <span className="font-semibold text-slate-800">{item.effectiveDate}</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-700">
                    <span className="font-semibold text-slate-900">Reason: </span>
                    {item.reason}
                  </div>

                  {item.notes && (
                    <div className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded">
                      &ldquo;{item.notes}&rdquo;
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                    <div>
                      Authorized By: <span className="font-medium text-slate-600">{item.authorizedBy?.email || item.authorizedByUserId}</span>
                    </div>
                    <div>
                      {item.accessRestricted ? (
                        <span className="inline-flex items-center text-red-600 font-medium">
                          <AlertTriangle className="w-3 h-3 mr-1" /> Access Restricted
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-emerald-600">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Standard Access
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setIsHistoryModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
