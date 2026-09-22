'use client';

import { Calendar, Filter, Users, ExternalLink, Clock, Zap, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

import { getDistributionHistory } from '@/lib/api/round-robin';

const METHOD_STYLES: Record<string, { label: string; color: string }> = {
  ROUND_ROBIN:               { label: 'Round Robin',        color: 'bg-blue-100 text-blue-700' },
  SALES_HEAD_MANUAL:         { label: 'Manual (Head)',      color: 'bg-purple-100 text-purple-700' },
  COUNSELLOR_SELF_ASSIGNED:  { label: 'Self Assigned',      color: 'bg-green-100 text-green-700' },
  REFERRAL_SELF_ASSIGNED:    { label: 'Referral',           color: 'bg-teal-100 text-teal-700' },
  REOPEN_OWNER_RESTORED:     { label: 'Reopen Restored',    color: 'bg-orange-100 text-orange-700' },
  ROUND_ROBIN_PAUSED:        { label: 'RR Paused',          color: 'bg-rose-100 text-rose-700' },
};

export default function RoundRobinHistoryPage() {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState<string>('');
  const [cursor, setCursor] = useState<string | null>(null);

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setFetchError(null);
    getDistributionHistory({ date, method, cursor })
      .then(res => { if (active) { setData(res); setIsLoading(false); } })
      .catch(err => { if (active) { setFetchError(err?.message || 'Failed to load'); setIsLoading(false); } });
    return () => { active = false; };
  }, [date, method, cursor]);

  const events: any[] = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Lead Distribution History</h1>
        <p className="text-slate-500 text-sm mt-1">Chronological view of all daily lead assignments</p>
      </div>

      {/* Filter card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row gap-4">
        {/* Date */}
        <div className="flex-1 space-y-1">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5" /> Date (Asia/Kolkata)
          </label>
          <input
            type="date"
            className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            value={date}
            onChange={e => { setDate(e.target.value); setCursor(null); }}
          />
        </div>

        {/* Method */}
        <div className="flex-1 space-y-1">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" /> Assignment Method
          </label>
          <select
            className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white"
            value={method}
            onChange={e => { setMethod(e.target.value); setCursor(null); }}
          >
            <option value="">All Methods</option>
            <option value="ROUND_ROBIN">Round Robin</option>
            <option value="SALES_HEAD_MANUAL">Manual (Head)</option>
            <option value="COUNSELLOR_SELF_ASSIGNED">Self Assigned</option>
            <option value="REFERRAL_SELF_ASSIGNED">Referral</option>
            <option value="REOPEN_OWNER_RESTORED">Reopen Restored</option>
            <option value="ROUND_ROBIN_PAUSED">RR Paused</option>
          </select>
        </div>
      </div>

      {/* Summary strip */}
      {!isLoading && !fetchError && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Users className="w-4 h-4" />
          <span>
            {events.length === 0
              ? 'No events found'
              : `Showing ${events.length} event${events.length !== 1 ? 's' : ''}`}
            {method && ` · ${METHOD_STYLES[method]?.label ?? method}`}
          </span>
        </div>
      )}

      {/* Event list */}
      <div className="space-y-3">
        {isLoading && (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 bg-slate-100 rounded" />
                  <div className="h-3 w-1/4 bg-slate-100 rounded" />
                </div>
                <div className="h-3 w-24 bg-slate-100 rounded" />
              </div>
            </div>
          ))
        )}

        {fetchError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600 font-medium">{fetchError}</p>
          </div>
        )}

        {!isLoading && !fetchError && events.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium">No distribution events found</p>
            <p className="text-slate-400 text-sm mt-1">Try a different date or filter</p>
          </div>
        )}

        {events.map((event: any) => {
          const leadName = event.lead
            ? `${event.lead.firstName ?? ''} ${event.lead.lastName ?? ''}`.trim() || 'Unnamed Lead'
            : 'Deleted Lead';
          const assignedToName = event.newOwner
            ? event.newOwner.employee
              ? `${event.newOwner.employee.firstName} ${event.newOwner.employee.lastName}`
              : event.newOwner.email ?? 'Unknown User'
            : 'Unassigned';
          const methodStyle = METHOD_STYLES[event.assignmentMethod] ?? { label: event.assignmentMethod, color: 'bg-slate-100 text-slate-600' };
          const initials = assignedToName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

          return (
            <div
              key={event.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all p-4"
            >
              <div className="flex items-start gap-4">
                {/* Order badge */}
                <div className="shrink-0 w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-bold border border-brand-100">
                  #{event.dailyDistributionOrder}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {/* Lead name link */}
                    {event.lead ? (
                      <Link
                        href={`/leads/${event.leadId}`}
                        className="text-sm font-semibold text-slate-900 hover:text-brand-600 flex items-center gap-1 transition-colors"
                      >
                        {leadName}
                        <ExternalLink className="w-3 h-3 opacity-50" />
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-slate-400 italic">{leadName}</span>
                    )}

                    {/* Method badge */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${methodStyle.color}`}>
                      {methodStyle.label}
                    </span>

                    {/* Reassignment badge */}
                    {event.isReassignment && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        <RefreshCw className="w-2.5 h-2.5" /> Reassignment
                      </span>
                    )}
                  </div>

                  {/* RR debug row */}
                  {event.assignmentMethod === 'ROUND_ROBIN' && (
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] font-mono text-slate-400">
                      <span>Seq #{event.rrSequence}</span>
                      <span className="opacity-30">·</span>
                      <span>Pos {event.rrPosition}</span>
                      <span className="opacity-30">·</span>
                      <span>{event.eligibleMemberIds?.length ?? 0} eligible</span>
                    </div>
                  )}
                </div>

                {/* Right: assignee + time */}
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  {/* Assignee chip */}
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-bold">
                      {initials}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{assignedToName}</span>
                  </div>

                  {/* Time + latency */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(event.assignedAt).toLocaleTimeString()}</span>
                    {event.assignmentLatencyMs !== null && (
                      <>
                        <span className="opacity-30">·</span>
                        <span className="flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" />
                          {event.assignmentLatencyMs}ms
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {data?.pagination?.hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setCursor(data.pagination.nextCursor)}
            className="px-6 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shadow-sm transition-colors"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
