"use client";

import * as React from 'react';
import { AlertTriangle, Check, Clock, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';

import {
  MEETING_QUEUES, MeetingRow, MeetingsData, examSummaryText, goalsSummaryText, meetingsQuery, preparationLeft, preparationText, queueCount, whenText,
} from '../meetings-view';
import { mentoringApi } from '../mentoring-client';
import { MEETING_TONE } from '../review-view';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1';
const TONE_STYLE = { done: 'text-emerald-800', waiting: 'text-slate-700', none: 'text-slate-500' } as const;
const TONE_ICON = { done: Check, waiting: Clock, none: Minus } as const;

function Prep({ r }: { r: MeetingRow }) {
  const p = preparationText(r);
  const left = preparationLeft(r);
  const Icon = TONE_ICON[p.tone];
  return (
    <div>
      <span className={`inline-flex items-start gap-1 ${TONE_STYLE[p.tone]}`}><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{p.text}</span></span>
      {left.length > 0 && <ul className="mt-1 list-inside list-disc text-xs text-slate-600">{left.slice(0, 3).map((l) => <li key={l}>{l}</li>)}{left.length > 3 && <li>and {left.length - 3} more</li>}</ul>}
    </div>
  );
}

function StatusBadge({ r }: { r: MeetingRow }) {
  return (
    <div>
      <Badge variant={MEETING_TONE[r.state] ?? 'default'}>{r.stateLabel}</Badge>
      {r.overdue && <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-700"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{r.state === 'NOT_CONDUCTED' ? 'Needs a new date' : 'Overdue'}</div>}
    </div>
  );
}

/**
 * The monthly parent meetings of the Mentor's students, each tied to the student's Individual Learning Plan: when, the state, how far the
 * preparation is, the exam record of the period, the goals, and whether the parent's feedback was recorded. Opening one shows the whole
 * review (the existing workflow, unchanged) and the learning plan. Parent communication stays in its own fields, apart from observations.
 */
export function MeetingsWorkspaceClient() {
  const [queue, setQueue] = React.useState('all');
  const [student, setStudent] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [data, setData] = React.useState<MeetingsData | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { const t = setTimeout(() => setDebounced(student), 300); return () => clearTimeout(t); }, [student]);

  const state = MEETING_QUEUES.find((q) => q.key === queue)?.state ?? '';
  const load = React.useCallback(async () => {
    try {
      setData(await mentoringApi(`/mentoring/reviews${meetingsQuery({ state, student: debounced, from: '', to: '' })}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The meetings could not be loaded.');
    }
  }, [state, debounced]);
  React.useEffect(() => { void load(); }, [load]);

  const hrefOf = (r: MeetingRow) => `/mentoring/meetings/${encodeURIComponent(r.activationId)}`;
  const filtered = !!student || queue !== 'all';

  return (
    <div className="mx-auto max-w-7xl space-y-3" data-testid="meetings-workspace">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Meetings</h1>
        <p className="text-sm text-slate-700">Monthly parent reviews. Each one reviews the student&apos;s current learning plan, and completing it starts the next plan.</p>
      </header>

      <section aria-label="Filters" className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-3">
        <label className="text-sm"><span className="mb-1 block text-slate-700">Student name</span><Input type="search" value={student} onChange={(e) => setStudent(e.target.value)} /></label>
        {filtered && <div className="flex items-end"><Button type="button" size="sm" variant="ghost" onClick={() => { setStudent(''); setQueue('all'); }}>Clear the filters</Button></div>}
      </section>

      <div className="-mx-1 overflow-x-auto px-1">
        <div role="group" aria-label="Meeting queues" className="flex min-w-max gap-1">
          {MEETING_QUEUES.map((q) => (
            <button key={q.key} type="button" aria-pressed={queue === q.key} onClick={() => setQueue(q.key)} className={`min-h-9 rounded-full border px-3 text-sm ${RING} ${queue === q.key ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {q.label}{data ? <span className="ml-1 font-semibold">{queueCount(q, data)}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button type="button" className="font-medium underline" onClick={() => void load()}>Try again</button></p>}
      {!data && !error && <div role="status" aria-label="Loading the meetings" className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />)}</div>}
      {data && data.rows.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600" data-testid="no-meetings">No meetings {filtered ? 'match these filters' : 'to show yet. A student appears here once their learning plan is running'}.</p>}

      {data && data.rows.length > 0 && (
        <>
          <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white lg:block">
            <table className="min-w-full text-left text-sm" data-testid="meeting-table">
              <caption className="sr-only">Monthly parent meetings</caption>
              <thead className="bg-slate-50 text-xs text-slate-700"><tr>{['Meeting', 'Student and parent', 'Mentor', 'Status', 'Preparation', 'Exam performance', 'Goals', 'Parent feedback', ''].map((h, i) => <th key={`${h}-${i}`} scope="col" className="px-2 py-2 font-semibold">{h || <span className="sr-only">Open</span>}</th>)}</tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.meetingId ?? `${r.activationId}-new`} className="border-t border-slate-100" data-testid="meeting-row" data-state={r.state}>
                    <td className="px-2 py-2 align-top whitespace-nowrap">{whenText(r)}{r.originalDate && r.date && r.originalDate !== r.date ? <div className="text-xs text-slate-600">moved from {r.originalDate}</div> : null}</td>
                    <td className="px-2 py-2 align-top"><div className="font-medium text-slate-900">{r.studentName}</div><div className="text-slate-700">{r.parentName ?? 'Parent not recorded'}</div></td>
                    <td className="px-2 py-2 align-top">{r.mentorName ?? 'Not assigned'}</td>
                    <td className="px-2 py-2 align-top"><StatusBadge r={r} /></td>
                    <td className="px-2 py-2 align-top"><Prep r={r} /></td>
                    <td className="px-2 py-2 align-top text-slate-700">{examSummaryText(r.exams)}</td>
                    <td className="px-2 py-2 align-top text-slate-700">{goalsSummaryText(r.goals)}{r.improvementAreas > 0 ? <div className="text-xs text-slate-600">{r.improvementAreas} improvement {r.improvementAreas === 1 ? 'area' : 'areas'}</div> : null}</td>
                    <td className="px-2 py-2 align-top">{r.parentFeedbackRecorded ? 'Recorded' : r.state === 'COMPLETED' ? 'Not recorded' : 'Not yet'}</td>
                    <td className="px-2 py-2 text-right align-top"><Link href={hrefOf(r)} className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium ${RING} ${r.state === 'NOT_SCHEDULED' ? 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700' : 'border-slate-300 text-slate-800 hover:bg-slate-50'}`} aria-label={`${r.state === 'NOT_SCHEDULED' ? 'Schedule' : 'Open'} the meeting of ${r.studentName}`}>{r.state === 'NOT_SCHEDULED' ? 'Schedule' : 'Open'}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 lg:hidden" aria-label="Meetings">
            {data.rows.map((r) => (
              <li key={r.meetingId ?? `${r.activationId}-new`} className="rounded-md border border-slate-200 bg-white p-3" data-testid="meeting-card">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-medium text-slate-900">{r.studentName}</p><p className="text-sm text-slate-700">{r.parentName ?? 'Parent not recorded'}</p><p className="text-sm text-slate-700">{whenText(r)}</p></div>
                  <StatusBadge r={r} />
                </div>
                <dl className="mt-2 space-y-1 text-sm">
                  <div><dt className="text-xs text-slate-600">Preparation</dt><dd><Prep r={r} /></dd></div>
                  <div><dt className="text-xs text-slate-600">Exam performance</dt><dd>{examSummaryText(r.exams)}</dd></div>
                  <div><dt className="text-xs text-slate-600">Goals</dt><dd>{goalsSummaryText(r.goals)}</dd></div>
                </dl>
                <Link href={hrefOf(r)} className={`mt-3 flex min-h-11 w-full items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 ${RING}`}>{r.state === 'NOT_SCHEDULED' ? 'Schedule the meeting' : 'Open the meeting'}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {data && data.pages > 1 && <p className="text-sm text-slate-700">Showing the first {data.rows.length} of {data.total} meetings. Narrow the list with a student name or a queue.</p>}

    </div>
  );
}
