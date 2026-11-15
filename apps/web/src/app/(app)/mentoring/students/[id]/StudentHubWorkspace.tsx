"use client";

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { fmt, pretty, statusVariant } from '../../labels';
import { mentoringApi } from '../../mentoring-client';
import { TABS, TabKey, WorkspaceData, dateText, initialsOf, minutesText, tabOf, whenText } from '../../student-hub-view';
import { ClassesTab } from './ClassesTab';
import { ComplaintsPanel } from './ComplaintsPanel';
import { ExamsPanel } from './ExamsPanel';
import { LearningPlanPanel } from './LearningPlanPanel';
import { MonthlyReviewPanel } from './MonthlyReviewPanel';
import { TimetablePanel } from './TimetablePanel';

/**
 * The Student Workspace: one header and one set of tabs for a student's whole Mentoring journey. Each tab loads when it is opened and
 * shows the screen that already owns that work (classes, timetable, exams, monthly review, learning plan, complaints), so there is
 * one workflow for each thing and nothing is copied here.
 */
export function StudentHubWorkspace({ activationId, initialTab }: { activationId: string; initialTab?: TabKey }) {
  const [ws, setWs] = React.useState<WorkspaceData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<TabKey>(initialTab ?? 'overview');
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    mentoringApi(`/mentoring/mentor-students/${activationId}/workspace`)
      .then((d: WorkspaceData) => { if (live) { setWs(d); setError(null); } })
      .catch((e: unknown) => { if (live) setError(e instanceof Error && e.message ? e.message : 'The student could not be opened.'); });
    return () => { live = false; };
  }, [activationId, reload]);

  if (error) return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button type="button" className="underline" onClick={() => setReload((n) => n + 1)}>Try again</button></p>;
  if (!ws) return <p className="text-sm text-slate-500">Loading the student</p>;
  const h = ws.header;
  const choose = (k: TabKey) => {
    setTab(k);
    // Keep the address in step so a tab can be linked to, without leaving the page.
    window.history.replaceState(null, '', `/mentoring/students/${activationId}?tab=${k}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4" data-testid="student-workspace">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
        <Link href="/mentoring" className="hover:underline">Mentoring</Link> / <Link href="/mentoring/students" className="hover:underline">Students</Link> / <span className="font-medium text-slate-900">{h.name}</span>
      </nav>

      <header className="sticky top-0 z-10 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="student-header">
        <div className="flex flex-wrap items-start gap-4">
          {h.photoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={h.photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            : <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-700">{initialsOf(h.name)}</span>}
          <div className="mr-auto">
            <h1 className="text-xl font-bold text-slate-900">{h.name} <span className="font-normal text-slate-500">({h.studentId ?? 'No ID'})</span></h1>
            <p className="text-sm text-slate-600">{[h.grade, h.level, h.curriculum].filter(Boolean).join(' · ') || 'Grade not recorded'}</p>
            <p className="text-sm text-slate-600">Mentor: {h.mentor.name ?? 'Unallocated'} · Activated: {h.activatedAt ? dateText(h.activatedAt) : 'Not yet'} · Group: {h.group ?? 'Not recorded'}</p>
            <p className="text-sm text-slate-600" data-testid="parent-line">
              {h.parent ? <>Parent / guardian: {[h.parent.name, h.parent.phone].filter(Boolean).join(' · ') || 'Not provided'}</> : 'Parent contact is shown to the assigned Mentor, the Mentoring Head and the CEO.'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={statusVariant(h.status)}>{h.statusLabel}</Badge>
            {ws.viewer.readOnly && <Badge>Read only</Badge>}
          </div>
        </div>
        {h.status !== 'ACTIVATED' && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This student is not active yet. <Link className="font-medium underline" href={`/mentoring/students/${activationId}?panel=checklist`}>Open the activation workflow</Link> to complete the stages.
          </p>
        )}
      </header>

      <div role="tablist" aria-label="Student workspace" className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} onClick={() => choose(k)}
            className={`whitespace-nowrap px-3 py-2 text-sm ${tab === k ? 'border-b-2 border-brand-600 font-semibold text-brand-700' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <Overview ws={ws} onOpen={choose} />}
        {tab === 'details' && <Details activationId={activationId} ws={ws} />}
        {tab === 'classes' && <ClassesTab activationId={activationId} />}
        {tab === 'timetable' && <TimetablePanel activationId={activationId} />}
        {tab === 'tutors' && <Tutors ws={ws} />}
        {tab === 'exams' && <ExamsPanel activationId={activationId} />}
        {tab === 'meetings' && <MonthlyReviewPanel activationId={activationId} />}
        {tab === 'plan' && <LearningPlanPanel activationId={activationId} />}
        {tab === 'complaints' && <ComplaintsPanel activationId={activationId} parentName={h.parent?.name ?? ''} />}
        {tab === 'communication' && <Communication activationId={activationId} />}
        {tab === 'history' && <History activationId={activationId} />}
      </div>
    </div>
  );
}

function Card({ label, value, hint, onClick, testId }: { label: string; value: React.ReactNode; hint?: React.ReactNode; onClick?: () => void; testId?: string }) {
  const body = <><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-semibold text-slate-900">{value}</p>{hint && <p className="text-xs text-slate-500">{hint}</p>}</>;
  return onClick
    ? <button type="button" onClick={onClick} data-testid={testId} className="rounded-md border border-slate-200 bg-white p-3 text-left hover:border-brand-500">{body}</button>
    : <div data-testid={testId} className="rounded-md border border-slate-200 bg-white p-3">{body}</div>;
}

function Overview({ ws, onOpen }: { ws: WorkspaceData; onOpen: (k: TabKey) => void }) {
  const b = ws.balance;
  const c = ws.cards;
  const plan = c.learningPlan;
  return (
    <div className="space-y-3">
      <section aria-label="Classes this month" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Card testId="card-allocated" label="Allocated" value={minutesText(b.allocatedMinutes)} hint="Monthly hours on the requirements" />
        <Card testId="card-consumed" label="Consumed" value={minutesText(b.consumedMinutes)} hint="Verified by the Mentor" onClick={() => onOpen('classes')} />
        <Card testId="card-remaining" label="Remaining" value={minutesText(b.remainingMinutes)} hint={b.over ? 'More than allocated was consumed' : 'Allocated minus consumed'} />
        <Card testId="card-upcoming" label="Upcoming classes" value={c.upcomingClasses} hint="Next two weeks, from the timetable" onClick={() => onOpen('timetable')} />
        <Card testId="card-awaiting-tutor" label="Awaiting tutor update" value={c.awaitingTutorUpdate} onClick={() => onOpen('classes')} />
        <Card testId="card-awaiting-mentor" label="Awaiting Mentor verification" value={c.awaitingMentorVerification} hint={c.returnedForCorrection ? `${c.returnedForCorrection} returned for correction` : undefined} onClick={() => onOpen('classes')} />
        <Card testId="card-next-exam" label="Next exam" value={c.nextExam ? whenText(c.nextExam) : 'None scheduled'} hint={c.nextExam?.title} onClick={() => onOpen('exams')} />
        <Card testId="card-next-meeting" label="Next parent meeting" value={whenText(c.nextMeeting)} onClick={() => onOpen('meetings')} />
        <Card testId="card-plan" label="Learning plan period" value={plan && plan.endsOn ? `Until ${dateText(plan.endsOn)}` : 'Not set'} hint={plan ? [plan.status ? pretty(plan.status) : null, plan.start ? `from ${dateText(plan.start)}` : null].filter(Boolean).join(' · ') : 'No plan yet'} onClick={() => onOpen('plan')} />
        <Card testId="card-pending" label="Pending actions" value={c.pending.total} hint={`${c.pending.verification} to verify · ${c.pending.complaints} complaints · ${c.pending.tasks} tasks`} />
      </section>
      <p className="text-xs text-slate-500">{ws.allocationNote}</p>
    </div>
  );
}

function Tutors({ ws }: { ws: WorkspaceData }) {
  if (ws.tutors.length === 0) return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No tutor is assigned yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Tutor</th><th className="px-3 py-2">Classes</th><th className="px-3 py-2">Status</th></tr></thead>
        <tbody>
          {ws.tutors.map((t) => (
            <tr key={t.subjectId} className="border-t border-slate-100" data-testid="tutor-row">
              <td className="px-3 py-2 font-medium">{t.subjectName || 'Subject'}</td><td className="px-3 py-2">{t.tutorName}</td>
              <td className="px-3 py-2 text-slate-600">{t.sessions.length ? t.sessions.join(', ') : 'Not recorded'}</td>
              <td className="px-3 py-2">{t.status === 'NEEDS_REVIEW' ? <Badge variant="warning">Needs review</Badge> : <Badge variant="success">Assigned</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useLoad<T>(path: string): { data: T | null; error: string | null } {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    mentoringApi(path).then((d: T) => { if (live) setData(d); }).catch((e: unknown) => { if (live) setError(e instanceof Error && e.message ? e.message : 'This could not be loaded.'); });
    return () => { live = false; };
  }, [path]);
  return { data, error };
}

function Details({ activationId, ws }: { activationId: string; ws: WorkspaceData }) {
  const { data, error } = useLoad<any>(`/mentoring/students/${activationId}`);
  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading the details</p>;
  const s = data.student ?? {};
  const h = ws.header;
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
        {([['Name', h.name], ['Student ID', h.studentId], ['Grade', s.currentGrade ?? h.grade], ['Level', s.grade?.name ?? h.level], ['Curriculum', s.curriculum?.name ?? h.curriculum], ['Mentor', h.mentor.name], ['Parent / guardian', data.parent ? [data.parent.name, data.parent.primaryPhone].filter(Boolean).join(' · ') : null]] as Array<[string, string | null | undefined]>).map(([k, v]) => (
          <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-900">{v || 'Not recorded'}</dd></div>
        ))}
      </dl>
      <section aria-label="Activation stages" className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-semibold">Activation stages</h3>
        <ol className="space-y-1">{(data.stages ?? []).map((st: any) => <li key={st.number} className="flex items-center gap-2"><span>{st.number}. {st.name}</span><Badge variant={statusVariant(st.status)}>{pretty(st.status)}</Badge>{st.completedAt && <span className="text-xs text-slate-500">{fmt(st.completedAt)}</span>}</li>)}</ol>
        <Link className="mt-3 inline-block font-medium text-brand-700 underline" href={`/mentoring/students/${activationId}?panel=checklist`}>Open the activation workflow and handover information</Link>
      </section>
    </div>
  );
}

function Communication({ activationId }: { activationId: string }) {
  const { data, error } = useLoad<{ messages: any[]; reminders: any[] }>(`/mentoring/mentor-students/${activationId}/communication`);
  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading communication</p>;
  if (data.messages.length === 0 && data.reminders.length === 0) return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500" data-testid="communication-empty">No messages or reminders have been recorded for this student.</p>;
  return (
    <div className="space-y-4 text-sm">
      <section aria-label="Class messages"><h3 className="mb-1 font-semibold">Class messages</h3>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">{data.messages.map((m) => <li key={m.id} className="p-3"><p className="whitespace-pre-wrap">{m.text}</p><p className="text-xs text-slate-500">Prepared {fmt(m.preparedAt)}{m.confirmedAt ? ` · confirmed ${fmt(m.confirmedAt)}` : m.copiedAt ? ` · copied ${fmt(m.copiedAt)}` : ' · not sent'}</p></li>)}</ul>
      </section>
      <section aria-label="Reminders"><h3 className="mb-1 font-semibold">Reminders</h3>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">{data.reminders.map((r) => <li key={r.id} className="p-3"><p>{r.message}</p><p className="text-xs text-slate-500">{pretty(r.kind)} · {pretty(r.status)} · prepared {fmt(r.preparedAt)}{r.sentAt ? ` · sent ${fmt(r.sentAt)}` : ''}{r.acknowledgedAt ? ` · acknowledged ${fmt(r.acknowledgedAt)}` : ''}</p></li>)}</ul>
      </section>
    </div>
  );
}

function History({ activationId }: { activationId: string }) {
  const { data, error } = useLoad<any[]>(`/mentoring/students/${activationId}/events`);
  if (error) return <p role="alert" className="text-sm text-slate-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading the history</p>;
  if (data.length === 0) return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No history has been recorded yet.</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm" aria-label="History">
      {data.map((e) => (
        <li key={e.id} className="p-3">
          <span className="font-medium">{pretty(e.type)}</span>
          {e.fromStatus && e.toStatus && <span className="text-slate-500"> · {pretty(e.fromStatus)} to {pretty(e.toStatus)}</span>}
          {e.reason && <span className="text-slate-600"> · {pretty(e.reason)}</span>}
          <div className="text-xs text-slate-400">{fmt(e.createdAt)}</div>
        </li>
      ))}
    </ul>
  );
}

export { tabOf };
