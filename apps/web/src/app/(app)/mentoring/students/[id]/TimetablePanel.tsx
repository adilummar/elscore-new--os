"use client";

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { mentoringApi } from '../../mentoring-client';
import { formatRange } from '../../tutor-availability';
import {
  ASSIGNMENT_LABELS, CLASS_STATUS_LABELS, STATUS_LABELS, TimetableData, TimetableEvent, TimetableViewName, colourFor, countsAsClass, dayLabel, datesOf, eventsOn, hourSpan, hoursText,
  longDayLabel, monthWeeks, periodTitle, placeDay, shiftDate, weekdayName,
} from '../../timetable-view';

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const STATUS_TONE: Record<TimetableData['status'], 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  DRAFT: 'default', READY_FOR_REVIEW: 'info', PENDING_MENTOR_APPROVAL: 'warning', APPROVED: 'success', CONFLICT_DETECTED: 'danger',
};
const VIEWS: Array<[TimetableViewName, string]> = [['weekly', 'Weekly'], ['biweekly', 'Bi-weekly'], ['monthly', 'Monthly']];
const subjectIdsOf = (d: TimetableData) => d.subjects.map((s) => s.subjectId);

// ─── Summary ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function SummaryCards({ data }: { data: TimetableData }) {
  const s = data.summary;
  const cards: Array<[string, string, boolean]> = [
    ['Subjects', String(s.totalSubjects), false],
    ['Scheduled sessions', String(s.scheduledSessions), false],
    ['Teaching hours', hoursText(s.teachingMinutes), false],
    ['Assigned tutors', String(s.assignedTutors), false],
    ['Incomplete subjects', String(s.incompleteSubjects + s.subjectsWithoutTutor), s.incompleteSubjects + s.subjectsWithoutTutor > 0],
    ['Unresolved conflicts', String(s.unresolvedConflicts + s.tutorIssues), s.unresolvedConflicts + s.tutorIssues > 0],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Timetable summary">
      {cards.map(([label, value, bad]) => (
        <div key={label} className={`rounded-md border px-3 py-2 ${bad ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className={`text-lg font-semibold ${bad ? 'text-red-700' : 'text-slate-900'}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── One class ───────────────────────────────────────────────────────────────────────────────────────────────────
function EventCard({ e, data, onOpen, compact, selected }: { e: TimetableEvent; data: TimetableData; onOpen: (e: TimetableEvent) => void; compact?: boolean; selected?: boolean }) {
  const colour = colourFor(e.subjectId, subjectIdsOf(data));
  const gone = !countsAsClass(e);
  const bad = e.problems.length > 0 && !gone;
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      data-testid="timetable-event"
      data-event-id={e.id}
      data-state={e.classStatus}
      aria-label={`${e.subjectName}, ${e.tutorName ?? 'no tutor'}, ${weekdayName(e.date)} ${formatRange(e.startMinute, e.endMinute)}${bad ? ', needs attention' : ''}`}
      className={`block w-full overflow-hidden rounded-md border-l-4 border px-2 py-1 text-left leading-tight ${colour.box} ${gone ? 'opacity-60 line-through' : ''} ${bad ? 'ring-2 ring-red-400' : ''} ${selected ? 'outline outline-2 outline-brand-600' : ''} ${compact ? 'text-xs' : 'text-sm'}`}
    >
      <span className="block font-semibold">{e.subjectName}{e.week ? ` (Week ${e.week})` : ''}</span>
      <span className="block">{e.tutorName ?? 'No tutor'}</span>
      <span className="block text-slate-700">{formatRange(e.startMinute, e.endMinute)}{compact ? '' : `, ${hoursText(e.durationMinutes)}`}</span>
      {!compact && <span className="block text-xs text-slate-600">{e.gradeName}{e.classStatus !== 'SCHEDULED' ? `, ${CLASS_STATUS_LABELS[e.classStatus]}` : ''}</span>}
      {bad && <span className="block text-xs font-medium text-red-700">{e.overlaps.length ? 'Overlaps another class' : 'Needs attention'}</span>}
    </button>
  );
}

// ─── Weekly grid ─────────────────────────────────────────────────────────────────────────────────────────────────
const HOUR_PX = 56;

export function WeekGrid({ data, days, onOpen, selectedId, today }: { data: TimetableData; days: string[]; onOpen: (e: TimetableEvent) => void; selectedId: string | null; today: string }) {
  const { from, to } = hourSpan(data.events.filter((e) => days.includes(e.date)));
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const height = (to - from) * HOUR_PX;
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white" data-testid="week-grid">
      <div className="grid min-w-[760px]" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
        <div className="border-b border-slate-200" />
        {days.map((d) => (
          <div key={d} className={`border-b border-l border-slate-200 px-2 py-1 text-center text-xs font-medium ${d === today ? 'bg-brand-50 text-brand-700' : 'text-slate-600'}`}>
            {dayLabel(d)}
          </div>
        ))}
        <div className="relative" style={{ height }}>
          {hours.map((h) => (
            <div key={h} className="absolute right-1 -translate-y-2 text-[11px] text-slate-500" style={{ top: (h - from) * HOUR_PX }}>
              {h % 12 === 0 ? 12 : h % 12} {h >= 12 ? 'PM' : 'AM'}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const placed = placeDay(eventsOn(data.events, d));
          return (
            <div key={d} className={`relative border-l border-slate-200 ${d === today ? 'bg-brand-50/30' : ''}`} style={{ height }} data-date={d}>
              {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: (h - from) * HOUR_PX }} />)}
              {placed.length === 0 && <span className="absolute inset-x-0 top-2 text-center text-[11px] text-slate-400">No classes</span>}
              {placed.map(({ event, lane, lanes }) => (
                <div
                  key={event.id}
                  className="absolute p-0.5"
                  style={{ top: ((event.startMinute / 60) - from) * HOUR_PX, height: Math.max(((event.endMinute - event.startMinute) / 60) * HOUR_PX, 36), left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }}
                >
                  <EventCard e={event} data={data} onOpen={onOpen} compact selected={selectedId === event.id} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bi-weekly lists ─────────────────────────────────────────────────────────────────────────────────────────────
export function WeekList({ data, days, title, onOpen, selectedId }: { data: TimetableData; days: string[]; title: string; onOpen: (e: TimetableEvent) => void; selectedId: string | null }) {
  const rows = data.events.filter((e) => days.includes(e.date)).sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
  return (
    <section aria-label={title} className="rounded-md border border-slate-200 bg-white" data-testid="week-list">
      <h3 className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">{title}<span className="ml-2 font-normal text-slate-500">{dayLabel(days[0])} to {dayLabel(days[days.length - 1])}</span></h3>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-slate-500">No classes this week.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500"><tr><th className="px-3 py-1.5 font-medium">Day</th><th className="px-3 py-1.5 font-medium">Subject</th><th className="px-3 py-1.5 font-medium">Tutor</th><th className="px-3 py-1.5 font-medium">Time</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={`border-t border-slate-100 ${selectedId === e.id ? 'bg-brand-50' : ''} ${countsAsClass(e) ? '' : 'text-slate-400 line-through'}`} data-testid="timetable-row">
                <td className="px-3 py-1.5">{dayLabel(e.date)}</td>
                <td className="px-3 py-1.5"><button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => onOpen(e)}>{e.subjectName}</button></td>
                <td className="px-3 py-1.5">{e.tutorName ?? 'No tutor'}</td>
                <td className="px-3 py-1.5">{formatRange(e.startMinute, e.endMinute)}{e.problems.length > 0 && countsAsClass(e) ? <span className="ml-2 text-xs font-medium text-red-700">Needs attention</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ─── Month grid ──────────────────────────────────────────────────────────────────────────────────────────────────
export function MonthGrid({ data, onOpen, onPickDate, selectedDate, today }: { data: TimetableData; onOpen: (e: TimetableEvent) => void; onPickDate: (d: string) => void; selectedDate: string | null; today: string }) {
  const weeks = monthWeeks(data.period.from, data.period.to);
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white" data-testid="month-grid">
      <div className="grid min-w-[720px] grid-cols-7 text-xs">
        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((n) => <div key={n} className="border-b border-slate-200 px-2 py-1 text-center font-medium text-slate-600">{n.slice(0, 3)}</div>)}
        {weeks.flat().map((d) => {
          const inMonth = data.period.month ? d.startsWith(data.period.month) : true;
          const list = eventsOn(data.events, d);
          const shown = list.slice(0, 3);
          return (
            <div key={d} data-date={d} data-outside={inMonth ? undefined : 'true'} className={`min-h-[104px] border-b border-l border-slate-100 p-1 ${inMonth ? 'bg-white' : 'bg-slate-50'} ${selectedDate === d ? 'outline outline-2 -outline-offset-2 outline-brand-600' : ''}`}>
              <button type="button" onClick={() => onPickDate(d)} aria-label={`${longDayLabel(d)}, ${list.length} classes`} className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${d === today ? 'bg-brand-600 font-semibold text-white' : inMonth ? 'text-slate-800 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-100'}`}>
                {Number(d.slice(8))}
              </button>
              <div className="space-y-0.5">
                {shown.map((e) => <EventCard key={e.id} e={e} data={data} onOpen={onOpen} compact />)}
                {list.length > shown.length && <button type="button" className="text-[11px] font-medium text-brand-700 hover:underline" onClick={() => onPickDate(d)}>+{list.length - shown.length} more</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Details ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function EventDetails({ e, data, onClose }: { e: TimetableEvent; data: TimetableData; onClose: () => void }) {
  const subject = data.subjects.find((s) => s.subjectId === e.subjectId);
  const rows: Array<[string, React.ReactNode]> = [
    ['Subject', e.subjectName],
    ['Tutor', e.tutorProfileId && data.canViewTutorProfile ? <Link className="text-brand-700 hover:underline" href={`/tutors/${e.tutorProfileId}`}>{e.tutorName}</Link> : e.tutorName ?? 'No tutor selected'],
    ['Student', data.student.name],
    ['Grade', e.gradeName],
    ['Date', longDayLabel(e.date)],
    ['Time', `${formatRange(e.startMinute, e.endMinute)} (${hoursText(e.durationMinutes)})`],
    ['Frequency', `${e.frequencyLabel}, ${e.recurrence}`],
    ['Tutor assignment', ASSIGNMENT_LABELS[e.assignmentState]],
    ['Tutor availability', e.availability ? (e.availability.status === 'AVAILABLE' ? 'Confirmed for this date' : e.availability.reason) : 'Not checked, no tutor'],
    ['Class status', CLASS_STATUS_LABELS[e.classStatus]],
  ];
  return (
    <aside aria-label="Class details" className="rounded-md border border-slate-200 bg-white p-3" data-testid="event-details">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{e.subjectName} class</h3>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([k, v]) => <React.Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></React.Fragment>)}
      </dl>
      {e.problems.length > 0 && <ul role="alert" className="mt-2 space-y-0.5 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{e.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {(e.notes.length > 0 || subject?.startDate) && (
        <div className="mt-2 text-xs text-slate-600">
          {e.notes.map((n) => <p key={n}>{n}</p>)}
          {subject?.startDate && <p>Classes start on {longDayLabel(subject.startDate)}.</p>}
        </div>
      )}
    </aside>
  );
}

export function DayDetails({ date, data, onOpen, onClose }: { date: string; data: TimetableData; onOpen: (e: TimetableEvent) => void; onClose: () => void }) {
  const list = eventsOn(data.events, date);
  return (
    <aside aria-label="Classes on this date" className="rounded-md border border-slate-200 bg-white p-3" data-testid="day-details">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{longDayLabel(date)}</h3>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {list.length === 0 ? <p className="text-sm text-slate-500">No classes on this date.</p> : <div className="space-y-1">{list.map((e) => <EventCard key={e.id} e={e} data={data} onOpen={onOpen} />)}</div>}
    </aside>
  );
}

// ─── The page section ────────────────────────────────────────────────────────────────────────────────────────────
interface BoardProps {
  data: TimetableData;
  biweeklyTab: 'week1' | 'week2' | 'combined';
  onBiweeklyTab: (t: 'week1' | 'week2' | 'combined') => void;
  selectedEvent: TimetableEvent | null;
  selectedDate: string | null;
  onOpen: (e: TimetableEvent | null) => void;
  onPickDate: (d: string | null) => void;
  today: string;
}

/** The calendar for the chosen view, with the details beside it. Presentational: everything comes from `data`. */
export function TimetableBoard({ data, biweeklyTab, onBiweeklyTab, selectedEvent, selectedDate, onOpen, onPickDate, today }: BoardProps) {
  const { from, to } = data.period;
  let board: React.ReactNode;
  if (data.view === 'weekly') board = <WeekGrid data={data} days={datesOf(from, to)} onOpen={onOpen} selectedId={selectedEvent?.id ?? null} today={today} />;
  else if (data.view === 'monthly') board = <MonthGrid data={data} onOpen={onOpen} onPickDate={onPickDate} selectedDate={selectedDate} today={today} />;
  else {
    const week1 = datesOf(from, to).slice(0, 7);
    const week2 = datesOf(from, to).slice(7, 14);
    board = (
      <div className="space-y-2">
        <div role="group" aria-label="Weeks" className="flex gap-1">
          {([['week1', 'Week 1'], ['week2', 'Week 2'], ['combined', 'Combined 2 weeks']] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={biweeklyTab === k} onClick={() => onBiweeklyTab(k)} className={`rounded-md border px-2.5 py-1 text-xs ${biweeklyTab === k ? 'border-brand-600 bg-brand-50 font-medium text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
        {(biweeklyTab === 'week1' || biweeklyTab === 'combined') && <WeekList data={data} days={week1} title="Week 1" onOpen={onOpen} selectedId={selectedEvent?.id ?? null} />}
        {(biweeklyTab === 'week2' || biweeklyTab === 'combined') && <WeekList data={data} days={week2} title="Week 2" onOpen={onOpen} selectedId={selectedEvent?.id ?? null} />}
      </div>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">{board}</div>
      <div className="space-y-3">
        {selectedEvent ? <EventDetails e={selectedEvent} data={data} onClose={() => onOpen(null)} /> : selectedDate ? <DayDetails date={selectedDate} data={data} onOpen={onOpen} onClose={() => onPickDate(null)} /> : (
          <aside className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">Choose a class to see its details{data.view === 'monthly' ? ', or a date to see everything on it' : ''}.</aside>
        )}
        <section aria-label="Subjects and tutors" className="rounded-md border border-slate-200 bg-white p-3">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Subjects and tutors</h3>
          {data.subjects.length === 0 ? <p className="text-sm text-slate-500">No subjects are scheduled yet.</p> : (
            <ul className="space-y-1 text-sm">
              {data.subjects.map((s) => (
                <li key={s.subjectId} className="flex items-start gap-2">
                  <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${colourFor(s.subjectId, subjectIdsOf(data)).dot}`} />
                  <span><span className="font-medium">{s.subjectName}</span>, {s.gradeName}, {s.frequencyLabel}<br /><span className="text-slate-600">{s.tutorName ?? 'No tutor selected'}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Stage 3: the timetable made from the saved subject schedules and tutors, above the existing checklist. */
export function TimetablePanel({ activationId }: { activationId: string }) {
  const [view, setView] = React.useState<TimetableViewName>('weekly');
  const [date, setDate] = React.useState(todayIso);
  const [biweeklyTab, setBiweeklyTab] = React.useState<'week1' | 'week2' | 'combined'>('combined');
  const [data, setData] = React.useState<TimetableData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const today = todayIso();

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    mentoringApi(`/mentoring/students/${activationId}/timetable?view=${view}&from=${date}`)
      .then((d: TimetableData) => !cancelled && (setData(d), setError(null)))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error && e.message ? e.message : 'The timetable could not be loaded.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [activationId, view, date]);

  const selectedEvent = data?.events.find((e) => e.id === selectedId) ?? null;
  const go = (d: string) => { setDate(d); setSelectedId(null); setSelectedDate(null); };
  return (
    <section aria-label="Timetable" className="space-y-3" data-testid="stage-timetable">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold text-slate-900">{data ? `${data.student.name}, timetable` : 'Timetable'}</h2>
        {data && <Badge variant={STATUS_TONE[data.status]} data-testid="timetable-status">{STATUS_LABELS[data.status]}</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Timetable controls">
        <div role="tablist" aria-label="View" className="flex gap-1">
          {VIEWS.map(([k, label]) => (
            <button key={k} role="tab" type="button" aria-selected={view === k} onClick={() => { setView(k); setSelectedId(null); setSelectedDate(null); }} className={`rounded-md border px-3 py-1 text-sm ${view === k ? 'border-brand-600 bg-brand-50 font-medium text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" aria-label="Previous period" onClick={() => go(shiftDate(view, data?.period.from ?? date, -1))}><ChevronLeft aria-hidden className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="outline" onClick={() => go(todayIso())}>Today</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Next period" onClick={() => go(shiftDate(view, data?.period.from ?? date, 1))}><ChevronRight aria-hidden className="h-4 w-4" /></Button>
        <span className="w-44"><Input aria-label="Choose a date" type="date" className="h-9" value={date} onChange={(e) => e.target.value && go(e.target.value)} /></span>
        {data && <p className="text-sm font-medium text-slate-700" aria-live="polite">{periodTitle(data.period)}</p>}
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!data && loading && <p className="text-sm text-slate-500">Loading the timetable</p>}
      {data && (
        <>
          <SummaryCards data={data} />
          {data.warnings.length > 0 && (
            <ul role="list" aria-label="Schedule warnings" className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="timetable-warnings">
              {data.warnings.map((w) => <li key={`${w.subjectId}-${w.kind}`}>{w.message}</li>)}
            </ul>
          )}
          <TimetableBoard data={data} biweeklyTab={biweeklyTab} onBiweeklyTab={setBiweeklyTab} selectedEvent={selectedEvent} selectedDate={selectedDate} onOpen={(e) => { setSelectedId(e?.id ?? null); if (e) setSelectedDate(null); }} onPickDate={(d) => { setSelectedDate(d); setSelectedId(null); }} today={today} />
        </>
      )}
    </section>
  );
}
