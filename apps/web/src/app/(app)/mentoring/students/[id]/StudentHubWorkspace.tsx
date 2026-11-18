"use client";

import * as React from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmt, pretty, statusVariant } from '../../labels';
import { mentoringApi } from '../../mentoring-client';
import { GROUP_ORDER, GROUP_TITLES, ProfileField, SOURCE_LABELS, auditLine, displayOf } from '../../profile-form';
import { TABS, TONES, TabKey, profileModeOf, WorkspaceData, clock, dateText, initialsOf, isAuditEvent, minutesText, untilText, whenText } from '../../student-hub-view';
import { ClassesTab } from './ClassesTab';
import { ComplaintsPanel } from './ComplaintsPanel';
import { ExamsPanel } from './ExamsPanel';
import { EditProfileDialog } from './EditProfileDialog';
import { LearningPlanPanel } from './LearningPlanPanel';
import { MonthlyReviewPanel } from './MonthlyReviewPanel';
import { StudentWorkspaceClient } from './StudentWorkspaceClient';
import { TimetablePanel } from './TimetablePanel';

/**
 * The student profile. It first finds the student's real status. A student whose activation is still in progress (or paused, blocked or waiting
 * for final approval) opens the existing seven-stage activation workspace, with its permissions and verification untouched. An activated student
 * opens an operational workspace instead, and the activation checklist appears only while a genuine workflow is pending.
 */
export function StudentHubWorkspace({ activationId, initialTab, initialPanel }: { activationId: string; initialTab?: TabKey; initialPanel?: React.ComponentProps<typeof StudentWorkspaceClient>['initialPanel'] }) {
  const [ws, setWs] = React.useState<WorkspaceData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<TabKey>(initialTab ?? 'overview');
  const [reload, setReload] = React.useState(0);
  const [editing, setEditing] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    mentoringApi(`/mentoring/mentor-students/${activationId}/workspace`)
      .then((d: WorkspaceData) => { if (live) { setWs(d); setError(null); } })
      .catch((e: unknown) => { if (live) setError(e instanceof Error && e.message ? e.message : 'The student could not be opened.'); });
    return () => { live = false; };
  }, [activationId, reload]);

  if (error) return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button type="button" className="underline" onClick={() => setReload((n) => n + 1)}>Try again</button></p>;
  if (!ws) return <p className="text-sm text-slate-500" aria-live="polite">Loading the student</p>;
  // Not activated yet: the existing activation workspace is the profile.
  if (profileModeOf(ws.header.status) === 'ACTIVATION') return <StudentWorkspaceClient activationId={activationId} initialPanel={initialPanel} />;

  const h = ws.header;
  const choose = (k: TabKey) => {
    setTab(k);
    // Keep the address in step so a tab can be linked to, without leaving the page.
    window.history.replaceState(null, '', `/mentoring/students/${activationId}?tab=${k}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4" data-testid="student-workspace">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
        <Link href="/mentoring" className="hover:underline">Mentoring</Link> / <Link href="/mentoring/students" className="hover:underline">My Students</Link> / <span className="font-medium text-slate-900">{h.name}</span>
      </nav>

      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="student-header">
        <div className="flex flex-wrap items-start gap-4">
          {h.photoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={h.photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            : <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-700">{initialsOf(h.name)}</span>}
          <div className="mr-auto min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{h.name} <span className="font-normal text-slate-500">({h.studentId ?? 'n/a'})</span></h1>
            <p className="text-sm text-slate-600">{[h.grade, h.level, h.curriculum].filter(Boolean).join(' · ') || 'Grade n/a'}{h.school ? ` · ${h.school}` : ''}</p>
            <p className="text-sm text-slate-600">Mentor: {h.mentor.name ?? 'n/a'} · Activated: {h.activatedAt ? dateText(h.activatedAt) : 'n/a'}</p>
            <p className="text-sm text-slate-600" data-testid="parent-line">
              {h.parent ? <>Parent / guardian: {[h.parent.name, h.parent.phone].filter(Boolean).join(' · ') || 'n/a'}</> : 'Parent contact is shown to the assigned Mentor, the Mentoring Head and the CEO.'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={statusVariant(h.status)}>{h.statusLabel}</Badge>
            {ws.viewer.readOnly && <Badge>Read only</Badge>}
            {ws.viewer.canEditProfile && <Button type="button" size="sm" variant="outline" onClick={() => { choose('profile'); setEditing(true); }} className="min-h-11 gap-1.5" data-testid="edit-profile-button"><Pencil aria-hidden="true" className="h-4 w-4" />Edit profile</Button>}
          </div>
        </div>
        {ws.cards.pendingWorkflow && (
          <p role="status" className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            An activation workflow is still open for this student. <Link className="font-medium underline" href={`/mentoring/students/${activationId}?panel=checklist`}>Open the activation checklist</Link>
          </p>
        )}
      </header>

      <div role="tablist" aria-label="Student workspace" className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} onClick={() => choose(k)}
            className={`min-h-11 whitespace-nowrap px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${tab === k ? 'border-b-2 border-brand-600 font-semibold text-brand-700' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <Overview ws={ws} onOpen={choose} />}
        {tab === 'classes' && <ClassesTab activationId={activationId} />}
        {tab === 'timetable' && <TimetableTab activationId={activationId} ws={ws} />}
        {tab === 'exams' && <ExamsPanel activationId={activationId} />}
        {tab === 'complaints' && <ComplaintsPanel activationId={activationId} parentName={h.parent?.name ?? ''} />}
        {tab === 'profile' && <ProfileDetails activationId={activationId} editing={editing} setEditing={setEditing} saved={saved} onSaved={(changed) => { setEditing(false); setSaved(`Profile saved. ${changed.length} field${changed.length === 1 ? '' : 's'} changed and recorded in the audit history.`); setReload((n) => n + 1); }} />}
        {tab === 'tutors' && <Tutors ws={ws} />}
        {tab === 'plan' && <div className="space-y-6"><LearningPlanPanel activationId={activationId} /><MonthlyReviewPanel activationId={activationId} /></div>}
        {tab === 'communication' && <Communication activationId={activationId} />}
        {tab === 'activation' && <Events activationId={activationId} audit={false} />}
        {tab === 'audit' && <Events activationId={activationId} audit />}
      </div>
    </div>
  );
}

function Card({ label, value, hint, onClick, testId }: { label: string; value: React.ReactNode; hint?: React.ReactNode; onClick?: () => void; testId?: string }) {
  const body = <><p className="text-xs text-slate-600">{label}</p><p className="text-lg font-semibold text-slate-900">{value}</p>{hint && <p className="text-xs text-slate-600">{hint}</p>}</>;
  const cls = 'min-h-11 rounded-md border border-slate-200 bg-white p-3 text-left';
  return onClick
    ? <button type="button" onClick={onClick} data-testid={testId} className={`${cls} hover:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}>{body}</button>
    : <div data-testid={testId} className={cls}>{body}</div>;
}

function Overview({ ws, onOpen }: { ws: WorkspaceData; onOpen: (k: TabKey) => void }) {
  const b = ws.balance;
  const c = ws.cards;
  const next = c.nextClass;
  const plan = c.learningPlan;
  return (
    <div className="space-y-4">
      <section aria-label="Class allocation and consumption this month" className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">This month</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <Card testId="card-allocated" label="Allocated" value={<>{minutesText(b.allocatedMinutes)}<span className="block text-sm font-normal text-slate-600">Classes: n/a</span></>} hint="Hours are the monthly hours on the requirements. A class count is not stored." />
          <Card testId="card-consumed" label="Consumed" value={<>{minutesText(b.consumedMinutes)}<span className="block text-sm font-normal text-slate-600">Classes: {b.consumedClasses}</span></>} hint="Only classes the Mentor verified" onClick={() => onOpen('classes')} />
          <Card testId="card-remaining" label="Remaining" value={<>{minutesText(b.remainingMinutes)}<span className="block text-sm font-normal text-slate-600">Classes: n/a</span></>} hint={b.over ? 'More than allocated was consumed' : 'Allocated hours minus consumed hours'} />
        </div>
      </section>

      <section aria-label="What needs attention" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Card testId="card-next-class" label="Next class" value={next ? `${dateText(next.date)}, ${clock(next.startMinute)}` : 'None in two weeks'} hint={next ? `${next.subjectName} · ${untilText(ws.today, next.date)}` : undefined} onClick={() => onOpen('timetable')} />
        <Card testId="card-awaiting-mentor" label="Pending verifications" value={c.awaitingMentorVerification} hint={c.awaitingTutorUpdate ? `${c.awaitingTutorUpdate} awaiting the tutor` : undefined} onClick={() => onOpen('classes')} />
        <Card testId="card-next-exam" label="Upcoming exams" value={c.upcomingExams} hint={c.nextExam ? `Next: ${whenText(c.nextExam)} · ${c.nextExam.title}` : 'None scheduled'} onClick={() => onOpen('exams')} />
        <Card testId="card-complaints" label="Open complaints" value={c.openComplaints} onClick={() => onOpen('complaints')} />
        <Card testId="card-next-meeting" label="Next parent meeting" value={whenText(c.nextMeeting)} onClick={() => onOpen('plan')} />
        <Card testId="card-plan" label="Learning plan period" value={plan && plan.endsOn ? `Until ${dateText(plan.endsOn)}` : 'n/a'} hint={plan ? [plan.status ? pretty(plan.status) : null, plan.start ? `from ${dateText(plan.start)}` : null].filter(Boolean).join(' · ') : 'No plan yet'} onClick={() => onOpen('plan')} />
        <Card testId="card-pending" label="Pending actions" value={c.pending.total} hint={`${c.pending.verification} to verify · ${c.pending.complaints} complaints · ${c.pending.tasks} tasks`} />
        <Card testId="card-upcoming" label="Upcoming classes" value={c.upcomingClasses} hint="Next two weeks, from the timetable" onClick={() => onOpen('timetable')} />
      </section>

      <section aria-label="Recent class activity" className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Recent class activity</h2>
        {c.recentClasses.length === 0
          ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600" data-testid="recent-empty">No class records yet.</p>
          : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
              {c.recentClasses.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="font-medium">{dateText(r.date)}, {clock(r.startMinute)}</span><span>{r.subjectName}</span>
                  <Badge className={`ml-auto ${TONES[r.tone].chip}`}>{r.stateLabel}</Badge>
                </li>
              ))}
            </ul>
          )}
      </section>
      <p className="text-xs text-slate-600">{ws.allocationNote}</p>
    </div>
  );
}

function TimetableTab({ activationId, ws }: { activationId: string; ws: WorkspaceData }) {
  const next = ws.cards.nextClass;
  return (
    <div className="space-y-4">
      <section aria-label="Next class" className="rounded-lg border border-blue-200 bg-blue-50 p-4" data-testid="timetable-next">
        <p className="text-xs font-medium text-blue-900">Next class</p>
        {next
          ? <p className="text-lg font-semibold text-slate-900">{dateText(next.date)}, {clock(next.startMinute)} <span className="text-base font-normal text-slate-700">· {next.subjectName} · {untilText(ws.today, next.date)}</span></p>
          : <p className="text-sm text-slate-700">No class is scheduled in the next two weeks.</p>}
      </section>
      <TimetablePanel activationId={activationId} />
    </div>
  );
}

function Tutors({ ws }: { ws: WorkspaceData }) {
  if (ws.tutors.length === 0) return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">No tutor is assigned yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Tutor</th><th className="px-3 py-2">Classes</th><th className="px-3 py-2">Status</th></tr></thead>
        <tbody>
          {ws.tutors.map((t) => (
            <tr key={t.subjectId} className="border-t border-slate-100" data-testid="tutor-row">
              <td className="px-3 py-2 font-medium">{t.subjectName || 'n/a'}</td><td className="px-3 py-2">{t.tutorName}</td>
              <td className="px-3 py-2 text-slate-600">{t.sessions.length ? t.sessions.join(', ') : 'n/a'}</td>
              <td className="px-3 py-2">{t.status === 'NEEDS_REVIEW' ? <Badge variant="warning">Needs review</Badge> : <Badge variant="success">Assigned</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useLoad<T>(path: string, reload = 0): { data: T | null; error: string | null } {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    mentoringApi(path).then((d: T) => { if (live) setData(d); }).catch((e: unknown) => { if (live) setError(e instanceof Error && e.message ? e.message : 'This could not be loaded.'); });
    return () => { live = false; };
  }, [path, reload]);
  return { data, error };
}

/**
 * Profile Details. Values come from the admission handover and keep their source: Sales values stay as Sales sent them, and a Mentor's edit is stored
 * beside them. Only the assigned Mentor of an activated student can edit; everyone else sees the same values read only.
 */
function ProfileDetails({ activationId, editing, setEditing, saved, onSaved }: { activationId: string; editing: boolean; setEditing: (v: boolean) => void; saved: string | null; onSaved: (changed: string[]) => void }) {
  const [version, setVersion] = React.useState(0);
  const { data, error } = useLoad<{ fields: ProfileField[]; canEdit: boolean; parentHidden: boolean }>(`/mentoring/mentor-students/${activationId}/profile`, version + (saved ? saved.length : 0));
  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-600">Loading the profile</p>;
  return (
    <div className="space-y-4 text-sm">
      {saved && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900" data-testid="profile-saved">{saved}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <p role="note" data-testid="profile-edit-note" className="mr-auto text-slate-700">
          {data.canEdit ? 'You are the assigned Mentor, so you can edit every student and parent detail. Each change keeps the original Sales value and is recorded in the audit history.' : 'These details are read only for you. The assigned Mentor edits them.'}
        </p>
        {data.canEdit && <Button type="button" className="min-h-11" onClick={() => setEditing(true)} data-testid="profile-edit-open">Edit profile</Button>}
      </div>
      {data.parentHidden && <p className="rounded-md bg-slate-100 px-3 py-2 text-slate-800">Parent details are shown to the assigned Mentor, the Mentoring Head and the CEO.</p>}
      {GROUP_ORDER.map((g) => {
        const list = data.fields.filter((f) => f.group === g);
        if (list.length === 0) return null;
        return (
          <section key={g} aria-label={GROUP_TITLES[g]} className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 font-semibold text-slate-900">{GROUP_TITLES[g]}</h3>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((f) => (
                <div key={f.key} data-testid="profile-field" data-key={f.key}>
                  <dt className="text-xs text-slate-600">{f.label}</dt>
                  <dd className="whitespace-pre-wrap text-slate-900">{displayOf(f.value)}</dd>
                  <dd className="text-xs text-slate-600">{SOURCE_LABELS[f.source] ?? f.source}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      {editing && data.canEdit && <EditProfileDialog activationId={activationId} fields={data.fields} onClose={() => setEditing(false)} onSaved={(c) => { setVersion((n) => n + 1); onSaved(c); }} />}
    </div>
  );
}

function Communication({ activationId }: { activationId: string }) {
  const { data, error } = useLoad<{ messages: any[]; reminders: any[] }>(`/mentoring/mentor-students/${activationId}/communication`);
  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-600">Loading communication</p>;
  if (data.messages.length === 0 && data.reminders.length === 0) return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600" data-testid="communication-empty">No messages or reminders have been recorded for this student.</p>;
  return (
    <div className="space-y-4 text-sm">
      <section aria-label="Class messages"><h3 className="mb-1 font-semibold">Class messages</h3>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">{data.messages.map((m) => <li key={m.id} className="p-3"><p className="whitespace-pre-wrap">{m.text}</p><p className="text-xs text-slate-600">Prepared {fmt(m.preparedAt)}{m.confirmedAt ? ` · confirmed ${fmt(m.confirmedAt)}` : m.copiedAt ? ` · copied ${fmt(m.copiedAt)}` : ' · not sent'}</p></li>)}</ul>
      </section>
      <section aria-label="Reminders"><h3 className="mb-1 font-semibold">Reminders</h3>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">{data.reminders.map((r) => <li key={r.id} className="p-3"><p>{r.message}</p><p className="text-xs text-slate-600">{pretty(r.kind)} · {pretty(r.status)} · prepared {fmt(r.preparedAt)}{r.sentAt ? ` · sent ${fmt(r.sentAt)}` : ''}{r.acknowledgedAt ? ` · acknowledged ${fmt(r.acknowledgedAt)}` : ''}</p></li>)}</ul>
      </section>
    </div>
  );
}

/** Activation history is the workflow's stages and decisions; the audit history is every edit to profile information. Both read the existing event log. */
function Events({ activationId, audit }: { activationId: string; audit: boolean }) {
  const { data, error } = useLoad<any[]>(`/mentoring/students/${activationId}/events`);
  if (error) return <p role="alert" className="text-sm text-slate-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-600">Loading the history</p>;
  const rows = data.filter((e) => isAuditEvent(e.type) === audit);
  if (rows.length === 0) return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600" data-testid="history-empty">{audit ? 'No profile edits have been recorded.' : 'No activation history has been recorded.'}</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm" aria-label={audit ? 'Audit history' : 'Activation history'}>
      {rows.map((e) => (
        <li key={e.id} className="p-3">
          <span className="font-medium">{pretty(e.type)}{audit && typeof e.payload?.fieldKey === 'string' ? `: ${fieldLabel(e.payload.fieldKey)}` : ''}</span>
          {e.fromStatus && e.toStatus && <span className="text-slate-600"> · {pretty(e.fromStatus)} to {pretty(e.toStatus)}</span>}
          {e.reason && <span className="text-slate-600"> · {pretty(e.reason)}</span>}
          {audit && auditLine(e.payload) && <div className="text-slate-700" data-testid="audit-line">{auditLine(e.payload)}</div>}
          <div className="text-xs text-slate-600">{fmt(e.createdAt)}{audit && e.payload?.source === 'ACTIVATED_PROFILE_EDIT' ? ' · edited after activation' : ''}</div>
        </li>
      ))}
    </ul>
  );
}

const fieldLabel = (key: string) => key.replace(/^(student|parent|academic)\./, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
