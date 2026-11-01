"use client";

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../actions';
import { fmt, pretty, statusVariant } from '../labels';

export function TaskBoardClient() {
  const [scope, setScope] = React.useState('assigned');
  const [status, setStatus] = React.useState('');
  const [tasks, setTasks] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const q = new URLSearchParams({ scope });
    if (status) q.set('status', status);
    mentoringApi(`/mentoring/tasks?${q}`).then((d) => { setTasks(d); setError(null); }).catch((e) => setError(e.message));
  }, [scope, status]);

  const overdue = (t: any) => t.dueAt && new Date(t.dueAt) < new Date() && !['VERIFIED', 'CANCELLED', 'SUBMITTED'].includes(t.status);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
      <div className="flex gap-3">
        <Select className="w-52" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="assigned">Assigned to me</option><option value="created">Assigned by me</option><option value="all">All (Mentoring Head)</option>
        </Select>
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'SUBMITTED', 'RETURNED', 'VERIFIED', 'CANCELLED'].map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
        </Select>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
        {tasks.length === 0 && <p className="p-4 text-slate-500">No tasks.</p>}
        {tasks.map((t) => (
          <div key={t.id} className="p-3 flex flex-wrap items-center gap-3">
            <Link href={`/mentoring/students/${t.activationId}`} className="font-medium text-brand-700 hover:underline">{t.title}</Link>
            <span className="text-slate-500">{t.studentName} ({t.studentBusinessId})</span>
            <Badge variant={statusVariant(t.status)}>{pretty(t.status)}</Badge>
            <Badge>{t.priority}</Badge>
            {t.dueAt && <span className={`text-xs ${overdue(t) ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>Due {fmt(t.dueAt)}{overdue(t) ? ' · overdue' : ''}</span>}
            {t.returnReason && <span className="text-xs text-red-600">Returned: {t.returnReason}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
