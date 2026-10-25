"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { usePermissions } from '@/components/providers/AuthProvider';
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
  const [error, setError] = React.useState<string | null>(null);
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
        setPayrollRuns(Array.isArray(res) ? res : []);
      } else {
        const res = await getTutorPayableRunsAction();
        setTutorRuns(Array.isArray(res) ? res : []);
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
        const details = await getPayrollRunDetailsAction(runId);
        setSelectedRun(details);
      } else {
        const details = await getTutorPayableRunDetailsAction(runId);
        setSelectedRun(details);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load run details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (activeTab === 'payroll') {
        await createPayrollRunAction(createForm);
        setActionSuccess('Employee payroll run generated successfully');
      } else {
        await createTutorPayableRunAction(createForm);
        setActionSuccess('Tutor payable run generated successfully');
      }
      setIsCreateModalOpen(false);
      setCreateForm({ periodStart: '', periodEnd: '', notes: '' });
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to create run');
    }
  };

  const handleFinalizeRun = async (id: string) => {
    if (!confirm('Are you sure you want to finalize this run? Amounts and records will be permanently frozen.')) {
      return;
    }
    setError(null);
    try {
      if (activeTab === 'payroll') {
        await finalizePayrollRunAction(id);
      } else {
        await finalizeTutorPayableRunAction(id);
      }
      setActionSuccess('Run finalized successfully');
      handleSelectRun(id);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to finalize run');
    }
  };

  const handleCancelRun = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this draft run?')) return;
    setError(null);
    try {
      if (activeTab === 'payroll') {
        await cancelPayrollRunAction(id);
      } else {
        await cancelTutorPayableRunAction(id);
      }
      setActionSuccess('Run cancelled successfully');
      setSelectedRun(null);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel run');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTargetItem) return;
    setError(null);
    try {
      if (paymentTargetItem.type === 'payroll') {
        await recordPayrollPaymentAction(paymentTargetItem.id, paymentForm);
      } else {
        await recordTutorPayablePaymentAction(paymentTargetItem.id, paymentForm);
      }
      setActionSuccess('Payment recorded successfully');
      setIsPaymentModalOpen(false);
      setPaymentForm({ paymentReference: '', paymentNotes: '' });
      if (selectedRun?.id) {
        handleSelectRun(selectedRun.id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to record payment');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Payroll & Financial Calculation Engine
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Manage employee payroll cycles (INR) and tutor teaching payables (AED) with audit-grade snapshots.
          </p>
        </div>

        <div>
          {activeTab === 'payroll' && canManagePayroll && (
            <Button onClick={() => setIsCreateModalOpen(true)}>Generate Payroll Run</Button>
          )}
          {activeTab === 'tutorPayable' && canManageTutorPayable && (
            <Button onClick={() => setIsCreateModalOpen(true)}>Generate Tutor Payables</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800">
        <button
          onClick={() => setActiveTab('payroll')}
          className={`py-3 px-6 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'payroll'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-700'
          }`}
        >
          Employee Payroll (INR)
        </button>
        <button
          onClick={() => setActiveTab('tutorPayable')}
          className={`py-3 px-6 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'tutorPayable'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-700'
          }`}
        >
          Tutor Payables (AED)
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm">
          {actionSuccess}
        </div>
      )}

      {/* Grid: Run List & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Runs List */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {activeTab === 'payroll' ? 'Payroll Cycles' : 'Tutor Payable Runs'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 text-center text-sm text-neutral-500">Loading runs...</div>
              ) : (activeTab === 'payroll' ? payrollRuns : tutorRuns).length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500">No runs found.</div>
              ) : (
                <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {(activeTab === 'payroll' ? payrollRuns : tutorRuns).map((run) => (
                    <div
                      key={run.id}
                      onClick={() => handleSelectRun(run.id)}
                      className={`p-4 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors ${
                        selectedRun?.id === run.id ? 'bg-neutral-100 dark:bg-neutral-800' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
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

                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        Period: {run.periodStart} → {run.periodEnd}
                      </div>

                      <div className="flex justify-between items-center text-xs mt-2 text-neutral-600 dark:text-neutral-300">
                        {activeTab === 'payroll' ? (
                          <>
                            <span>{run.employeeCount} Employees</span>
                            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                              ₹{Number(run.totalNet).toLocaleString()}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>
                              {run.classCount} Classes ({Number(run.totalHours)}h)
                            </span>
                            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
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

        {/* Right Column: Run Details & Line Items */}
        <div className="lg:col-span-2">
          {detailsLoading ? (
            <Card>
              <CardContent className="p-12 text-center text-neutral-500">Loading run details...</CardContent>
            </Card>
          ) : selectedRun ? (
            <div className="space-y-6">
              {/* Run Summary Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-3">
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
                    <p className="text-xs text-neutral-500 mt-1">
                      Period: {selectedRun.periodStart} to {selectedRun.periodEnd} • Currency: {selectedRun.currency}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {selectedRun.status === 'DRAFT' && (
                      <>
                        {activeTab === 'payroll' && canFinalizePayroll && (
                          <Button size="sm" onClick={() => handleFinalizeRun(selectedRun.id)}>
                            Finalize Run
                          </Button>
                        )}
                        {activeTab === 'tutorPayable' && canFinalizeTutorPayable && (
                          <Button size="sm" onClick={() => handleFinalizeRun(selectedRun.id)}>
                            Finalize Run
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleCancelRun(selectedRun.id)}>
                          Cancel Run
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-t border-neutral-100 dark:border-neutral-800 text-sm">
                    {activeTab === 'payroll' ? (
                      <>
                        <div>
                          <span className="text-xs text-neutral-500">Total Gross</span>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                            ₹{Number(selectedRun.totalGross).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500">Deductions</span>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                            ₹{Number(selectedRun.totalDeductions).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500">Total Net</span>
                          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                            ₹{Number(selectedRun.totalNet).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500">Employees</span>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {selectedRun.employeeCount}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-xs text-neutral-500">Total Amount</span>
                          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                            AED {Number(selectedRun.totalAmount).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500">Total Teaching Hours</span>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {Number(selectedRun.totalHours)}h
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500">Classes Verified</span>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {selectedRun.classCount}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500">Distinct Tutors</span>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
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
                <CardHeader>
                  <CardTitle className="text-base">Itemized Calculation Records</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-500 uppercase">
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
                        <th className="py-3 px-4">Payment</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {selectedRun.items?.map((item: any) => (
                        <tr key={item.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20">
                          {activeTab === 'payroll' ? (
                            <>
                              <td className="py-3 px-4">
                                <div className="font-medium text-neutral-900 dark:text-neutral-100">
                                  {item.employee?.firstName} {item.employee?.lastName}
                                </div>
                                <div className="text-xs text-neutral-500">{item.employee?.businessId}</div>
                              </td>
                              <td className="py-3 px-4">₹{Number(item.baseSalary).toLocaleString()}</td>
                              <td className="py-3 px-4 font-semibold text-emerald-600">
                                ₹{Number(item.netAmount).toLocaleString()}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-3 px-4">
                                <div className="font-medium text-neutral-900 dark:text-neutral-100">
                                  {item.tutor?.employee?.firstName} {item.tutor?.employee?.lastName}
                                </div>
                                <div className="text-xs text-neutral-500">{item.tutor?.employee?.businessId}</div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-medium text-neutral-900 dark:text-neutral-100">
                                  {item.classRecord?.businessId}
                                </div>
                                <div className="text-xs text-neutral-500">
                                  {new Date(item.classDate).toLocaleDateString()}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div>AED {Number(item.hourlyRate)}/h</div>
                                <div className="text-xs text-neutral-500">
                                  {(item.workedMinutes / 60).toFixed(1)} hrs ({item.workedMinutes}m)
                                </div>
                              </td>
                              <td className="py-3 px-4 font-semibold text-emerald-600">
                                AED {Number(item.amount).toLocaleString()}
                              </td>
                            </>
                          )}
                          <td className="py-3 px-4">
                            <Badge variant={item.paymentStatus === 'PAID' ? 'success' : 'default'}>
                              {item.paymentStatus}
                            </Badge>
                            {item.paymentReference && (
                              <div className="text-xs text-neutral-500 mt-1">Ref: {item.paymentReference}</div>
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
            <Card>
              <CardContent className="p-12 text-center text-neutral-500">
                Select a run from the list to view calculation details and line items.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal: Generate Run */}
      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
        >
          <div className="p-6">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">
              {activeTab === 'payroll' ? 'Generate Employee Payroll Cycle' : 'Generate Tutor Payable Batch'}
            </h3>
            <form onSubmit={handleCreateRun} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Period Start Date (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    required
                    value={createForm.periodStart}
                    onChange={(e) => setCreateForm({ ...createForm, periodStart: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md text-sm dark:bg-neutral-800 dark:border-neutral-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Period End Date (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    required
                    value={createForm.periodEnd}
                    onChange={(e) => setCreateForm({ ...createForm, periodEnd: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md text-sm dark:bg-neutral-800 dark:border-neutral-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="e.g. October monthly cycle"
                  className="w-full px-3 py-2 border rounded-md text-sm dark:bg-neutral-800 dark:border-neutral-700"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Run Calculation</Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Modal: Record Payment */}
      {isPaymentModalOpen && (
        <Modal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
        >
          <div className="p-6">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">
              Record Manual Payment Confirmation
            </h3>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Transaction Reference / UTR
                </label>
                <input
                  type="text"
                  placeholder="e.g. UTR-123456789 or Check #402"
                  value={paymentForm.paymentReference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm dark:bg-neutral-800 dark:border-neutral-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Payment Confirmation Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Processed via corporate banking portal"
                  value={paymentForm.paymentNotes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentNotes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm dark:bg-neutral-800 dark:border-neutral-700"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Confirm Payment Recorded</Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
