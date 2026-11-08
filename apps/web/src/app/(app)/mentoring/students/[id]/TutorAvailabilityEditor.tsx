"use client";

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  AvailabilityWindow,
  DAY_NAMES,
  DAY_ORDER,
  DayNumber,
  MAX_WINDOWS_PER_DAY,
  clockToMinutes,
  formatRange,
  minutesToClock,
  validateAvailability,
} from '../../tutor-availability';

/** A time a class needs, offered as a one-click addition to the tutor's working hours. */
export interface NeededTime {
  dayNumber: DayNumber;
  startMinute: number;
  endMinute: number;
}

interface Props {
  /** Who the hours belong to, for the heading and the field labels. */
  name: string;
  initial: AvailabilityWindow[];
  onSave: (windows: AvailabilityWindow[]) => Promise<void>;
  onCancel?: () => void;
  needed?: NeededTime[];
  saveLabel?: string;
}

const same = (a: AvailabilityWindow[], b: AvailabilityWindow[]) => JSON.stringify(a) === JSON.stringify(b);

/** Adds a range, joining it to any range on that day that it overlaps or touches, so the result is always valid. */
export function addRange(windows: AvailabilityWindow[], add: AvailabilityWindow): AvailabilityWindow[] {
  let start = clockToMinutes(add.start);
  let end = clockToMinutes(add.end);
  const keep: AvailabilityWindow[] = [];
  for (const w of windows) {
    const ws = clockToMinutes(w.start);
    const we = clockToMinutes(w.end);
    if (w.day === add.day && ws <= end && we >= start) {
      start = Math.min(start, ws);
      end = Math.max(end, we);
    } else keep.push(w);
  }
  return [...keep, { day: add.day, start: minutesToClock(start), end: minutesToClock(end) }];
}

/**
 * A tutor's weekly working hours: several time ranges a day, a day with none is a day off, and two ranges on one day
 * leave a break. The same rules run here and on the server; the server is the authority.
 */
export function TutorAvailabilityEditor({ name, initial, onSave, onCancel, needed = [], saveLabel = 'Save availability' }: Props) {
  const [windows, setWindows] = React.useState<AvailabilityWindow[]>(initial);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const checked = validateAvailability(windows);
  const start = validateAvailability(initial);
  const dirty = !same(start.ok ? start.value : initial, checked.ok ? checked.value : windows);

  const indexed = windows.map((w, index) => ({ ...w, index }));
  // Every change builds on the latest hours, so two quick changes never overwrite each other.
  const edit = (index: number, patch: Partial<AvailabilityWindow>) => setWindows((current) => current.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  const save = async () => {
    if (!checked.ok) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(checked.value);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The availability could not be saved. Please try again.');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3" data-testid="tutor-availability-editor">
      <p className="text-sm text-slate-600">
        Working hours for <span className="font-medium text-slate-900">{name}</span>. A day with no time range is a day off. Add two ranges on one day to leave a break.
        Changing the hours never changes a class that is already booked.
      </p>

      {needed.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p className="font-medium">Times this student needs</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {needed.map((n) => (
              <button
                key={`${n.dayNumber}-${n.startMinute}`}
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-100"
                onClick={() => setWindows((current) => addRange(current, { day: n.dayNumber, start: minutesToClock(n.startMinute), end: minutesToClock(n.endMinute) }))}
              >
                Add {DAY_NAMES[n.dayNumber]} {formatRange(n.startMinute, n.endMinute)}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul role="list" className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {DAY_ORDER.map((day) => {
          const ranges = indexed.filter((w) => w.day === day);
          return (
            <li key={day} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2" data-day={day}>
              <span className="w-24 pt-2 text-sm font-medium text-slate-800">{DAY_NAMES[day]}</span>
              <div className="min-w-0 flex-1 space-y-2">
                {ranges.length === 0 && <p className="pt-2 text-sm text-slate-500">Not working</p>}
                {ranges.map((r) => (
                  <div key={r.index} className="flex flex-wrap items-center gap-2">
                    <span className="inline-block w-32"><Input aria-label={`${DAY_NAMES[day]} range ${ranges.indexOf(r) + 1} start`} type="time" className="h-9" value={r.start} onChange={(e) => edit(r.index, { start: e.target.value })} /></span>
                    <span className="text-xs text-slate-500">to</span>
                    <span className="inline-block w-32"><Input aria-label={`${DAY_NAMES[day]} range ${ranges.indexOf(r) + 1} end`} type="time" className="h-9" value={r.end} onChange={(e) => edit(r.index, { end: e.target.value })} /></span>
                    <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${DAY_NAMES[day]} range ${ranges.indexOf(r) + 1}`} onClick={() => setWindows((current) => current.filter((_, i) => i !== r.index))}>
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={ranges.length >= MAX_WINDOWS_PER_DAY}
                onClick={() => setWindows((current) => [...current, { day, start: ranges.some((x) => x.day === day) ? '16:00' : '14:00', end: '18:00' }])}
              >
                <Plus aria-hidden className="mr-1 h-3.5 w-3.5" />Add time range
              </Button>
            </li>
          );
        })}
      </ul>

      {!checked.ok && <p role="alert" className="text-xs font-medium text-red-600">{checked.message}</p>}
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" isLoading={saving} disabled={!checked.ok || !dirty} onClick={save}>{saveLabel}</Button>
        {onCancel && <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>}
        {!dirty && checked.ok && <span className="text-xs text-slate-500">No changes yet</span>}
      </div>
    </div>
  );
}
