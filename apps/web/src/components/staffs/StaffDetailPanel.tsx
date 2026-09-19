'use client';

import React, { useEffect, useRef } from 'react';
import { X, Clock, Coffee, CheckCircle, AlertCircle, Calendar, Briefcase } from 'lucide-react';
import type { StaffDetail } from '@/app/(app)/staffs/actions';

interface Props {
  staff: StaffDetail | null;
  onClose: () => void;
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

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">Absent</span>;
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    ON_BREAK: 'bg-amber-100 text-amber-700',
    COMPLETED: 'bg-blue-100 text-blue-700',
  };
  const label: Record<string, string> = { ACTIVE: 'Working', ON_BREAK: 'On Break', COMPLETED: 'Checked Out' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>{label[status] ?? status}</span>;
}

export function StaffDetailPanel({ staff, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!staff) return null;

  const fullName = `${staff.firstName} ${staff.lastName}`;
  const todaySession = staff.todaySession;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div
        ref={ref}
        className="relative z-10 w-full max-w-lg bg-white shadow-modal flex flex-col h-full overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border sticky top-0 bg-white">
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

        {/* Today's Status */}
        <div className="p-6 border-b border-border">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Today&apos;s Status</h3>
          {todaySession ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Status</span>
                <StatusBadge status={todaySession.status} />
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
              <p className="text-sm">No attendance recorded today</p>
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Last 14 Days</h3>
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
            <p className="text-sm text-text-muted text-center py-4">No recent sessions found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
