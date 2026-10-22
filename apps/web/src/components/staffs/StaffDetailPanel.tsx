'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, Clock, Coffee, CheckCircle, AlertCircle, Calendar, Briefcase, Unlock } from 'lucide-react';
import type { StaffDetail } from '@/app/(app)/staffs/actions';
import { unlockAttendanceLeaveAction } from '@/app/(app)/staffs/actions';
import { usePermissions } from '@/components/providers/AuthProvider';

interface Props {
  staff: StaffDetail | null;
  onClose: () => void;
  onRefresh?: () => void;
}

function fmt(mins: number) {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtTime(ts: string | null) {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function StatusBadge({ status, isOnLeave }: { status: string | null; isOnLeave?: boolean }) {
  if (isOnLeave) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">On Leave</span>;
  }
  if (!status) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">Absent</span>;
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    ON_BREAK: 'bg-amber-100 text-amber-700',
    COMPLETED: 'bg-blue-100 text-blue-700',
  };
  const label: Record<string, string> = { ACTIVE: 'Working', ON_BREAK: 'On Break', COMPLETED: 'Checked Out' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>{label[status] ?? status}</span>;
}

export function StaffDetailPanel({ staff, onClose, onRefresh }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { hasPermission } = usePermissions();
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [unlockedSuccess, setUnlockedSuccess] = useState(false);

  const canUnlock = hasPermission('attendance.unlock.leave') || hasPermission('role.manage');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!staff) return null;

  const fullName = `${staff.firstName} ${staff.lastName}`;
  const todaySession = staff.todaySession;
  const isUnlocked = staff.isLeaveUnlocked || unlockedSuccess;

  const handleUnlock = async () => {
    if (!unlockReason.trim()) {
      setUnlockError('A mandatory reason is required to unlock check-in.');
      return;
    }
    setIsUnlocking(true);
    setUnlockError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await unlockAttendanceLeaveAction(
        staff.id,
        today,
        unlockReason.trim(),
        staff.todayLeave?.id,
      );
      if (!res.success) {
        setUnlockError(res.error || 'Failed to unlock');
        return;
      }
      setUnlockedSuccess(true);
      setIsUnlockModalOpen(false);
      setUnlockReason('');
      if (onRefresh) onRefresh();
    } catch (e: any) {
      setUnlockError(e.message || 'An unexpected error occurred');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        {/* Panel */}
        <div
          ref={ref}
          className="relative z-10 w-full max-w-lg bg-white shadow-modal flex flex-col h-full overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-border sticky top-0 bg-white z-20">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
                  {staff.firstName[0]}{staff.lastName[0]}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-text-primary">{fullName}</h2>
                  <p className="text-sm text-text-secondary">{staff.email}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="px-2 py-0.5 rounded text-xs bg-surface-muted text-text-secondary font-medium">{staff.businessId}</span>
                <span className="px-2 py-0.5 rounded text-xs bg-surface-muted text-text-secondary font-medium">{staff.department?.name}</span>
                {staff.roles.map(r => (
                  <span key={r.id} className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary font-medium">{r.name}</span>
                ))}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-surface-muted transition-colors text-text-secondary">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Leave Banner if on leave */}
          {staff.isOnLeave && (
            <div className="p-6 bg-purple-50/60 border-b border-purple-100">
              <div className="p-4 rounded-lg bg-white border border-purple-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> On Approved Leave
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                    {staff.todayLeave?.leaveType ?? 'LEAVE'}
                  </span>
                </div>
                <p className="text-xs text-purple-950 font-medium">
                  Inclusive Period: <span className="font-bold">{staff.todayLeave?.startDate}</span> to <span className="font-bold">{staff.todayLeave?.endDate}</span>
                </p>
                {staff.todayLeave?.reason && (
                  <p className="text-xs text-text-secondary italic">
                    &ldquo;{staff.todayLeave.reason}&rdquo;
                  </p>
                )}

                {isUnlocked ? (
                  <div className="mt-2 pt-2 border-t border-purple-100 flex items-center justify-between text-xs text-emerald-700 font-semibold">
                    <span className="flex items-center gap-1">
                      <Unlock className="w-3.5 h-3.5" /> Check-in unlocked for today
                    </span>
                    <span className="text-text-muted font-normal text-[11px] truncate max-w-[180px]">
                      {staff.todayUnlock?.reason || 'HR granted'}
                    </span>
                  </div>
                ) : canUnlock ? (
                  <div className="mt-2 pt-2 border-t border-purple-100 flex justify-end">
                    <button
                      onClick={() => setIsUnlockModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium transition-colors shadow-sm"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Unlock Check-in for Today
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Today's Attendance Status */}
          <div className="p-6 border-b border-border">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Today&apos;s Status</h3>
            {todaySession ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Status</span>
                  <StatusBadge status={todaySession.status} isOnLeave={staff.isOnLeave && !todaySession} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Check In</span>
                  <span className="text-sm font-medium text-text-primary">{fmtTime(todaySession.events?.find((e: any) => e.eventType === 'CHECK_IN')?.timestamp ?? null)}</span>
                </div>
                {(todaySession.status === 'COMPLETED') && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" />Check Out</span>
                    <span className="text-sm font-medium text-text-primary">{fmtTime(todaySession.events?.find((e: any) => e.eventType === 'CHECK_OUT' || e.eventType === 'AUTO_CHECK_OUT')?.timestamp ?? null)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Worked</span>
                  <span className="text-sm font-medium text-text-primary">{fmt(todaySession.netDurationMinutes ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary flex items-center gap-1.5"><Coffee className="w-3.5 h-3.5" />Break</span>
                  <span className="text-sm font-medium text-text-primary">{fmt(todaySession.breakDurationMinutes ?? 0)}</span>
                </div>
                {todaySession.isLate && (
                  <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-xs text-amber-700">Checked in late by {todaySession.lateMinutes} min</span>
                  </div>
                )}
                {todaySession.note && (
                  <div className="p-3 rounded-md bg-blue-50 border border-blue-100">
                    <p className="text-xs font-semibold text-blue-600 mb-1 flex items-center gap-1"><Briefcase className="w-3 h-3" /> Working On</p>
                    <p className="text-sm text-blue-800">{todaySession.note}</p>
                  </div>
                )}

                {/* Timeline */}
                {todaySession.events && todaySession.events.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Timeline</p>
                    <div className="space-y-1.5">
                      {todaySession.events.map((ev: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 text-xs">
                          <span className="text-text-muted w-14 shrink-0">{fmtTime(ev.timestamp)}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            ev.eventType === 'CHECK_IN' ? 'bg-emerald-100 text-emerald-700' :
                            ev.eventType.includes('BREAK_START') ? 'bg-amber-100 text-amber-700' :
                            ev.eventType.includes('BREAK_END') ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>{ev.eventType.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-text-muted">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {staff.isOnLeave ? 'Employee is on approved leave today' : 'No attendance recorded today'}
                </p>
              </div>
            )}
          </div>

          {/* Recent Attendance Sessions */}
          <div className="p-6 border-b border-border">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Last 14 Days Attendance</h3>
            {staff.recentSessions && staff.recentSessions.length > 0 ? (
              <div className="space-y-2">
                {staff.recentSessions.map((s: any) => {
                  const cin = s.events?.find((e: any) => e.eventType === 'CHECK_IN');
                  const cout = s.events?.find((e: any) => e.eventType === 'CHECK_OUT' || e.eventType === 'AUTO_CHECK_OUT');
                  return (
                    <div key={s.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{fmtDate(s.calendarDate)}</p>
                        <p className="text-xs text-text-muted">{fmtTime(cin?.timestamp)} → {fmtTime(cout?.timestamp)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-text-primary">{fmt(s.netDurationMinutes ?? 0)}</p>
                        {s.isLate && <p className="text-xs text-amber-600">Late {s.lateMinutes}m</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">No recent attendance sessions found.</p>
            )}
          </div>

          {/* Recent Leave Requests */}
          {staff.recentLeaves && staff.recentLeaves.length > 0 && (
            <div className="p-6">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Leave Records</h3>
              <div className="space-y-2.5">
                {staff.recentLeaves.map((l: any) => (
                  <div key={l.id} className="p-3 rounded-lg border border-border bg-surface-muted/30 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-text-primary">{l.leaveType}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        l.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                        l.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                        l.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{l.status}</span>
                    </div>
                    <p className="text-text-muted">{l.startDate} → {l.endDate}</p>
                    {l.reason && <p className="text-text-secondary italic">&ldquo;{l.reason}&rdquo;</p>}
                    {l.reviewNote && <p className="text-text-muted">Review Note: {l.reviewNote}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* HR Unlock Modal */}
      {isUnlockModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" aria-modal="true">
          <div className="bg-white rounded-lg shadow-modal max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Unlock className="w-5 h-5 text-purple-600" />
                Unlock Check-in for Today
              </h3>
              <button
                onClick={() => { setIsUnlockModalOpen(false); setUnlockReason(''); setUnlockError(''); }}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-text-secondary">
              This will permit <strong>{fullName}</strong> to check in today without modifying or cancelling their approved leave record.
            </p>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Mandatory Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                placeholder="Enter justification for unlocking check-in (e.g. Employee volunteered to cover emergency demo)..."
                className="w-full border border-border rounded-md p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={3}
              />
            </div>
            {unlockError && <p className="text-xs text-red-600">{unlockError}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => { setIsUnlockModalOpen(false); setUnlockReason(''); setUnlockError(''); }}
                className="px-3.5 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:bg-surface-muted font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUnlocking || !unlockReason.trim()}
                onClick={handleUnlock}
                className="px-4 py-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm"
              >
                {isUnlocking ? 'Unlocking...' : 'Confirm Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
