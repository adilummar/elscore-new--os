"use client";

import * as React from 'react';
import {
  AlertCircle,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';

import { useAuth, usePermissions } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

import {
  cancelOnboardingCaseAction,
  createOnboardingCaseAction,
  createOnboardingTaskAction,
  finalizeOnboardingCaseAction,
  getOnboardingCaseDetailAction,
  getOnboardingCasesAction,
  getOnboardingReadyQueueAction,
  getProbationReviewsAction,
  recordProbationReviewAction,
  updateOnboardingCaseAction,
  updateOnboardingTaskAction,
  uploadOnboardingDocumentAction,
  verifyOnboardingDocumentAction,
} from '../actions';

export default function OnboardingPage() {
  const { hasPermission } = usePermissions();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = React.useState<'queue' | 'cases' | 'probation'>('cases');

  // Data states
  const [readyQueue, setReadyQueue] = React.useState<any[]>([]);
  const [cases, setCases] = React.useState<any[]>([]);
  const [selectedCase, setSelectedCase] = React.useState<any | null>(null);
  const [caseLoading, setCaseLoading] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = React.useState<string>('');
  const [searchFilter, setSearchFilter] = React.useState<string>('');

  // Modals
  const [openCaseModalOpen, setOpenCaseModalOpen] = React.useState(false);
  const [selectedApplicationToOpen, setSelectedApplicationToOpen] = React.useState<any | null>(null);

  const [uploadDocModalOpen, setUploadDocModalOpen] = React.useState(false);
  const [verifyDocModalOpen, setVerifyDocModalOpen] = React.useState(false);
  const [selectedDocToVerify, setSelectedDocToVerify] = React.useState<any | null>(null);

  const [addTaskModalOpen, setAddTaskModalOpen] = React.useState(false);
  const [cancelModalOpen, setCancelModalOpen] = React.useState(false);
  const [finalizeModalOpen, setFinalizeModalOpen] = React.useState(false);

  const [probationModalOpen, setProbationModalOpen] = React.useState(false);
  const [probationEmployee, setProbationEmployee] = React.useState<any | null>(null);
  const [probationHistory, setProbationHistory] = React.useState<any[]>([]);

  // Form states
  const [openCaseForm, setOpenCaseForm] = React.useState({
    targetJoiningDate: '',
    probationDurationMonths: 3,
    notes: '',
  });

  const [uploadDocForm, setUploadDocForm] = React.useState({
    documentType: 'PASSPORT',
    title: '',
    fileName: '',
  });
  const [uploadDocFile, setUploadDocFile] = React.useState<File | null>(null);

  const [verifyDocForm, setVerifyDocForm] = React.useState({
    status: 'VERIFIED' as 'VERIFIED' | 'REJECTED',
    verificationNotes: '',
  });

  const [taskForm, setTaskForm] = React.useState({
    title: '',
    category: 'IT_SETUP',
    dueDate: '',
    notes: '',
  });

  const [cancelForm, setCancelForm] = React.useState({
    status: 'WITHDRAWN' as 'WITHDRAWN' | 'NO_SHOW' | 'REJECTED',
    reason: '',
  });

  const [finalizeForm, setFinalizeForm] = React.useState({
    confirmedJoiningDate: '',
    jobTitle: '',
    personalEmail: '',
    phone: '',
    dateOfBirth: '',
    gender: 'MALE',
    address: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    notes: '',
  });

  const [probationForm, setProbationForm] = React.useState({
    reviewDate: '',
    outcome: 'CONFIRMED' as 'CONFIRMED' | 'EXTENDED' | 'TERMINATED',
    extendedEndDate: '',
    notes: '',
  });

  // Load Initial Data
  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [queueRes, casesRes] = await Promise.all([
        getOnboardingReadyQueueAction(),
        getOnboardingCasesAction({
          status: statusFilter || undefined,
          search: searchFilter || undefined,
        }),
      ]);

      if (Array.isArray(queueRes)) setReadyQueue(queueRes);
      if (casesRes?.cases) setCases(casesRes.cases);
    } catch (err: any) {
      setError(err?.message || 'Failed to load onboarding data');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchFilter]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const loadCaseDetail = async (id: string) => {
    setCaseLoading(true);
    try {
      const detail = await getOnboardingCaseDetailAction(id);
      setSelectedCase(detail);
    } catch (err: any) {
      setError(err?.message || 'Failed to load case detail');
    } finally {
      setCaseLoading(false);
    }
  };

  // Handlers
  const handleOpenCaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApplicationToOpen) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await createOnboardingCaseAction({
        applicationId: selectedApplicationToOpen.id,
        targetJoiningDate: openCaseForm.targetJoiningDate,
        probationDurationMonths: Number(openCaseForm.probationDurationMonths),
        notes: openCaseForm.notes,
      });
      if (res && res.success === false) {
        setError(res.error || 'Failed to create onboarding case');
        return;
      }
      setOpenCaseModalOpen(false);
      setSelectedApplicationToOpen(null);
      await loadData();
      setActiveTab('cases');
    } catch (err: any) {
      setError(err?.message || 'Failed to create onboarding case');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;
    if (!uploadDocFile) {
      setError('Please select a binary file to upload.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadDocFile);
      formData.append('documentType', uploadDocForm.documentType);
      formData.append('title', uploadDocForm.title);

      const res = await uploadOnboardingDocumentAction(selectedCase.id, formData);
      if (res && res.success === false) {
        setError(res.error || 'Failed to upload document');
        return;
      }
      setUploadDocModalOpen(false);
      setUploadDocForm({ documentType: 'PASSPORT', title: '', fileName: '' });
      setUploadDocFile(null);
      await loadCaseDetail(selectedCase.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload document');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !selectedDocToVerify) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await verifyOnboardingDocumentAction(
        selectedCase.id,
        selectedDocToVerify.id,
        verifyDocForm,
      );
      if (res && res.success === false) {
        setError(res.error || 'Failed to record verification');
        return;
      }
      setVerifyDocModalOpen(false);
      setSelectedDocToVerify(null);
      await loadCaseDetail(selectedCase.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to record verification');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await createOnboardingTaskAction(selectedCase.id, {
        title: taskForm.title,
        category: taskForm.category,
        dueDate: taskForm.dueDate || undefined,
        notes: taskForm.notes || undefined,
      });
      if (res && res.success === false) {
        setError(res.error || 'Failed to create task');
        return;
      }
      setAddTaskModalOpen(false);
      setTaskForm({ title: '', category: 'IT_SETUP', dueDate: '', notes: '' });
      await loadCaseDetail(selectedCase.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to create task');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleTaskStatus = async (taskId: string, currentStatus: string) => {
    if (!selectedCase) return;
    const newStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      const res = await updateOnboardingTaskAction(selectedCase.id, taskId, { status: newStatus });
      if (res && res.success === false) {
        setError(res.error || 'Failed to update task status');
        return;
      }
      await loadCaseDetail(selectedCase.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to update task status');
    }
  };

  const handleCancelCaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await cancelOnboardingCaseAction(selectedCase.id, cancelForm);
      if (res && res.success === false) {
        setError(res.error || 'Failed to cancel onboarding case');
        return;
      }
      setCancelModalOpen(false);
      await loadCaseDetail(selectedCase.id);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel onboarding case');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;
    setActionLoading(true);
    setError(null);
    try {
      const payload: any = {
        confirmedJoiningDate: finalizeForm.confirmedJoiningDate,
      };
      if (finalizeForm.jobTitle?.trim()) payload.jobTitle = finalizeForm.jobTitle.trim();
      if (finalizeForm.personalEmail?.trim()) payload.personalEmail = finalizeForm.personalEmail.trim();
      if (finalizeForm.phone?.trim()) payload.phone = finalizeForm.phone.trim();
      if (finalizeForm.dateOfBirth?.trim()) payload.dateOfBirth = finalizeForm.dateOfBirth.trim();
      if (finalizeForm.gender?.trim()) payload.gender = finalizeForm.gender.trim();
      if (finalizeForm.address?.trim()) payload.address = finalizeForm.address.trim();
      if (finalizeForm.emergencyContactName?.trim()) payload.emergencyContactName = finalizeForm.emergencyContactName.trim();
      if (finalizeForm.emergencyContactPhone?.trim()) payload.emergencyContactPhone = finalizeForm.emergencyContactPhone.trim();
      if (finalizeForm.emergencyContactRelation?.trim()) payload.emergencyContactRelation = finalizeForm.emergencyContactRelation.trim();

      const res = await finalizeOnboardingCaseAction(selectedCase.id, payload);
      if (res && res.success === false) {
        const msg = res.blockers?.length
          ? `${res.error || 'Onboarding readiness checks failed'}:\n• ${res.blockers.join('\n• ')}`
          : res.error || 'Failed to finalize onboarding';
        setError(msg);
        return;
      }
      setFinalizeModalOpen(false);
      await loadCaseDetail(selectedCase.id);
      await loadData();
    } catch (err: any) {
      const msg = err?.blockers?.length
        ? `${err.message || 'Onboarding readiness checks failed'}:\n• ${err.blockers.join('\n• ')}`
        : err?.message || 'Failed to finalize onboarding';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenProbation = async (emp: any) => {
    setProbationEmployee(emp);
    setProbationModalOpen(true);
    try {
      const res = await getProbationReviewsAction(emp.id);
      if (res?.reviews) setProbationHistory(res.reviews);
    } catch (err: any) {
      console.error('Failed to load probation reviews', err);
    }
  };

  const handleRecordProbationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!probationEmployee) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await recordProbationReviewAction(probationEmployee.id, probationForm);
      if (res && res.success === false) {
        setError(res.error || 'Failed to record probation review');
        return;
      }
      setProbationModalOpen(false);
      setProbationEmployee(null);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to record probation review');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Employee Onboarding & Probation
          </h1>
          <p className="text-sm text-slate-500">
            Manage accepted offer handoff, document verification, IT/HR checklists, employee profile finalization, and probation milestones.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-700 flex items-start justify-between gap-3">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm whitespace-pre-line">{error}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="shrink-0">
            Dismiss
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 flex space-x-8">
        <button
          onClick={() => { setActiveTab('cases'); setSelectedCase(null); }}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center space-x-2 ${
            activeTab === 'cases'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Active Onboarding Cases</span>
          <span className="ml-1.5 py-0.5 px-2 text-xs rounded-full bg-slate-100 text-slate-600">
            {cases.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('queue'); setSelectedCase(null); }}
          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center space-x-2 ${
            activeTab === 'queue'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Accepted Candidates Queue</span>
          {readyQueue.length > 0 && (
            <span className="ml-1.5 py-0.5 px-2 text-xs rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              {readyQueue.length} Ready
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: ACCEPTED CANDIDATES QUEUE */}
      {activeTab === 'queue' && (
        <Card className="overflow-hidden border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Applications with Accepted Offers</h2>
              <p className="text-xs text-slate-500">
                Candidates who accepted corporate job offers, waiting for an onboarding case to be initiated.
              </p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Target Vacancy</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Accepted Offer</TableHead>
                <TableHead>Offered Terms</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {readyQueue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No accepted candidate applications waiting in queue.
                  </TableCell>
                </TableRow>
              ) : (
                readyQueue.map((app) => {
                  const offer = app.offers?.[0];
                  return (
                    <TableRow key={app.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{app.candidate?.fullName}</div>
                        <div className="text-xs text-slate-500">{app.candidate?.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-900 font-medium">{app.vacancy?.title}</div>
                        <div className="text-xs text-slate-500">{app.vacancy?.businessId}</div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {app.vacancy?.department?.name}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-200 font-medium">
                          {offer?.businessId}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium text-slate-900">
                          {offer?.currency} {Number(offer?.offeredSalary || 0).toLocaleString()} / {offer?.salaryPeriod}
                        </div>
                        <div className="text-xs text-slate-500">Target: {offer?.proposedStartDate}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        {hasPermission('onboarding.manage') && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedApplicationToOpen(app);
                              setOpenCaseForm({
                                targetJoiningDate: offer?.proposedStartDate || '',
                                probationDurationMonths: 3,
                                notes: '',
                              });
                              setOpenCaseModalOpen(true);
                            }}
                          >
                            <Plus className="w-4 h-4 mr-1.5" />
                            Open Onboarding Case
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* TAB 2: ACTIVE ONBOARDING CASES */}
      {activeTab === 'cases' && !selectedCase && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="flex flex-1 gap-2 w-full sm:max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <Input
                  placeholder="Search candidate name, email, or ONB ID..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                className="text-sm border border-slate-300 rounded-lg px-3.5 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="READY_FOR_FINALIZATION">Ready for Finalization</option>
                <option value="COMPLETED">Completed (Hired)</option>
                <option value="WITHDRAWN">Withdrawn</option>
                <option value="NO_SHOW">No Show</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          <Card className="overflow-hidden border border-slate-200 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case ID</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Target Role</TableHead>
                  <TableHead>Target Joining</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      No onboarding cases match your search or filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  cases.map((c) => {
                    const verifiedDocs = c.documents?.filter((d: any) => d.status === 'VERIFIED').length || 0;
                    const totalDocs = c.documents?.length || 0;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs font-semibold text-slate-800">
                          {c.businessId}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900">
                            {c.application?.candidate?.fullName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {c.application?.candidate?.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-slate-800 font-medium">
                            {c.application?.vacancy?.title}
                          </div>
                          <div className="text-xs text-slate-500">
                            {c.application?.vacancy?.department?.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {c.targetJoiningDate}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {verifiedDocs} / {totalDocs} Verified
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => loadCaseDetail(c.id)}>
                            View Checklist
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* CASE DETAIL VIEW */}
      {selectedCase && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="sm" onClick={() => setSelectedCase(null)}>
              ← Back to Onboarding Cases
            </Button>

            <div className="flex items-center space-x-2">
              <StatusBadge status={selectedCase.status} />
              {selectedCase.status !== 'COMPLETED' &&
                selectedCase.status !== 'WITHDRAWN' &&
                selectedCase.status !== 'NO_SHOW' &&
                selectedCase.status !== 'REJECTED' && (
                  <>
                    {hasPermission('onboarding.manage') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => {
                          setCancelForm({ status: 'WITHDRAWN', reason: '' });
                          setCancelModalOpen(true);
                        }}
                      >
                        Cancel / Withdraw
                      </Button>
                    )}

                    {hasPermission('onboarding.finalize') && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                        onClick={() => {
                          setFinalizeForm({
                            confirmedJoiningDate: selectedCase.targetJoiningDate || '',
                            jobTitle: selectedCase.offer?.roleTitle || '',
                            personalEmail: selectedCase.application?.candidate?.email || '',
                            phone: selectedCase.application?.candidate?.phone || '',
                            dateOfBirth: '',
                            gender: 'MALE',
                            address: '',
                            emergencyContactName: '',
                            emergencyContactPhone: '',
                            emergencyContactRelation: '',
                            notes: '',
                          });
                          setFinalizeModalOpen(true);
                        }}
                      >
                        <UserCheck className="w-4 h-4 mr-1.5" />
                        Finalize Onboarding & Hire
                      </Button>
                    )}
                  </>
                )}
            </div>
          </div>

          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 border border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Candidate Profile
              </div>
              <div className="text-base font-bold text-slate-900">
                {selectedCase.application?.candidate?.fullName}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                {selectedCase.application?.candidate?.email}
              </div>
              <div className="text-sm text-slate-600">
                {selectedCase.application?.candidate?.phone || 'No phone provided'}
              </div>
            </Card>

            <Card className="p-4 border border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Offer Terms
              </div>
              <div className="text-base font-bold text-slate-900">
                {selectedCase.offer?.roleTitle}
              </div>
              <div className="text-sm text-emerald-700 font-semibold mt-1">
                {selectedCase.offer?.currency} {Number(selectedCase.offer?.offeredSalary || 0).toLocaleString()} / {selectedCase.offer?.salaryPeriod}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Offer Ref: {selectedCase.offer?.businessId}
              </div>
            </Card>

            <Card className="p-4 border border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Milestones & Dates
              </div>
              <div className="text-sm text-slate-700">
                <span className="font-medium">Target Joining:</span> {selectedCase.targetJoiningDate}
              </div>
              {selectedCase.confirmedJoiningDate && (
                <div className="text-sm text-slate-700">
                  <span className="font-medium">Confirmed Joining:</span> {selectedCase.confirmedJoiningDate}
                </div>
              )}
              <div className="text-sm text-slate-700">
                <span className="font-medium">Probation Duration:</span> {selectedCase.probationDurationMonths} Months
              </div>
              {selectedCase.employee && (
                <div className="text-sm font-semibold text-brand-600 mt-2">
                  Employee ID: {selectedCase.employee.businessId}
                </div>
              )}
            </Card>
          </div>

          {/* Section: Documents Checklist */}
          <Card className="border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-brand-600" />
                  Required Onboarding Documents
                </h3>
                <p className="text-xs text-slate-500">
                  Securely collect and verify government IDs, certificates, and signed offer letters.
                </p>
              </div>

              {hasPermission('onboarding.manage') && selectedCase.status !== 'COMPLETED' && (
                <Button size="sm" onClick={() => setUploadDocModalOpen(true)}>
                  <Upload className="w-4 h-4 mr-1.5" />
                  Upload Document
                </Button>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Verification Status</TableHead>
                  <TableHead>Verification Notes</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedCase.documents?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-slate-500">
                      No documents registered yet. Click &apos;Upload Document&apos; to submit candidate documents.
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedCase.documents?.map((doc: any) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium text-xs text-slate-700">
                        {doc.documentType}
                      </TableCell>
                      <TableCell className="text-sm text-slate-900 font-medium">
                        {doc.title}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-600">
                        {doc.fileName}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {doc.uploadedBy?.email}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={doc.status} />
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-xs truncate">
                        {doc.verificationNotes || '—'}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <a
                          href={`/api/onboarding/${selectedCase.id}/documents/${doc.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" variant="outline">
                            Download / View
                          </Button>
                        </a>
                        {hasPermission('onboarding.verify') && selectedCase.status !== 'COMPLETED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedDocToVerify(doc);
                              setVerifyDocForm({
                                status: doc.status === 'VERIFIED' ? 'VERIFIED' : 'VERIFIED',
                                verificationNotes: doc.verificationNotes || '',
                              });
                              setVerifyDocModalOpen(true);
                            }}
                          >
                            Verify / Reject
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Section: Task Checklist */}
          <Card className="border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-brand-600" />
                  Onboarding Tasks Checklist
                </h3>
                <p className="text-xs text-slate-500">
                  Track IT provisioning, workspace allocation, induction sessions, and administrative formalities.
                </p>
              </div>

              {hasPermission('onboarding.manage') && selectedCase.status !== 'COMPLETED' && (
                <Button size="sm" onClick={() => setAddTaskModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Task
                </Button>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Task Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedCase.tasks?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-slate-500">
                      No tasks in checklist.
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedCase.tasks?.map((task: any) => {
                    const isCompleted = task.status === 'COMPLETED';
                    return (
                      <TableRow key={task.id} className={isCompleted ? 'bg-slate-50/60' : ''}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={isCompleted}
                            disabled={!hasPermission('onboarding.manage') || selectedCase.status === 'COMPLETED'}
                            onChange={() => handleToggleTaskStatus(task.id, task.status)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className={`text-sm font-medium ${isCompleted ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {task.title}
                          {task.notes && <div className="text-xs text-slate-500 mt-0.5">{task.notes}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 font-mono">
                          {task.category}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {task.dueDate || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {task.assignedTo?.email || 'Unassigned'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={task.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* MODAL: OPEN ONBOARDING CASE */}
      <Modal
        isOpen={openCaseModalOpen}
        onClose={() => setOpenCaseModalOpen(false)}
      >
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Open Onboarding Case</h2>
          <form onSubmit={handleOpenCaseSubmit} className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-md text-sm text-slate-700">
              <div><strong>Candidate:</strong> {selectedApplicationToOpen?.candidate?.fullName}</div>
              <div><strong>Role:</strong> {selectedApplicationToOpen?.vacancy?.title}</div>
              <div><strong>Offer ID:</strong> {selectedApplicationToOpen?.offers?.[0]?.businessId}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Target Joining Date (YYYY-MM-DD) *
              </label>
              <Input
                type="date"
                required
                value={openCaseForm.targetJoiningDate}
                onChange={(e) => setOpenCaseForm({ ...openCaseForm, targetJoiningDate: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Probation Duration (Months)
              </label>
              <Input
                type="number"
                min={1}
                max={24}
                value={openCaseForm.probationDurationMonths}
                onChange={(e) => setOpenCaseForm({ ...openCaseForm, probationDurationMonths: parseInt(e.target.value, 10) })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Onboarding Notes
              </label>
              <Input
                placeholder="Special equipment requirements, orientation schedule..."
                value={openCaseForm.notes}
                onChange={(e) => setOpenCaseForm({ ...openCaseForm, notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpenCaseModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading}>
                {actionLoading ? 'Creating...' : 'Open Case'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* MODAL: UPLOAD ONBOARDING DOCUMENT */}
      <Modal
        isOpen={uploadDocModalOpen}
        onClose={() => setUploadDocModalOpen(false)}
      >
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Upload Onboarding Document</h2>
          <form onSubmit={handleUploadDocSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Document Type *
              </label>
              <select
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                value={uploadDocForm.documentType}
                onChange={(e) => setUploadDocForm({ ...uploadDocForm, documentType: e.target.value })}
              >
                <option value="PASSPORT">Passport</option>
                <option value="NATIONAL_ID">National ID / Aadhaar</option>
                <option value="DEGREE_CERTIFICATE">Degree / Graduation Certificate</option>
                <option value="EXPERIENCE_LETTER">Experience / Relieving Letter</option>
                <option value="PAYSLIP">Recent Payslips</option>
                <option value="SIGNED_OFFER_LETTER">Signed Offer Letter</option>
                <option value="BACKGROUND_CHECK">Background Verification Form</option>
                <option value="OTHER">Other Official Document</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Document Display Title *
              </label>
              <Input
                required
                placeholder="e.g. Passport Copy - Front & Back"
                value={uploadDocForm.title}
                onChange={(e) => setUploadDocForm({ ...uploadDocForm, title: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Select Binary File (.pdf, .png, .jpg, .jpeg, .webp — max 10MB) *
              </label>
              <input
                type="file"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="w-full text-xs text-slate-600 border border-slate-300 rounded-md p-1.5 bg-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setUploadDocFile(f);
                  if (f && !uploadDocForm.title) {
                    setUploadDocForm((prev) => ({
                      ...prev,
                      title: f.name.replace(/\.[^/.]+$/, ''),
                    }));
                  }
                }}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setUploadDocModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading}>
                {actionLoading ? 'Uploading...' : 'Submit Document'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* MODAL: VERIFY DOCUMENT */}
      <Modal
        isOpen={verifyDocModalOpen}
        onClose={() => setVerifyDocModalOpen(false)}
      >
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Verify Onboarding Document</h2>
          <form onSubmit={handleVerifyDocSubmit} className="space-y-4">
            <div className="text-sm bg-slate-50 p-3 rounded">
              <div><strong>Document:</strong> {selectedDocToVerify?.title}</div>
              <div><strong>File:</strong> {selectedDocToVerify?.fileName}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Verification Decision *
              </label>
              <select
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                value={verifyDocForm.status}
                onChange={(e) => setVerifyDocForm({ ...verifyDocForm, status: e.target.value as any })}
              >
                <option value="VERIFIED">VERIFIED — Document authentic and valid</option>
                <option value="REJECTED">REJECTED — Document illegible, expired, or invalid</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Verification Notes {verifyDocForm.status === 'REJECTED' && '* (Mandatory for rejection)'}
              </label>
              <Input
                required={verifyDocForm.status === 'REJECTED'}
                placeholder="Verification remarks or rejection reason..."
                value={verifyDocForm.verificationNotes}
                onChange={(e) => setVerifyDocForm({ ...verifyDocForm, verificationNotes: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setVerifyDocModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading}>
                {actionLoading ? 'Saving...' : 'Confirm Decision'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* MODAL: ADD ONBOARDING TASK */}
      <Modal
        isOpen={addTaskModalOpen}
        onClose={() => setAddTaskModalOpen(false)}
      >
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Add Onboarding Task</h2>
          <form onSubmit={handleCreateTaskSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Task Title *
              </label>
              <Input
                required
                placeholder="e.g. Schedule Product Demo & Architecture Walkthrough"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Category *
              </label>
              <select
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                value={taskForm.category}
                onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
              >
                <option value="IT_SETUP">IT Setup & Accounts</option>
                <option value="DOCUMENTATION">Documentation & Compliance</option>
                <option value="WORKSPACE">Workspace & Hardware</option>
                <option value="ORIENTATION">Orientation & Induction</option>
                <option value="TRAINING">Technical Training</option>
                <option value="HR_FORMALITIES">HR Formalities & Payroll</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Due Date (YYYY-MM-DD)
              </label>
              <Input
                type="date"
                value={taskForm.dueDate}
                onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Notes / Instructions
              </label>
              <Input
                placeholder="Assignee guidance or checklist details..."
                value={taskForm.notes}
                onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddTaskModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading}>
                {actionLoading ? 'Adding...' : 'Add Task'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* MODAL: CANCEL / WITHDRAW ONBOARDING */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
      >
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Cancel Onboarding Case</h2>
          <form onSubmit={handleCancelCaseSubmit} className="space-y-4">
            <div className="p-3 bg-red-50 text-red-800 rounded-md text-xs">
              <strong>Warning:</strong> Cancelling will mark this onboarding case as cancelled and update the job application status. No employee profile will be generated.
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Cancellation Status *
              </label>
              <select
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                value={cancelForm.status}
                onChange={(e) => setCancelForm({ ...cancelForm, status: e.target.value as any })}
              >
                <option value="WITHDRAWN">WITHDRAWN — Candidate withdrew before joining</option>
                <option value="NO_SHOW">NO_SHOW — Candidate failed to report on joining date</option>
                <option value="REJECTED">REJECTED — Company revoked onboarding / failed checks</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Mandatory Reason / Explanation *
              </label>
              <Input
                required
                placeholder="State reason for withdrawal, no-show, or rejection..."
                value={cancelForm.reason}
                onChange={(e) => setCancelForm({ ...cancelForm, reason: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCancelModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={actionLoading}>
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* MODAL: FINALIZE ONBOARDING & HIRE */}
      {(() => {
        const hasIdentityDoc = Boolean(
          selectedCase?.documents?.some(
            (doc: any) =>
              (doc.documentType === 'NATIONAL_ID' || doc.documentType === 'PASSPORT') &&
              doc.status === 'VERIFIED',
          ),
        );
        const hasSignedOfferDoc = Boolean(
          selectedCase?.documents?.some(
            (doc: any) =>
              doc.documentType === 'SIGNED_OFFER_LETTER' &&
              doc.status === 'VERIFIED',
          ),
        );
        const totalTasks = selectedCase?.tasks?.length || 0;
        const completedOrWaivedTasks = (selectedCase?.tasks || []).filter(
          (t: any) => t.status === 'COMPLETED' || t.status === 'WAIVED',
        ).length;
        const tasksReady = totalTasks > 0 && completedOrWaivedTasks === totalTasks;
        const pendingDocsCount = (selectedCase?.documents || []).filter(
          (d: any) => d.status === 'PENDING',
        ).length;
        const rejectedDocsCount = (selectedCase?.documents || []).filter(
          (d: any) => d.status === 'REJECTED',
        ).length;
        const docsResolutionReady = pendingDocsCount === 0 && rejectedDocsCount === 0;

        const isReadyToFinalize =
          hasIdentityDoc && hasSignedOfferDoc && tasksReady && docsResolutionReady;

        return (
          <Modal
            isOpen={finalizeModalOpen}
            onClose={() => setFinalizeModalOpen(false)}
            size="lg"
          >
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900 pr-10 mb-2">Finalize Onboarding & Hire Employee</h2>

              {/* In-modal error banner */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-xs whitespace-pre-line flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">{error}</div>
                </div>
              )}

              {/* Readiness Gates Verification Card */}
              <div
                className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                  isReadyToFinalize
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold">
                    {isReadyToFinalize ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    )}
                    Onboarding Readiness Checklist
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      isReadyToFinalize
                        ? 'bg-emerald-200 text-emerald-900'
                        : 'bg-amber-200 text-amber-900'
                    }`}
                  >
                    {isReadyToFinalize ? 'All Gates Satisfied' : 'Gates Incomplete'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                  <div className="flex items-center gap-2">
                    {hasIdentityDoc ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className={hasIdentityDoc ? 'text-slate-800' : 'text-rose-700 font-medium'}>
                      Identity Proof (National ID / Passport)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasSignedOfferDoc ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className={hasSignedOfferDoc ? 'text-slate-800' : 'text-rose-700 font-medium'}>
                      Signed Corporate Offer Letter
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {tasksReady ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    )}
                    <span className={tasksReady ? 'text-slate-800' : 'text-amber-800 font-medium'}>
                      Checklist Tasks ({completedOrWaivedTasks}/{totalTasks} Completed)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {docsResolutionReady ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    )}
                    <span className={docsResolutionReady ? 'text-slate-800' : 'text-amber-800 font-medium'}>
                      Document Resolution ({pendingDocsCount} pending, {rejectedDocsCount} rejected)
                    </span>
                  </div>
                </div>

                {!isReadyToFinalize && (
                  <div className="text-[11px] text-amber-800 pt-1 border-t border-amber-200/50">
                    All checklist tasks must be completed/waived, mandatory documents verified, and no documents pending or rejected before finalization.
                  </div>
                )}
              </div>

              <form onSubmit={handleFinalizeSubmit} className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
                <div className="p-3 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-md text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-emerald-700" />
                    Idempotent Employee Record Creation
                  </div>
                  <div>
                    This action creates an Employee record (EMP-####), sets up a User account in PENDING_SETUP status with mustChangePassword=true, transitions the application to HIRED, and submits an initial Compensation Request for CEO approval.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Confirmed Joining Date *
                    </label>
                    <Input
                      type="date"
                      required
                      value={finalizeForm.confirmedJoiningDate}
                      onChange={(e) => setFinalizeForm({ ...finalizeForm, confirmedJoiningDate: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Official Job Title
                    </label>
                    <Input
                      value={finalizeForm.jobTitle}
                      onChange={(e) => setFinalizeForm({ ...finalizeForm, jobTitle: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Personal Email
                    </label>
                    <Input
                      type="email"
                      value={finalizeForm.personalEmail}
                      onChange={(e) => setFinalizeForm({ ...finalizeForm, personalEmail: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Mobile Phone
                    </label>
                    <Input
                      value={finalizeForm.phone}
                      onChange={(e) => setFinalizeForm({ ...finalizeForm, phone: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Date of Birth
                    </label>
                    <Input
                      type="date"
                      value={finalizeForm.dateOfBirth}
                      onChange={(e) => setFinalizeForm({ ...finalizeForm, dateOfBirth: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Gender
                    </label>
                    <select
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                      value={finalizeForm.gender}
                      onChange={(e) => setFinalizeForm({ ...finalizeForm, gender: e.target.value })}
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Residential Address
                  </label>
                  <Input
                    placeholder="Street address, city, state, postal code..."
                    value={finalizeForm.address}
                    onChange={(e) => setFinalizeForm({ ...finalizeForm, address: e.target.value })}
                  />
                </div>

                <div className="border-t border-slate-200 pt-3">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Emergency Contact Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                      <Input
                        value={finalizeForm.emergencyContactName}
                        onChange={(e) => setFinalizeForm({ ...finalizeForm, emergencyContactName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                      <Input
                        value={finalizeForm.emergencyContactPhone}
                        onChange={(e) => setFinalizeForm({ ...finalizeForm, emergencyContactPhone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Relation</label>
                      <Input
                        placeholder="e.g. Spouse / Parent"
                        value={finalizeForm.emergencyContactRelation}
                        onChange={(e) => setFinalizeForm({ ...finalizeForm, emergencyContactRelation: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                  <Button type="button" variant="outline" onClick={() => setFinalizeModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={actionLoading || !isReadyToFinalize}
                  >
                    {actionLoading
                      ? 'Finalizing...'
                      : !isReadyToFinalize
                      ? 'Readiness Gates Incomplete'
                      : 'Confirm & Create Employee'}
                  </Button>
                </div>
              </form>
            </div>
          </Modal>
        );
      })()}

      {/* MODAL: PROBATION EVALUATION */}
      <Modal
        isOpen={probationModalOpen}
        onClose={() => setProbationModalOpen(false)}
      >
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Probation Review & Decision</h2>
          <form onSubmit={handleRecordProbationSubmit} className="space-y-4">
            <div className="p-3 bg-slate-50 text-slate-800 rounded-md text-xs space-y-1">
              <div><strong>Employee:</strong> {probationEmployee?.firstName} {probationEmployee?.lastName} ({probationEmployee?.businessId})</div>
              <div><strong>Expected End Date:</strong> {probationEmployee?.probationEndDate || 'N/A'}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Review Date (YYYY-MM-DD) *
              </label>
              <Input
                type="date"
                required
                value={probationForm.reviewDate}
                onChange={(e) => setProbationForm({ ...probationForm, reviewDate: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Probation Decision Outcome *
              </label>
              <select
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                value={probationForm.outcome}
                onChange={(e) => setProbationForm({ ...probationForm, outcome: e.target.value as any })}
              >
                <option value="CONFIRMED">CONFIRMED — Promote to permanent ACTIVE status</option>
                <option value="EXTENDED">EXTENDED — Extend probation period for improvement</option>
                <option value="TERMINATED">TERMINATED — End employment due to unsatisfactory performance</option>
              </select>
            </div>

            {probationForm.outcome === 'EXTENDED' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  New Extended End Date (YYYY-MM-DD) *
                </label>
                <Input
                  type="date"
                  required
                  value={probationForm.extendedEndDate}
                  onChange={(e) => setProbationForm({ ...probationForm, extendedEndDate: e.target.value })}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Review Notes & Feedback *
              </label>
              <Input
                required
                placeholder="Evaluation rationale, feedback, objectives achieved..."
                value={probationForm.notes}
                onChange={(e) => setProbationForm({ ...probationForm, notes: e.target.value })}
              />
            </div>

            {/* Previous reviews history */}
            {probationHistory.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs font-semibold text-slate-600 mb-2">Previous Reviews:</div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {probationHistory.map((rev) => (
                    <div key={rev.id} className="text-xs p-2 bg-slate-50 rounded border border-slate-100 flex justify-between items-center">
                      <div>
                        <span className="font-medium text-slate-800">{rev.reviewDate}: </span>
                        <span className="text-slate-600">{rev.notes}</span>
                      </div>
                      <StatusBadge status={rev.outcome} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
              <Button type="button" variant="outline" onClick={() => setProbationModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading}>
                {actionLoading ? 'Recording...' : 'Record Review'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
