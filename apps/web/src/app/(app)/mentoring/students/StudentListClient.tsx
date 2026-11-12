"use client";

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../mentoring-client';
import { ACTIVATION_LABELS, fmt, pretty, statusVariant } from '../labels';

export function StudentListClient({ title, fixedStatus, initialStatus = '' }: { title: string; fixedStatus?: string; initialStatus?: string }) {
  const [status, setStatus] = React.useState(fixedStatus ?? initialStatus);
  const [stage, setStage] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (status) q.set('status', status);
    if (stage) q.set('stage', stage);
    if (search.trim()) q.set('search', search.trim());
    let live = true;
    mentoringApi(`/mentoring/students?${q}`)
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [status, stage, search, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <div className="flex flex-wrap gap-3">
        <div className="w-64"><Input placeholder="Search name or student ID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        {!fixedStatus && (
          <Select className="w-56" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {Object.entries(ACTIVATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}
        <Select className="w-40" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}>
          <option value="">All stages</option>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>Stage {n}</option>)}
        </Select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Student</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Progress</th><th className="px-3 py-2">Mentor</th><th className="px-3 py-2">Enrolled</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r: any) => (
              <tr key={r.activationId} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <Link href={`/mentoring/students/${r.activationId}`} className="font-medium text-brand-700 hover:underline">{r.studentName}</Link>
                  <div className="text-xs text-slate-500">{r.studentBusinessId}</div>
                </td>
                <td className="px-3 py-2"><Badge variant={statusVariant(r.status)}>{pretty(r.status)}</Badge></td>
                <td className="px-3 py-2">Stage {r.currentStage} · {pretty(r.currentStageStatus)}</td>
                <td className="px-3 py-2">{r.completedStages}/7</td>
                <td className="px-3 py-2">{r.mentorName ?? <span className="text-slate-400">Unallocated</span>}</td>
                <td className="px-3 py-2">{fmt(r.enrolledAt)}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No students found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages} · {data?.total ?? 0} students</span>
        <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
