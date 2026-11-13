"use client";

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Minus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

import { STATE_CHOICES, STATE_TONE } from '../class-view';
import {
  AttentionTile, Cell, QUICK_VIEWS, RangeMode, actualDiffers, actualText, attentionTiles, checklistCell, classHref, isOverdue, modeOf, needsAction, quickViewOf, reminderCell, scheduledText, shiftDay, updateCell, verificationCell, voiceCell, weekOf,
} from '../classes-view';
import { mentoringApi } from '../mentoring-client';
import {
  Empty, FIELD_LABEL, FOCUS, ListSkeleton, Notice, PANEL, PageHeader, QueueTabs, Segmented, StatusChip, TABLE, TABLE_WRAP, TD, TH, THEAD, TR, chipTone, linkButton,
} from '../mentoring-ui';
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

const TONE_STYLE = { done: 'text-emerald-800', waiting: 'text-slate-700', attention: 'font-medium text-amber-900', none: 'text-slate-500' } as const;
const TONE_ICON = { done: Check, waiting: Clock, attention: AlertTriangle, none: Minus } as const;
/** A status is never colour alone: each one has an icon and its words. */
function StatusCell({ cell }: { cell: Cell }) {
  const Icon = TONE_ICON[cell.tone];
  return <span className={`inline-flex items-start gap-1.5 ${TONE_STYLE[cell.tone]}`} data-tone={cell.tone}><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{cell.text}</span></span>;
}

const COLUMNS = ['Scheduled', 'Student and subject', 'Tutor', 'Class', 'Tutor reminder', 'Tutor update', 'Voice recording', 'After-class checklist', 'Mentor verification'];
/** A class that waits on a person gets an amber edge on its first cell, so the eye finds it without a coloured row. */
const EDGE = 'shadow-[inset_3px_0_0_0_#d97706]';

function RowCells({ r, many }: { r: ListRow; many: boolean }) {
  const actual = actualText(r);
  return (
    <>
      <td className={`${TD} whitespace-nowrap ${needsAction(r) ? EDGE : ''}`}>
        <div className="font-medium text-slate-900">{scheduledText(r)}</div>
        {actual && <div className={`mt-0.5 text-xs ${actualDiffers(r) ? 'font-medium text-amber-900' : 'text-slate-600'}`}>Actual {actual}</div>}
        {many && <div className="mt-0.5 text-xs text-slate-600">{longDayLabel(r.date)}</div>}
        <Link href={classHref(r.key)} className={`${linkButton(needsAction(r) ? 'primary' : 'secondary')} mt-2`} aria-label={`Open the ${r.subjectName} class of ${r.studentName}`}>Open</Link>
      </td>
      <td className={TD}><div className="font-medium text-slate-900">{r.studentName}{r.studentId ? <span className="ml-1.5 text-xs font-normal text-slate-600">{r.studentId}</span> : null}</div><div className="text-slate-700">{r.subjectName}</div></td>
      <td className={`${TD} text-slate-800`}>{r.tutorName}</td>
      <td className={TD} data-testid="row-class-status">
        <StatusChip tone={chipTone(STATE_TONE[r.state])}>{r.stateLabel}</StatusChip>
        {r.classStatusLabel && <div className="mt-1 text-xs text-slate-700">{r.classStatusLabel}</div>}
        {isOverdue(r) && <div className="mt-1 text-xs font-semibold text-red-800">Response overdue</div>}
        <div className="mt-1 text-xs text-slate-600">{r.consumption === 'CONSUMED' ? 'Consumed' : 'Not consumed'}</div>
      </td>
      <td className={TD}><StatusCell cell={reminderCell(r)} /></td>
      <td className={TD}><StatusCell cell={updateCell(r)} /></td>
      <td className={TD}><StatusCell cell={voiceCell(r)} /></td>
      <td className={TD} data-testid="row-documentation-status"><StatusCell cell={checklistCell(r)} /></td>
      <td className={TD}><StatusCell cell={verificationCell(r)} /></td>
    </>
  );
}

function RowCard({ r, many }: { r: ListRow; many: boolean }) {
  const actual = actualText(r);
  const cells: Array<[string, Cell]> = [['Reminder', reminderCell(r)], ['Tutor update', updateCell(r)], ['Voice', voiceCell(r)], ['Checklist', checklistCell(r)], ['Verification', verificationCell(r)]];
  return (
    <li className={`${PANEL} p-4 ${needsAction(r) ? 'border-l-4 border-l-amber-600' : ''}`} data-testid="class-card" data-state={r.state}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{r.studentName}</p>
          <p className="text-sm text-slate-700">{r.subjectName} with {r.tutorName}</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{many ? `${longDayLabel(r.date)}, ` : ''}{scheduledText(r)}</p>
          {actual && <p className={`text-xs ${actualDiffers(r) ? 'font-medium text-amber-900' : 'text-slate-600'}`}>Actual {actual}</p>}
        </div>
        <StatusChip tone={chipTone(STATE_TONE[r.state])}>{r.stateLabel}</StatusChip>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {cells.map(([label, cell]) => <div key={label}><dt className="text-xs text-slate-600">{label}</dt><dd><StatusCell cell={cell} /></dd></div>)}
      </dl>
      <Link href={classHref(r.key)} className={`${linkButton(needsAction(r) ? 'primary' : 'secondary', true)} mt-4`}>Open class</Link>
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
  const applyView = (key: string) => {
    const q = QUICK_VIEWS.find((x) => x.key === key);
    if (q) set({ card: q.card, state: q.state, ...(q.wholeDay ? { from: shiftDay(today, -30), to: today } : { from: '', to: '' }) });
  };
  const bannerCard = f.card && CARD_LABELS[f.card] && view === 'other';
  const filtered = f.mentorUserId || f.studentQuery || f.tutorProfileId || f.subjectId || (f.state && view === 'other') || bannerCard;
  const many = mode !== 'day' || view !== 'all';
  const title = mode === 'day' ? longDayLabel(f.date) : `${longDayLabel(f.from || f.date)} to ${longDayLabel(f.to || f.from || f.date)}`;
  const count = (k: string) => attention?.find((t) => t.key === k)?.count;
  const tabCounts: Record<string, number | undefined> = { verify: count('verify'), update: count('update'), returned: count('returned') };

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-testid="class-list">
      <PageHeader
        title="Classes"
        subtitle={<span aria-live="polite">{title}{data ? `, ${data.total} ${data.total === 1 ? 'class' : 'classes'}` : ''}</span>}
        actions={(
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose the dates">
            <Segmented label="Day or week" value={mode === 'week' ? 'week' : 'day'} onChange={(k) => (k === 'week' ? goWeek(f.from || f.date) : goDay(f.from || f.date))} items={[{ key: 'day', label: 'Day' }, { key: 'week', label: 'Week' }]} />
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => move(-1)} aria-label={mode === 'week' ? 'Previous week' : 'Previous day'}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => (mode === 'week' ? goWeek(today) : goDay(today))}>Today</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => move(1)} aria-label={mode === 'week' ? 'Next week' : 'Next day'}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
            </div>
            <span className="w-40"><Input aria-label="Choose a date" type="date" className="h-9" value={f.date} onChange={(e) => e.target.value && (mode === 'week' ? goWeek(e.target.value) : goDay(e.target.value))} /></span>
          </div>
        )}
      />

      {attention && attention.some((t) => t.count > 0) && (
        <section aria-label="Needs your attention" className={`${PANEL} p-1`} data-testid="attention">
          <ul className="grid grid-cols-2 divide-slate-100 lg:grid-cols-4 lg:divide-x">
            {attention.map((t) => (
              <li key={t.key}>
                <button type="button" onClick={() => applyView(t.view)} className={`flex min-h-16 w-full flex-col items-start rounded-md px-4 py-3 text-left hover:bg-slate-50 ${FOCUS}`}>
                  <span className={`text-2xl font-semibold leading-none ${t.count > 0 ? 'text-amber-800' : 'text-slate-500'}`}>{t.count}</span>
                  <span className="mt-1 text-sm text-slate-700">{t.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-2 text-xs text-slate-600">Counted over the last 30 days, whichever day is open below.</p>
        </section>
      )}

      <QueueTabs label="Work queues" value={view} onChange={applyView} items={QUICK_VIEWS.map((q) => ({ key: q.key, label: q.label, count: tabCounts[q.key], urgent: q.key === 'verify' || q.key === 'returned' }))} />

      {bannerCard || (mode === 'range' && view === 'all') ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-slate-800" data-testid="card-banner">
          <span>{bannerCard ? `Showing: ${CARD_LABELS[f.card]}.` : `Showing ${longDayLabel(f.from || f.date)} to ${longDayLabel(f.to || f.from || f.date)}.`}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => set({ card: '', from: '', to: '' })}>Show one day instead</Button>
        </div>
      ) : null}

      <section aria-label="Filters" className={`${PANEL} p-4`} data-testid="class-list-filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm"><span className={FIELD_LABEL}>Student name or student ID</span><Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label className="text-sm"><span className={FIELD_LABEL}>Subject</span><Select value={f.subjectId} onChange={(e) => set({ subjectId: e.target.value })}><option value="">All subjects</option>{[...known.subjects].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>
          <label className="text-sm"><span className={FIELD_LABEL}>Tutor</span><Select value={f.tutorProfileId} onChange={(e) => set({ tutorProfileId: e.target.value })}><option value="">All tutors</option>{[...known.tutors].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>
          <label className="text-sm"><span className={FIELD_LABEL}>Class status</span><Select value={f.state} onChange={(e) => set({ state: e.target.value })}><option value="">Any</option>{STATE_CHOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
          {(known.mentors.size > 1 || f.mentorUserId) && <label className="text-sm"><span className={FIELD_LABEL}>Mentor</span><Select value={f.mentorUserId} onChange={(e) => set({ mentorUserId: e.target.value })}><option value="">All Mentors</option>{[...known.mentors].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>}
        </div>
        {filtered && <div className="mt-3"><Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(''); set({ mentorUserId: '', studentQuery: '', tutorProfileId: '', subjectId: '', state: '', card: '' }); }}>Clear the filters</Button></div>}
      </section>

      {error && <Notice tone="error">{error} <button type="button" className={`rounded font-semibold underline ${FOCUS}`} onClick={() => void load()}>Try again</button></Notice>}
      {!data && !error && <ListSkeleton label="Loading the classes" />}
      {data && data.rows.length === 0 && (
        <Empty title={`No classes ${filtered || view !== 'all' ? 'match these filters' : 'are scheduled'} ${mode === 'day' ? 'on this date' : 'in these dates'}`} testId="no-classes">
          {filtered || view !== 'all' ? 'Clear a filter or choose another queue or date.' : 'Choose another date, or switch to the week view to see what is coming up.'}
        </Empty>
      )}
      {data && data.rows.length > 0 && (
        <>
          <div className={`${TABLE_WRAP} hidden xl:block`}>
            <table className={TABLE} data-testid="class-table">
              <caption className="sr-only">Classes from {f.from || f.date} to {f.to || f.date}</caption>
              <thead className={THEAD}><tr>{COLUMNS.map((h, i) => <th key={`${h}-${i}`} scope="col" className={TH}>{h || <span className="sr-only">Open</span>}</th>)}</tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <React.Fragment key={r.key}>
                    {many && (i === 0 || data.rows[i - 1].date !== r.date) && (
                      <tr><th colSpan={COLUMNS.length} scope="colgroup" className="bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold text-slate-700">{longDayLabel(r.date)}</th></tr>
                    )}
                    <tr className={TR} data-testid="class-row" data-state={r.state}><RowCells r={r} many={false} /></tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 xl:hidden" aria-label="Classes">{data.rows.map((r) => <RowCard key={r.key} r={r} many={many} />)}</ul>
        </>
      )}
      {data && data.pages > 1 && (
        <div className="flex items-center gap-3 text-sm" role="navigation" aria-label="Pages">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-slate-700">Page {data.page} of {data.pages}, {data.total} classes</span>
          <Button type="button" size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
