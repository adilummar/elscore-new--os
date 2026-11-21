"use client";

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { AssignmentView } from '../../tutor-types';
import { isScheduleValue, summariseSubject } from '../../subject-schedule';
import { subjectLines, subjectProblem, SubjectLine } from '../../subjects-panel-view';

/** Opens the subject's card in the timetable below (adding it first when it is not there), where frequency, days, times and the tutor are set. */
const openSchedule = (subjectId: string | null) => {
  if (subjectId) window.dispatchEvent(new CustomEvent('mentoring:schedule-add-subject', { detail: { subjectId } }));
  window.setTimeout(() => {
    const el = (subjectId && document.querySelector(`[data-assigned-tutor="${subjectId}"]`)) || document.querySelector('[data-subsection="D. Preferred timetable"]');
    if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 250);
};

interface Props {
  /** The `academic.subjects` list from the handover: what Sales entered, plus what the Mentor added. */
  lines: unknown;
  assignments: AssignmentView[];
  /** The stored subject schedule (`timetable.schedule`), shown under each subject. */
  schedule: unknown;
  /** Subjects the Mentor may add. Empty hides the form. */
  options: Array<{ id: string; name: string }>;
  canAdd: boolean;
  onAdd?: (subjectId: string, monthlyHours: number) => Promise<void>;
}

/**
 * One place for a student's subjects. Each subject shows where it came from (Sales, or added by the Mentor with who and when), its
 * hours, its tutor and its schedule. The Mentor can add a subject the parent asked for later; its hours count toward the Mentor's
 * monthly capacity, and the API refuses it when they would not fit.
 */
export function SubjectsPanel({ lines, assignments, schedule, options, canAdd, onAdd }: Props) {
  const list: SubjectLine[] = subjectLines(lines);
  const taken = new Set(list.map((l) => l.subjectId).filter(Boolean));
  const choices = options.filter((o) => !taken.has(o.id));
  const [open, setOpen] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState('');
  const [hours, setHours] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const problem = subjectProblem(subjectId, hours);
  const scheduleSubjects = isScheduleValue(schedule) ? schedule.subjects : [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAdd || problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(subjectId, Number(hours));
      setSubjectId('');
      setHours('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The subject could not be added.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4" data-testid="subjects-panel" data-subsection="A. Subjects">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1">
        <h4 className="text-sm font-semibold text-slate-800">Subjects ({list.length})</h4>
        {canAdd && choices.length > 0 && !open && (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" aria-hidden="true" />Add subject</Button>
        )}
      </div>

      {list.some((l) => !l.addedByMentor) && <p className="mt-1 text-xs text-slate-600">Sales subjects are locked after handover. Add any subject the parent asks for later.</p>}
      {!canAdd && <p className="mt-1 text-xs font-medium text-slate-700" data-testid="subjects-readonly-note">Only the assigned Mentor can add subjects or set schedules, and only while the student is being activated.</p>}

      {list.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700" data-testid="subjects-empty">
          Sales did not collect any subjects. {canAdd ? 'Add the subjects the parent wants, then set a tutor and a schedule for each.' : 'The assigned Mentor adds them.'}
        </p>
      ) : (
        <ul role="list" className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="Subjects">
          {list.map((l) => {
            const tutor = assignments.find((a) => a.subjectId === l.subjectId && a.status !== 'ENDED');
            const plan = scheduleSubjects.find((s) => s.subjectId === l.subjectId);
            return (
              <li key={l.key} className="rounded-xl border border-slate-200 bg-white p-3 text-sm" data-testid="subject-card" data-origin={l.addedByMentor ? 'mentor' : 'sales'}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{l.subject}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.addedByMentor ? 'bg-sky-50 text-sky-900' : 'bg-slate-100 text-slate-800'}`}>{l.origin}</span>
                </div>
                <p className="text-slate-700">{[l.grade, l.hoursText].filter(Boolean).join(', ')}</p>
                <p className="mt-1.5 text-slate-800"><span className="text-slate-600">Tutor: </span>{tutor ? tutor.tutorName : 'Not assigned yet'}</p>
                <p className="whitespace-pre-line text-slate-800"><span className="text-slate-600">Schedule: </span>{plan ? summariseSubject(plan) : 'Not set yet'}</p>
                {canAdd && (
                  <div className="mt-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => openSchedule(l.subjectId)}>{plan ? 'Edit schedule and tutor' : 'Set schedule and tutor'}</Button>
                    {!plan && <p className="mt-1 text-xs text-slate-600">Choose weekly, every two weeks or monthly, the days and the time. Save it, then pick a tutor from those available at those times.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end" aria-label="Add a subject">
          <label className="text-sm"><span className="mb-1 block font-medium text-slate-800">Subject</span>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Choose a subject</option>
              {choices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </label>
          <label className="text-sm"><span className="mb-1 block font-medium text-slate-800">Hours a month</span>
            <Input type="number" inputMode="decimal" min={0.5} max={200} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} aria-invalid={!!hours && !!problem} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!!problem} isLoading={busy}>Add subject</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
          </div>
          <p className="text-xs text-slate-700 sm:col-span-3">These hours count toward your monthly capacity. If they would not fit, the Mentoring Head has to raise your limit first. Adding a subject returns this section to Not verified.</p>
          {error && <p role="alert" className="text-sm font-medium text-red-800 sm:col-span-3">{error}</p>}
        </form>
      )}
    </div>
  );
}
