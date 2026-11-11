"use client";

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, CLASS_STATES, Card, DashFilters, DashRow, EXAM_STATES, GROUPS, MEETING_STATES, PERIODS, PRIORITIES, Records, SLA_STATES, Summary, attention, classCardHref, emptyFilters, filtersActive, hrefOf, pageText, queryOf,
} from '../dashboard-view';
import { mentoringApi } from '../mentoring-client';
import { dayLabel } from '../timetable-view';

const opt = (list: Array<[string, string]>) => list.map(([v, l]) => <option key={v} value={v}>{l}</option>);

export function FilterBar({ f, onChange, onClear }: { f: DashFilters; onChange: (f: DashFilters) => void; onClear: () => void }) {
  const set = (k: keyof DashFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...f, [k]: e.target.value });
  return (
    <section aria-label="Filters" className="space-y-2 rounded-md border border-slate-200 bg-white p-3" data-testid="dashboard-filters">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm"><span className="mb-1 block text-slate-700">Student name or student ID</span><Input value={f.studentQuery} onChange={set('studentQuery')} /></label>
        <label className="text-sm"><span className="mb-1 block text-slate-700">Period</span><Select value={f.period} onChange={set('period')}><option value="">Default window</option>{opt(PERIODS)}</Select></label>
        <label className="text-sm"><span className="mb-1 block text-slate-700">Around the date</span><Input type="date" value={f.date} onChange={set('date')} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm"><span className="mb-1 block text-slate-700">From</span><Input type="date" value={f.from} onChange={set('from')} /></label>
          <label className="text-sm"><span className="mb-1 block text-slate-700">To</span><Input type="date" value={f.to} onChange={set('to')} /></label>
        </div>
        <label className="text-sm"><span className="mb-1 block text-slate-700">Class status</span><Select value={f.classState} onChange={set('classState')}><option value="">Any</option>{opt(CLASS_STATES)}</Select></label>
        <label className="text-sm"><span className="mb-1 block text-slate-700">Exam status</span><Select value={f.examState} onChange={set('examState')}><option value="">Any</option>{opt(EXAM_STATES)}</Select></label>
        <label className="text-sm"><span className="mb-1 block text-slate-700">Meeting status</span><Select value={f.meetingState} onChange={set('meetingState')}><option value="">Any</option>{opt(MEETING_STATES)}</Select></label>
        <label className="text-sm"><span className="mb-1 block text-slate-700">Complaint category</span><Select value={f.complaintCategory} onChange={set('complaintCategory')}><option value="">Any</option>{opt(COMPLAINT_CATEGORIES)}</Select></label>
        <label className="text-sm"><span className="mb-1 block text-slate-700">Complaint status</span><Select value={f.complaintStatus} onChange={set('complaintStatus')}><option value="">Any</option>{opt(COMPLAINT_STATUSES)}</Select></label>
        <label className="text-sm"><span className="mb-1 block text-slate-700">Priority</span><Select value={f.priority} onChange={set('priority')}><option value="">Any</option>{opt(PRIORITIES)}</Select></label>
        <label className="text-sm"><span className="mb-1 block text-slate-700">Response time status</span><Select value={f.slaState} onChange={set('slaState')}><option value="">Any</option>{opt(SLA_STATES)}</Select></label>
      </div>
      {filtersActive(f) && <Button type="button" size="sm" variant="ghost" onClick={onClear}>Clear the filters</Button>}
    </section>
  );
}

export function CardGrid({ summary, selected, onOpen, filters }: { summary: Summary; selected: string | null; onOpen: (c: Card) => void; filters?: DashFilters }) {
  return (
    <div className="space-y-4" data-testid="card-grid">
      {GROUPS.map(([group, label]) => (
        <section key={group} aria-label={label}>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">{label}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {summary.cards.filter((c) => c.group === group).map((c) => {
              const href = filters ? classCardHref(c, summary, filters) : null;
              const body = (
                <>
                  <span className={`block text-2xl font-semibold ${c.count > 0 && attention(c.key) ? 'text-amber-700' : 'text-slate-900'}`}>{c.count}</span>
                  <span className="block text-xs text-slate-600">{c.label}</span>
                </>
              );
              // A daily class card opens the Daily classes page on the same dates, card and filters.
              if (href) return <Link key={c.key} href={href} data-testid="dash-card" data-key={c.key} data-count={c.count} data-href={href} className="rounded-md border border-slate-200 bg-white p-3 text-left hover:border-brand-500">{body}</Link>;
              return (
              <button key={c.key} type="button" onClick={() => onOpen(c)} aria-pressed={selected === c.key} data-testid="dash-card" data-key={c.key} data-count={c.count}
                className={`rounded-md border p-3 text-left ${selected === c.key ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-500'}`}>
                {body}
              </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function NotRecorded({ items }: { items: Summary['notRecorded'] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Not recorded yet" className="rounded-md border border-dashed border-slate-300 p-3" data-testid="not-recorded">
      <h2 className="text-sm font-semibold text-slate-900">Not recorded yet</h2>
      <ul className="mt-1 space-y-0.5 text-sm text-slate-600">{items.map((i) => <li key={i.label}><span className="font-medium text-slate-800">{i.label}:</span> {i.reason}</li>)}</ul>
    </section>
  );
}

export function RecordRow({ r }: { r: DashRow }) {
  const href = hrefOf(r);
  return (
    <tr className="border-t border-slate-100" data-testid="dash-row">
      <td className="px-2 py-1.5 text-slate-900">{r.studentName}{r.studentId ? <span className="ml-1 text-xs text-slate-500">{r.studentId}</span> : null}</td>
      <td className="px-2 py-1.5 text-slate-800">{r.title}</td>
      <td className="px-2 py-1.5 text-slate-700">{r.tutorName ?? ''}</td>
      <td className="px-2 py-1.5 text-slate-700">{r.date ? dayLabel(r.date) : ''}</td>
      <td className="px-2 py-1.5"><Badge variant={r.slaState === 'BREACHED' ? 'danger' : r.slaState === 'APPROACHING' ? 'warning' : 'default'}>{r.status}</Badge></td>
      <td className="px-2 py-1.5 text-right">{href ? <Link href={href} className="text-sm font-medium text-brand-700 hover:underline">Open</Link> : null}</td>
    </tr>
  );
}

export function RecordTable({ data, onPage }: { data: Records; onPage: (p: number) => void }) {
  return (
    <section aria-label={data.label} className="rounded-md border border-slate-200 bg-white" data-testid="record-table">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold text-slate-900">{data.label}</h2>
        <span className="text-xs text-slate-600" data-testid="page-text">{pageText(data)}</span>
      </div>
      {data.rows.length === 0 ? <p className="px-3 py-3 text-sm text-slate-500" data-testid="no-records">Nothing matches.</p> : (
        <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th className="px-2 py-1.5 font-medium">Student</th><th className="px-2 py-1.5 font-medium">Record</th><th className="px-2 py-1.5 font-medium">Tutor</th><th className="px-2 py-1.5 font-medium">Date</th><th className="px-2 py-1.5 font-medium">Status</th><th className="px-2 py-1.5" /></tr></thead>
          <tbody>{data.rows.map((r) => <RecordRow key={`${r.kind}-${r.id}`} r={r} />)}</tbody></table>
      )}
      {data.pages > 1 && (
        <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2">
          <Button type="button" size="sm" variant="outline" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Previous page</Button>
          <Button type="button" size="sm" variant="outline" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>Next page</Button>
          <span className="text-xs text-slate-600">Page {data.page} of {data.pages}</span>
        </div>
      )}
    </section>
  );
}

/** The Mentor dashboard: every card counted by the server, and each opened into the records it counted. */
export function DashboardClient({ initialCard }: { initialCard?: string } = {}) {
  const [filters, setFilters] = React.useState<DashFilters>(emptyFilters());
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [selected, setSelected] = React.useState<Card | null>(null);
  const [records, setRecords] = React.useState<Records | null>(null);
  const [page, setPage] = React.useState(1);
  const [error, setError] = React.useState<string | null>(null);
  const query = queryOf(filters);

  React.useEffect(() => {
    let live = true;
    mentoringApi(`/mentoring/dashboard${query}`).then((s: Summary) => { if (live) { setSummary(s); setError(null); } }).catch((e: unknown) => { if (live) setError(e instanceof Error && e.message ? e.message : 'The dashboard could not be loaded.'); });
    return () => { live = false; };
  }, [query]);
  React.useEffect(() => {
    if (summary && initialCard && !selected) {
      const c = summary.cards.find((x) => x.key === initialCard);
      if (c) setSelected(c);
    }
  }, [summary, initialCard]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { setPage(1); }, [query, selected?.key]);
  React.useEffect(() => {
    if (!selected) return;
    let live = true;
    mentoringApi(`/mentoring/dashboard/${selected.key}${queryOf(filters, { page, pageSize: 25 })}`).then((r: Records) => { if (live) setRecords(r); }).catch((e: unknown) => { if (live) setError(e instanceof Error && e.message ? e.message : 'The records could not be loaded.'); });
    return () => { live = false; };
  }, [selected, page, query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-6xl space-y-4" data-testid="mentor-dashboard">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Mentor dashboard</h1>
        <Link href="/mentoring/classes" className="text-sm font-medium text-brand-700 hover:underline" data-testid="daily-class-list-link">Open the daily class list</Link>
        {summary && <p className="text-sm text-slate-600">Today is {dayLabel(summary.today)}.{summary.window ? ` Showing ${dayLabel(summary.window.from)} to ${dayLabel(summary.window.to)}.` : ''} Each number is counted by the server for the students you may see.</p>}
      </header>
      <FilterBar f={filters} onChange={setFilters} onClear={() => setFilters(emptyFilters())} />
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!summary && !error && <p className="text-sm text-slate-500">Loading the dashboard</p>}
      {summary && <CardGrid summary={summary} selected={selected?.key ?? null} onOpen={(c) => { setRecords(null); setSelected(c); }} filters={filters} />}
      {selected && records && <RecordTable data={records} onPage={setPage} />}
      {summary && <NotRecorded items={summary.notRecorded} />}
    </div>
  );
}
