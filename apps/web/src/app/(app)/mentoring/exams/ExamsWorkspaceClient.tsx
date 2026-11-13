"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import { Select } from '@/components/ui/Select';

import { EXAM_TONE, examTime } from '../exam-view';
import {
  DUE_STATUS_TEXT, DueData, DueRow, EXAM_QUEUES, ExamWorkspaceData, dueQuery, dueReason, dueStatus, examsInQueue, queueCount, workspaceQuery,
} from '../exams-view';
import { mentoringApi } from '../mentoring-client';
import { longDayLabel } from '../timetable-view';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1';

function Progress({ r }: { r: DueRow }) {
  return (
    <div className="min-w-[10rem]">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={r.thresholdMinutes} aria-valuenow={Math.min(r.verifiedMinutes, r.thresholdMinutes)} aria-label={`Verified class time for ${r.studentName}, ${r.subjectName}`}>
        <div className={`h-full ${r.due ? 'bg-amber-600' : 'bg-brand-600'}`} style={{ width: `${r.progressPercent}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-700">{Math.floor(r.verifiedMinutes / 60)} h {r.verifiedMinutes % 60} min of {r.thresholdMinutes / 60} h</p>
    </div>
  );
}

/**
 * Exams for the Mentor's students: who is due next (from verified class hours), the exams in each stage of their life, and the one panel
 * where an exam is scheduled, moved, marked and closed. The due figure and every state come from the API; nothing is counted here.
 */
export function ExamsWorkspaceClient() {
  const [tab, setTab] = React.useState<string>('due');
  const [subjectId, setSubjectId] = React.useState('');
  const [student, setStudent] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [due, setDue] = React.useState<DueData | null>(null);
  const [list, setList] = React.useState<ExamWorkspaceData | null>(null);
  const [subjects, setSubjects] = React.useState<Map<string, string>>(new Map());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { const t = setTimeout(() => setDebounced(student), 300); return () => clearTimeout(t); }, [student]);

  const load = React.useCallback(async () => {
    try {
      const [d, l]: [DueData, ExamWorkspaceData] = await Promise.all([
        mentoringApi(`/mentoring/exams/due${dueQuery({ subjectId, student: debounced })}`),
        mentoringApi(`/mentoring/exams${workspaceQuery({ subjectId, student: debounced, from: '', to: '' })}`),
      ]);
      setDue(d);
      setList(l);
      setSubjects((k) => { const m = new Map(k); for (const r of d.rows) m.set(r.subjectId, r.subjectName); for (const e of l.exams) m.set(e.subjectId, e.subjectName); return m; });
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The exams could not be loaded.');
    }
  }, [subjectId, debounced]);
  React.useEffect(() => { void load(); }, [load]);

  const dueNow = due ? due.rows.filter((r) => r.due) : [];
  const shownDue = tab === 'due' ? dueNow : [];
  const queue = EXAM_QUEUES.find((q) => q.key === tab);
  const exams = list && queue ? examsInQueue(queue, list.exams) : [];
  const filtered = subjectId || student;

  return (
    <div className="mx-auto max-w-7xl space-y-3" data-testid="exams-workspace">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Exams</h1>
        <p className="text-sm text-slate-700">An exam is due after 3 hours of verified classes in a subject since the last exam that was conducted. Scheduling or moving an exam does not restart that count.</p>
      </header>

      <section aria-label="Filters" className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-3">
        <label className="text-sm"><span className="mb-1 block text-slate-700">Student name</span><Input type="search" value={student} onChange={(e) => setStudent(e.target.value)} /></label>
        <label className="text-sm"><span className="mb-1 block text-slate-700">Subject</span><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">All subjects</option>{[...subjects].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>
        {filtered ? <div className="flex items-end"><Button type="button" size="sm" variant="ghost" onClick={() => { setStudent(''); setSubjectId(''); }}>Clear the filters</Button></div> : null}
      </section>

      <div className="-mx-1 overflow-x-auto px-1">
        <div role="group" aria-label="Exam queues" className="flex min-w-max gap-1">
          <button type="button" aria-pressed={tab === 'due'} onClick={() => setTab('due')} className={`min-h-9 rounded-full border px-3 text-sm ${RING} ${tab === 'due' ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            Due now{due ? <span className="ml-1 font-semibold">{dueNow.length}</span> : null}
          </button>
          {EXAM_QUEUES.map((q) => (
            <button key={q.key} type="button" aria-pressed={tab === q.key} onClick={() => setTab(q.key)} className={`min-h-9 rounded-full border px-3 text-sm ${RING} ${tab === q.key ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {q.label}{list ? <span className="ml-1 font-semibold">{queueCount(q, list.counts)}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button type="button" className="font-medium underline" onClick={() => void load()}>Try again</button></p>}
      {!due && !error && <div role="status" aria-label="Loading the exams" className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />)}</div>}

      {due && tab === 'due' && (
        shownDue.length === 0
          ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600" data-testid="no-due">No student is due an exam {filtered ? 'with these filters' : 'right now'}. The counts below show who is closest.</p>
          : null
      )}
      {due && tab === 'due' && (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm" data-testid="due-table">
            <caption className="sr-only">Students and subjects, with verified class time toward the next exam</caption>
            <thead className="bg-slate-50 text-xs text-slate-700"><tr>{['Student', 'Subject', 'Verified class time', 'Status', 'Why', ''].map((h, i) => <th key={`${h}-${i}`} scope="col" className="px-2 py-2 font-semibold">{h || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
            <tbody>
              {due.rows.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-slate-600">No Active student has a subject to count yet.</td></tr>}
              {due.rows.map((r) => {
                const s = dueStatus(r);
                return (
                  <tr key={`${r.activationId}-${r.subjectId}`} className="border-t border-slate-100" data-testid="due-row" data-due={r.due}>
                    <td className="px-2 py-2 align-top font-medium text-slate-900">{r.studentName}</td>
                    <td className="px-2 py-2 align-top">{r.subjectName}</td>
                    <td className="px-2 py-2 align-top"><Progress r={r} /></td>
                    <td className="px-2 py-2 align-top"><Badge variant={s === 'due' ? 'warning' : s === 'counting' ? 'default' : 'info'}>{DUE_STATUS_TEXT[s]}</Badge>{r.scheduledExam && <div className="mt-1 text-xs text-slate-700">Exam on {longDayLabel(r.scheduledExam.date)}</div>}</td>
                    <td className="px-2 py-2 align-top text-slate-700">{dueReason(r)}</td>
                    <td className="px-2 py-2 text-right align-top"><Link href={`/mentoring/exams/${encodeURIComponent(r.activationId)}`} className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium ${RING} ${s === 'due' ? 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700' : 'border-slate-300 text-slate-800 hover:bg-slate-50'}`}>{s === 'due' ? 'Schedule exam' : 'Manage exams'}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {list && queue && (
        exams.length === 0
          ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600" data-testid="no-exams">No exams are {queue.label.toLowerCase()} {filtered ? 'with these filters' : 'right now'}.</p>
          : (
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm" data-testid="exam-table">
                <caption className="sr-only">{queue.label} exams</caption>
                <thead className="bg-slate-50 text-xs text-slate-700"><tr>{['Date and time', 'Student', 'Subject', 'Exam', 'Status', 'Marks', ''].map((h, i) => <th key={`${h}-${i}`} scope="col" className="px-2 py-2 font-semibold">{h || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
                <tbody>
                  {exams.map((e) => (
                    <tr key={e.id} className="border-t border-slate-100" data-testid="exam-row" data-state={e.state}>
                      <td className="px-2 py-2 align-top whitespace-nowrap">{longDayLabel(e.date)}<div className="text-xs text-slate-700">{examTime(e)}{e.date !== e.originalDate ? `, moved from ${longDayLabel(e.originalDate)}` : ''}</div></td>
                      <td className="px-2 py-2 align-top font-medium text-slate-900">{e.studentName}</td>
                      <td className="px-2 py-2 align-top">{e.subjectName}</td>
                      <td className="px-2 py-2 align-top">{e.title}{e.kind === 'RE_EXAM' ? <span className="ml-1 text-xs text-slate-700">(re-exam)</span> : null}</td>
                      <td className="px-2 py-2 align-top"><Badge variant={EXAM_TONE[e.state] ?? 'default'}>{e.stateLabel}</Badge></td>
                      <td className="px-2 py-2 align-top">{e.marks ? `${e.marks.obtained} of ${e.marks.max} (${e.marks.percentage}%)` : 'Not recorded'}</td>
                      <td className="px-2 py-2 text-right align-top"><Link href={`/mentoring/exams/${encodeURIComponent(e.activationId)}`} className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium ${RING} border-slate-300 text-slate-800 hover:bg-slate-50`} aria-label={`Open the exam of ${e.studentName}`}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}

    </div>
  );
}
