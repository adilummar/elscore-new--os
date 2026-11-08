"use client";

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EditableFieldMeta } from '../../handover-presentation';
import { AssignmentView, TutorTools } from '../../tutor-types';
import { AssignedTutor } from './TutorPanel';
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  OCCURRENCES,
  OCCURRENCE_LABELS,
  PERIOD_LABELS,
  WEEKDAYS,
  Frequency,
  Occurrence,
  ScheduleValue,
  SubjectSchedule,
  Weekday,
  classesIn,
  conflictMessage,
  findConflicts,
  formatMinutes,
  hoursMismatch,
  hoursToMinutes,
  isScheduleValue,
  minutesToHoursText,
  newSubject,
  planTotals,
  restoreEqualSplit,
  scheduleProblem,
  scheduledMinutes,
  sessionLabel,
  setFrequency,
  setOccurrences,
  setSessionDuration,
  setSessionEnd,
  setSessionStart,
  setTotalMinutes,
  subjectProblem,
  suggestedClasses,
  toggleDay,
  totalClasses,
} from '../../subject-schedule';

/** One Sales subject line, offered as a quick way to add a subject card. */
export interface ScheduleSuggestion {
  subject: string;
  grade: string;
  monthlyHours: string | null;
}

interface EditorProps {
  id: string;
  label: string;
  meta: EditableFieldMeta;
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
  disabled?: boolean;
  /** What is stored now. A timetable saved before subject schedules is shown as an earlier timetable. */
  previous?: unknown;
  suggestions?: ScheduleSuggestion[];
  /** Adds a subject to the master list. Offered only to people who may manage reference data; the API checks again. */
  onCreateSubject?: (name: string) => Promise<void>;
  /** Tutor selection for each subject. Omitted where tutors cannot be chosen. */
  tutorTools?: TutorTools;
}

/** Compares what matters for matching a tutor: level, frequency, hours and the classes with their times. */
function matchKey(s: SubjectSchedule): string {
  const sessions = s.sessions.map((x) => `${x.week ?? ''}|${x.day}|${(x.occurrences ?? []).join('+')}|${x.durationMinutes}|${x.start ?? ''}|${x.end ?? ''}`).sort();
  return JSON.stringify([s.gradeId, s.frequency, s.totalMinutes, s.distribution, sessions]);
}

const SHORT_DAY: Record<Weekday, string> = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
const DURATION_PRESETS = [30, 60, 90, 120];
const chip = (on: boolean) => `rounded-md border px-2.5 py-1 text-xs ${on ? 'border-brand-600 bg-brand-50 font-medium text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'} disabled:opacity-60`;

function DayChips({ label, days, onToggle, disabled }: { label: string; days: ReadonlySet<Weekday>; onToggle: (day: Weekday) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {WEEKDAYS.map((day) => (
        <button key={day} type="button" aria-label={day} aria-pressed={days.has(day)} disabled={disabled} className={chip(days.has(day))} onClick={() => onToggle(day)}>
          {SHORT_DAY[day]}
        </button>
      ))}
    </div>
  );
}

/** Total hours as typed text ("1.5"). The text is kept while typing, so "1." is not rewritten under the cursor. */
function HoursInput({ id, label, minutes, onMinutes, disabled }: { id: string; label: string; minutes: number; onMinutes: (minutes: number) => void; disabled?: boolean }) {
  const [text, setText] = React.useState(minutesToHoursText(minutes));
  const emitted = React.useRef(minutes);
  React.useEffect(() => {
    if (minutes !== emitted.current) {
      emitted.current = minutes;
      setText(minutesToHoursText(minutes));
    }
  }, [minutes]);
  const bad = text.trim() !== '' && hoursToMinutes(text) === null;
  return (
    <Input
      id={id}
      aria-label={label}
      inputMode="decimal"
      placeholder="e.g. 4 or 1.5"
      disabled={disabled}
      value={text}
      error={bad ? 'Enter hours as a number, for example 1.5' : undefined}
      onChange={(e) => {
        setText(e.target.value);
        const next = hoursToMinutes(e.target.value) ?? 0;
        emitted.current = next;
        onMinutes(next);
      }}
    />
  );
}

/** A class length: 30 minutes, 1 hour, 1 hour 30 minutes, 2 hours, or any other length in minutes. */
function DurationControl({ label, minutes, onChange, disabled }: { label: string; minutes: number; onChange: (minutes: number) => void; disabled?: boolean }) {
  const [custom, setCustom] = React.useState(!DURATION_PRESETS.includes(minutes));
  const showCustom = custom || !DURATION_PRESETS.includes(minutes);
  return (
    <span className="inline-flex items-center gap-1">
      <Select
        aria-label={`${label} length`}
        disabled={disabled}
        className="h-9 w-auto min-w-[8.5rem]"
        value={showCustom ? 'custom' : String(minutes)}
        onChange={(e) => {
          if (e.target.value === 'custom') setCustom(true);
          else {
            setCustom(false);
            onChange(Number(e.target.value));
          }
        }}
      >
        {DURATION_PRESETS.map((m) => <option key={m} value={m}>{formatMinutes(m)}</option>)}
        <option value="custom">Custom</option>
      </Select>
      {showCustom && (
        <Input aria-label={`${label} length in minutes`} type="number" min={5} step={5} disabled={disabled} className="h-9 w-20" value={minutes || ''} onChange={(e) => onChange(Number(e.target.value) || 0)} />
      )}
    </span>
  );
}

interface CardProps {
  index: number;
  baseId: string;
  subject: SubjectSchedule;
  meta: NonNullable<EditableFieldMeta['schedule']>;
  takenIds: ReadonlySet<string>;
  salesHours: string | null;
  disabled?: boolean;
  tutorTools?: TutorTools;
  /** This card matches the saved schedule, so tutors can be matched against it. */
  saved: boolean;
  onChange: (next: SubjectSchedule) => void;
  onRemove: () => void;
}

function SubjectCard({ index, baseId, subject, meta, takenIds, salesHours, disabled, tutorTools, saved, onChange, onRemove }: CardProps) {
  const [customizing, setCustomizing] = React.useState(false);
  const id = `${baseId}-subject-${index}`;
  const period = PERIOD_LABELS[subject.frequency];
  const planned = scheduledMinutes(subject);
  const matches = subject.totalMinutes > 0 && planned === subject.totalMinutes;
  const mismatch = subject.totalMinutes > 0 && subject.sessions.length > 0 ? hoursMismatch(subject) : null;
  const problem = subjectProblem(subject, { subjects: meta.subjects, grades: meta.grades });
  const editingLengths = subject.distribution === 'CUSTOM' || customizing;
  const hoursText = (m: number) => minutesToHoursText(m) || '0';
  const daysIn = (week?: 1 | 2) => new Set(subject.sessions.filter((s) => week === undefined || s.week === week).map((s) => s.day));
  const suggested = subject.sessions.length === 0 ? suggestedClasses(subject.totalMinutes, meta.defaultSessionMinutes) : null;

  const title = subject.subjectName || 'New subject';
  return (
    <section aria-label={`${title} schedule`} className="rounded-md border border-slate-200 bg-slate-50/50 p-3" data-subject-card={subject.subjectId || 'new'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          <p className="text-xs text-slate-500">{[subject.gradeName, FREQUENCY_LABELS[subject.frequency], subject.totalMinutes ? `${hoursText(subject.totalMinutes)} hours ${period}` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onRemove}>Remove subject</Button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-slate-600">
          Subject
          <Select
            aria-label={`Subject ${index + 1}`}
            disabled={disabled}
            value={subject.subjectId}
            onChange={(e) => {
              const ref = meta.subjects.find((s) => s.id === e.target.value);
              onChange({ ...subject, subjectId: ref?.id ?? '', subjectName: ref?.name ?? '' });
            }}
          >
            <option value="">Select a subject</option>
            {meta.subjects.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id !== subject.subjectId && takenIds.has(s.id)}>
                {s.name}{s.id !== subject.subjectId && takenIds.has(s.id) ? ' (already added)' : ''}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-xs text-slate-600">
          Required level
          <Select
            aria-label={`Required level ${index + 1}`}
            disabled={disabled}
            value={subject.gradeId}
            onChange={(e) => {
              const ref = meta.grades.find((g) => g.id === e.target.value);
              onChange({ ...subject, gradeId: ref?.id ?? '', gradeName: ref?.name ?? '' });
            }}
          >
            <option value="">Select a level</option>
            {meta.grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </label>
        <label className="block text-xs text-slate-600">
          How often
          <Select aria-label={`Frequency ${index + 1}`} disabled={disabled} value={subject.frequency} onChange={(e) => { setCustomizing(false); onChange(setFrequency(subject, e.target.value as Frequency)); }}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
          </Select>
        </label>
        <div className="block text-xs text-slate-600">
          <label htmlFor={`${id}-hours`}>Total required hours {period}</label>
          <HoursInput id={`${id}-hours`} label={`Total required hours ${index + 1}`} minutes={subject.totalMinutes} disabled={disabled} onMinutes={(m) => onChange(setTotalMinutes(subject, m))} />
        </div>
      </div>
      {salesHours && <p className="mt-1 text-xs text-slate-500">Sales recorded {salesHours} hours a month for this subject.</p>}

      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium text-slate-700">Preferred days</p>
        {subject.frequency === 'WEEKLY' && <DayChips label={`${title} days`} days={daysIn()} disabled={disabled} onToggle={(day) => onChange(toggleDay(subject, day))} />}
        {subject.frequency === 'BIWEEKLY' &&
          ([1, 2] as const).map((week) => (
            <div key={week} className="flex flex-wrap items-center gap-2">
              <span className="w-14 text-xs text-slate-600">Week {week}</span>
              <DayChips label={`${title} week ${week} days`} days={daysIn(week)} disabled={disabled} onToggle={(day) => onChange(toggleDay(subject, day, week))} />
            </div>
          ))}
        {subject.frequency === 'MONTHLY' && (
          <>
            <DayChips label={`${title} days`} days={daysIn()} disabled={disabled} onToggle={(day) => onChange(toggleDay(subject, day))} />
            {subject.sessions.map((s) => (
              <div key={s.day} className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-xs text-slate-600">{s.day}</span>
                <div role="group" aria-label={`${s.day} pattern`} className="flex flex-wrap gap-1">
                  {OCCURRENCES.map((o: Occurrence) => {
                    const on = (s.occurrences ?? []).includes(o);
                    return (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={on}
                        disabled={disabled}
                        className={chip(on)}
                        onClick={() => {
                          const current = s.occurrences ?? [];
                          const next = o === 'EVERY' ? ['EVERY' as Occurrence] : current.includes(o) ? current.filter((x) => x !== o) : [...current.filter((x) => x !== 'EVERY'), o];
                          onChange(setOccurrences(subject, s.day, next.length ? next : ['EVERY']));
                        }}
                      >
                        {OCCURRENCE_LABELS[o]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
        {suggested !== null && <p className="text-xs text-slate-500">At {formatMinutes(meta.defaultSessionMinutes)} a class, {formatMinutes(subject.totalMinutes)} is {suggested} {suggested === 1 ? 'class' : 'classes'} {period}. Choose the days you prefer.</p>}
      </div>

      {subject.sessions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-700">Schedule from these days</p>
          <ul role="list" className="mt-1 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
            {subject.sessions.map((s, i) => (
              <li key={`${s.week ?? 0}-${s.day}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-sm">
                <span className="min-w-[9rem] text-slate-900">
                  {sessionLabel(s, subject.frequency)}
                  {subject.frequency === 'MONTHLY' && classesIn(s, 'MONTHLY') > 1 && <span className="ml-1 text-xs text-slate-500">x {classesIn(s, 'MONTHLY')} a month</span>}
                </span>
                {editingLengths ? (
                  <DurationControl label={sessionLabel(s, subject.frequency)} minutes={s.durationMinutes} disabled={disabled} onChange={(m) => onChange(setSessionDuration(subject, i, m))} />
                ) : (
                  <span className="min-w-[7rem] text-slate-700">{formatMinutes(s.durationMinutes)}</span>
                )}
                <label className="inline-flex items-center gap-1 text-xs text-slate-500">
                  From
                  <Input aria-label={`${sessionLabel(s, subject.frequency)} start time`} type="time" disabled={disabled} className="h-9 w-28" value={s.start ?? ''} onChange={(e) => onChange(setSessionStart(subject, i, e.target.value))} />
                </label>
                <label className="inline-flex items-center gap-1 text-xs text-slate-500">
                  To
                  <Input aria-label={`${sessionLabel(s, subject.frequency)} end time`} type="time" disabled={disabled || !s.start} className="h-9 w-28" value={s.end ?? ''} onChange={(e) => onChange(setSessionEnd(subject, i, e.target.value))} />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className={`text-sm font-medium ${matches ? 'text-emerald-700' : 'text-amber-700'}`} data-total-status={matches ? 'ok' : 'off'}>
          Total: {hoursText(planned)} / {hoursText(subject.totalMinutes)} hours {period}
          {subject.frequency === 'MONTHLY' && subject.sessions.length > 0 && <span className="ml-2 text-xs font-normal text-slate-500">{totalClasses(subject)} classes a month</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {!editingLengths && subject.sessions.length > 0 && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setCustomizing(true)}>Edit session durations</Button>}
          {editingLengths && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => { setCustomizing(false); onChange(restoreEqualSplit(subject)); }}>Restore equal distribution</Button>}
        </div>
      </div>
      {mismatch && <p role="alert" className="mt-1 text-xs font-medium text-amber-700">{mismatch}</p>}
      {!mismatch && problem && <p className="mt-1 text-xs text-amber-700">Still needed: {problem}</p>}

      {tutorTools && subject.subjectId && <AssignedTutor subjectId={subject.subjectId} subjectName={subject.subjectName} tools={tutorTools} saved={saved} />}
    </section>
  );
}

/** Stage 2 editor for the preferred timetable: one card per subject, each with its own frequency, hours and days. */
export function SubjectScheduleEditor({ id, label, meta, value, onChange, disabled = false, previous, suggestions = [], onCreateSubject, tutorTools }: EditorProps) {
  const lists = meta.schedule ?? { subjects: [], grades: [], defaultSessionMinutes: 60, canAddSubject: false };
  const [newName, setNewName] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);

  const subjects = value.subjects;
  const set = (next: SubjectSchedule[]) => onChange({ ...value, subjects: next });
  const taken = new Set(subjects.map((s) => s.subjectId).filter(Boolean));
  const totals = planTotals(subjects);
  const conflicts = findConflicts(subjects);
  const ready = scheduleProblem(value, { subjects: lists.subjects, grades: lists.grades });
  const storedKeys = new Map((isScheduleValue(previous) ? previous.subjects : []).map((s) => [s.subjectId, matchKey(s)]));
  const legacy = Array.isArray(previous) ? previous.filter((r): r is Record<string, string> => !!r && typeof r === 'object') : [];

  const byName = (list: Array<{ id: string; name: string }>, name: string) => list.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
  const fromSales = (s: ScheduleSuggestion) => {
    const subject = byName(lists.subjects, s.subject);
    const grade = byName(lists.grades, s.grade);
    set([...subjects, { ...newSubject('WEEKLY'), subjectId: subject?.id ?? '', subjectName: subject?.name ?? '', gradeId: grade?.id ?? '', gradeName: grade?.name ?? '' }]);
  };
  const pending = suggestions.filter((s) => {
    const ref = byName(lists.subjects, s.subject);
    return !ref || !taken.has(ref.id);
  });
  const salesHoursFor = (subject: SubjectSchedule) => suggestions.find((s) => byName(lists.subjects, s.subject)?.id === subject.subjectId)?.monthlyHours ?? null;

  const create = async () => {
    if (!onCreateSubject || !newName.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await onCreateSubject(newName.trim());
      setNewName('');
    } catch (e) {
      setAddError(e instanceof Error && e.message ? e.message : 'The subject could not be added. Check that you have access to reference data.');
    }
    setAdding(false);
  };

  const hoursOf = (m: number) => minutesToHoursText(m) || '0';
  return (
    <div id={id} className="space-y-3" aria-label={label}>
      {legacy.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">Earlier timetable, without subjects</p>
          <p className="mt-0.5">{legacy.map((r) => `${r.day ?? ''} ${r.start ?? ''}${r.end ? ` to ${r.end}` : ''}`.trim()).join(', ')}</p>
          <p className="mt-0.5">It stays on record. Saving a subject schedule replaces it, and the change is kept in the history.</p>
        </div>
      )}

      {subjects.length === 0 && <p className="text-sm text-slate-500">No subjects yet. Add a subject, then set its level, how often it meets, the hours and the days.</p>}

      {subjects.map((subject, index) => (
        <SubjectCard
          key={index}
          index={index}
          baseId={id}
          subject={subject}
          meta={lists}
          takenIds={taken}
          salesHours={salesHoursFor(subject)}
          disabled={disabled}
          tutorTools={tutorTools}
          saved={storedKeys.get(subject.subjectId) === matchKey(subject)}
          onChange={(next) => set(subjects.map((s, i) => (i === index ? next : s)))}
          onRemove={() => set(subjects.filter((_, i) => i !== index))}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled || subjects.length >= 15} onClick={() => set([...subjects, newSubject('WEEKLY')])}>
          <Plus aria-hidden className="mr-1 h-3.5 w-3.5" />Add subject
        </Button>
        {pending.map((s) => (
          <button key={`${s.subject}-${s.grade}`} type="button" disabled={disabled} className={chip(false)} onClick={() => fromSales(s)}>
            Add {s.subject}{s.grade ? ` (${s.grade})` : ''} from Sales
          </button>
        ))}
      </div>

      {lists.canAddSubject && onCreateSubject ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">
            Subject not in the list?
            <Input aria-label="New subject name" placeholder="New subject name" disabled={disabled || adding} className="h-9 w-56" value={newName} maxLength={100} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <Button type="button" size="sm" variant="outline" isLoading={adding} disabled={disabled || !newName.trim()} onClick={create}>Add to subject list</Button>
          {addError && <p role="alert" className="text-xs font-medium text-red-600">{addError}</p>}
        </div>
      ) : (
        <p className="text-xs text-slate-500">A subject that is not in the list can be added by someone with access to reference data.</p>
      )}

      {subjects.length > 0 && (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="schedule-plan-totals">
          <p className="font-medium text-slate-800">Learning plan: {totals.subjects} {totals.subjects === 1 ? 'subject' : 'subjects'}</p>
          <ul role="list" className="mt-0.5 space-y-0.5">
            {FREQUENCIES.filter((f) => totals.byFrequency[f].subjects > 0).map((f) => (
              <li key={f}>{FREQUENCY_LABELS[f]}: {hoursOf(totals.byFrequency[f].minutes)} hours {PERIOD_LABELS[f]} across {totals.byFrequency[f].subjects} {totals.byFrequency[f].subjects === 1 ? 'subject' : 'subjects'}</li>
            ))}
          </ul>
          <p className="mt-0.5 text-slate-500">About {hoursOf(totals.monthlyEquivalentMinutes)} hours a month in all, counting a month as four weeks.</p>
        </div>
      )}

      {conflicts.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="schedule-conflicts">
          <p className="font-medium">Overlapping times</p>
          <ul role="list" className="mt-0.5 list-disc pl-4">
            {conflicts.map((c, i) => <li key={i}>{conflictMessage(c)}</li>)}
          </ul>
          <p className="mt-0.5">You can still save. Change a start time if both classes cannot run together.</p>
        </div>
      )}

      {ready && subjects.length > 0 && <p className="text-xs text-slate-500" data-testid="schedule-not-ready">Not ready to save: {ready}</p>}
    </div>
  );
}

/** The saved schedule for people who cannot edit it: one block per subject with its classes. */
export function SubjectScheduleView({ value, assignments = [] }: { value: ScheduleValue; assignments?: AssignmentView[] }) {
  return (
    <div className="space-y-2" data-testid="schedule-view">
      {value.subjects.map((subject) => (
        <div key={subject.subjectId} className="rounded-md bg-slate-50 px-3 py-2">
          <p className="text-sm font-medium text-slate-900">{subject.subjectName}</p>
          <p className="text-xs text-slate-500">{[subject.gradeName, FREQUENCY_LABELS[subject.frequency], `${minutesToHoursText(subject.totalMinutes)} hours ${PERIOD_LABELS[subject.frequency]}`].join(' · ')}</p>
          {assignments.filter((a) => a.subjectId === subject.subjectId).map((a) => (
            <p key={a.id} className="mt-1 text-xs text-slate-700" data-testid="schedule-view-tutor">
              Tutor: <span className="font-medium text-slate-900">{a.tutorName}</span>{a.status === 'NEEDS_REVIEW' ? ', needs review' : ''}
            </p>
          ))}
          <ul role="list" className="mt-1 flex flex-wrap gap-1">
            {subject.sessions.map((s) => (
              <li key={`${s.week ?? 0}-${s.day}`} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                {sessionLabel(s, subject.frequency)}, {formatMinutes(s.durationMinutes)}
                {s.start ? `, ${s.start}${s.end ? ` to ${s.end}` : ''}` : ''}
                {subject.frequency === 'MONTHLY' && classesIn(s, 'MONTHLY') > 1 ? `, ${classesIn(s, 'MONTHLY')} a month` : ''}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
