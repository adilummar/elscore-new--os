"use client";

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatRange } from '../../mentoring/tutor-availability';

/** What the API sends for a tutor's calendar. */
export type SegmentState = 'CLASS' | 'FREE' | 'BREAK' | 'BLOCKED' | 'NOT_WORKING' | 'LEAVE' | 'HOLIDAY' | 'DAY_OFF' | 'NOT_CONFIGURED';

export interface Segment {
  start: number;
  end: number;
  state: SegmentState;
  label?: { subject: string; student: string | null };
  moved?: boolean;
  note?: string;
}

export interface CalendarDay {
  date: string;
  label: string;
  weekday: number;
  closed: { kind: 'LEAVE' | 'HOLIDAY' | 'DAY_OFF'; note: string } | null;
  configured: boolean;
  segments: Segment[];
  totals: { freeMinutes: number; bookedMinutes: number; breakMinutes: number };
  affected: Array<{ startMinute: number; endMinute: number; subject: string; student: string | null }>;
}

export interface TutorCalendar {
  tutor: { id: string; name: string; photoUrl: string | null; subjects: string[]; levels: string[]; active: boolean };
  from: string;
  to: string;
  canSeeStudents: boolean;
  days: CalendarDay[];
}

// ─── Dates, kept as plain YYYY-MM-DD text so no time zone can move a day ────────────────────────────────────────
const toUtc = (d: string) => new Date(`${d}T00:00:00Z`);
export const isoOf = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => isoOf(new Date(toUtc(d).getTime() + n * 86_400_000));
export const mondayOf = (d: string) => addDays(d, -((toUtc(d).getUTCDay() + 6) % 7));
export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const STYLE: Record<SegmentState, { box: string; text: string; word: string }> = {
  CLASS: { box: 'border-l-4 border-red-400 bg-red-50', text: 'text-red-900', word: 'Occupied' },
  FREE: { box: 'border-l-4 border-emerald-400 bg-emerald-50', text: 'text-emerald-900', word: 'Available' },
  BREAK: { box: 'border-l-4 border-amber-400 bg-amber-50', text: 'text-amber-900', word: 'Break' },
  BLOCKED: { box: 'border-l-4 border-amber-500 bg-amber-50', text: 'text-amber-900', word: 'Time blocked' },
  NOT_WORKING: { box: 'border-l-4 border-slate-300 bg-slate-50', text: 'text-slate-500', word: 'Not working' },
  LEAVE: { box: 'border-l-4 border-violet-400 bg-violet-50', text: 'text-violet-900', word: 'On leave' },
  HOLIDAY: { box: 'border-l-4 border-sky-400 bg-sky-50', text: 'text-sky-900', word: 'Public holiday' },
  DAY_OFF: { box: 'border-l-4 border-slate-400 bg-slate-100', text: 'text-slate-700', word: 'Not working this date' },
  NOT_CONFIGURED: { box: 'border-l-4 border-slate-300 bg-white', text: 'text-slate-600', word: 'Availability not configured' },
};

const hoursAndMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};

/** The stretches of one day. A long stretch outside working time is left out unless the whole day is closed. */
function SegmentList({ day, compact }: { day: CalendarDay; compact?: boolean }) {
  const allOff = day.segments.length === 1 && day.segments[0].state === 'NOT_WORKING';
  const shown = day.segments.filter((s) => s.state !== 'NOT_WORKING' || allOff);
  return (
    <ul role="list" className="space-y-1" data-date={day.date}>
      {shown.map((s) => {
        const style = STYLE[s.state];
        return (
          <li key={`${s.start}-${s.state}`} className={`rounded-sm px-2 py-1 ${style.box} ${style.text} ${compact ? 'text-xs' : 'text-sm'}`} data-state={s.state}>
            {s.state === 'NOT_WORKING' || s.state === 'LEAVE' || s.state === 'HOLIDAY' || s.state === 'DAY_OFF' || s.state === 'NOT_CONFIGURED' ? (
              <span className="font-medium">{style.word}{s.note ? `: ${s.note}` : ''}</span>
            ) : (
              <>
                <span className="font-medium">{formatRange(s.start, s.end)}</span>
                <span className="ml-2">
                  {s.state === 'CLASS' ? `${s.label?.subject ?? 'Class'}${s.label ? `, ${s.label.student ?? 'Booked'}` : ''}${s.moved ? ' (moved here)' : ''}, ${style.word.toLowerCase()}` : style.word}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DayCard({ day, compact }: { day: CalendarDay; compact?: boolean }) {
  const working = day.segments.some((s) => s.state === 'FREE' || s.state === 'CLASS');
  return (
    <section aria-label={day.label} className="rounded-md border border-slate-200 bg-white p-3" data-testid="calendar-day">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold text-slate-900">{day.label}</h3>
        {working && !day.closed && (
          <p className="text-xs text-slate-500">
            {hoursAndMinutes(day.totals.freeMinutes)} free, {hoursAndMinutes(day.totals.bookedMinutes)} booked{day.totals.breakMinutes ? `, ${hoursAndMinutes(day.totals.breakMinutes)} break` : ''}
          </p>
        )}
      </div>
      <SegmentList day={day} compact={compact} />
      {day.affected.length > 0 && (
        <div role="alert" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900" data-testid="calendar-affected">
          <p className="font-medium">Classes on a day the tutor is away. Nothing is cancelled until someone decides.</p>
          {day.affected.map((c) => <p key={`${c.startMinute}-${c.subject}`}>{formatRange(c.startMinute, c.endMinute)}, {c.subject}{c.student ? `, ${c.student}` : ', Booked'}</p>)}
        </div>
      )}
    </section>
  );
}

const LEGEND: Array<[SegmentState, string]> = [['CLASS', 'Occupied by a student'], ['FREE', 'Available'], ['BREAK', 'Break'], ['BLOCKED', 'Time blocked'], ['NOT_WORKING', 'Not working'], ['LEAVE', 'Leave'], ['HOLIDAY', 'Public holiday'], ['NOT_CONFIGURED', 'Availability not configured']];

interface Props {
  calendar: TutorCalendar | null;
  selected: string;
  mode: 'day' | 'week';
  loading?: boolean;
  error?: string | null;
  onSelect: (date: string) => void;
  onMode: (mode: 'day' | 'week') => void;
}

/** A tutor's timetable for one chosen date or one week, with the controls to move through the calendar. */
export function TutorTimetable({ calendar, selected, mode, loading = false, error = null, onSelect, onMode }: Props) {
  const step = mode === 'week' ? 7 : 1;
  const heading = mode === 'week' ? `Week of ${mondayOf(selected)}` : selected;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Calendar controls">
        <Button type="button" size="sm" variant="outline" aria-label={mode === 'week' ? 'Previous week' : 'Previous day'} onClick={() => onSelect(addDays(selected, -step))}>
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onSelect(todayIso())}>Today</Button>
        <Button type="button" size="sm" variant="outline" aria-label={mode === 'week' ? 'Next week' : 'Next day'} onClick={() => onSelect(addDays(selected, step))}>
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Button>
        <span className="w-44"><Input aria-label="Choose a date" type="date" className="h-9" value={selected} onChange={(e) => e.target.value && onSelect(e.target.value)} /></span>
        <div role="group" aria-label="View" className="ml-auto flex gap-1">
          {(['day', 'week'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)} className={`rounded-md border px-2.5 py-1 text-xs ${mode === m ? 'border-brand-600 bg-brand-50 font-medium text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {m === 'day' ? 'Day' : 'Week'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm font-medium text-slate-700" aria-live="polite">{heading}</p>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading && !calendar && <p className="text-sm text-slate-500">Loading the timetable</p>}
      {calendar && (
        <div className={mode === 'week' ? 'grid gap-2 md:grid-cols-2 xl:grid-cols-4' : 'space-y-2'} data-testid="calendar-days" data-mode={mode}>
          {calendar.days.map((d) => <DayCard key={d.date} day={d} compact={mode === 'week'} />)}
        </div>
      )}
      {calendar && !calendar.canSeeStudents && <p className="text-xs text-slate-500">You can see that a time is booked and for which subject. The student is shown only to people who may see that student.</p>}

      <ul role="list" aria-label="Key" className="flex flex-wrap gap-2 text-xs text-slate-600">
        {LEGEND.map(([state, text]) => (
          <li key={state} className={`rounded-sm px-2 py-0.5 ${STYLE[state].box}`}>{text}</li>
        ))}
      </ul>
    </div>
  );
}
