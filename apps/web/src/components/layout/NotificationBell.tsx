"use client";

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, CheckCheck } from 'lucide-react';
import { usePermissions } from '@/components/providers/AuthProvider';
import {
  listMyNotifications, listOverdueEvaluationContext, markAllNotificationsRead, markNotificationRead,
} from '@/lib/api/notifications';
import { cn } from '@/lib/utils';

const POLL_MS = 60_000;
const EVAL_TYPE = 'TUTOR_EVALUATION_OVERDUE';

const dt = (v?: string | null) =>
  v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

function duration(mins: number): string {
  if (mins < 1) return 'less than a minute';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) { const d = Math.floor(h / 24); return `${d}d ${h % 24}h`; }
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function NotificationBell() {
  const { hasPermission } = usePermissions();
  const canSeeHiring = hasPermission('tutor_lead.read');
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<any[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [ctx, setCtx] = React.useState<Record<string, any>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    const r = await listMyNotifications();
    if (!r.ok) { setError(r.message); setLoaded(true); return; }
    setItems(r.data.items); setUnread(r.data.unread); setError(null); setLoaded(true);
    if (canSeeHiring && r.data.items.some((n) => n.type === EVAL_TYPE)) {
      const c = await listOverdueEvaluationContext();
      if (c.ok) setCtx(Object.fromEntries(c.data.filter((x) => x.notificationId).map((x) => [x.notificationId, x])));
    }
  }, [canSeeHiring]);

  React.useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const read = async (n: any) => {
    if (n.readAt) return;
    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    setUnread((u) => Math.max(0, u - 1));
    const r = await markNotificationRead(n.id);
    if (!r.ok) load();
  };
  const readAll = async () => { await markAllNotificationsRead(); load(); };

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative h-10 w-10 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-[18px] text-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications"
          className="fixed sm:absolute right-2 left-2 sm:left-auto top-16 sm:top-full sm:mt-2 sm:w-[26rem] max-h-[75vh] overflow-hidden flex flex-col rounded-lg border border-slate-200 bg-white shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
            <button type="button" onClick={readAll} disabled={unread === 0}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 disabled:text-slate-400">
              <CheckCheck className="w-3.5 h-3.5" aria-hidden />Mark all read
            </button>
          </div>
          <div className="overflow-y-auto">
            {error && <p role="alert" className="p-4 text-sm text-red-700">{error}</p>}
            {!error && loaded && items.length === 0 && <p className="p-6 text-center text-sm text-slate-500">You&apos;re all caught up.</p>}
            <ul className="divide-y divide-slate-100">
              {items.map((n) => {
                const c = ctx[n.id];
                const href = n.action || (n.entityType === 'TutorLead' && n.entityId ? `/tutor-hr/hiring/candidates/${n.entityId}` : null);
                const body = n.type === EVAL_TYPE && c ? (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <AlertTriangle className={cn('w-4 h-4', c.evaluationStatus === 'OVERDUE' ? 'text-red-600' : 'text-slate-400')} aria-hidden />
                      Overdue evaluation: {c.candidate.name ?? c.candidate.candidateId}
                    </p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-slate-600">
                      <dt className="text-slate-500">Candidate ID</dt><dd>{c.candidate.candidateId}</dd>
                      <dt className="text-slate-500">Demo</dt><dd>{dt(c.demoScheduledAt)}</dd>
                      <dt className="text-slate-500">Completed</dt><dd>{dt(c.demoCompletedAt)}</dd>
                      <dt className="text-slate-500">Manager</dt><dd className="break-all">{c.assignedManager}</dd>
                      <dt className="text-slate-500">Status</dt>
                      <dd className={c.evaluationStatus === 'OVERDUE' ? 'text-red-700 font-medium' : 'text-brand-700 font-medium'}>
                        {c.evaluationStatus === 'OVERDUE' ? 'Evaluation pending' : `Evaluated ${dt(c.evaluatedAt)}`}
                      </dd>
                      <dt className="text-slate-500">{c.evaluationStatus === 'OVERDUE' ? 'Overdue by' : 'Was overdue by'}</dt><dd>{duration(c.overdueMinutes)}</dd>
                      <dt className="text-slate-500">Notified</dt><dd>{dt(c.notifiedAt ?? n.createdAt)}</dd>
                    </dl>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-slate-900">{n.message}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{dt(n.createdAt)}</p>
                  </div>
                );
                const cls = cn('block px-4 py-3 hover:bg-slate-50', !n.readAt && 'bg-brand-50/40');
                return (
                  <li key={n.id} className="flex">
                    <span className={cn('mt-4 ml-3 h-2 w-2 rounded-full flex-shrink-0', n.readAt ? 'bg-transparent' : 'bg-brand-600')} aria-label={n.readAt ? 'Read' : 'Unread'} role="img" />
                    {href
                      ? <Link href={href} className={cn(cls, 'flex-1 min-w-0')} onClick={() => { read(n); setOpen(false); }}>{body}</Link>
                      : <button type="button" className={cn(cls, 'flex-1 min-w-0 text-left')} onClick={() => read(n)}>{body}</button>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
