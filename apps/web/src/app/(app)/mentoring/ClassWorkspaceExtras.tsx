"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

import { call } from './workspace-api';
import {
  FOLLOW_UP_PRIORITIES, FOLLOW_UP_STATUS_LABELS, FollowUpDraft, FollowUpInfo, UPDATE_FIELD_LABELS, VersionInfo, WorkspaceData, WorkspaceRole, emptyFollowUp, followUpProblems, payloadOfFollowUp,
} from './workspace-view';

const AREA = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50';
const when = (iso: string | null) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : '');
type Run = (label: string, fn: () => Promise<unknown>, done: string) => void;

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const DOC_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = { NOT_REQUIRED: 'default', NOT_STARTED: 'default', IN_PROGRESS: 'warning', RETURNED: 'danger', COMPLETE: 'success' };
const CONDUCT_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = { SCHEDULED: 'default', RESCHEDULED: 'default', PENDING_REPORT: 'warning', CONDUCTED: 'success', NOT_CONDUCTED: 'default', CANCELLED: 'default' };

/**
 * The two statuses of a class side by side. Whether the class took place and whether its paperwork is complete are separate facts:
 * a conducted class can still lack its paperwork, and finished paperwork never makes a class conducted.
 */
export function StatusStrip({ c }: { c: WorkspaceData['class'] }) {
  if (!c.classStatus || !c.documentation) return null;
  const missing = c.documentation.missing;
  return (
    <section aria-label="Class and documentation status" className="rounded-md border border-slate-200 bg-white p-3" data-testid="status-strip">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Class</span><Badge variant={CONDUCT_TONE[c.classStatus] ?? 'default'} data-testid="class-status">{c.classStatusLabel}</Badge>
        <span className="ml-3 text-xs text-slate-500">Documentation</span><Badge variant={DOC_TONE[c.documentation.status] ?? 'default'} data-testid="documentation-status">{c.documentation.label}</Badge>
      </div>
      {missing.length > 0 && c.documentation.status !== 'NOT_REQUIRED' && (
        <ul className="mt-2 space-y-0.5 text-xs text-slate-700" aria-label="What is missing" data-testid="documentation-missing">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
      )}
    </section>
  );
}

const show = (value: unknown): string => (Array.isArray(value) ? value.join(', ') || 'None' : value === null || value === undefined || value === '' ? 'Empty' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value));

/** Every submission of the tutor update, oldest first, with who sent it, why, and what changed. Nothing here can be edited. */
export function VersionHistory({ versions }: { versions: VersionInfo[] }) {
  if (versions.length === 0) return null;
  return (
    <section aria-label="Update history" className="rounded-md border border-slate-200 bg-white p-3" data-testid="version-history">
      <h4 className="mb-1 text-sm font-semibold text-slate-900">Update history</h4>
      <ol className="space-y-2">
        {versions.map((v) => (
          <li key={v.version} className="text-sm" data-testid="version">
            <p className="font-medium text-slate-900">Version {v.version}{v.resubmission ? ', sent again' : ', first submission'}<span className="ml-2 font-normal text-slate-600">{when(v.at)}{v.by ? `, ${v.by}` : ''}</span></p>
            {v.reason && <p className="text-xs text-slate-700">Reason: {v.reason}</p>}
            {v.changed.length > 0 && <p className="text-xs text-slate-600">Changed: {v.changed.map((k) => UPDATE_FIELD_LABELS[k] ?? k).join(', ')}.</p>}
            {v.snapshot && (
              <details className="text-xs text-slate-700"><summary className="cursor-pointer">How it was sent</summary>
                <dl className="mt-1 grid gap-x-3 gap-y-0.5 sm:grid-cols-[180px_1fr]">
                  {Object.entries(v.snapshot).filter(([k]) => UPDATE_FIELD_LABELS[k]).map(([k, val]) => <React.Fragment key={k}><dt className="text-slate-500">{UPDATE_FIELD_LABELS[k]}</dt><dd className="whitespace-pre-wrap">{show(val)}</dd></React.Fragment>)}
                </dl>
              </details>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function FollowUpForm({ busy, onSave }: { busy: boolean; onSave: (d: FollowUpDraft) => void }) {
  const [d, setD] = React.useState<FollowUpDraft>(emptyFollowUp);
  const today = localToday();
  const problems = followUpProblems(d, today);
  const set = <K extends keyof FollowUpDraft>(k: K, v: FollowUpDraft[K]) => setD({ ...d, [k]: v });
  return (
    <div className="space-y-2 rounded-md bg-slate-50 p-3" data-testid="follow-up-form">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block text-slate-700">What needs doing</span><Input value={d.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Due date</span><Input type="date" min={today} value={d.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Who does it</span>
          <select className={AREA} value={d.assignee} onChange={(e) => set('assignee', e.target.value as FollowUpDraft['assignee'])}><option value="TUTOR">The tutor</option><option value="MENTOR">I do</option></select></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Priority</span>
          <select className={AREA} value={d.priority} onChange={(e) => set('priority', e.target.value)}>{FOLLOW_UP_PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      <label className="block text-sm"><span className="mb-1 block text-slate-700">Details</span><textarea className={AREA} rows={2} value={d.description} onChange={(e) => set('description', e.target.value)} /></label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={busy || problems.length > 0} onClick={() => { onSave(d); setD(emptyFollowUp()); }}>Add follow-up</Button>
        {problems.length > 0 && <span className="text-xs text-slate-500">Still needed: {problems.join(', ')}.</span>}
      </div>
    </div>
  );
}

function FollowUpRow({ f, role, classKey, busy, canDecide, run }: { f: FollowUpInfo; role: WorkspaceRole; classKey: string; busy: boolean; canDecide: boolean; run: Run }) {
  const [note, setNote] = React.useState('');
  const [reason, setReason] = React.useState('');
  const closed = f.status === 'VERIFIED' || f.status === 'CANCELLED';
  void classKey;
  return (
    <li className="rounded-md border border-slate-200 bg-white p-3 text-sm" data-testid="follow-up" data-status={f.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto font-semibold text-slate-900">{f.title}</span>
        <Badge variant={f.overdue ? 'danger' : closed ? 'success' : 'default'}>{FOLLOW_UP_STATUS_LABELS[f.status] ?? f.status}{f.overdue ? ', overdue' : ''}</Badge>
      </div>
      <p className="text-xs text-slate-600">For {f.assigneeRole === 'TUTOR' ? `the tutor${f.assignee ? `, ${f.assignee}` : ''}` : 'the Mentor'}. Due {f.dueAt ? when(f.dueAt) : 'no date'}. Priority {f.priority.toLowerCase()}.</p>
      {f.description && <p className="mt-1 whitespace-pre-wrap text-slate-800">{f.description}</p>}
      {f.note && <p className="mt-1 text-xs text-slate-700">Handed in: {f.note}</p>}
      {f.returnReason && <p className="mt-1 text-xs text-red-700">{f.status === 'CANCELLED' ? 'Cancelled' : 'Sent back'}: {f.returnReason}</p>}
      {role === 'TUTOR' && ['OPEN', 'IN_PROGRESS', 'RETURNED'].includes(f.status) && (
        <div className="mt-2 space-y-2">
          <label className="block"><span className="mb-1 block text-xs text-slate-700">What was done</span><textarea className={AREA} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            {f.status === 'OPEN' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run('follow-up', () => call('TUTOR', `/follow-ups/${f.id}`, 'PUT', { status: 'IN_PROGRESS', note }), 'Marked as started.')}>I have started</Button>}
            <Button type="button" size="sm" disabled={busy || !note.trim()} onClick={() => run('follow-up', () => call('TUTOR', `/follow-ups/${f.id}`, 'PUT', { status: 'SUBMITTED', note }), 'Handed in to your Mentor.')}>Hand it in</Button>
          </div>
        </div>
      )}
      {role === 'MENTOR' && canDecide && !closed && (
        <div className="mt-2 space-y-2">
          <label className="block"><span className="mb-1 block text-xs text-slate-700">Reason, needed to send back or cancel</span><textarea className={AREA} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy || (f.status !== 'SUBMITTED' && f.assigneeRole === 'TUTOR')} onClick={() => run('follow-up', () => call('MENTOR', `/follow-ups/${f.id}`, 'PUT', { decision: 'VERIFIED' }), 'The follow-up is verified.')}>Verify</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || f.status !== 'SUBMITTED' || !reason.trim()} onClick={() => run('follow-up', () => call('MENTOR', `/follow-ups/${f.id}`, 'PUT', { decision: 'RETURNED', reason }), 'Sent back to the tutor.')}>Send back</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => run('follow-up', () => call('MENTOR', `/follow-ups/${f.id}`, 'PUT', { decision: 'CANCELLED', reason }), 'The follow-up is cancelled.')}>Cancel it</Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Follow-up tasks about this class. The Mentor makes and decides them; the tutor sees the ones given to them and hands them in. */
export function FollowUps({ role, classKey, items, busy, canWork, run }: { role: WorkspaceRole; classKey: string; items: FollowUpInfo[]; busy: boolean; canWork: boolean; run: Run }) {
  if (role === 'TUTOR' && items.length === 0) return null;
  return (
    <section aria-label="Follow-up tasks" className="space-y-2" data-testid="follow-ups">
      <h4 className="text-sm font-semibold text-slate-900">Follow-up tasks</h4>
      {items.length === 0 && <p className="text-sm text-slate-500">No follow-up tasks for this class.</p>}
      <ul className="space-y-2" aria-label="Follow-ups">{items.map((f) => <FollowUpRow key={f.id} f={f} role={role} classKey={classKey} busy={busy} canDecide={canWork} run={run} />)}</ul>
      {role === 'MENTOR' && canWork && <FollowUpForm busy={busy} onSave={(d) => run('add-follow-up', () => call('MENTOR', `/${classKey}/follow-ups`, 'POST', payloadOfFollowUp(d)), 'The follow-up was added.')} />}
    </section>
  );
}
