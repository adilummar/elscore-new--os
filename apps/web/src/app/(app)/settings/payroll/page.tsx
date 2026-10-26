"use client";

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { usePermissions } from '@/components/providers/AuthProvider';
import {
  Calculator,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  CreditCard,
  ArrowRight,
  Info,
  Loader2,
  BookOpen,
} from 'lucide-react';
import {
  getPayrollRunsAction,
  getPayrollRunDetailsAction,
  createPayrollRunAction,
  finalizePayrollRunAction,
  cancelPayrollRunAction,
  recordPayrollPaymentAction,
  getTutorPayableRunsAction,
  getTutorPayableRunDetailsAction,
  createTutorPayableRunAction,
  finalizeTutorPayableRunAction,
  cancelTutorPayableRunAction,
  recordTutorPayablePaymentAction,
} from '../actions';

export default function PayrollManagementPage() {
  const { hasPermission } = usePermissions();

  const [activeTab, setActiveTab] = React.useState<'payroll' | 'tutorPayable'>('payroll');
  const [payrollRuns, setPayrollRuns] = React.useState<any[]>([]);
  const [tutorRuns, setTutorRuns] = React.useState<any[]>([]);
  const [selectedRun, setSelectedRun] = React.useState<any | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [modalError, setModalError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({ periodStart: '', periodEnd: '', notes: '' });

  const [isPaymentModalOpen, setIsPaymentModalOpen] = React.useState(false);
  const [paymentTargetItem, setPaymentTargetItem] = React.useState<{ id: string; type: 'payroll' | 'tutorPayable' } | null>(null);
  const [paymentForm, setPaymentForm] = React.useState({ paymentReference: '', paymentNotes: '' });

  const canManagePayroll = hasPermission('payroll.run.manage');
  const canFinalizePayroll = hasPermission('payroll.run.finalize');
  const canManagePayment = hasPermission('payroll.payment.manage');
  const canManageTutorPayable = hasPermission('tutor.payable.manage');
  const canFinalizeTutorPayable = hasPermission('tutor.payable.finalize');

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'payroll') {
        const res = await getPayrollRunsAction();
        if (res && typeof res === 'object' && 'success' in res) {
          if (!res.success) {
            setError(res.error || 'Failed to load employee payroll runs');
            setPayrollRuns([]);
          } else {
            setPayrollRuns(Array.isArray(res.data) ? res.data : []);
          }
        } else if (Array.isArray(res)) {
          setPayrollRuns(res);
        } else {
          setPayrollRuns([]);
        }
      } else {
        const res = await getTutorPayableRunsAction();
        if (res && typeof res === 'object' && 'success' in res) {
          if (!res.success) {
            setError(res.error || 'Failed to load tutor payable runs');
            setTutorRuns([]);
          } else {
            setTutorRuns(Array.isArray(res.data) ? res.data : []);
          }
        } else if (Array.isArray(res)) {
          setTutorRuns(res);
        } else {
          setTutorRuns([]);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  React.useEffect(() => {
    setSelectedRun(null);
    loadData();
  }, [loadData, activeTab]);

  const handleSelectRun = async (runId: string) => {
    setDetailsLoading(true);
    setError(null);
    try {
      if (activeTab === 'payroll') {
        const res = await getPayrollRunDetailsAction(runId);
        if (res && typeof res === 'object' && 'success' in res) {
          if (!res.success) {
            setError(res.error || 'Failed to load run details');
            setSelectedRun(null);
          } else {
            setSelectedRun(res.data);
          }
        } else {
          setSelectedRun(res);
        }
      } else {
        const res = await getTutorPayableRunDetailsAction(runId);
        if (res && typeof res === 'object' && 'success' in res) {
          if (!res.success) {
            setError(res.error || 'Failed to load run details');
            setSelectedRun(null);
          } else {
            setSelectedRun(res.data);
          }
        } else {
          setSelectedRun(res);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load run details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setModalError(null);
    // Pre-populate with current calendar month if empty
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    setCreateForm({
      periodStart: `${year}-${month}-01`,
      periodEnd: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
      notes: '',
    });
    setIsCreateModalOpen(true);
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setModalError(null);
    setError(null);
    try {
      if (activeTab === 'payroll') {
        const res = await createPayrollRunAction(createForm);
        if (res && typeof res === 'object' && 'success' in res && !res.success) {
          setModalError(res.error || 'Failed to generate payroll cycle');
          setError(res.error || 'Failed to generate payroll cycle');
          setActionLoading(false);
          return;
        }
        setActionSuccess('Employee payroll run generated successfully');
      } else {
        const res = await createTutorPayableRunAction(createForm);
        if (res && typeof res === 'object' && 'success' in res && !res.success) {
          setModalError(res.error || 'Failed to generate tutor payable batch');
          setError(res.error || 'Failed to generate tutor payable batch');
          setActionLoading(false);
          return;
        }
        setActionSuccess('Tutor payable run generated successfully');
      }
      setIsCreateModalOpen(false);
      setCreateForm({ periodStart: '', periodEnd: '', notes: '' });
      loadData();
    } catch (err: any) {
      const msg = err?.message || 'Failed to create run';
      setModalError(msg);
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalizeRun = async (id: string) => {
    if (!confirm('Are you sure you want to finalize this run? Amounts and records will be permanently frozen.')) {
      return;
    }
    setError(null);
    setActionLoading(true);
    try {
      if (activeTab === 'payroll') {
        const res = await finalizePayrollRunAction(id);
        if (res && typeof res === 'object' && 'success' in res && !res.success) {
          setError(res.error || 'Failed to finalize run');
          setActionLoading(false);
          return;
        }
      } else {
        const res = await finalizeTutorPayableRunAction(id);
        if (res && typeof res === 'object' && 'success' in res && !res.success) {
          setError(res.error || 'Failed to finalize run');
          setActionLoading(false);
          return;
        }
      }
      setActionSuccess('Run finalized successfully. Amounts are permanently frozen for audit compliance.');
      handleSelectRun(id);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to finalize run');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRun = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this draft run?')) return;
    setError(null);
    setActionLoading(true);
    try {
      if (activeTab === 'payroll') {
        const res = await cancelPayrollRunAction(id);
        if (res && typeof res === 'object' && 'success' in res && !res.success) {
          setError(res.error || 'Failed to cancel run');
          setActionLoading(false);
          return;
        }
      } else {
        const res = await cancelTutorPayableRunAction(id);
        if (res && typeof res === 'object' && 'success' in res && !res.success) {
          setError(res.error || 'Failed to cancel run');
          setActionLoading(false);
          return;
        }
      }
      setActionSuccess('Draft run cancelled successfully.');
      setSelectedRun(null);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel run');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTargetItem) return;
    setError(null);
    setModalError(null);
    setActionLoading(true);
    try {
      if (paymentTargetItem.type === 'payroll') {
        const res = await recordPayrollPaymentAction(paymentTargetItem.id, paymentForm);
        if (res && typeof res === 'object' && 'success' in res && !res.success) {
          setModalError(res.error || 'Failed to record payment');
          setActionLoading(false);
          return;
        }
      } else {
        const res = await recordTutorPayablePaymentAction(paymentTargetItem.id, paymentForm);
        if (res && typeof res === 'object' && 'success' in res && !res.success) {
          setModalError(res.error || 'Failed to record payment');
          setActionLoading(false);
          return;
        }
      }
      setActionSuccess('Payment recorded and transaction reference verified successfully.');
      setIsPaymentModalOpen(false);
      setPaymentForm({ paymentReference: '', paymentNotes: '' });
      if (selectedRun?.id) {
        handleSelectRun(selectedRun.id);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to record payment';
      setModalError(msg);
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const currentRuns = activeTab === 'payroll' ? payrollRuns : tutorRuns;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calculator className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            Payroll & Financial Calculation Engine
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Manage employee payroll cycles (INR) and tutor teaching payables (AED) with audit-grade snapshots.
          </p>
        </div>

        <div>
          {activeTab === 'payroll' && canManagePayroll && (
            <Button onClick={handleOpenCreateModal} className="flex items-center gap-2 shadow-sm">
              <Calculator className="w-4 h-4" />
              Generate Payroll Run
            </Button>
          )}
          {activeTab === 'tutorPayable' && canManageTutorPayable && (
            <Button onClick={handleOpenCreateModal} className="flex items-center gap-2 shadow-sm">
              <Calculator className="w-4 h-4" />
              Generate Tutor Payables
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('payroll')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-2 ${
            activeTab === 'payroll'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Employee Payroll (INR)
        </button>
        <button
          onClick={() => setActiveTab('tutorPayable')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-2 ${
            activeTab === 'tutorPayable'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Tutor Payables (AED)
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 rounded-lg text-sm border border-red-200 dark:border-red-900 flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold mb-0.5">Calculation Blocked or Operation Failed</h4>
            <p className="text-red-700 dark:text-red-300">{error}</p>
            {error.includes('no active compensation') && (
              <p className="mt-2 text-xs text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/40 p-2.5 rounded border border-red-200 dark:border-red-800/60">
                <strong>Resolution:</strong> Every active/probation employee must have an approved compensation record before generating a cycle. Visit{' '}
                <Link href="/settings/employees" className="underline font-bold hover:text-red-900 dark:hover:text-white">
                  Settings &gt; Employees
                </Link>{' '}
                to configure base salary and allowances.
              </p>
            )}
            {error.includes('No eligible verified class records') && (
              <p className="mt-2 text-xs text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/40 p-2.5 rounded border border-red-200 dark:border-red-800/60">
                <strong>Resolution:</strong> Ensure tutors have completed teaching classes within this calendar window and that class records are verified and marked payroll-ready in the tutor operations module.
              </p>
            )}
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 dark:hover:text-red-300 text-xs font-semibold px-2 py-1 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 rounded-lg text-sm border border-emerald-200 dark:border-emerald-900 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 text-xs font-semibold px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Grid: Run List & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Runs List */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <CardTitle className="text-base text-slate-900 dark:text-slate-100 flex items-center justify-between">
                <span>{activeTab === 'payroll' ? 'Payroll Cycles' : 'Tutor Payable Runs'}</span>
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  {currentRuns.length} recorded
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                  <span>Loading calculation runs...</span>
                </div>
              ) : currentRuns.length === 0 ? (
                /* Polished Empty State for Left Column */
                <div className="p-8 text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {activeTab === 'payroll' ? 'No Payroll Cycles Yet' : 'No Tutor Payable Runs Yet'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                      {activeTab === 'payroll'
                        ? 'No employee salary cycles have been calculated yet for this organization.'
                        : 'No tutor teaching payable batches have been calculated yet.'}
                    </p>
                  </div>
                  {activeTab === 'payroll' && canManagePayroll && (
                    <Button size="sm" onClick={handleOpenCreateModal} className="mt-2 text-xs">
                      Generate First Cycle
                    </Button>
                  )}
                  {activeTab === 'tutorPayable' && canManageTutorPayable && (
                    <Button size="sm" onClick={handleOpenCreateModal} className="mt-2 text-xs">
                      Generate First Batch
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {currentRuns.map((run) => (
                    <div
                      key={run.id}
                      onClick={() => handleSelectRun(run.id)}
                      className={`p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                        selectedRun?.id === run.id ? 'bg-slate-100 dark:bg-slate-800 border-l-4 border-primary-600' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {run.businessId}
                        </span>
                        <Badge
                          variant={
                            run.status === 'FINALIZED'
                              ? 'success'
                              : run.status === 'CANCELLED'
                              ? 'default'
                              : 'warning'
                          }
                        >
                          {run.status}
                        </Badge>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{run.periodStart} → {run.periodEnd}</span>
                      </div>

                      <div className="flex justify-between items-center text-xs mt-2 text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                        {activeTab === 'payroll' ? (
                          <>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-slate-400" />
                              {run.employeeCount} Employees
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              ₹{Number(run.totalNet).toLocaleString()}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>
                              {run.classCount} Classes ({Number(run.totalHours)}h)
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              AED {Number(run.totalAmount).toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Run Details & Line Items OR Informational Lifecycle Guide */}
        <div className="lg:col-span-2">
          {detailsLoading ? (
            <Card>
              <CardContent className="p-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                <span className="text-sm">Loading calculation details and itemized breakdown...</span>
              </CardContent>
            </Card>
          ) : selectedRun ? (
            <div className="space-y-6">
              {/* Run Summary Card */}
              <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-3 text-slate-900 dark:text-slate-100">
                      <span>{selectedRun.businessId}</span>
                      <Badge
                        variant={
                          selectedRun.status === 'FINALIZED'
                            ? 'success'
                            : selectedRun.status === 'CANCELLED'
                            ? 'default'
                            : 'warning'
                        }
                      >
                        {selectedRun.status}
                      </Badge>
                    </CardTitle>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                      <span>Period: <strong>{selectedRun.periodStart}</strong> to <strong>{selectedRun.periodEnd}</strong></span>
                      <span>•</span>
                      <span>Currency: <strong>{selectedRun.currency}</strong></span>
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {selectedRun.status === 'DRAFT' && (
                      <>
                        {activeTab === 'payroll' && canFinalizePayroll && (
                          <Button size="sm" onClick={() => handleFinalizeRun(selectedRun.id)} disabled={actionLoading}>
                            Finalize Run
                          </Button>
                        )}
                        {activeTab === 'tutorPayable' && canFinalizeTutorPayable && (
                          <Button size="sm" onClick={() => handleFinalizeRun(selectedRun.id)} disabled={actionLoading}>
                            Finalize Run
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancelRun(selectedRun.id)}
                          disabled={actionLoading}
                        >
                          Cancel Run
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 text-sm">
                    {activeTab === 'payroll' ? (
                      <>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">Total Gross</span>
                          <p className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            ₹{Number(selectedRun.totalGross).toLocaleString()}
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">Total Deductions</span>
                          <p className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            ₹{Number(selectedRun.totalDeductions).toLocaleString()}
                          </p>
                        </div>
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                          <span className="text-xs text-emerald-700 dark:text-emerald-400 block font-medium">Total Net Pay</span>
                          <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                            ₹{Number(selectedRun.totalNet).toLocaleString()}
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">Employees Included</span>
                          <p className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            {selectedRun.employeeCount}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                          <span className="text-xs text-emerald-700 dark:text-emerald-400 block font-medium">Total Payables</span>
                          <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                            AED {Number(selectedRun.totalAmount).toLocaleString()}
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">Teaching Hours</span>
                          <p className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            {Number(selectedRun.totalHours)} hrs
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">Classes Verified</span>
                          <p className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            {selectedRun.classCount}
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">Distinct Tutors</span>
                          <p className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            {selectedRun.tutorCount}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Line Items Table */}
              <Card>
                <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <CardTitle className="text-base text-slate-900 dark:text-slate-100 flex items-center justify-between">
                    <span>Itemized Calculation Records</span>
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {selectedRun.items?.length || 0} line items
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Recipient</th>
                        {activeTab === 'payroll' ? (
                          <>
                            <th className="py-3 px-4">Base Salary</th>
                            <th className="py-3 px-4">Net Amount</th>
                          </>
                        ) : (
                          <>
                            <th className="py-3 px-4">Class Ref & Date</th>
                            <th className="py-3 px-4">Rate & Hours</th>
                            <th className="py-3 px-4">Amount</th>
                          </>
                        )}
                        <th className="py-3 px-4">Payment Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {selectedRun.items?.map((item: any) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          {activeTab === 'payroll' ? (
                            <>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900 dark:text-slate-100">
                                  {item.employee?.firstName} {item.employee?.lastName}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{item.employee?.businessId}</div>
                              </td>
                              <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                                ₹{Number(item.baseSalary).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                                ₹{Number(item.netAmount).toLocaleString()}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900 dark:text-slate-100">
                                  {item.tutor?.employee?.firstName} {item.tutor?.employee?.lastName}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{item.tutor?.employee?.businessId}</div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-medium text-slate-900 dark:text-slate-100">
                                  {item.classRecord?.businessId}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {new Date(item.classDate).toLocaleDateString()}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                                <div>AED {Number(item.hourlyRate)}/h</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {(item.workedMinutes / 60).toFixed(1)} hrs ({item.workedMinutes}m)
                                </div>
                              </td>
                              <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                                AED {Number(item.amount).toLocaleString()}
                              </td>
                            </>
                          )}
                          <td className="py-3 px-4">
                            <Badge variant={item.paymentStatus === 'PAID' ? 'success' : 'default'}>
                              {item.paymentStatus}
                            </Badge>
                            {item.paymentReference && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                                Ref: {item.paymentReference}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {selectedRun.status === 'FINALIZED' &&
                              item.paymentStatus === 'UNPAID' &&
                              canManagePayment && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setPaymentTargetItem({
                                      id: item.id,
                                      type: activeTab,
                                    });
                                    setIsPaymentModalOpen(true);
                                  }}
                                  className="text-xs"
                                >
                                  Mark Paid
                                </Button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* Comprehensive Informational Architecture Guide when no run selected */
            <Card className="border-dashed">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-lg flex items-center gap-2 text-slate-900 dark:text-slate-100">
                  <ShieldCheck className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  {activeTab === 'payroll' ? 'Employee Payroll Engine & Lifecycle' : 'Tutor Teaching Payables Lifecycle'}
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Audit-compliant compensation calculation and immutable financial disbursement pipeline.
                </p>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Step 1 */}
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-sm">
                      <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">
                        1
                      </div>
                      Prerequisite: Active Compensation
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {activeTab === 'payroll'
                        ? 'Every employee in Active or Probation status must have an approved compensation profile configured with base salary, currency, and payment details.'
                        : 'Tutors must have active AED hourly rates configured in their Tutor Profile before teaching payables can be calculated.'}
                    </p>
                    {activeTab === 'payroll' && (
                      <Link
                        href="/settings/employees"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline pt-1"
                      >
                        Manage Employee Compensation <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>

                  {/* Step 2 */}
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-sm">
                      <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">
                        2
                      </div>
                      Generate Draft Cycle
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {activeTab === 'payroll'
                        ? 'HR initiates a cycle by defining the calendar period. The engine checks every active employee, verifies compensation dates, and snapshots gross and net pay.'
                        : 'Tutor HR generates a batch for a calendar date range. The engine matches verified class attendance records with effective hourly rates.'}
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-sm">
                      <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">
                        3
                      </div>
                      HR Review & Finalization
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      HR verifies the itemized records. Once finalized, amounts are permanently frozen and immutable to satisfy audit integrity and prevent unauthorized modifications.
                    </p>
                  </div>

                  {/* Step 4 */}
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-sm">
                      <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">
                        4
                      </div>
                      Finance Payment Execution
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Finance executes bank disbursements and records official bank UTR/transaction references directly against individual line items.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-900/40 text-xs text-primary-900 dark:text-primary-200 flex items-start gap-2.5">
                  <Info className="w-4 h-4 flex-shrink-0 text-primary-600 dark:text-primary-400 mt-0.5" />
                  <div>
                    <span className="font-semibold">Next Step: </span>
                    {currentRuns.length === 0 ? (
                      <span>
                        Use the <strong>&ldquo;Generate Payroll Run&rdquo;</strong> button above to calculate the current cycle. If any active employee lacks an approved compensation record, configure them first in{' '}
                        <Link href="/settings/employees" className="underline font-bold">Settings &gt; Employees</Link>.
                      </span>
                    ) : (
                      <span>Select any cycle from the left column to view its itemized breakdown, employee snapshots, and payment reconciliation.</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal: Generate Run (High Contrast WCAG AA) */}
      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          size="md"
        >
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                {activeTab === 'payroll' ? 'Generate Employee Payroll Cycle' : 'Generate Tutor Payable Batch'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {activeTab === 'payroll'
                  ? 'Calculate salary snapshots for all active employees across the selected period.'
                  : 'Calculate payables for all verified tutor classes completed within the selected period.'}
              </p>
            </div>

            {modalError && (
              <div className="p-3.5 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200 rounded-lg text-xs border border-red-200 dark:border-red-900 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold mb-0.5">Calculation Blocked</div>
                  <p>{modalError}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleCreateRun} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                    Period Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={createForm.periodStart}
                    onChange={(e) => setCreateForm({ ...createForm, periodStart: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">e.g. 2026-10-01</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                    Period End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={createForm.periodEnd}
                    onChange={(e) => setCreateForm({ ...createForm, periodEnd: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">e.g. 2026-10-31</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Cycle Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="e.g. October monthly salary cycle with approved revisions"
                  className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                />
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-slate-100">Prerequisite Check: </span>
                {activeTab === 'payroll'
                  ? 'All active and probation employees must have active compensation configured for this date window.'
                  : 'Classes must be verified and marked payroll-ready with approved tutor hourly rates.'}
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={actionLoading}
                  className="text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={actionLoading} className="flex items-center gap-2">
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running Calculation...
                    </>
                  ) : (
                    <>
                      <Calculator className="w-4 h-4" />
                      Run Calculation
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Modal: Record Payment (High Contrast WCAG AA) */}
      {isPaymentModalOpen && (
        <Modal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          size="md"
        >
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Record Manual Payment Confirmation
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Record the official bank transaction reference or UTR number for this disbursed amount.
              </p>
            </div>

            {modalError && (
              <div className="p-3.5 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200 rounded-lg text-xs border border-red-200 dark:border-red-900 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold mb-0.5">Payment Record Failed</div>
                  <p>{modalError}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Transaction Reference / UTR Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UTR-20261026-987654 or HDFC-TXN-4029"
                  value={paymentForm.paymentReference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Payment Confirmation Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Processed via corporate net banking portal by Finance"
                  value={paymentForm.paymentNotes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentNotes: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPaymentModalOpen(false)}
                  disabled={actionLoading}
                  className="text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={actionLoading} className="flex items-center gap-2">
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Recording Payment...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirm Payment Recorded
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
