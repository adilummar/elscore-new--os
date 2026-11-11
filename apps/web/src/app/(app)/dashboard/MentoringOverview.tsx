"use client";

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  ActivationRow, Attention, HEAD_COPY, MENTOR_COPY, MENTOR_SORTS, MentorRow, Overview, PERIODS, Paged, StudentRow, Today, TodayRow, attentionHref, classTone, hoursOnly, hoursText, progressPercent, query, studentHref, timeRange, waitTone,
} from '../mentoring/overview-view';
import { mentoringApi } from '../mentoring/mentoring-client';
import { addDays, longDayLabel } from '../mentoring/timetable-view';

const CARD = 'rounded-lg border border-slate-200 bg-white shadow-sm';
const TONE = { normal: 'text-slate-700', amber: 'text-amber-700', red: 'text-red-700', done: 'text-primary' } as const;
const DOT = { normal: 'bg-slate-300', amber: 'bg-amber-500', red: 'bg-red-500', done: 'bg-primary' } as const;

const Panel = ({ title, hint, action, children, label }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode; label?: string }) => (
  <section aria-label={label ?? title} className={CARD} data-testid="panel">
    <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <div><h2 className="text-sm font-semibold text-slate-900">{title}</h2>{hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}</div>
      {action}
    </header>
    {children}
  </section>
);

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-2 p-4" aria-busy="true" data-testid="skeleton">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-5 animate-pulse rounded bg-slate-100" />)}</div>;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-red-700" data-testid="section-error">
      <span>{message}</span><Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-6 text-center text-sm text-slate-500" data-testid="empty">{children}</p>;

// ─── The summary strip ──────────────────────────────────────────────────────────────────────────────────────────
export function SummaryStrip({ o }: { o: Overview }) {
  const s = o.summary;
  const pct = progressPercent(s.consumedMinutes, s.scheduledMinutes);
  const items: Array<{ key: string; label: string; value: string; hint?: string; tone?: 'amber' }> = [
    { key: 'active', label: 'Active students', value: String(s.activeStudents) },
    { key: 'ongoing', label: 'Activations in progress', value: String(s.ongoingActivations), hint: 'Not active yet' },
    { key: 'scheduled', label: 'Scheduled hours', value: hoursText(s.scheduledMinutes), hint: 'From the approved schedule' },
    { key: 'consumed', label: 'Consumed hours', value: hoursText(s.consumedMinutes), hint: 'Verified by a Mentor' },
    { key: 'verify', label: 'Waiting for verification', value: String(s.pendingVerification), hint: 'Conducted, not yet consumed', tone: s.pendingVerification > 0 ? 'amber' : undefined },
    { key: 'attention', label: 'Needs attention', value: String(s.attentionTotal), tone: s.attentionTotal > 0 ? 'amber' : undefined },
  ];
  return (
    <section aria-label="Summary" className={`${CARD} p-4`} data-testid="summary-strip">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-slate-100">
        {items.map((i) => (
          <div key={i.key} className="lg:px-4 lg:first:pl-0" data-testid="summary-item" data-key={i.key}>
            <dt className="text-xs text-slate-500">{i.label}</dt>
            <dd className={`mt-0.5 text-2xl font-semibold ${i.tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{i.value}</dd>
            {i.hint && <p className="text-xs text-slate-400">{i.hint}</p>}
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500"><span>Consumed of scheduled, {longDayLabel(o.window.from)} to {longDayLabel(o.window.to)}</span><span data-testid="progress-text">{pct}%</span></div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Consumed of scheduled hours"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
        <p className="mt-2 text-xs text-slate-500">{o.note}</p>
      </div>
    </section>
  );
}

// ─── What needs attention ───────────────────────────────────────────────────────────────────────────────────────
export function AttentionPanel({ items }: { items: Attention[] }) {
  return (
    <Panel title="Needs attention" hint="Open each to see the records">
      {items.length === 0 ? <Empty>Nothing needs attention right now.</Empty> : (
        <ul className="divide-y divide-slate-100">
          {items.map((a) => (
            <li key={a.key} data-testid="attention-item"><Link href={attentionHref(a.key)} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"><span className="text-slate-800">{a.label}</span><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{a.count}</span></Link></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ─── Mentor by Mentor ───────────────────────────────────────────────────────────────────────────────────────────
export function MentorTable({ data, search, sort, selected, onSearch, onSort, onSelect, onPage }: { data: Paged<MentorRow>; search: string; sort: string; selected: string | null; onSearch: (v: string) => void; onSort: (v: string) => void; onSelect: (m: MentorRow | null) => void; onPage: (p: number) => void }) {
  return (
    <Panel title="Mentor allocation and workload" hint="Students and hours for each Mentor. Choose a Mentor to see their day, their students and their activations."
      action={<div className="flex gap-2"><Input aria-label="Search Mentors" placeholder="Search Mentors" className="h-9 w-44" value={search} onChange={(e) => onSearch(e.target.value)} /><Select aria-label="Sort Mentors" className="h-9" value={sort} onChange={(e) => onSort(e.target.value)}>{MENTOR_SORTS.map(([v, l]) => <option key={v} value={v}>Sort by {l.toLowerCase()}</option>)}</Select></div>}>
      {data.rows.length === 0 ? <Empty>No Mentor matches.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr>{['Mentor', 'Active', 'In activation', 'Scheduled', 'Consumed', 'Remaining', 'Waiting for verification', 'Pending tasks', ''].map((h, i) => <th key={`${h}-${i}`} className={`px-4 py-2 font-medium ${i > 0 && i < 8 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((m) => (
                <tr key={m.mentorUserId} className={`border-t border-slate-100 ${selected === m.mentorUserId ? 'bg-primary-soft/40' : ''}`} data-testid="mentor-row">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{m.name}<span className="block text-xs font-normal text-slate-500">{m.assignedStudents} assigned</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.activeStudents}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.ongoingActivations}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{hoursOnly(m.scheduledHours)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{hoursOnly(m.consumedHours)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{hoursOnly(m.remainingHours)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${m.pendingVerification > 0 ? 'text-amber-700' : ''}`}>{m.pendingVerification}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.pendingTasks}</td>
                  <td className="px-4 py-2.5 text-right"><Button type="button" size="sm" variant={selected === m.mentorUserId ? 'primary' : 'outline'} onClick={() => onSelect(selected === m.mentorUserId ? null : m)}>{selected === m.mentorUserId ? 'Showing' : 'View'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager data={data} onPage={onPage} />
    </Panel>
  );
}

export function Pager({ data, onPage }: { data: Paged<unknown>; onPage: (p: number) => void }) {
  if (data.pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-600" data-testid="pager">
      <Button type="button" size="sm" variant="outline" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Previous page</Button>
      <Button type="button" size="sm" variant="outline" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>Next page</Button>
      <span>Page {data.page} of {data.pages}, {data.total} in all</span>
    </div>
  );
}

// ─── Activations still in progress ──────────────────────────────────────────────────────────────────────────────
export function ActivationTable({ data, onPage }: { data: Paged<ActivationRow>; onPage: (p: number) => void }) {
  return (
    <Panel title="Activations in progress" hint="Students who are not active yet. The longest waiting come first.">
      {data.rows.length === 0 ? <Empty>No student is waiting to be activated.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="px-4 py-2 font-medium">Student</th><th className="px-4 py-2 font-medium">Stage</th><th className="px-4 py-2 font-medium">With</th><th className="px-4 py-2 font-medium">Next action</th><th className="px-4 py-2 text-right font-medium">Waiting</th></tr></thead>
            <tbody>
              {data.rows.map((a) => {
                const tone = waitTone(a.daysPending, a.blocked);
                return (
                  <tr key={a.activationId} className="border-t border-slate-100" data-testid="activation-row" data-tone={tone}>
                    <td className="px-4 py-2.5"><Link href={studentHref(a.activationId)} className="font-medium text-slate-900 hover:text-primary">{a.studentName}</Link>{a.studentId && <span className="block text-xs text-slate-500">{a.studentId}</span>}</td>
                    <td className="px-4 py-2.5 text-slate-700">{a.stageName ? `${a.stageNumber}. ${a.stageName}` : `Stage ${a.stageNumber}`}<span className={`block text-xs ${a.blocked ? 'text-red-700' : 'text-slate-500'}`}>{a.statusLabel}</span></td>
                    <td className="px-4 py-2.5 text-slate-700">{a.responsible}{a.mentorName && a.responsible !== a.mentorName ? <span className="block text-xs text-slate-500">Mentor: {a.mentorName}</span> : null}</td>
                    <td className="px-4 py-2.5 text-slate-800">{a.nextAction}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${TONE[tone]}`}>{a.daysPending} {a.daysPending === 1 ? 'day' : 'days'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager data={data} onPage={onPage} />
    </Panel>
  );
}

// ─── Student hours ──────────────────────────────────────────────────────────────────────────────────────────────
export function StudentTable({ data, search, onSearch, onPage }: { data: Paged<StudentRow>; search: string; onSearch: (v: string) => void; onPage: (p: number) => void }) {
  return (
    <Panel title="Students and hours" hint="Scheduled hours come from the schedule, reported hours from the tutor, consumed hours only from Mentor verification."
      action={<Input aria-label="Search students" placeholder="Name or student ID" className="h-9 w-48" value={search} onChange={(e) => onSearch(e.target.value)} />}>
      {data.rows.length === 0 ? <Empty>No student matches.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="px-4 py-2 font-medium">Student</th><th className="px-4 py-2 font-medium">Mentor</th><th className="px-4 py-2 font-medium">Subjects</th><th className="px-4 py-2 text-right font-medium">Scheduled</th><th className="px-4 py-2 text-right font-medium">Reported</th><th className="px-4 py-2 text-right font-medium">Consumed</th><th className="px-4 py-2 text-right font-medium">Remaining</th><th className="px-4 py-2 text-right font-medium">Classes left</th></tr></thead>
            <tbody>
              {data.rows.map((s) => (
                <tr key={s.activationId} className="border-t border-slate-100" data-testid="student-row">
                  <td className="px-4 py-2.5"><Link href={studentHref(s.activationId)} className="font-medium text-slate-900 hover:text-primary">{s.studentName}</Link><span className="block text-xs text-slate-500">{s.studentId ?? ''}{s.studentId ? ', ' : ''}{s.statusLabel}</span></td>
                  <td className="px-4 py-2.5 text-slate-700">{s.mentorName ?? 'No Mentor yet'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{s.subjects.map((x) => x.name).join(', ') || 'None scheduled'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{hoursOnly(s.scheduledHours)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{hoursOnly(s.reportedHours)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{hoursOnly(s.consumedHours)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{hoursOnly(s.remainingHours)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{s.pendingClasses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager data={data} onPage={onPage} />
    </Panel>
  );
}

// ─── The day ────────────────────────────────────────────────────────────────────────────────────────────────────
export function AgendaRow({ r }: { r: TodayRow }) {
  const tone = classTone(r.state, r.warning);
  return (
    <li className="flex gap-3 px-4 py-3" data-testid="agenda-row" data-tone={tone} data-consumption={r.consumption}>
      <div className="w-28 shrink-0 text-sm tabular-nums text-slate-600">{timeRange(r)}<span className="block text-xs text-slate-400">{hoursText(r.scheduledMinutes)}</span></div>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900"><Link href={studentHref(r.activationId, 'classes')} className="hover:text-primary">{r.subjectName}, {r.studentName}</Link>{r.studentId && <span className="ml-2 text-xs font-normal text-slate-500">{r.studentId}</span>}</p>
        <p className="text-xs text-slate-500">Tutor {r.tutorName}{r.mentorName ? `. Mentor ${r.mentorName}` : ''}</p>
        {r.warning && <p className={`mt-0.5 text-xs ${tone === 'red' ? 'text-red-700' : 'text-amber-700'}`} data-testid="agenda-warning">{r.warning}</p>}
      </div>
      <div className="shrink-0 text-right text-xs"><span className={TONE[tone]}>{r.stateLabel}</span><span className={`block ${r.consumption === 'CONSUMED' ? 'font-medium text-primary' : 'text-slate-400'}`}>{r.consumption === 'CONSUMED' ? 'Consumed' : 'Not consumed'}</span></div>
    </li>
  );
}

export function TodayAgenda({ data, date, search, onDate, onSearch, onPage }: { data: Today; date: string; search: string; onDate: (d: string) => void; onSearch: (v: string) => void; onPage: (p: number) => void }) {
  return (
    <Panel title="Classes" label="Daily classes" hint={`${longDayLabel(date)}. ${data.total} ${data.total === 1 ? 'class' : 'classes'}, ${data.consumed} consumed.`}
      action={(
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" aria-label="Previous day" onClick={() => onDate(addDays(date, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="outline" disabled={date === data.today} onClick={() => onDate(data.today)}>Today</Button>
          <Button type="button" size="sm" variant="outline" aria-label="Next day" onClick={() => onDate(addDays(date, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Input aria-label="Search classes" placeholder="Student, subject or tutor" className="h-9 w-48" value={search} onChange={(e) => onSearch(e.target.value)} />
        </div>
      )}>
      {data.rows.length === 0 ? <Empty>{search ? 'No class matches this search.' : 'No classes scheduled for this date.'}</Empty> : <ul className="divide-y divide-slate-100" aria-label="Chronological agenda">{data.rows.map((r) => <AgendaRow key={r.key} r={r} />)}</ul>}
      <Pager data={data} onPage={onPage} />
    </Panel>
  );
}

// ─── The page ───────────────────────────────────────────────────────────────────────────────────────────────────
function useLoad<T>(path: string | null) {
  const [state, setState] = React.useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: path !== null });
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (path === null) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    mentoringApi(path).then((d: T) => { if (live) setState({ data: d, error: null, loading: false }); }).catch((e: unknown) => { if (live) setState((s) => ({ ...s, loading: false, error: e instanceof Error && e.message ? e.message : 'This could not be loaded.' })); });
    return () => { live = false; };
  }, [path, tick]);
  return { ...state, retry: () => setTick((t) => t + 1) };
}

/** The Mentoring dashboard for the Mentoring Head and for a Mentor. The server decides which students each one receives. */
export function MentoringOverview() {
  const [period, setPeriod] = React.useState('month');
  const [mentor, setMentor] = React.useState<MentorRow | null>(null);
  const [mSearch, setMSearch] = React.useState('');
  const [mSort, setMSort] = React.useState('name');
  const [mPage, setMPage] = React.useState(1);
  const [sSearch, setSSearch] = React.useState('');
  const [sPage, setSPage] = React.useState(1);
  const [aPage, setAPage] = React.useState(1);
  const [tSearch, setTSearch] = React.useState('');
  const [tPage, setTPage] = React.useState(1);
  const [date, setDate] = React.useState<string | null>(null);

  const overview = useLoad<Overview>(`/mentoring/overview${query({ period })}`);
  const head = overview.data?.role === 'HEAD';
  const m = mentor?.mentorUserId;
  const day = date ?? overview.data?.today;
  const mentors = useLoad<Paged<MentorRow>>(head ? `/mentoring/overview/mentors${query({ period, search: mSearch, sort: mSort, dir: mSort === 'name' ? 'asc' : 'desc', page: mPage })}` : null);
  const today = useLoad<Today>(overview.data ? `/mentoring/overview/today${query({ date: day, mentorUserId: m, search: tSearch, page: tPage })}` : null);
  const activations = useLoad<Paged<ActivationRow>>(overview.data ? `/mentoring/overview/activations${query({ mentorUserId: m, page: aPage })}` : null);
  const students = useLoad<Paged<StudentRow>>(overview.data ? `/mentoring/overview/students${query({ period, mentorUserId: m, search: sSearch, page: sPage })}` : null);
  const copy = head ? HEAD_COPY : MENTOR_COPY;

  const section = <T,>(l: ReturnType<typeof useLoad<T>>, render: (d: T) => React.ReactNode, rows = 4) => (l.error ? <section className={CARD}><ErrorNote message={l.error} onRetry={l.retry} /></section> : l.data ? render(l.data) : <section className={CARD}><Skeleton rows={rows} /></section>);
  const agenda = section(today, (d) => <TodayAgenda data={d} date={day ?? d.date} search={tSearch} onDate={(x) => { setDate(x); setTPage(1); }} onSearch={(v) => { setTSearch(v); setTPage(1); }} onPage={setTPage} />, 5);

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-testid="mentoring-overview">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{copy.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{copy.subtitle}</p>
          {overview.data && <p className="mt-1 text-xs text-slate-400">{longDayLabel(overview.data.today)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Reporting period" className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            {PERIODS.map(([v, l]) => <button key={v} type="button" aria-pressed={period === v} onClick={() => { setPeriod(v); setSPage(1); setMPage(1); }} className={`rounded px-3 py-1.5 text-sm ${period === v ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}
          </div>
          <Link href="/mentoring/dashboard" className="text-sm font-medium text-primary hover:underline">All work lists</Link>
        </div>
      </header>

      {mentor && (
        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary-soft/50 px-4 py-2 text-sm" data-testid="mentor-banner">
          <span>Showing the day, students and activations of <strong>{mentor.name}</strong>.</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setMentor(null); setTPage(1); setSPage(1); setAPage(1); }}>Show everyone</Button>
        </div>
      )}

      {overview.error ? <section className={CARD}><ErrorNote message={overview.error} onRetry={overview.retry} /></section> : overview.data ? <SummaryStrip o={overview.data} /> : <section className={CARD}><Skeleton rows={4} /></section>}

      {head ? (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">{section(mentors, (d) => <MentorTable data={d} search={mSearch} sort={mSort} selected={m ?? null} onSearch={(v) => { setMSearch(v); setMPage(1); }} onSort={(v) => { setMSort(v); setMPage(1); }} onSelect={(x) => { setMentor(x); setTPage(1); setSPage(1); setAPage(1); }} onPage={setMPage} />)}</div>
            {overview.data && <AttentionPanel items={overview.data.attention} />}
          </div>
          {agenda}
          {section(activations, (d) => <ActivationTable data={d} onPage={setAPage} />)}
          {section(students, (d) => <StudentTable data={d} search={sSearch} onSearch={(v) => { setSSearch(v); setSPage(1); }} onPage={setSPage} />)}
        </>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">{agenda}</div>
            {overview.data && <AttentionPanel items={overview.data.attention} />}
          </div>
          {section(activations, (d) => <ActivationTable data={d} onPage={setAPage} />)}
          {section(students, (d) => <StudentTable data={d} search={sSearch} onSearch={(v) => { setSSearch(v); setSPage(1); }} onPage={setSPage} />)}
        </>
      )}
    </div>
  );
}
