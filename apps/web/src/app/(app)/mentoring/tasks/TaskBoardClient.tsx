"use client";

import * as React from 'react';
import Link from 'next/link';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../mentoring-client';
import { PRIORITY_LABELS, fmt, pretty, statusVariant } from '../labels';
import { Banner, Empty, FIELD_LABEL, FOCUS, ListSkeleton, MUTED, PANEL, PageHeader, StatusChip, chipTone } from '../mentoring-ui';

export function TaskBoardClient() {
  const [scope, setScope] = React.useState('assigned');
  const [status, setStatus] = React.useState('');
  const [tasks, setTasks] = React.useState<any[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTasks(null);
    const q = new URLSearchParams({ scope });
    if (status) q.set('status', status);
    mentoringApi(`/mentoring/tasks?${q}`).then((d) => { setTasks(d); setError(null); }).catch((e) => setError(e.message));
  }, [scope, status]);

  const overdue = (t: any) => t.dueAt && new Date(t.dueAt) < new Date() && !['VERIFIED', 'CANCELLED', 'SUBMITTED'].includes(t.status);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Pending actions" subtitle="Tasks given to you or by you, with their status and due date." />
      <div className="flex flex-wrap gap-3">
        <label className="text-sm"><span className={FIELD_LABEL}>Show</span>
          <Select className="w-52" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="assigned">Assigned to me</option><option value="created">Assigned by me</option><option value="all">All (Mentoring Head)</option>
          </Select></label>
        <label className="text-sm"><span className={FIELD_LABEL}>Status</span>
          <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'SUBMITTED', 'RETURNED', 'VERIFIED', 'CANCELLED'].map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
          </Select></label>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      {!tasks && !error && <ListSkeleton rows={4} label="Loading the tasks" />}
      {tasks && tasks.length === 0 && <Empty title="No tasks here">Change the filters above to see other tasks.</Empty>}
      {tasks && tasks.length > 0 && (
        <ul className={`${PANEL} divide-y divide-slate-100 text-sm`} aria-label="Tasks">
          {tasks.map((t) => (
            <li key={t.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 ${overdue(t) ? 'shadow-[inset_3px_0_0_0_#dc2626]' : ''}`}>
              <Link href={`/mentoring/students/${t.activationId}`} className={`rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>{t.title}</Link>
              <span className={MUTED}>{t.studentName} ({t.studentBusinessId})</span>
              <StatusChip tone={chipTone(statusVariant(t.status))}>{pretty(t.status)}</StatusChip>
              <StatusChip tone="neutral">{PRIORITY_LABELS[t.priority] ?? pretty(t.priority)}</StatusChip>
              {t.dueAt && <span className={`text-xs ${overdue(t) ? 'font-semibold text-red-800' : MUTED}`}>Due {fmt(t.dueAt)}{overdue(t) ? ', overdue' : ''}</span>}
              {t.returnReason && <span className="text-xs text-red-800">Returned: {t.returnReason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
