"use client";

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, CLASS_STATES, Card, DashFilters, DashRow, EXAM_STATES, GROUPS, MEETING_STATES, PERIODS, PRIORITIES, Records, SLA_STATES, Summary, attention, classCardHref, emptyFilters, filtersActive, hrefOf, pageText, queryOf,
} from '../dashboard-view';
import { mentoringApi } from '../mentoring-client';
import { Banner, FIELD_LABEL, ListSkeleton, MUTED, PANEL, PageHeader, StatusChip, TABLE, TABLE_WRAP, TD, TH, THEAD, TR, linkButton, FOCUS } from '../mentoring-ui';
import { dayLabel } from '../timetable-view';

const opt = (list: Array<[string, string]>) => list.map(([v, l]) => <option key={v} value={v}>{l}</option>);

export function FilterBar({ f, onChange, onClear }: { f: DashFilters; onChange: (f: DashFilters) => void; onClear: () => void }) {
  const set = (k: keyof DashFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...f, [k]: e.target.value });
  return (
    <section aria-label="Filters" className={`${PANEL} space-y-3 p-4`} data-testid="dashboard-filters">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm"><span className={FIELD_LABEL}>Student name or student ID</span><Input value={f.studentQuery} onChange={set('studentQuery')} /></label>
        <label className="text-sm"><span className={FIELD_LABEL}>Period</span><Select value={f.period} onChange={set('period')}><option value="">Default window</option>{opt(PERIODS)}</Select></label>
        <label className="text-sm"><span className={FIELD_LABEL}>Around the date</span><Input type="date" value={f.date} onChange={set('date')} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm"><span className={FIELD_LABEL}>From</span><Input type="date" value={f.from} onChange={set('from')} /></label>
          <label className="text-sm"><span className={FIELD_LABEL}>To</span><Input type="date" value={f.to} onChange={set('to')} /></label>
        </div>
        <label className="text-sm"><span className={FIELD_LABEL}>Class status</span><Select value={f.classState} onChange={set('classState')}><option value="">Any</option>{opt(CLASS_STATES)}</Select></label>
        <label className="text-sm"><span className={FIELD_LABEL}>Exam status</span><Select value={f.examState} onChange={set('examState')}><option value="">Any</option>{opt(EXAM_STATES)}</Select></label>
        <label className="text-sm"><span className={FIELD_LABEL}>Meeting status</span><Select value={f.meetingState} onChange={set('meetingState')}><option value="">Any</option>{opt(MEETING_STATES)}</Select></label>
        <label className="text-sm"><span className={FIELD_LABEL}>Complaint category</span><Select value={f.complaintCategory} onChange={set('complaintCategory')}><option value="">Any</option>{opt(COMPLAINT_CATEGORIES)}</Select></label>
        <label className="text-sm"><span className={FIELD_LABEL}>Complaint status</span><Select value={f.complaintStatus} onChange={set('complaintStatus')}><option value="">Any</option>{opt(COMPLAINT_STATUSES)}</Select></label>
        <label className="text-sm"><span className={FIELD_LABEL}>Priority</span><Select value={f.priority} onChange={set('priority')}><option value="">Any</option>{opt(PRIORITIES)}</Select></label>
        <label className="text-sm"><span className={FIELD_LABEL}>Response time status</span><Select value={f.slaState} onChange={set('slaState')}><option value="">Any</option>{opt(SLA_STATES)}</Select></label>
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
          <h2 className="mb-2 text-base font-semibold text-slate-900">{label}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {summary.cards.filter((c) => c.group === group).map((c) => {
              const href = filters ? classCardHref(c, summary, filters) : null;
              const body = (
                <>
                  <span className={`block text-2xl font-semibold ${c.count > 0 && attention(c.key) ? 'text-amber-700' : 'text-slate-900'}`}>{c.count}</span>
                  <span className="mt-1 block text-sm text-slate-700">{c.label}</span>
                </>
              );
              // A daily class card opens the Daily classes page on the same dates, card and filters.
              if (href) return <Link key={c.key} href={href} data-testid="dash-card" data-key={c.key} data-count={c.count} data-href={href} className={`${PANEL} block p-3 text-left transition-shadow hover:shadow-floating ${FOCUS}`}>{body}</Link>;
              return (
              <button key={c.key} type="button" onClick={() => onOpen(c)} aria-pressed={selected === c.key} data-testid="dash-card" data-key={c.key} data-count={c.count}
                className={`${PANEL} p-3 text-left transition-shadow hover:shadow-floating ${FOCUS} ${selected === c.key ? '!bg-brand-50 !ring-2 !ring-brand-600' : ''}`}>
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
    <section aria-label="Not recorded yet" className="rounded-lg border border-dashed border-slate-300 p-4" data-testid="not-recorded">
      <h2 className="text-base font-semibold text-slate-900">Not recorded yet</h2>
      <ul className="mt-1 space-y-0.5 text-sm text-slate-700">{items.map((i) => <li key={i.label}><span className="font-medium text-slate-800">{i.label}:</span> {i.reason}</li>)}</ul>
    </section>
  );
}

export function RecordRow({ r }: { r: DashRow }) {
  const href = hrefOf(r);
  return (
    <tr className={TR} data-testid="dash-row">
      <td className={`${TD} text-slate-900`}>{r.studentName}{r.studentId ? <span className="ml-1 text-xs text-slate-600">{r.studentId}</span> : null}</td>
      <td className={`${TD} text-slate-800`}>{r.title}</td>
      <td className={`${TD} text-slate-700`}>{r.tutorName ?? ''}</td>
      <td className={`${TD} text-slate-700`}>{r.date ? dayLabel(r.date) : ''}</td>
      <td className={TD}><StatusChip tone={r.slaState === 'BREACHED' ? 'danger' : r.slaState === 'APPROACHING' ? 'warning' : 'neutral'}>{r.status}</StatusChip></td>
      <td className={`${TD} text-right`}>{href ? <Link href={href} className={linkButton('secondary')}>Open</Link> : null}</td>
    </tr>
  );
}

export function RecordTable({ data, onPage }: { data: Records; onPage: (p: number) => void }) {
  return (
    <section aria-label={data.label} className={PANEL} data-testid="record-table">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="mr-auto text-base font-semibold text-slate-900">{data.label}</h2>
        <span className={`text-sm ${MUTED}`} data-testid="page-text">{pageText(data)}</span>
      </div>
      {data.rows.length === 0 ? <p className={`px-4 py-6 text-sm ${MUTED}`} data-testid="no-records">Nothing matches.</p> : (
        <div className="overflow-x-auto"><table className={TABLE}><caption className="sr-only">{data.label}</caption><thead className={THEAD}><tr>{['Student', 'Record', 'Tutor', 'Date', 'Status'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}<th scope="col" className={TH}><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{data.rows.map((r) => <RecordRow key={`${r.kind}-${r.id}`} r={r} />)}</tbody></table></div>
      )}
      {data.pages > 1 && (
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
          <Button type="button" size="sm" variant="outline" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Previous page</Button>
          <Button type="button" size="sm" variant="outline" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>Next page</Button>
          <span className={`text-sm ${MUTED}`}>Page {data.page} of {data.pages}</span>
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
    <div className="mx-auto max-w-7xl space-y-5" data-testid="mentor-dashboard">
      <PageHeader title="Mentor dashboard" actions={<Link href="/mentoring/classes" className={linkButton('secondary')} data-testid="daily-class-list-link">Open the daily class list</Link>}
        subtitle={summary ? <>Today is {dayLabel(summary.today)}.{summary.window ? ` Showing ${dayLabel(summary.window.from)} to ${dayLabel(summary.window.to)}.` : ''} Each number is counted by the server for the students you may see.</> : undefined} />
      <FilterBar f={filters} onChange={setFilters} onClear={() => setFilters(emptyFilters())} />
      {error && <Banner tone="error">{error}</Banner>}
      {!summary && !error && <ListSkeleton rows={3} label="Loading the dashboard" />}
      {summary && <CardGrid summary={summary} selected={selected?.key ?? null} onOpen={(c) => { setRecords(null); setSelected(c); }} filters={filters} />}
      {selected && records && <RecordTable data={records} onPage={setPage} />}
      {summary && <NotRecorded items={summary.notRecorded} />}
    </div>
  );
}
