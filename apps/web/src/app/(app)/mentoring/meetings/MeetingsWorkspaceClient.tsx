"use client";

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

import {
  MEETING_QUEUES, MeetingRow, MeetingsData, examSummaryText, goalsSummaryText, meetingsQuery, preparationText, queueCount, reviewSteps, whenText,
} from '../meetings-view';
import { mentoringApi } from '../mentoring-client';
import {
  Empty, FIELD_LABEL, FOCUS, ListSkeleton, Notice, PANEL, PageHeader, QueueTabs, StatusChip, TABLE, TABLE_WRAP, TD, TH, THEAD, TR, chipTone, linkButton,
} from '../mentoring-ui';
import { MEETING_TONE } from '../review-view';

const meetingHref = (r: MeetingRow) => `/mentoring/meetings/${encodeURIComponent(r.activationId)}`;

function Steps({ r }: { r: MeetingRow }) {
  const steps = reviewSteps(r);
  const prep = preparationText(r);
  if (steps.length === 0) return <span className="text-slate-600">{prep.text}</span>;
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="min-w-[13rem]">
      <p className="mb-1 text-xs font-semibold text-slate-700">{done} of {steps.length} parts in place</p>
      <ul className="space-y-0.5">
        {steps.map((s) => (
          <li key={s.key} className={`flex items-start gap-1.5 text-xs ${s.done ? 'text-emerald-900' : 'text-slate-700'}`} data-done={s.done}>
            {s.done ? <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> : <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />}
            <span><span className="font-medium">{s.label}:</span> {s.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Status({ r }: { r: MeetingRow }) {
  return (
    <div>
      <StatusChip tone={chipTone(MEETING_TONE[r.state])}>{r.stateLabel}</StatusChip>
      {r.overdue && <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-800"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{r.state === 'NOT_CONDUCTED' ? 'Needs a new date' : 'Overdue'}</div>}
    </div>
  );
}

/**
 * The monthly parent meetings of the Mentor's students, each tied to the student's Individual Learning Plan: when, the state, which parts of
 * the review are in place, the exam record of the period and the goals. Opening one shows the whole review (the existing workflow,
 * unchanged) and the learning plan. Parent communication stays in its own fields, apart from the Mentor's and the tutor's observations.
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

  const filtered = !!student || queue !== 'all';

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-testid="meetings-workspace">
      <PageHeader title="Meetings" subtitle="Monthly parent reviews. Each one reviews the student's current learning plan, and completing it starts the next plan." />

      <section aria-label="Filters" className={`${PANEL} p-4`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm"><span className={FIELD_LABEL}>Student name</span><Input type="search" value={student} onChange={(e) => setStudent(e.target.value)} /></label>
          {filtered && <div className="flex items-end"><Button type="button" size="sm" variant="ghost" onClick={() => { setStudent(''); setQueue('all'); }}>Clear the filters</Button></div>}
        </div>
      </section>

      <QueueTabs label="Meeting queues" value={queue} onChange={setQueue}
        items={MEETING_QUEUES.map((q) => ({ key: q.key, label: q.label, count: data ? queueCount(q, data) : undefined, urgent: q.key === 'schedule' || q.key === 'overdue' || q.key === 'progress' }))} />

      {error && <Notice tone="error">{error} <button type="button" className={`rounded font-semibold underline ${FOCUS}`} onClick={() => void load()}>Try again</button></Notice>}
      {!data && !error && <ListSkeleton rows={3} label="Loading the meetings" />}
      {data && data.rows.length === 0 && (
        <Empty title={filtered ? 'No meetings match these filters' : 'No meetings to show yet'} testId="no-meetings">
          {filtered ? 'Clear a filter or choose another queue.' : 'A student appears here once their learning plan is running.'}
        </Empty>
      )}

      {data && data.rows.length > 0 && (
        <>
          <div className={`${TABLE_WRAP} hidden xl:block`}>
            <table className={TABLE} data-testid="meeting-table">
              <caption className="sr-only">Monthly parent meetings</caption>
              <thead className={THEAD}><tr>{['Meeting', 'Student and parent', 'Status', 'Review progress', 'Exam performance', 'Goals', ''].map((h, i) => <th key={`${h}-${i}`} scope="col" className={TH}>{h || <span className="sr-only">Open</span>}</th>)}</tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.meetingId ?? `${r.activationId}-new`} className={TR} data-testid="meeting-row" data-state={r.state}>
                    <td className={`${TD} whitespace-nowrap ${r.overdue || r.state === 'NOT_SCHEDULED' ? 'shadow-[inset_3px_0_0_0_#d97706]' : ''}`}>
                      <div className="font-medium text-slate-900">{whenText(r)}</div>
                      {r.originalDate && r.date && r.originalDate !== r.date ? <div className="text-xs text-slate-600">moved from {r.originalDate}</div> : null}
                      <div className="mt-0.5 text-xs text-slate-600">{r.mentorName ? `Mentor: ${r.mentorName}` : 'No Mentor assigned'}</div>
                    </td>
                    <td className={TD}><div className="font-medium text-slate-900">{r.studentName}</div><div className="text-slate-700">{r.parentName ?? 'Parent not recorded'}</div></td>
                    <td className={TD}><Status r={r} /></td>
                    <td className={TD}><Steps r={r} /></td>
                    <td className={`${TD} text-slate-700`}>{examSummaryText(r.exams)}</td>
                    <td className={`${TD} text-slate-700`}>{goalsSummaryText(r.goals)}</td>
                    <td className={`${TD} text-right`}><Link href={meetingHref(r)} className={linkButton(r.state === 'NOT_SCHEDULED' ? 'primary' : 'secondary')} aria-label={`${r.state === 'NOT_SCHEDULED' ? 'Schedule' : 'Open'} the meeting of ${r.studentName}`}>{r.state === 'NOT_SCHEDULED' ? 'Schedule' : 'Open'}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 xl:hidden" aria-label="Meetings">
            {data.rows.map((r) => (
              <li key={r.meetingId ?? `${r.activationId}-new`} className={`${PANEL} p-4 ${r.overdue || r.state === 'NOT_SCHEDULED' ? 'border-l-4 border-l-amber-600' : ''}`} data-testid="meeting-card">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold text-slate-900">{r.studentName}</p><p className="text-sm text-slate-700">{r.parentName ?? 'Parent not recorded'}</p><p className="mt-1 text-sm font-medium text-slate-900">{whenText(r)}</p></div>
                  <Status r={r} />
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  <div><dt className="text-xs text-slate-600">Review progress</dt><dd><Steps r={r} /></dd></div>
                  <div><dt className="text-xs text-slate-600">Exam performance</dt><dd className="text-slate-800">{examSummaryText(r.exams)}</dd></div>
                  <div><dt className="text-xs text-slate-600">Goals</dt><dd className="text-slate-800">{goalsSummaryText(r.goals)}</dd></div>
                </dl>
                <Link href={meetingHref(r)} className={`${linkButton(r.state === 'NOT_SCHEDULED' ? 'primary' : 'secondary', true)} mt-4`}>{r.state === 'NOT_SCHEDULED' ? 'Schedule the meeting' : 'Open the meeting'}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {data && data.pages > 1 && <p className="text-sm text-slate-700">Showing the first {data.rows.length} of {data.total} meetings. Narrow the list with a student name or a queue.</p>}
    </div>
  );
}
