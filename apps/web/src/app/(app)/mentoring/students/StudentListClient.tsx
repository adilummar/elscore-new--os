"use client";

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../mentoring-client';
import { statusVariant } from '../labels';
import {
  CONSUMPTION_CHOICES, HubList, HubRow, ListFilters, SORT_CHOICES, STATUS_CHOICES, dateText, emptyListFilters, initialsOf, listQuery, rowHref,
} from '../student-hub-view';

const CELL = 'px-3 py-2 align-top';

/** The Mentor Portal Students list. Every figure and every row comes from the API, scoped to the people the signed-in user may see. */
export function StudentListClient({ title = 'Students', initialFilters, fixedStatus }: { title?: string; initialFilters?: ListFilters; fixedStatus?: string }) {
  const [f, setF] = React.useState<ListFilters>({ ...(initialFilters ?? emptyListFilters()), ...(fixedStatus ? { status: fixedStatus } : {}) });
  const [typed, setTyped] = React.useState(f.search);
  const [data, setData] = React.useState<HubList | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reload, setReload] = React.useState(0);

  // Typing waits for a short pause before it asks the server again.
  React.useEffect(() => {
    const t = setTimeout(() => setF((cur) => (cur.search === typed ? cur : { ...cur, search: typed, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const query = listQuery(f);
  React.useEffect(() => {
    let live = true;
    setLoading(true);
    mentoringApi(`/mentoring/mentor-students?${query}`)
      .then((d: HubList) => { if (live) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (live) setError(e instanceof Error && e.message ? e.message : 'The students could not be loaded.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [query, reload]);

  const set = (patch: Partial<ListFilters>) => setF((cur) => ({ ...cur, ...patch, page: 'page' in patch ? (patch.page as number) : 1 }));
  const options = data?.options;
  const filtering = !!(f.search || f.grade || f.subjectId || (f.status && !fixedStatus) || f.consumption || f.pendingVerification || f.upcomingExam || f.mentorUserId);

  return (
    <div className="mx-auto max-w-7xl space-y-4" data-testid="students-list">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">Open a student to see their classes, exams, parent meetings and hours for this month in the Student Workspace.</p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filter students">
        <Input aria-label="Search by name or student ID" placeholder="Search by name or student ID" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <Select aria-label="Grade" value={f.grade} onChange={(e) => set({ grade: e.target.value })}>
          <option value="">All grades</option>
          {options?.grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
        <Select aria-label="Subject" value={f.subjectId} onChange={(e) => set({ subjectId: e.target.value })}>
          <option value="">All subjects</option>
          {options?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {!fixedStatus && <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">Active and in activation</option>
          {STATUS_CHOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>}
        <Select aria-label="Class consumption" value={f.consumption} onChange={(e) => set({ consumption: e.target.value })}>
          <option value="">Any class consumption</option>
          {CONSUMPTION_CHOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {options && options.mentors.length > 0 && (
          <Select aria-label="Mentor" value={f.mentorUserId} onChange={(e) => set({ mentorUserId: e.target.value })}>
            <option value="">All Mentors</option>
            {options.mentors.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </Select>
        )}
        <Select aria-label="Sort by" value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
          {SORT_CHOICES.map(([k, v]) => <option key={k} value={k}>Sort: {v}</option>)}
        </Select>
        <Select aria-label="Sort direction" value={f.dir} onChange={(e) => set({ dir: e.target.value as 'asc' | 'desc' })}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.pendingVerification} onChange={(e) => set({ pendingVerification: e.target.checked })} /> Classes waiting for my verification</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.upcomingExam} onChange={(e) => set({ upcomingExam: e.target.checked })} /> Exam in the next two weeks</label>
        {filtering && <button type="button" className="text-brand-700 hover:underline" onClick={() => { setTyped(''); setF({ ...emptyListFilters(), ...(fixedStatus ? { status: fixedStatus } : {}) }); }}>Clear filters</button>}
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" className="font-medium underline" onClick={() => setReload((n) => n + 1)}>Try again</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm" aria-busy={loading}>
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className={CELL}>Student</th><th className={CELL}>Grade / level</th><th className={CELL}>Tutors</th><th className={CELL}>Mentor</th><th className={CELL}>Activated</th><th className={CELL}>Status</th><th className={CELL}>Pending</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && Array.from({ length: 5 }).map((_, i) => <tr key={i} className="border-t border-slate-100"><td colSpan={7} className="px-3 py-4"><div className="h-4 animate-pulse rounded bg-slate-100" /></td></tr>)}
            {data?.rows.map((r) => <Row key={r.activationId} r={r} />)}
            {data && data.rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500" data-testid="students-empty">{filtering ? 'No students match these filters.' : 'No students are assigned to you yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <nav className="flex items-center gap-3 text-sm" aria-label="Pages">
        <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={f.page <= 1 || loading} onClick={() => set({ page: f.page - 1 })}>Previous</button>
        <span>Page {data?.page ?? f.page} of {data?.pages ?? 1} · {data?.total ?? 0} students</span>
        <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={!data || f.page >= data.pages || loading} onClick={() => set({ page: f.page + 1 })}>Next</button>
      </nav>
    </div>
  );
}

function Row({ r }: { r: HubRow }) {
  return (
    <tr className="border-t border-slate-100" data-testid="student-row" data-id={r.activationId}>
      <td className={CELL}>
        <Link href={rowHref(r)} className="flex items-center gap-2 font-medium text-brand-700 hover:underline">
          {r.photoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={r.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
            : <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">{initialsOf(r.name)}</span>}
          <span>{r.name}<span className="block text-xs font-normal text-slate-500">{r.studentId ?? 'n/a'}</span></span>
        </Link>
      </td>
      <td className={CELL}>{r.grade ?? <span className="text-slate-600">n/a</span>}{r.level && <span className="block text-xs text-slate-500">{r.level}</span>}</td>
      <td className={CELL}>{r.tutors.length ? r.tutors.join(', ') : <span className="text-slate-600">n/a</span>}</td>
      <td className={CELL}>{r.mentor.name ?? <span className="text-slate-600">Unallocated</span>}</td>
      <td className={CELL}>{r.activatedAt ? dateText(r.activatedAt) : <span className="text-slate-400">Not yet</span>}</td>
      <td className={CELL}><Badge variant={statusVariant(r.status)}>{r.statusLabel}</Badge></td>
      <td className={CELL}>
        {r.pending.total > 0
          ? <Badge variant="warning" title={`${r.pending.verification} to verify, ${r.pending.complaints} complaints, ${r.pending.tasks} tasks`}>{r.pending.total} pending</Badge>
          : <span className="text-slate-400">None</span>}
      </td>
    </tr>
  );
}
