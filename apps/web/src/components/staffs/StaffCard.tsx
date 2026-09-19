'use client';

import React from 'react';
import { Clock, Coffee, AlertCircle, Briefcase, ChevronRight } from 'lucide-react';
import type { StaffSummary } from '@/app/(app)/staffs/actions';

function fmt(mins: number) {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtTime(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_CONFIG = {
  ACTIVE: { label: 'Working', bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  ON_BREAK: { label: 'On Break', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  COMPLETED: { label: 'Checked Out', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
};

interface Props {
  staff: StaffSummary;
  onClick: () => void;
}

export function StaffCard({ staff, onClick }: Props) {
  const session = staff.todaySession;
  const status = session?.status as keyof typeof STATUS_CONFIG | null;
  const cfg = status ? STATUS_CONFIG[status] : null;
  const checkInTime = fmtTime(session?.checkInTime ?? null);
  const initials = `${staff.firstName[0]}${staff.lastName[0]}`;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg border border-border shadow-card hover:shadow-floating hover:border-primary/30 transition-all duration-200 p-4 group"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Avatar + name */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
              {initials}
            </div>
            {/* Live pulse dot for ACTIVE */}
            {status === 'ACTIVE' && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white">
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-text-primary truncate">
              {staff.firstName} {staff.lastName}
            </p>
            <p className="text-xs text-text-muted truncate">{staff.department?.name}</p>
          </div>
        </div>

        {/* Status badge + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          {cfg ? (
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              Absent
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
        </div>
      </div>

      {/* Today's task note */}
      {session?.note && (
        <div className="mt-3 flex items-start gap-2 p-2 rounded-md bg-blue-50/60 border border-blue-100">
          <Briefcase className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-800 line-clamp-2">{session.note}</p>
        </div>
      )}

      {/* Stats row */}
      {session && (
        <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
          {checkInTime && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              In {checkInTime}
            </span>
          )}
          {(session.netDurationMinutes ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-text-primary font-medium">{fmt(session.netDurationMinutes)}</span> worked
            </span>
          )}
          {(session.breakDurationMinutes ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Coffee className="w-3.5 h-3.5 text-amber-500" />
              {fmt(session.breakDurationMinutes)} break
            </span>
          )}
          {session.isLate && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertCircle className="w-3.5 h-3.5" />
              Late {session.lateMinutes}m
            </span>
          )}
        </div>
      )}

      {/* Roles */}
      {staff.roles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {staff.roles.slice(0, 2).map(r => (
            <span key={r.id} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{r.name}</span>
          ))}
          {staff.roles.length > 2 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">+{staff.roles.length - 2}</span>
          )}
        </div>
      )}
    </button>
  );
}
