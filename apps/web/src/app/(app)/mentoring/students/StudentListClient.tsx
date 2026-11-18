"use client";

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../mentoring-client';
import { statusVariant } from '../labels';
import {
  CONSUMPTION_CHOICES, HubList, HubRow, ListFilters, SORT_CHOICES, STATUS_CHOICES, dateText, emptyListFilters, initialsOf, listQuery, rowHref,
} from '../student-hub-view';

const CELL = 'px-4 py-3 align-middle';
const FIELD = 'block text-xs font-medium text-slate-600';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

/** A toggle that reads as a filter chip: it is pressed or not, and says so to a screen reader. */
function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${FOCUS} ${pressed ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
    >
      {children}
    </button>
  );
}

/** The Mentor Portal Students list. Every figure and every row comes from the API, scoped to the people the signed-in user may see. */
export function StudentListClient({ title = 'Students', initialFilters, fixedStatus }: { title?: string; initialFilters?: ListFilters; fixedStatus?: string }) {
  const [f, setF] = React.useState<ListFilters>({ ...(initialFilters ?? emptyListFilters()), ...(fixedStatus ? { status: fixedStatus } : {}) });
  const [typed, setTyped] = React.useState(f.search);
  const [data, setData] = React.useState<HubList | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reload, setReload] = React.useState(0);
  const [more, setMore] = React.useState(!!(initialFilters?.consumption || initialFilters?.mentorUserId));

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
  const hasMentors = !!options && options.mentors.length > 0;
  const hiddenActive = (f.consumption ? 1 : 0) + (f.mentorUserId ? 1 : 0);
  const clear = () => { setTyped(''); setF({ ...emptyListFilters(), ...(fixedStatus ? { status: fixedStatus } : {}) }); };

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-testid="students-list">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="max-w-2xl text-sm text-slate-600">Open a student to see their classes, exams, parent meetings and hours for this month in the Student Workspace.</p>
        </div>
        <p className="text-sm text-slate-600" aria-live="polite" data-testid="students-count">{data ? `${data.total} ${data.total === 1 ? 'student' : 'students'}${filtering ? ' match' : ''}` : 'Loading students'}</p>
      </header>

      <section role="search" aria-label="Filter students" className="space-y-3 rounded-xl bg-white p-3 shadow-card ring-1 ring-slate-200/70">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[16rem] flex-1">
            <span className={FIELD}>Search</span>
            <span className="relative mt-1 block">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-600" aria-hidden="true" />
              <Input aria-label="Search by name or student ID" placeholder="Search by name or student ID" value={typed} onChange={(e) => setTyped(e.target.value)} className="pl-8" />
            </span>
          </label>
          <label className="w-full sm:w-40">
            <span className={FIELD}>Grade</span>
            <Select aria-label="Grade" value={f.grade} onChange={(e) => set({ grade: e.target.value })} className="mt-1">
              <option value="">All grades</option>
              {options?.grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </label>
          <label className="w-full sm:w-44">
            <span className={FIELD}>Subject</span>
            <Select aria-label="Subject" value={f.subjectId} onChange={(e) => set({ subjectId: e.target.value })} className="mt-1">
              <option value="">All subjects</option>
              {options?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </label>
          {!fixedStatus && (
            <label className="w-full sm:w-52">
              <span className={FIELD}>Status</span>
              <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="mt-1">
                <option value="">Active and in activation</option>
                {STATUS_CHOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <Chip pressed={f.pendingVerification} onClick={() => set({ pendingVerification: !f.pendingVerification })}>Classes waiting for my verification</Chip>
          <Chip pressed={f.upcomingExam} onClick={() => set({ upcomingExam: !f.upcomingExam })}>Exam in the next two weeks</Chip>
          <button type="button" aria-expanded={more} aria-controls="more-student-filters" onClick={() => setMore((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 ${FOCUS}`}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />More filters{hiddenActive > 0 ? ` (${hiddenActive})` : ''}
          </button>
          <span className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <span>Sort</span>
              <Select aria-label="Sort by" value={f.sort} onChange={(e) => set({ sort: e.target.value })} className="w-auto">
                {SORT_CHOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </label>
            <Select aria-label="Sort direction" value={f.dir} onChange={(e) => set({ dir: e.target.value as 'asc' | 'desc' })} className="w-auto">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
            {filtering && <button type="button" onClick={clear} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-brand-700 hover:underline ${FOCUS}`}><X className="h-3.5 w-3.5" aria-hidden="true" />Clear filters</button>}
          </span>
        </div>

        {more && (
          <div id="more-student-filters" className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-3">
            <label>
              <span className={FIELD}>Class consumption</span>
              <Select aria-label="Class consumption" value={f.consumption} onChange={(e) => set({ consumption: e.target.value })} className="mt-1">
                <option value="">Any class consumption</option>
                {CONSUMPTION_CHOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </label>
            {hasMentors && (
              <label>
                <span className={FIELD}>Mentor</span>
                <Select aria-label="Mentor" value={f.mentorUserId} onChange={(e) => set({ mentorUserId: e.target.value })} className="mt-1">
                  <option value="">All Mentors</option>
                  {options!.mentors.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </Select>
              </label>
            )}
          </div>
        )}
      </section>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" className="font-medium underline" onClick={() => setReload((n) => n + 1)}>Try again</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl bg-white shadow-card ring-1 ring-slate-200/70">
        <table className="min-w-full text-sm" aria-busy={loading}>
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className={CELL}>Student</th><th scope="col" className={CELL}>Grade</th><th scope="col" className={CELL}>Tutors</th><th scope="col" className={CELL}>Mentor</th><th scope="col" className={CELL}>Activated</th><th scope="col" className={CELL}>Status</th><th scope="col" className={CELL}>Pending</th>
              <th scope="col" className={CELL}><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !data && Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={8} className="px-4 py-4"><div className="h-4 motion-safe:animate-pulse rounded bg-slate-100" /></td></tr>)}
            {data?.rows.map((r) => <Row key={r.activationId} r={r} />)}
            {data && data.rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-600" data-testid="students-empty">{filtering ? 'No students match these filters.' : 'No students are assigned to you yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <nav className="flex items-center gap-3 text-sm" aria-label="Pages">
        <button type="button" className={`rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 ${FOCUS}`} disabled={f.page <= 1 || loading} onClick={() => set({ page: f.page - 1 })}>Previous</button>
        <span className="text-slate-700">Page {data?.page ?? f.page} of {data?.pages ?? 1} · {data?.total ?? 0} students</span>
        <button type="button" className={`rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 ${FOCUS}`} disabled={!data || f.page >= data.pages || loading} onClick={() => set({ page: f.page + 1 })}>Next</button>
      </nav>
    </div>
  );
}

const NONE = <span className="text-slate-600">Not set</span>;

function Row({ r }: { r: HubRow }) {
  // The grade and the level said the same thing on most rows, so they share one cell: the level only appears when it adds something.
  const grade = r.grade ?? r.level;
  const level = r.grade && r.level && r.level !== r.grade ? r.level : null;
  return (
    <tr className="transition-colors hover:bg-slate-50" data-testid="student-row" data-id={r.activationId}>
      <td className={CELL}>
        <Link href={rowHref(r)} className={`flex items-center gap-3 rounded font-medium text-slate-900 hover:text-brand-700 ${FOCUS}`}>
          {r.photoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={r.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
            : <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{initialsOf(r.name)}</span>}
          <span>{r.name}<span className="block text-xs font-normal text-slate-600">{r.studentId ?? 'No student ID'}</span></span>
        </Link>
      </td>
      <td className={CELL}>{grade ?? NONE}{level && <span className="block text-xs text-slate-600">{level}</span>}</td>
      <td className={CELL}>{r.tutors.length ? r.tutors.join(', ') : <span className="text-slate-600">Not assigned</span>}</td>
      <td className={CELL}>{r.mentor.name ?? <span className="text-slate-600">Unallocated</span>}</td>
      <td className={CELL}>{r.activatedAt ? dateText(r.activatedAt) : <span className="text-slate-600">Not yet</span>}</td>
      <td className={CELL}><Badge variant={statusVariant(r.status)}>{r.statusLabel}</Badge></td>
      <td className={CELL}>
        {r.pending.total > 0
          ? <Badge variant="warning" title={`${r.pending.verification} to verify, ${r.pending.complaints} complaints, ${r.pending.tasks} tasks`}>{r.pending.total} pending</Badge>
          : <span className="text-slate-600">None</span>}
      </td>
      <td className={`${CELL} text-right`}>
        <Link href={rowHref(r)} aria-label={`Open ${r.name}`} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 ${FOCUS}`}>Open<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
      </td>
    </tr>
  );
}
