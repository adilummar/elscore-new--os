"use client";

import * as React from 'react';
import { getLeadStatusHistoryAction } from '../../actions';
import { ArrowRight, RefreshCcw, User } from 'lucide-react';

function statusColor(status: string) {
  const map: Record<string, string> = {
    NEW: 'bg-blue-100 text-blue-700',
    CONTACTED: 'bg-yellow-100 text-yellow-700',
    INTERESTED: 'bg-green-100 text-green-700',
    NOT_INTERESTED: 'bg-red-100 text-red-700',
    DEMO_SCHEDULED: 'bg-purple-100 text-purple-700',
    DEMO_DONE: 'bg-indigo-100 text-indigo-700',
    CONVERTED: 'bg-emerald-100 text-emerald-700',
    LOST: 'bg-gray-100 text-gray-600',
    JUNK: 'bg-red-100 text-red-500',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${statusColor(status)}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function LeadStatusHistory({ leadId }: { leadId: string }) {
  const [history, setHistory] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        const res = await getLeadStatusHistoryAction(leadId);
        // res is the array directly (API returns array, fetchApi unwraps data envelope if present)
        const data = Array.isArray(res) ? res : (res?.data ?? res ?? []);
        setHistory(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leadId]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <RefreshCcw className="w-4 h-4 text-orange-500" />
        <h3 className="text-base font-semibold text-slate-800">Status Change History</h3>
        {!loading && (
          <span className="ml-auto text-xs text-slate-400">{history.length} change{history.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {loading ? (
          <div className="px-5 py-6 text-sm text-slate-400 text-center">Loading...</div>
        ) : error ? (
          <div className="px-5 py-6 text-sm text-red-500 text-center">{error}</div>
        ) : history.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-400 text-center">No status changes yet.</div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="px-5 py-4">
              {/* Status transition */}
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <StatusBadge status={item.oldStatus} />
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <StatusBadge status={item.newStatus} />
              </div>

              {/* Reason */}
              {item.reason && (
                <div className="mt-1 text-sm text-slate-700">
                  <span className="font-medium text-slate-500">Reason: </span>
                  {item.reason}
                </div>
              )}

              {/* Note */}
              {item.note && (
                <div className="mt-1 text-sm text-slate-600 bg-slate-50 rounded px-3 py-1.5 border border-slate-100">
                  {item.note}
                </div>
              )}

              {/* Footer */}
              <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <User className="w-3 h-3" />
                <span>{item.changedBy}</span>
                <span className="mx-1">·</span>
                <span>{new Date(item.changedAt).toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
