"use client";

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

import { STATE_CHOICES, STATE_TONE } from '../class-view';
import {
  AttentionTile, Cell, QUICK_VIEWS, RangeMode, actualDiffers, actualText, checklistCell, classHref, isOverdue, modeOf, quickViewOf, attentionTiles, reminderCell, scheduledText, shiftDay, updateCell, verificationCell, voiceCell, weekOf,
} from '../classes-view';
import { mentoringApi } from '../mentoring-client';
import { longDayLabel } from '../timetable-view';
import { ListData, ListFilters, ListRow, emptyListFilters, listQuery } from '../workspace-view';

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_LABELS: Record<string, string> = {
  classes_today: "Today's scheduled classes", classes_upcoming: 'Upcoming classes', classes_awaiting_update: 'Waiting for the tutor update', classes_awaiting_verification: 'Waiting for the Mentor verification', classes_verified: 'Verified classes',
  classes_not_conducted: 'Classes not conducted', classes_rescheduled: 'Classes rescheduled', classes_voice_pending: 'Waiting for the voice recording', classes_conducted: 'Classes conducted', classes_awaiting_activities: 'Waiting for post-class activities', classes_cancelled: 'Classes cancelled',
};
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1';

const TONE_STYLE = { done: 'text-emerald-800', waiting: 'text-slate-700', attention: 'font-medium text-amber-800', none: 'text-slate-500' } as const;
const TONE_ICON = { done: Check, waiting: Clock, attention: AlertTriangle, none: Minus } as const;
/** A status is never colour alone: each one has an icon and its words. */
function StatusCell({ cell }: { cell: Cell }) {
  const Icon = TONE_ICON[cell.tone];
  return <span className={`inline-flex items-start gap-1 ${TONE_STYLE[cell.tone]}`} data-tone={cell.tone}><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{cell.text}</span></span>;
}

const COLUMNS = ['Scheduled', 'Student and subject', 'Tutor', 'Class', 'Tutor reminder', 'Tutor update', 'Voice recording', 'After-class checklist', 'Mentor verification', ''];

function RowCells({ r, many }: { r: ListRow; many: boolean }) {
  const actual = actualText(r);
  return (
    <>
      <td className="px-2 py-2 align-top whitespace-nowrap">
        {many && <div className="text-xs text-slate-600">{longDayLabel(r.date)}</div>}
        <div>{scheduledText(r)}</div>
        {actual && <div className={`text-xs ${actualDiffers(r) ? 'font-medium text-amber-800' : 'text-slate-600'}`}>Actual {actual}</div>}
      </td>
      <td className="px-2 py-2 align-top"><div className="font-medium text-slate-900">{r.studentName}{r.studentId ? <span className="ml-1 text-xs font-normal text-slate-600">{r.studentId}</span> : null}</div><div className="text-slate-700">{r.subjectName}</div></td>
      <td className="px-2 py-2 align-top">{r.tutorName}</td>
      <td className="px-2 py-2 align-top" data-testid="row-class-status">
        <Badge variant={STATE_TONE[r.state] ?? 'default'}>{r.stateLabel}</Badge>
        {r.classStatusLabel && <div className="mt-1 text-xs text-slate-700">{r.classStatusLabel}</div>}
        {isOverdue(r) && <div className="mt-1 text-xs font-medium text-red-700">Response overdue</div>}
        <div className="mt-1 text-xs text-slate-600">{r.consumption === 'CONSUMED' ? 'Consumed' : 'Not consumed'}</div>
      </td>
      <td className="px-2 py-2 align-top"><StatusCell cell={reminderCell(r)} /></td>
      <td className="px-2 py-2 align-top"><StatusCell cell={updateCell(r)} /></td>
      <td className="px-2 py-2 align-top"><StatusCell cell={voiceCell(r)} /></td>
      <td className="px-2 py-2 align-top" data-testid="row-documentation-status"><StatusCell cell={checklistCell(r)} /></td>
      <td className="px-2 py-2 align-top"><StatusCell cell={verificationCell(r)} /></td>
      <td className="px-2 py-2 text-right align-top"><Link href={classHref(r.key)} className={`inline-flex min-h-9 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 ${RING}`} aria-label={`Open the ${r.subjectName} class of ${r.studentName}`}>Open</Link></td>
    </>
  );
}

function RowCard({ r, many }: { r: ListRow; many: boolean }) {
  const actual = actualText(r);
  const cells: Array<[string, Cell]> = [['Reminder', reminderCell(r)], ['Tutor update', updateCell(r)], ['Voice', voiceCell(r)], ['Checklist', checklistCell(r)], ['Verification', verificationCell(r)]];
  return (
    <li className="rounded-md border border-slate-200 bg-white p-3" data-testid="class-card" data-state={r.state}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{r.studentName}</p>
          <p className="text-sm text-slate-700">{r.subjectName}, {r.tutorName}</p>
          <p className="text-sm text-slate-700">{many ? `${longDayLabel(r.date)}, ` : ''}{scheduledText(r)}</p>
          {actual && <p className={`text-xs ${actualDiffers(r) ? 'font-medium text-amber-800' : 'text-slate-600'}`}>Actual {actual}</p>}
        </div>
        <Badge variant={STATE_TONE[r.state] ?? 'default'}>{r.stateLabel}</Badge>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {cells.map(([label, cell]) => <div key={label}><dt className="text-xs text-slate-600">{label}</dt><dd><StatusCell cell={cell} /></dd></div>)}
      </dl>
      <Link href={classHref(r.key)} className={`mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 ${RING}`}>Open class</Link>
    </li>
  );
}

/**
 * Every class of a day or a week, with who, what and where it stands. Mentors see their own students; the Head sees all of them and can
 * filter by Mentor. The filters live in the address, so Back from a class returns to the same list.
 */
export function ClassListClient({ initialDate = '', initialFrom = '', initialTo = '', initialCard = '', initialState = '', initialMentor = '', initialStudent = '', initialTutor = '', initialSubject = '' }: { initialDate?: string; initialFrom?: string; initialTo?: string; initialCard?: string; initialState?: string; initialMentor?: string; initialStudent?: string; initialTutor?: string; initialSubject?: string }) {
  const [f, setF] = React.useState<ListFilters>(() => ({
    ...emptyListFilters(DATE.test(initialDate) ? initialDate : todayIso()),
    from: DATE.test(initialFrom) ? initialFrom : '', to: DATE.test(initialTo) ? initialTo : '', card: CARD_LABELS[initialCard] ? initialCard : '',
    state: initialState, mentorUserId: initialMentor, studentQuery: initialStudent, tutorProfileId: initialTutor, subjectId: initialSubject,
  }));
  const [search, setSearch] = React.useState(initialStudent);
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<ListData | null>(null);
  const [known, setKnown] = React.useState<{ mentors: Map<string, string>; tutors: Map<string, string>; subjects: Map<string, string> }>({ mentors: new Map(), tutors: new Map(), subjects: new Map() });
  const [error, setError] = React.useState<string | null>(null);

  const [attention, setAttention] = React.useState<AttentionTile[] | null>(null);
  const loadAttention = React.useCallback(async () => {
    const today = todayIso();
    try {
      const [month, verify] = await Promise.all([
        mentoringApi(`/mentoring/class-workspace/list?from=${shiftDay(today, -30)}&to=${today}&pageSize=1`),
        mentoringApi('/mentoring/class-workspace/list?card=classes_awaiting_verification&pageSize=100'),
      ]);
      setAttention(attentionTiles(month.counts ?? {}, (verify.rows as ListRow[]).filter(isOverdue).length));
    } catch {
      setAttention(null);
    }
  }, []);
  React.useEffect(() => { void loadAttention(); }, [loadAttention]);

  const query = listQuery(f, page);
  const load = React.useCallback(async () => {
    try {
      const d: ListData = await mentoringApi(`/mentoring/class-workspace/list${query}`);
      setData(d);
      setKnown((k) => {
        const mentors = new Map(k.mentors);
        const tutors = new Map(k.tutors);
        const subjects = new Map(k.subjects);
        for (const r of d.rows) { if (r.mentorUserId && r.mentorName) mentors.set(r.mentorUserId, r.mentorName); tutors.set(r.tutorProfileId, r.tutorName); subjects.set(r.subjectId, r.subjectName); }
        return { mentors, tutors, subjects };
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The classes could not be loaded.');
    }
  }, [query]);
  React.useEffect(() => { void load(); }, [load]);

  // The student search waits for a pause in typing, and changes nothing else.
  React.useEffect(() => {
    if (search === f.studentQuery) return undefined;
    const t = setTimeout(() => { setPage(1); setF((x) => ({ ...x, studentQuery: search })); }, 300);
    return () => clearTimeout(t);
  }, [search, f.studentQuery]);

  // Keep the address in step with the filters, so Back from a class returns here as it was.
  React.useEffect(() => {
    const parts = Object.entries({ ...f, ...(f.from || f.to ? { date: '' } : {}) }).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${parts.length ? `?${parts.join('&')}` : ''}`);
  }, [f]);

  const set = (patch: Partial<ListFilters>) => { setPage(1); setF((x) => ({ ...x, ...patch })); };
  const mode: RangeMode = modeOf(f);
  const anchor = f.from || f.date;
  const move = (dir: -1 | 1) => (mode === 'week' ? set({ ...weekOf(shiftDay(anchor, dir * 7)), date: shiftDay(anchor, dir * 7), card: '' }) : set({ date: shiftDay(f.date, dir), from: '', to: '', card: '' }));
  const goDay = (date: string) => set({ date, from: '', to: '', card: '' });
  const goWeek = (date: string) => set({ ...weekOf(date), date, card: '' });
  const today = todayIso();
  const view = quickViewOf(f);
  const bannerCard = f.card && CARD_LABELS[f.card] && view === 'other';
  const filtered = f.mentorUserId || f.studentQuery || f.tutorProfileId || f.subjectId || (f.state && view === 'other') || bannerCard;
  const many = mode !== 'day';
  const applyView = (key: string) => {
    const q = QUICK_VIEWS.find((x) => x.key === key);
    if (q) set({ card: q.card, state: q.state, ...(q.wholeDay ? { from: shiftDay(today, -30), to: today } : { from: '', to: '' }) });
  };
  const title = mode === 'day' ? longDayLabel(f.date) : `${longDayLabel(f.from || f.date)} to ${longDayLabel(f.to || f.from || f.date)}`;

  return (
    <div className="mx-auto max-w-7xl space-y-3" data-testid="class-list">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Classes</h1>
          <p className="text-sm text-slate-700" aria-live="polite">{title}{data ? `, ${data.total} ${data.total === 1 ? 'class' : 'classes'}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose the dates">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="Day or week">
            <button type="button" aria-pressed={mode === 'day'} onClick={() => goDay(f.from || f.date)} className={`min-h-9 px-3 text-sm ${RING} ${mode === 'day' ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>Day</button>
            <button type="button" aria-pressed={mode === 'week'} onClick={() => goWeek(f.from || f.date)} className={`min-h-9 border-l border-slate-300 px-3 text-sm ${RING} ${mode === 'week' ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>Week</button>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => move(-1)} aria-label={mode === 'week' ? 'Previous week' : 'Previous day'}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
          <Button type="button" size="sm" variant="outline" onClick={() => (mode === 'week' ? goWeek(today) : goDay(today))}>Today</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => move(1)} aria-label={mode === 'week' ? 'Next week' : 'Next day'}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
          <span className="w-40"><Input aria-label="Choose a date" type="date" className="h-9" value={f.date} onChange={(e) => e.target.value && (mode === 'week' ? goWeek(e.target.value) : goDay(e.target.value))} /></span>
        </div>
      </header>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Work queues">
        {QUICK_VIEWS.map((q) => (
          <button key={q.key} type="button" aria-pressed={view === q.key} onClick={() => applyView(q.key)}
            className={`min-h-9 rounded-full border px-3 text-sm ${RING} ${view === q.key ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{q.label}</button>
        ))}
      </div>

      {bannerCard || (mode === 'range' && view === 'all') ? (
        <p className="flex flex-wrap items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-slate-800" data-testid="card-banner">
          <span>{bannerCard ? `Showing: ${CARD_LABELS[f.card]}.` : `Showing ${longDayLabel(f.from || f.date)} to ${longDayLabel(f.to || f.from || f.date)}.`}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => set({ card: '', from: '', to: '' })}>Show one day instead</Button>
        </p>
      ) : null}

      <section aria-label="Filters" className="space-y-2 rounded-md border border-slate-200 bg-white p-3" data-testid="class-list-filters">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm"><span className="mb-1 block text-slate-700">Student name or student ID</span><Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block text-slate-700">Subject</span><Select value={f.subjectId} onChange={(e) => set({ subjectId: e.target.value })}><option value="">All subjects</option>{[...known.subjects].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>
          <label className="text-sm"><span className="mb-1 block text-slate-700">Tutor</span><Select value={f.tutorProfileId} onChange={(e) => set({ tutorProfileId: e.target.value })}><option value="">All tutors</option>{[...known.tutors].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>
          <label className="text-sm"><span className="mb-1 block text-slate-700">Class status</span><Select value={f.state} onChange={(e) => set({ state: e.target.value })}><option value="">Any</option>{STATE_CHOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
          {(known.mentors.size > 1 || f.mentorUserId) && <label className="text-sm"><span className="mb-1 block text-slate-700">Mentor</span><Select value={f.mentorUserId} onChange={(e) => set({ mentorUserId: e.target.value })}><option value="">All Mentors</option>{[...known.mentors].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>}
        </div>
        {filtered && <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(''); set({ mentorUserId: '', studentQuery: '', tutorProfileId: '', subjectId: '', state: '', card: '' }); }}>Clear the filters</Button>}
      </section>

      {attention && attention.some((t) => t.count > 0) && (
        <section aria-label="Needs your attention" className="rounded-md border border-slate-200 bg-white p-3" data-testid="attention">
          <h2 className="text-sm font-semibold text-slate-900">Needs your attention</h2>
          <ul className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {attention.map((t) => (
              <li key={t.key}>
                <button type="button" onClick={() => applyView(t.view)} className={`flex min-h-14 w-full items-baseline justify-between gap-2 rounded-md border px-3 py-2 text-left ${RING} ${t.count > 0 ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <span className="text-sm text-slate-800">{t.label}</span>
                  <span className={`text-xl font-semibold ${t.count > 0 ? 'text-amber-900' : 'text-slate-600'}`}>{t.count}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-600">Counted over the last 30 days, whichever day is open below.</p>
        </section>
      )}

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button type="button" className="font-medium underline" onClick={() => void load()}>Try again</button></p>}
      {!data && !error && <div role="status" aria-label="Loading the classes" className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />)}</div>}
      {data && data.rows.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600" data-testid="no-classes">No classes {filtered || view !== 'all' ? 'match these filters' : 'are scheduled'} {mode === 'day' ? 'on this date' : 'in these dates'}.</p>}
      {data && data.rows.length > 0 && (
        <>
          <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white lg:block">
            <table className="min-w-full text-left text-sm" data-testid="class-table">
              <caption className="sr-only">Classes from {f.from || f.date} to {f.to || f.date}</caption>
              <thead className="bg-slate-50 text-xs text-slate-700"><tr>{COLUMNS.map((h, i) => <th key={`${h}-${i}`} scope="col" className="px-2 py-2 font-semibold">{h || <span className="sr-only">Open</span>}</th>)}</tr></thead>
              <tbody>{data.rows.map((r) => <tr key={r.key} className="border-t border-slate-100" data-testid="class-row" data-state={r.state}><RowCells r={r} many={many} /></tr>)}</tbody>
            </table>
          </div>
          <ul className="space-y-2 lg:hidden" aria-label="Classes">{data.rows.map((r) => <RowCard key={r.key} r={r} many={many} />)}</ul>
        </>
      )}
      {data && data.pages > 1 && (
        <div className="flex items-center gap-2 text-sm" role="navigation" aria-label="Pages">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {data.page} of {data.pages}, {data.total} classes</span>
          <Button type="button" size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
