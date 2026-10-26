"use client";

import * as React from 'react';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Users,
  XCircle,
  AlertTriangle,
  Building,
} from 'lucide-react';

import { useAuth, usePermissions } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

import {
  createVacancyAction,
  getDepartmentsAction,
  getRolesAction,
  getVacanciesAction,
  getVacancyAction,
  reviewVacancyAction,
  submitVacancyForApprovalAction,
  transitionVacancyStatusAction,
} from '../actions';

export default function VacanciesPage() {
  const { hasPermission } = usePermissions();
  const { user } = useAuth();

  const [vacancies, setVacancies] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [departments, setDepartments] = React.useState<any[]>([]);
  const [roles, setRoles] = React.useState<any[]>([]);
  const [deptLoading, setDeptLoading] = React.useState(false);
  const [deptError, setDeptError] = React.useState<string | null>(null);

  const loadDepartments = React.useCallback(async () => {
    setDeptLoading(true);
    setDeptError(null);
    try {
      const deptRes = await getDepartmentsAction();
      const deptList = Array.isArray(deptRes) ? deptRes : (deptRes as any)?.data || (deptRes as any)?.items || [];
      const activeDepts = deptList.filter((d: any) => d.status === 'ACTIVE' || !d.status);
      setDepartments(activeDepts);
    } catch (err: any) {
      setDeptError(err?.message || 'Failed to load departments');
    } finally {
      setDeptLoading(false);
    }
  }, []);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = React.useState<string>('');
  const [priorityFilter, setPriorityFilter] = React.useState<string>('');
  const [departmentFilter, setDepartmentFilter] = React.useState<string>('');
  const [searchTerm, setSearchTerm] = React.useState<string>('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isDetailOpen, setIsDetailOpen] = React.useState(false);
  const [selectedVacancy, setSelectedVacancy] = React.useState<any | null>(null);
  const [reviewNote, setReviewNote] = React.useState('');
  const [statusNote, setStatusNote] = React.useState('');

  // Create Form State
  const [formData, setFormData] = React.useState({
    title: '',
    departmentId: '',
    roleId: '',
    employmentType: 'FULL_TIME',
    workMode: 'ON_SITE',
    location: '',
    targetHeadcount: 1,
    priority: 'MEDIUM',
    justification: '',
    targetStartDate: '',
    targetClosureDate: '',
    budgetMin: '',
    budgetMax: '',
    currency: 'INR',
    notes: '',
  });

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      if (departmentFilter) params.append('departmentId', departmentFilter);
      if (searchTerm) params.append('search', searchTerm);

      const [vacRes, deptRes, roleRes] = await Promise.all([
        getVacanciesAction(params.toString()),
        getDepartmentsAction(),
        getRolesAction('limit=100'),
      ]);

      if (vacRes?.items) {
        setVacancies(vacRes.items);
        setTotal(vacRes.total || 0);
      } else {
        setVacancies([]);
        setTotal(0);
      }

      const deptList = Array.isArray(deptRes) ? deptRes : (deptRes as any)?.data || (deptRes as any)?.items || [];
      const activeDepts = deptList.filter((d: any) => d.status === 'ACTIVE' || !d.status);
      setDepartments(activeDepts);

      const roleList = Array.isArray(roleRes) ? roleRes : (roleRes as any)?.data || (roleRes as any)?.items || [];
      setRoles(roleList);
    } catch (err: any) {
      setError(err?.message || 'Failed to load vacancies');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, departmentFilter, searchTerm]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle selection of a vacancy for detail view
  const handleViewVacancy = async (id: string) => {
    setActionLoading(true);
    setError(null);
    try {
      const data = await getVacancyAction(id);
      setSelectedVacancy(data);
      setReviewNote('');
      setStatusNote('');
      setIsDetailOpen(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to load vacancy details');
    } finally {
      setActionLoading(false);
    }
  };

  // Create Vacancy handler
  const handleCreateVacancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!formData.departmentId) {
      setError('Department is required');
      return;
    }
    if (!formData.justification.trim() || formData.justification.trim().length < 5) {
      setError('Business justification must be at least 5 characters');
      return;
    }
    if (formData.budgetMin && formData.budgetMax && Number(formData.budgetMin) > Number(formData.budgetMax)) {
      setError('Minimum budget cannot exceed maximum budget');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      await createVacancyAction({
        title: formData.title.trim(),
        departmentId: formData.departmentId,
        roleId: formData.roleId || undefined,
        employmentType: formData.employmentType,
        workMode: formData.workMode,
        location: formData.location.trim() || undefined,
        targetHeadcount: Number(formData.targetHeadcount) || 1,
        priority: formData.priority,
        justification: formData.justification.trim(),
        targetStartDate: formData.targetStartDate || undefined,
        targetClosureDate: formData.targetClosureDate || undefined,
        budgetMin: formData.budgetMin ? Number(formData.budgetMin) : undefined,
        budgetMax: formData.budgetMax ? Number(formData.budgetMax) : undefined,
        currency: formData.currency || 'INR',
        notes: formData.notes.trim() || undefined,
      });

      setSuccessMessage('Vacancy created successfully in DRAFT status.');
      setIsCreateOpen(false);
      setFormData({
        title: '',
        departmentId: '',
        roleId: '',
        employmentType: 'FULL_TIME',
        workMode: 'ON_SITE',
        location: '',
        targetHeadcount: 1,
        priority: 'MEDIUM',
        justification: '',
        targetStartDate: '',
        targetClosureDate: '',
        budgetMin: '',
        budgetMax: '',
        currency: 'INR',
        notes: '',
      });
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to create vacancy');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit for approval
  const handleSubmitForApproval = async (id: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await submitVacancyForApprovalAction(id);
      setSuccessMessage('Vacancy submitted for management approval.');
      setIsDetailOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit vacancy for approval');
    } finally {
      setActionLoading(false);
    }
  };

  // Review (Approve / Reject)
  const handleReview = async (id: string, action: 'APPROVE' | 'REJECT') => {
    setActionLoading(true);
    setError(null);
    try {
      await reviewVacancyAction(id, {
        action,
        reviewNote: reviewNote.trim() || undefined,
      });
      setSuccessMessage(`Vacancy successfully ${action.toLowerCase()}d.`);
      setIsDetailOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || `Failed to ${action.toLowerCase()} vacancy`);
    } finally {
      setActionLoading(false);
    }
  };

  // Transition lifecycle status
  const handleStatusTransition = async (id: string, nextStatus: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await transitionVacancyStatusAction(id, {
        status: nextStatus,
        note: statusNote.trim() || undefined,
      });
      setSuccessMessage(`Vacancy status transitioned to ${nextStatus}.`);
      setIsDetailOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || `Failed to transition status to ${nextStatus}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Metrics
  const openCount = vacancies.filter((v) => v.status === 'OPEN').length;
  const pendingCount = vacancies.filter((v) => v.status === 'PENDING_APPROVAL').length;
  const filledCount = vacancies.filter((v) => v.status === 'FILLED').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-600" />
            Workforce Planning & Vacancies
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage company-wide workforce demand, position requisitions, approvals, and recruitment statuses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {hasPermission('vacancy.create') && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white"
            >
              <Plus className="w-4 h-4" />
              New Vacancy
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold">
            ×
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-500" />
          <div className="flex-1">{successMessage}</div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-600 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Requisitions</span>
            <Building className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{total}</p>
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Open / Sourcing</span>
            <Briefcase className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{openCount}</p>
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Pending Approval</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-2">{pendingCount}</p>
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Filled</span>
            <CheckCircle2 className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-blue-600 mt-2">{filledCount}</p>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              placeholder="Search title, ID, justification..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="PENDING_APPROVAL">PENDING APPROVAL</option>
              <option value="APPROVED">APPROVED</option>
              <option value="OPEN">OPEN</option>
              <option value="ON_HOLD">ON HOLD</option>
              <option value="FILLED">FILLED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Priorities</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="URGENT">URGENT</option>
            </select>
          </div>

          <div>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Vacancies Table */}
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/75">
              <TableHead className="font-semibold text-slate-700">Business ID</TableHead>
              <TableHead className="font-semibold text-slate-700">Position & Department</TableHead>
              <TableHead className="font-semibold text-slate-700">Priority</TableHead>
              <TableHead className="font-semibold text-slate-700">Mode</TableHead>
              <TableHead className="font-semibold text-slate-700">Headcount</TableHead>
              <TableHead className="font-semibold text-slate-700">Target Closure</TableHead>
              <TableHead className="font-semibold text-slate-700">Status</TableHead>
              <TableHead className="text-right font-semibold text-slate-700">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-500" />
                  Loading workforce vacancies...
                </TableCell>
              </TableRow>
            ) : vacancies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                  No vacancies found matching current filters.
                </TableCell>
              </TableRow>
            ) : (
              vacancies.map((v) => (
                <TableRow key={v.id} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-mono text-xs font-semibold text-slate-600">
                    {v.businessId}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-900">{v.title}</div>
                    <div className="text-xs text-slate-500">{v.department?.name || 'Department'}</div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        v.priority === 'URGENT'
                          ? 'bg-rose-100 text-rose-800'
                          : v.priority === 'HIGH'
                            ? 'bg-amber-100 text-amber-800'
                            : v.priority === 'MEDIUM'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {v.priority}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    <div>{v.workMode.replace('_', ' ')}</div>
                    <div className="text-[10px] text-slate-400">{v.employmentType.replace('_', ' ')}</div>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-slate-700">
                    <span className={v.filledHeadcount >= v.targetHeadcount ? 'text-emerald-600 font-bold' : ''}>
                      {v.filledHeadcount} / {v.targetHeadcount}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {v.targetClosureDate || '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={v.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewVacancy(v.id)}
                      className="text-xs"
                    >
                      View & Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Vacancy Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} size="lg">
        <div className="space-y-4">
          <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-2 pr-10">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
              <Plus className="w-5 h-5 text-brand-600" />
              Create Workforce Vacancy
            </h2>
            <p className="text-xs text-slate-500">
              Initiate a workforce requisition. Initial status will be DRAFT for review.
            </p>
          </div>

          <form onSubmit={handleCreateVacancy} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Position Title *
                </label>
                <Input
                  required
                  placeholder="e.g. Senior Curriculum Specialist"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Department *
                  </label>
                  {deptError && (
                    <button
                      type="button"
                      onClick={loadDepartments}
                      className="text-xs text-brand-600 hover:text-brand-700 underline font-medium"
                    >
                      Retry loading
                    </button>
                  )}
                </div>
                <select
                  required
                  disabled={deptLoading}
                  value={formData.departmentId}
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {deptLoading ? (
                    <option value="" disabled>Loading departments...</option>
                  ) : deptError ? (
                    <option value="" disabled>Error loading departments — click Retry</option>
                  ) : departments.length === 0 ? (
                    <option value="" disabled>No active departments available</option>
                  ) : (
                    <option value="">Select Department</option>
                  )}
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
                {deptError && (
                  <p className="mt-1 text-xs text-red-600 font-medium">
                    {deptError}. <button type="button" onClick={loadDepartments} className="underline">Retry</button>
                  </p>
                )}
                {!deptLoading && !deptError && departments.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600 font-medium">
                    No active departments found in the system.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Associated System Role (Optional)
                </label>
                <select
                  value={formData.roleId}
                  onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                  className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">None / Custom Position</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Headcount *
                </label>
                <Input
                  type="number"
                  min="1"
                  required
                  value={formData.targetHeadcount}
                  onChange={(e) => setFormData({ ...formData, targetHeadcount: parseInt(e.target.value, 10) || 1 })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Employment Type
                </label>
                <select
                  value={formData.employmentType}
                  onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                  className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERN">Intern</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Work Mode
                </label>
                <select
                  value={formData.workMode}
                  onChange={(e) => setFormData({ ...formData, workMode: e.target.value })}
                  className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="ON_SITE">On Site</option>
                  <option value="REMOTE">Remote</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Location / Office
                </label>
                <Input
                  placeholder="e.g. Bangalore Office"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Budget Min (INR / Month)
                </label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 40000"
                  value={formData.budgetMin}
                  onChange={(e) => setFormData({ ...formData, budgetMin: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Budget Max (INR / Month)
                </label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 60000"
                  value={formData.budgetMax}
                  onChange={(e) => setFormData({ ...formData, budgetMax: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Start Date
                </label>
                <Input
                  type="date"
                  value={formData.targetStartDate}
                  onChange={(e) => setFormData({ ...formData, targetStartDate: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Closure Date
                </label>
                <Input
                  type="date"
                  value={formData.targetClosureDate}
                  onChange={(e) => setFormData({ ...formData, targetClosureDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Business Justification *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Explain why this workforce addition is required and strategic impact..."
                value={formData.justification}
                onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                className="w-full p-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notes & Additional Details
              </label>
              <textarea
                rows={2}
                placeholder="Any special skills, certificates, or operational notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-2.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actionLoading}
                className="bg-brand-600 hover:bg-brand-700 text-white"
              >
                {actionLoading ? 'Creating...' : 'Create Draft Vacancy'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Vacancy Detail & Actions Modal */}
      {selectedVacancy && (
        <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} size="lg">
          <div className="space-y-6">
            <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4 pt-1 pr-10">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                    {selectedVacancy.businessId}
                  </span>
                  <StatusBadge status={selectedVacancy.status} />
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      selectedVacancy.priority === 'URGENT'
                        ? 'bg-rose-100 text-rose-800'
                        : selectedVacancy.priority === 'HIGH'
                          ? 'bg-amber-100 text-amber-800'
                          : selectedVacancy.priority === 'MEDIUM'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {selectedVacancy.priority}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-2">{selectedVacancy.title}</h2>
                <p className="text-sm text-slate-500">
                  {selectedVacancy.department?.name} • {selectedVacancy.role?.name || 'Custom Role'}
                </p>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm bg-slate-50 p-4 rounded-lg">
              <div>
                <span className="text-xs text-slate-400 block font-medium">Headcount</span>
                <span className="font-semibold text-slate-800">
                  {selectedVacancy.filledHeadcount} / {selectedVacancy.targetHeadcount} filled
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block font-medium">Work Mode</span>
                <span className="font-semibold text-slate-800">
                  {selectedVacancy.workMode} ({selectedVacancy.location || 'HQ'})
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block font-medium">Budget Range</span>
                <span className="font-semibold text-slate-800">
                  {selectedVacancy.budgetMin || selectedVacancy.budgetMax
                    ? `${selectedVacancy.currency} ${selectedVacancy.budgetMin || 0} - ${selectedVacancy.budgetMax || 0}`
                    : 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block font-medium">Target Start</span>
                <span className="font-semibold text-slate-800">
                  {selectedVacancy.targetStartDate || 'Flexible'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block font-medium">Target Closure</span>
                <span className="font-semibold text-slate-800">
                  {selectedVacancy.targetClosureDate || 'Flexible'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block font-medium">Requested By</span>
                <span className="font-semibold text-slate-800">
                  {selectedVacancy.requestedBy?.employee
                    ? `${selectedVacancy.requestedBy.employee.firstName} ${selectedVacancy.requestedBy.employee.lastName}`
                    : selectedVacancy.requestedBy?.email}
                </span>
              </div>
            </div>

            {/* Justification & Notes */}
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Business Justification
                </h4>
                <p className="text-sm text-slate-700 bg-white border border-slate-200 p-3 rounded-md">
                  {selectedVacancy.justification}
                </p>
              </div>

              {selectedVacancy.notes && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Notes
                  </h4>
                  <p className="text-xs text-slate-600 bg-white border border-slate-200 p-3 rounded-md whitespace-pre-line">
                    {selectedVacancy.notes}
                  </p>
                </div>
              )}

              {selectedVacancy.reviewedBy && (
                <div className="p-3 bg-slate-100 rounded-md text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-700">
                    Reviewed by:{' '}
                    {selectedVacancy.reviewedBy?.employee
                      ? `${selectedVacancy.reviewedBy.employee.firstName} ${selectedVacancy.reviewedBy.employee.lastName}`
                      : selectedVacancy.reviewedBy?.email}
                  </div>
                  {selectedVacancy.reviewedAt && (
                    <div>Reviewed At: {new Date(selectedVacancy.reviewedAt).toLocaleString()}</div>
                  )}
                  {selectedVacancy.reviewNote && (
                    <div className="italic text-slate-700">Note: &quot;{selectedVacancy.reviewNote}&quot;</div>
                  )}
                </div>
              )}
            </div>

            {/* Lifecycle & Approval Action Panel */}
            <div className="border-t border-slate-200 pt-4 space-y-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Workflow & Status Actions
              </h4>

              {/* DRAFT or REJECTED: Submit for approval */}
              {(selectedVacancy.status === 'DRAFT' || selectedVacancy.status === 'REJECTED') && (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-xs text-blue-800">
                    This vacancy is ready for submission to management for formal approval.
                  </div>
                  <Button
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => handleSubmitForApproval(selectedVacancy.id)}
                    className="bg-brand-600 hover:bg-brand-700 text-white text-xs"
                  >
                    Submit for Approval
                  </Button>
                </div>
              )}

              {/* PENDING APPROVAL: Review controls */}
              {selectedVacancy.status === 'PENDING_APPROVAL' && (
                <div className="space-y-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="text-xs font-medium text-amber-900">
                    Management Review Required
                  </div>

                  {user?.id === selectedVacancy.requestedByUserId && !hasPermission('vacancy.approve') ? (
                    <div className="flex items-center gap-2 p-2 bg-amber-100 text-amber-800 text-xs rounded border border-amber-300">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>
                        <strong>Awaiting CEO Approval:</strong> As the requester of this vacancy, you
                        cannot approve or review your own submission. Awaiting CEO review.
                      </span>
                    </div>
                  ) : hasPermission('vacancy.approve') ? (
                    <div className="space-y-3">
                      {user?.id === selectedVacancy.requestedByUserId && (
                        <div className="flex items-center gap-2 p-2 bg-blue-50 text-blue-800 text-xs rounded border border-blue-200">
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-blue-600" />
                          <span>
                            <strong>CEO Requisition:</strong> As executive approver, you can self-approve this requisition.
                          </span>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Review Note (Mandatory for rejection)
                        </label>
                        <Input
                          placeholder="Feedback or rationale..."
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionLoading}
                          onClick={() => handleReview(selectedVacancy.id, 'REJECT')}
                          className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                        >
                          Reject Request
                        </Button>
                        <Button
                          size="sm"
                          disabled={actionLoading}
                          onClick={() => handleReview(selectedVacancy.id, 'APPROVE')}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {user?.id === selectedVacancy.requestedByUserId ? 'Self-Approve Vacancy' : 'Approve Vacancy'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      You do not have permission to approve vacancies. Awaiting CEO review.
                    </p>
                  )}
                </div>
              )}

              {/* APPROVED: Open for recruitment */}
              {selectedVacancy.status === 'APPROVED' && hasPermission('vacancy.manage-status') && (
                <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="text-xs text-emerald-800">
                    Vacancy is approved. Open position to begin sourcing and candidate pipeline.
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleStatusTransition(selectedVacancy.id, 'OPEN')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      Open Position
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleStatusTransition(selectedVacancy.id, 'CANCELLED')}
                      className="text-xs text-slate-600"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* OPEN: Sourcing and recruitment */}
              {selectedVacancy.status === 'OPEN' && hasPermission('vacancy.manage-status') && (
                <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-xs text-slate-700">
                    Position is actively open. Manage recruitment progression:
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleStatusTransition(selectedVacancy.id, 'ON_HOLD')}
                      variant="outline"
                      className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                    >
                      Put On Hold
                    </Button>
                    <Button
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleStatusTransition(selectedVacancy.id, 'FILLED')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      Mark as Filled
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleStatusTransition(selectedVacancy.id, 'CANCELLED')}
                      className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Cancel Position
                    </Button>
                  </div>
                </div>
              )}

              {/* ON_HOLD: Re-open or cancel */}
              {selectedVacancy.status === 'ON_HOLD' && hasPermission('vacancy.manage-status') && (
                <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="text-xs text-amber-800">
                    Position is on hold. Resume recruitment or cancel.
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleStatusTransition(selectedVacancy.id, 'OPEN')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      Resume (Open)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleStatusTransition(selectedVacancy.id, 'CANCELLED')}
                      className="text-xs text-slate-600"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* FILLED: Option to re-open if candidate dropped */}
              {selectedVacancy.status === 'FILLED' && hasPermission('vacancy.manage-status') && (
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-xs text-slate-600">
                    This requisition is fulfilled. If a hire drops out, you may re-open the vacancy.
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading}
                    onClick={() => handleStatusTransition(selectedVacancy.id, 'OPEN')}
                    className="text-xs"
                  >
                    Re-open Vacancy
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
