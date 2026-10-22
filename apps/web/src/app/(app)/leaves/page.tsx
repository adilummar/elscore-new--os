'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Filter,
  Check,
  X,
  FileText,
} from 'lucide-react';
import { usePermissions } from '@/components/providers/AuthProvider';
import {
  getMyLeaveRequestsAction,
  getAllLeaveRequestsAction,
  createLeaveRequestAction,
  reviewLeaveRequestAction,
  cancelLeaveRequestAction,
  LeaveRequest,
} from './actions';

export default function LeavesPage() {
  const { hasPermission } = usePermissions();
  const canManageLeaves = hasPermission('leave.manage') || hasPermission('role.manage');
  const canReadAllLeaves = hasPermission('leave.read.all') || canManageLeaves;

  const [activeTab, setActiveTab] = useState<'my' | 'all'>('my');
  const [myLeaves, setMyLeaves] = useState<LeaveRequest[]>([]);
  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Submit Modal
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<'CASUAL' | 'SICK' | 'UNPAID' | 'OTHER'>('CASUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Review Modal
  const [reviewingRequest, setReviewingRequest] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);
  const showToast = (message: string, type: 'success' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const myData = await getMyLeaveRequestsAction();
      setMyLeaves(myData);

      if (canReadAllLeaves) {
        const allData = await getAllLeaveRequestsAction(statusFilter);
        setAllLeaves(allData);
      }
    } finally {
      setLoading(false);
    }
  }, [canReadAllLeaves, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setSubmitError('Both start date and end date are required.');
      return;
    }
    if (startDate > endDate) {
      setSubmitError('Start date cannot be after end date.');
      return;
    }
    if (!reason.trim()) {
      setSubmitError('Please provide a reason for the leave.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    const res = await createLeaveRequestAction({
      leaveType,
      startDate,
      endDate,
      reason: reason.trim(),
    });
    setIsSubmitting(false);

    if (!res.success) {
      setSubmitError(res.error || 'Failed to submit leave request');
      return;
    }

    showToast('Leave request submitted successfully!', 'success');
    setIsSubmitModalOpen(false);
    setReason('');
    setStartDate('');
    setEndDate('');
    loadData();
  };

  const handleCancelLeave = async (requestId: string) => {
    if (!confirm('Are you sure you want to cancel this pending leave request?')) return;
    const res = await cancelLeaveRequestAction(requestId);
    if (!res.success) {
      showToast(res.error || 'Failed to cancel leave request', 'warning');
      return;
    }
    showToast('Leave request cancelled', 'success');
    loadData();
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingRequest) return;
    setIsReviewing(true);
    setReviewError('');

    const res = await reviewLeaveRequestAction(reviewingRequest.id, reviewAction, reviewNote.trim() || undefined);
    setIsReviewing(false);

    if (!res.success) {
      setReviewError(res.error || 'Failed to review request');
      return;
    }

    showToast(
      `Leave request ${reviewAction === 'APPROVE' ? 'approved' : 'rejected'} successfully`,
      'success',
    );
    setReviewingRequest(null);
    setReviewNote('');
    loadData();
  };

  const openReviewModal = (req: LeaveRequest, action: 'APPROVE' | 'REJECT') => {
    setReviewingRequest(req);
    setReviewAction(action);
    setReviewNote('');
    setReviewError('');
  };

  const getStatusBadge = (status: LeaveRequest['status']) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle className="w-3 h-3" /> Approved
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3" /> Pending Review
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" /> Rejected
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm text-white font-medium flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-amber-600'
          }`}
        >
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            Leaves & Absence
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Submit leave requests, track approval status, and manage attendance restriction
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium text-text-secondary hover:bg-surface-muted transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              setIsSubmitModalOpen(true);
              setSubmitError('');
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Request Leave
          </button>
        </div>
      </div>

      {/* Tabs */}
      {canReadAllLeaves && (
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('my')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'my'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            My Requests ({myLeaves.length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'all'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            All Staff Leaves ({allLeaves.length})
          </button>
        </div>
      )}

      {/* Tab: My Requests */}
      {activeTab === 'my' && (
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center text-text-muted">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
              Loading requests...
            </div>
          ) : myLeaves.length === 0 ? (
            <div className="bg-white rounded-lg border border-border p-12 text-center text-text-muted space-y-3">
              <Calendar className="w-12 h-12 mx-auto text-slate-300" />
              <p className="font-semibold text-text-primary">No leave requests found</p>
              <p className="text-xs">You have not submitted any leave requests yet.</p>
              <button
                onClick={() => setIsSubmitModalOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90"
              >
                <Plus className="w-3.5 h-3.5" /> Submit Request
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myLeaves.map((req) => (
                <div
                  key={req.id}
                  className="bg-white rounded-lg border border-border p-4 shadow-card hover:shadow-floating transition-shadow space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-primary">
                        {req.leaveType} LEAVE
                      </span>
                      <p className="text-sm font-semibold text-text-primary mt-0.5">
                        {req.startDate} <span className="text-text-muted">to</span> {req.endDate}
                      </p>
                    </div>
                    {getStatusBadge(req.status)}
                  </div>

                  <p className="text-xs text-text-secondary bg-surface-muted/50 p-2.5 rounded-md italic">
                    &ldquo;{req.reason}&rdquo;
                  </p>

                  {req.reviewNote && (
                    <div className="text-xs p-2 rounded bg-slate-50 border border-slate-200 text-text-secondary">
                      <span className="font-semibold">Reviewer note:</span> {req.reviewNote}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-text-muted pt-2 border-t border-border">
                    <span>Applied {new Date(req.createdAt).toLocaleDateString()}</span>
                    {req.status === 'PENDING' && (
                      <button
                        onClick={() => handleCancelLeave(req.id)}
                        className="text-red-600 hover:text-red-700 font-semibold"
                      >
                        Cancel Request
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: All Staff Leaves (HR / Managers) */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-muted" />
            <span className="text-xs font-semibold text-text-secondary">Status:</span>
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  statusFilter === st
                    ? 'bg-primary text-white'
                    : 'bg-surface-muted text-text-secondary hover:bg-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-12 text-center text-text-muted">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
              Loading requests...
            </div>
          ) : allLeaves.length === 0 ? (
            <div className="bg-white rounded-lg border border-border p-12 text-center text-text-muted">
              <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-text-primary">No requests found</p>
              <p className="text-xs">No leave requests match the selected status filter.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-border overflow-hidden shadow-card">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-muted/60 border-b border-border text-text-secondary font-semibold uppercase tracking-wider">
                    <th className="p-3">Staff</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Inclusive Dates</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Status</th>
                    {canManageLeaves && <th className="p-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allLeaves.map((req) => (
                    <tr key={req.id} className="hover:bg-surface-muted/30 transition-colors">
                      <td className="p-3">
                        <p className="font-semibold text-text-primary">
                          {req.employee?.firstName} {req.employee?.lastName}
                        </p>
                        <p className="text-[11px] text-text-muted">{req.employee?.businessId}</p>
                      </td>
                      <td className="p-3 text-text-secondary">{req.employee?.department?.name ?? '-'}</td>
                      <td className="p-3 font-semibold text-text-primary">{req.leaveType}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-medium text-text-primary">{req.startDate}</span>
                        <span className="text-text-muted"> to </span>
                        <span className="font-medium text-text-primary">{req.endDate}</span>
                      </td>
                      <td className="p-3 max-w-xs text-text-secondary truncate" title={req.reason}>
                        {req.reason}
                        {req.reviewNote && (
                          <p className="text-[11px] text-text-muted mt-0.5">Note: {req.reviewNote}</p>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">{getStatusBadge(req.status)}</td>
                      {canManageLeaves && (
                        <td className="p-3 text-right whitespace-nowrap">
                          {req.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openReviewModal(req, 'APPROVE')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-sm transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => openReviewModal(req, 'REJECT')}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-sm transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-text-muted">Reviewed</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Request Leave Modal */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" aria-modal="true">
          <div className="bg-white rounded-lg shadow-modal max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Submit Leave Request
              </h3>
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Leave Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as any)}
                  className="w-full border border-border rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="CASUAL">Casual Leave</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                  <option value="OTHER">Other Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-border rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-border rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why you are requesting leave..."
                  className="w-full border border-border rounded-md p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {submitError && <p className="text-xs text-red-600">{submitError}</p>}

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:bg-surface-muted font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" aria-modal="true">
          <div className="bg-white rounded-lg shadow-modal max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text-primary">
                {reviewAction === 'APPROVE' ? 'Approve Leave Request' : 'Reject Leave Request'}
              </h3>
              <button
                onClick={() => setReviewingRequest(null)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-surface-muted/50 border border-border text-xs space-y-1">
              <p className="font-semibold text-text-primary">
                {reviewingRequest.employee?.firstName} {reviewingRequest.employee?.lastName} (
                {reviewingRequest.employee?.businessId})
              </p>
              <p className="text-text-muted">
                {reviewingRequest.leaveType} Leave: {reviewingRequest.startDate} to {reviewingRequest.endDate}
              </p>
              <p className="text-text-secondary italic">&ldquo;{reviewingRequest.reason}&rdquo;</p>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Review Note {reviewAction === 'REJECT' && <span className="text-text-muted">(Optional justification)</span>}
                </label>
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Optional note for the employee..."
                  className="w-full border border-border rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {reviewError && <p className="text-xs text-red-600">{reviewError}</p>}

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setReviewingRequest(null)}
                  className="px-3.5 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:bg-surface-muted font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReviewing}
                  className={`px-4 py-1.5 rounded-md text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm ${
                    reviewAction === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isReviewing
                    ? 'Processing...'
                    : reviewAction === 'APPROVE'
                    ? 'Confirm Approval'
                    : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
