"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  CATEGORY_CHOICES, CHANNEL_CHOICES, COMMUNICATION_CHOICES, ComplaintDetail, ComplaintDraft, ComplaintList, ComplaintRow, ENTRY_LABELS, PRIORITY_CHOICES, PRIORITY_TONE, ResolutionDraft, SETTABLE_STATUS_CHOICES, SLA_CHOICES, SLA_TONE, STAGE_CHOICES, STAGE_TONE,
  ackText, complaintProblems, emptyComplaintDraft, emptyResolutionDraft, minutesText, payloadOfComplaint, payloadOfResolution, resolutionProblems,
} from '../../complaint-view';
import { mentoringApi } from '../../mentoring-client';
import { dayLabel, longDayLabel } from '../../timetable-view';

const AREA = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50';
const when = (iso: string) => `${dayLabel(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;
export type Call = (label: string, path: string, body: unknown, done: string, after?: () => void) => void;

// ─── One complaint in the list ──────────────────────────────────────────────────────────────────────────────────
export function ComplaintCard({ c, onOpen }: { c: ComplaintRow; onOpen: () => void }) {
  return (
    <article aria-label={c.title} className="rounded-md border border-slate-200 bg-white p-3" data-testid="complaint-card" data-stage={c.stage}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold text-slate-900">{c.title}<span className="ml-2 font-normal text-slate-500">{c.number}</span></h3>
        <Badge variant={PRIORITY_TONE[c.priority] ?? 'default'}>{c.priorityLabel}</Badge>
        <Badge variant={STAGE_TONE[c.stage]} data-testid="complaint-stage">{c.stageLabel}</Badge>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {([['Category', c.categoryLabel], ['Status', c.statusLabel], ['Parent', c.parentName], ['Received', when(c.receivedAt)], ['Assigned to', c.assignedToName ?? 'No one'], ['Resolution time', c.resolutionMinutes !== null ? minutesText(c.resolutionMinutes) : 'Not resolved yet']] as Array<[string, string]>)
          .map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></div>)}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {c.ack.state && <Badge variant={SLA_TONE[c.ack.state]} data-testid="complaint-sla">Acknowledgement: {c.ack.stateLabel}</Badge>}
        <span className="text-xs text-slate-600">{ackText(c.ack)}</span>
        <span className="ml-auto"><Button type="button" size="sm" variant="outline" onClick={onOpen}>Open</Button></span>
      </div>
    </article>
  );
}

// ─── Logging a complaint ────────────────────────────────────────────────────────────────────────────────────────
export function ComplaintForm({ draft, busy = false, error = null, onChange, onSubmit, onCancel }: { draft: ComplaintDraft; busy?: boolean; error?: string | null; onChange: (d: ComplaintDraft) => void; onSubmit: () => void; onCancel: () => void }) {
  const set = <K extends keyof ComplaintDraft>(k: K, v: ComplaintDraft[K]) => onChange({ ...draft, [k]: v });
  const problems = complaintProblems(draft);
  return (
    <section aria-label="Log a complaint" className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="complaint-form">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Log a complaint for the parent</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Complaint title <span className="text-red-600">required</span></span><Input value={draft.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Parent <span className="text-red-600">required</span></span><Input value={draft.parentName} onChange={(e) => set('parentName', e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Category <span className="text-red-600">required</span></span>
          <Select value={draft.category} onChange={(e) => set('category', e.target.value)}><option value="">Choose a category</option>{CATEGORY_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Priority</span>
          <Select value={draft.priority} onChange={(e) => set('priority', e.target.value)}>{PRIORITY_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">How the parent made it <span className="text-red-600">required</span></span>
          <Select value={draft.channel} onChange={(e) => set('channel', e.target.value)}><option value="">Choose</option>{CHANNEL_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">When the parent made it</span><Input type="datetime-local" value={draft.receivedAtLocal} onChange={(e) => set('receivedAtLocal', e.target.value)} /></label>
        <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-700">What the parent complained about <span className="text-red-600">required</span></span><textarea className={AREA} rows={4} value={draft.description} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-700">Supporting material, if any</span><Input value={draft.supportingNote} placeholder="Say what exists, for example a screenshot you kept. Files are not stored here." onChange={(e) => set('supportingNote', e.target.value)} /></label>
      </div>
      <p className="mt-1 text-xs text-slate-600">The two-hour acknowledgement target counts working hours from the time the parent made the complaint. Leave the time empty if it is now.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" isLoading={busy} disabled={busy || problems.length > 0} onClick={onSubmit}>Log the complaint</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        {problems.length > 0 && <p className="text-xs text-slate-500" data-testid="complaint-missing">Still needed: {problems.join(', ')}.</p>}
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

// ─── The two clocks ─────────────────────────────────────────────────────────────────────────────────────────────
export function ClockPanel({ c }: { c: ComplaintDetail }) {
  return (
    <section aria-label="Response and resolution time" className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-2" data-testid="clock-panel">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Acknowledgement target</h4>
        <dl className="mt-1 space-y-0.5 text-sm">
          <div><dt className="inline text-xs text-slate-500">Complaint made: </dt><dd className="inline text-slate-900">{when(c.ack.startedAt)}</dd></div>
          <div><dt className="inline text-xs text-slate-500">Acknowledgement due: </dt><dd className="inline text-slate-900">{c.ack.dueAt ? when(c.ack.dueAt) : 'No target set'}</dd></div>
          <div><dt className="inline text-xs text-slate-500">First response: </dt><dd className="inline text-slate-900">{c.ack.firstResponseAt ? when(c.ack.firstResponseAt) : 'Not yet'}</dd></div>
          <div><dt className="inline text-xs text-slate-500">Status: </dt><dd className="inline text-slate-900" data-testid="ack-state">{c.ack.stateLabel ?? 'No target'}</dd></div>
        </dl>
        <p className="mt-1 text-xs text-slate-600">{ackText(c.ack)}</p>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Resolution time</h4>
        <p className="mt-1 text-sm text-slate-900" data-testid="resolution-time">{c.resolutionMinutes !== null ? minutesText(c.resolutionMinutes) : 'Not resolved yet'}</p>
        <p className="mt-1 text-xs text-slate-600">{c.resolutionNote}</p>
      </div>
    </section>
  );
}

// ─── What the parent can be shown ───────────────────────────────────────────────────────────────────────────────
export function ParentView({ c }: { c: ComplaintDetail }) {
  const v = c.parentView;
  return (
    <section aria-label="What the parent sees" className="rounded-md border border-slate-200 bg-white p-3" data-testid="parent-view">
      <div className="mb-1 flex flex-wrap items-center gap-2"><h4 className="mr-auto text-sm font-semibold text-slate-900">What the parent sees</h4><Badge variant={STAGE_TONE[v.stage]}>{v.stageLabel}</Badge></div>
      <p className="text-sm text-slate-900">{v.title}, {v.categoryLabel}</p>
      <ol className="mt-1 space-y-0.5 text-sm" aria-label="Communication history">
        {v.history.map((h, i) => <li key={`${h.kind}-${i}`} className="text-slate-700">{when(h.at)}, {ENTRY_LABELS[h.kind] ?? h.kind}{h.text ? `: ${h.text}` : ''}</li>)}
      </ol>
      <p className="mt-1 text-xs text-slate-600">{v.note}</p>
    </section>
  );
}

// ─── The timeline for staff ─────────────────────────────────────────────────────────────────────────────────────
export function Timeline({ entries }: { entries: ComplaintDetail['entries'] }) {
  return (
    <ol className="space-y-1" aria-label="Everything recorded" data-testid="timeline">
      {entries.map((e, i) => (
        <li key={`${e.kind}-${i}`} className="flex flex-wrap items-baseline gap-2 text-sm" data-visibility={e.visibility}>
          <Badge variant={e.visibility === 'PARENT' ? 'info' : 'default'}>{e.visibility === 'PARENT' ? 'Parent can see' : 'Internal'}</Badge>
          <span className="font-medium text-slate-900">{ENTRY_LABELS[e.kind] ?? e.kind}</span>
          <span className="text-slate-700">{e.text}</span>
          <span className="text-xs text-slate-500">{when(e.at)}{e.by ? `, ${e.by}` : ''}</span>
        </li>
      ))}
    </ol>
  );
}

// ─── The actions ────────────────────────────────────────────────────────────────────────────────────────────────
function TextAction({ label, button, hint, busy, onSubmit }: { label: string; button: string; hint?: string; busy: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = React.useState('');
  return (
    <div className="space-y-1">
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span><textarea className={AREA} rows={2} value={text} onChange={(e) => setText(e.target.value)} /></label>
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
      <Button type="button" size="sm" variant="outline" disabled={busy || !text.trim()} onClick={() => { onSubmit(text); setText(''); }}>{button}</Button>
    </div>
  );
}

export function ResolveForm({ busy, error, onSubmit }: { busy: boolean; error?: string | null; onSubmit: (d: ResolutionDraft) => void }) {
  const [d, setD] = React.useState<ResolutionDraft>(emptyResolutionDraft());
  const problems = resolutionProblems(d);
  return (
    <section aria-label="Resolve the complaint" className="space-y-2 rounded-md bg-slate-50 p-3" data-testid="resolve-form">
      <h4 className="text-sm font-semibold text-slate-900">Resolve the complaint</h4>
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Resolution remarks <span className="text-red-600">required</span></span><textarea className={AREA} rows={3} value={d.remarks} onChange={(e) => setD({ ...d, remarks: e.target.value })} /></label>
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">How the problem was resolved <span className="text-red-600">required</span></span><textarea className={AREA} rows={2} value={d.how} onChange={(e) => setD({ ...d, how: e.target.value })} /></label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Resolution date</span><Input type="date" value={d.resolutionDate} onChange={(e) => setD({ ...d, resolutionDate: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Parent communication <span className="text-red-600">required</span></span>
          <Select value={d.communication} onChange={(e) => setD({ ...d, communication: e.target.value })}><option value="">Choose</option>{COMMUNICATION_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
      </div>
      {d.communication && d.communication !== 'INFORMED' && <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Why the parent has not been told <span className="text-red-600">required</span></span><Input value={d.communicationNote} onChange={(e) => setD({ ...d, communicationNote: e.target.value })} /></label>}
      <p className="text-xs text-slate-600">A complaint cannot be resolved without this explanation. You are recorded as the person who resolved it.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" isLoading={busy} disabled={busy || problems.length > 0} onClick={() => onSubmit(d)}>Resolve the complaint</Button>
        {problems.length > 0 && <p className="text-xs text-slate-500" data-testid="resolve-missing">Still needed: {problems.join(', ')}.</p>}
      </div>
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

export function ComplaintDetailView({ c, handlers, busy, error, call, onClose }: { c: ComplaintDetail; handlers: Array<{ userId: string; name: string }>; busy: boolean; error: string | null; call: Call; onClose: () => void }) {
  const base = `/mentoring/complaints/${c.id}`;
  const a = c.actions;
  const [channel, setChannel] = React.useState('');
  const [ackNote, setAckNote] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [statusNote, setStatusNote] = React.useState('');
  const [assignee, setAssignee] = React.useState('');
  const [escalate, setEscalate] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [reopenReason, setReopenReason] = React.useState('');
  return (
    <section aria-label="Complaint detail" className="space-y-3 rounded-md border border-brand-200 bg-white p-3" data-testid="complaint-detail">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
          <p className="text-xs text-slate-500">{c.number}, {c.studentName}, {c.categoryLabel}, {c.priorityLabel} priority</p>
        </div>
        <div className="flex items-center gap-2"><Badge variant={STAGE_TONE[c.stage]}>{c.stageLabel}</Badge><Badge variant="default">{c.statusLabel}</Badge><Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-slate-800">{c.description}</p>
      <dl className="grid gap-x-4 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-2">
        {([['Parent', c.parentName], ['Made by', c.channelLabel], ['Logged by', c.loggedByName ?? 'A user'], ['Assigned to', c.assignedToName ?? 'No one'], ['Subject', c.subjectName], ['Tutor', c.tutorName], ['Supporting material', c.supportingNote]] as Array<[string, string | null]>)
          .map(([k, v]) => v ? <div key={k}><dt className="inline font-medium">{k}: </dt><dd className="inline">{v}</dd></div> : null)}
      </dl>
      <ClockPanel c={c} />
      {c.resolution && (
        <section aria-label="Resolution" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm" data-testid="resolution">
          <h4 className="font-semibold text-emerald-900">Resolved</h4>
          <p className="text-emerald-900">{c.resolution.how}</p>
          <p className="text-xs text-emerald-800">{c.resolution.remarks}</p>
          <p className="mt-1 text-xs text-emerald-800">Resolved on {c.resolution.date ? longDayLabel(c.resolution.date) : 'an unknown date'} by {c.resolution.resolvedByName ?? 'a user'}. {c.resolution.communicationLabel}.{c.resolution.communicationNote ? ` ${c.resolution.communicationNote}` : ''}</p>
        </section>
      )}

      {a.canHandle && (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          {a.canAcknowledge && (
            <div className="space-y-2 rounded-md bg-slate-50 p-3" data-testid="ack-form">
              <h4 className="text-sm font-semibold text-slate-900">Acknowledge the complaint</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block text-slate-700">How you told the parent <span className="text-red-600">required</span></span><Select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Choose</option>{CHANNEL_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
                <label className="block text-sm"><span className="mb-1 block text-slate-700">Note</span><Input value={ackNote} onChange={(e) => setAckNote(e.target.value)} /></label>
              </div>
              <Button type="button" size="sm" disabled={busy || !channel} onClick={() => call('ack', `${base}/acknowledge`, { channel, note: ackNote }, 'The complaint is acknowledged.')}>Record the acknowledgement</Button>
            </div>
          )}
          {a.canRespond && <TextAction label="Response to the parent" button="Send the response" hint="The parent can be shown this. It is part of the communication history." busy={busy} onSubmit={(text) => call('respond', `${base}/respond`, { text }, 'The response is recorded.')} />}
          <TextAction label="What the parent said" button="Record the parent message" hint="Write down what the parent told you. It is part of the communication history." busy={busy} onSubmit={(text) => call('message', `${base}/parent-message`, { text }, 'The parent message is recorded.')} />
          <TextAction label="Internal remark" button="Add the remark" hint="Staff only. The parent never sees it." busy={busy} onSubmit={(text) => call('remark', `${base}/remark`, { text }, 'The remark is added.')} />
          <TextAction label="Action taken" button="Record the action" hint="Staff only." busy={busy} onSubmit={(text) => call('action', `${base}/action`, { text }, 'The action is recorded.')} />
          {a.canSetStatus && (
            <div className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]" data-testid="status-form">
              <Select aria-label="New status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Change the status</option>{SETTABLE_STATUS_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
              <Input aria-label="Status note" placeholder="Note, staff only" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
              <Button type="button" size="sm" variant="outline" disabled={busy || !status} onClick={() => call('status', `${base}/status`, { status, note: statusNote }, 'The status is changed.', () => { setStatus(''); setStatusNote(''); })}>Change</Button>
            </div>
          )}
          {a.canAssign && (
            <div className="space-y-2 rounded-md bg-slate-50 p-3" data-testid="assign-form">
              <h4 className="text-sm font-semibold text-slate-900">Assign or escalate</h4>
              <Select aria-label="Staff member" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Choose a staff member</option>{handlers.filter((h) => h.userId !== c.assignedToUserId).map((h) => <option key={h.userId} value={h.userId}>{h.name}</option>)}</Select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} />This is an escalation</label>
              <label className="block text-sm"><span className="mb-1 block text-slate-700">Reason{escalate ? <span className="text-red-600"> required</span> : ''}</span><Input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              <Button type="button" size="sm" variant="outline" disabled={busy || !assignee || (escalate && !reason.trim())} onClick={() => call('assign', `${base}/assign`, { userId: assignee, escalate, reason }, escalate ? 'The complaint is escalated.' : 'The complaint is assigned.', () => { setAssignee(''); setEscalate(false); setReason(''); })}>{escalate ? 'Escalate' : 'Assign'}</Button>
            </div>
          )}
          {a.canResolve && <ResolveForm busy={busy} error={error} onSubmit={(d) => call('resolve', `${base}/resolve`, payloadOfResolution(d), 'The complaint is resolved.')} />}
          {c.status === 'RESOLVED' && (
            <div className="space-y-2 rounded-md bg-slate-50 p-3" data-testid="reopen-form">
              <h4 className="text-sm font-semibold text-slate-900">Reopen the complaint</h4>
              {a.canReopen ? (
                <>
                  <label className="block text-sm"><span className="mb-1 block text-slate-700">Why <span className="text-red-600">required</span></span><Input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} /></label>
                  <Button type="button" size="sm" variant="outline" disabled={busy || !reopenReason.trim()} onClick={() => call('reopen', `${base}/reopen`, { reason: reopenReason }, 'The complaint is reopened. A new response clock started.')}>Reopen the complaint</Button>
                </>
              ) : <p className="text-sm text-slate-600">{a.reopenProblem}</p>}
            </div>
          )}
        </div>
      )}
      {error && !a.canResolve && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
      <ParentView c={c} />
      <section aria-label="Everything recorded"><h4 className="mb-1 text-sm font-semibold text-slate-900">Everything recorded</h4><Timeline entries={c.entries} /></section>
    </section>
  );
}

// ─── The page section ───────────────────────────────────────────────────────────────────────────────────────────
/** Parent complaints for one student, logged and handled by the Mentor on the parent's behalf. */
export function ComplaintsPanel({ activationId, parentName = '' }: { activationId: string; parentName?: string }) {
  const [stage, setStage] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [sla, setSla] = React.useState('');
  const [data, setData] = React.useState<ComplaintList | null>(null);
  const [open, setOpen] = React.useState<ComplaintDetail | null>(null);
  const [handlers, setHandlers] = React.useState<Array<{ userId: string; name: string }>>([]);
  const [creating, setCreating] = React.useState<ComplaintDraft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const query = `?activationId=${encodeURIComponent(activationId)}${stage ? `&stage=${stage}` : ''}${category ? `&category=${category}` : ''}${priority ? `&priority=${priority}` : ''}${sla ? `&sla=${sla}` : ''}`;

  const load = React.useCallback(async () => {
    try {
      setData(await mentoringApi(`/mentoring/complaints${query}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The complaints could not be loaded.');
    }
  }, [query]);
  React.useEffect(() => { void load(); }, [load]);

  const openComplaint = async (id: string) => {
    setActionError(null);
    try {
      const d: ComplaintDetail = await mentoringApi(`/mentoring/complaints/${id}`);
      setOpen(d);
      if (d.actions.canAssign && handlers.length === 0) setHandlers(await mentoringApi('/mentoring/complaints/handlers'));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The complaint could not be opened.');
    }
  };
  const act = async (label: string, run: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(label);
    setActionError(null);
    setNotice(null);
    try {
      await run();
      setNotice(done);
      after?.();
      await load();
      if (open) await openComplaint(open.id);
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : 'That could not be done.');
    }
    setBusy(null);
  };
  const call: Call = (label, path, body, done, after) => void act(label, () => mentoringApi(path, 'POST', body), done, after);

  const counts = data?.counts;
  return (
    <section aria-label="Parent complaints" className="space-y-3" data-testid="complaints-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold text-slate-900">Parent complaints</h2>
        {data?.canLog && !creating && <Button type="button" size="sm" onClick={() => { setActionError(null); setCreating(emptyComplaintDraft(parentName)); }}>Log a complaint</Button>}
      </div>
      <p className="text-xs text-slate-600">Parents have no login. You log a complaint for the parent and record every exchange with them.</p>
      {counts && <p className="text-sm text-slate-700" data-testid="complaint-counts">Started {counts.STARTED}, ongoing {counts.ONGOING}, resolved {counts.RESOLVED}. Acknowledgement: {counts.APPROACHING} approaching, {counts.BREACHED} breached.</p>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
        <label className="text-sm"><span className="sr-only">Stage</span><Select value={stage} onChange={(e) => setStage(e.target.value)}><option value="">Any stage</option>{STAGE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
        <label className="text-sm"><span className="sr-only">Category</span><Select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Any category</option>{CATEGORY_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
        <label className="text-sm"><span className="sr-only">Priority</span><Select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Any priority</option>{PRIORITY_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
        <label className="text-sm"><span className="sr-only">Acknowledgement status</span><Select value={sla} onChange={(e) => setSla(e.target.value)}><option value="">Any acknowledgement status</option>{SLA_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {actionError && !creating && !open && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
      {creating && <ComplaintForm draft={creating} busy={busy !== null} error={actionError} onChange={setCreating} onCancel={() => setCreating(null)} onSubmit={() => void act('create', () => mentoringApi(`/mentoring/students/${activationId}/complaints`, 'POST', payloadOfComplaint(creating)), 'The complaint is logged. The acknowledgement clock is running.', () => setCreating(null))} />}
      {!data && !error && <p className="text-sm text-slate-500">Loading the complaints</p>}
      {data && data.rows.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500" data-testid="no-complaints">{stage || category || priority || sla ? 'No complaints match these filters.' : 'No complaint has been logged for this student.'}</p>}
      <div className="space-y-2">{data?.rows.map((c) => <ComplaintCard key={c.id} c={c} onOpen={() => void openComplaint(c.id)} />)}</div>
      {open && <ComplaintDetailView key={`${open.id}-${open.entries.length}-${open.status}`} c={open} handlers={handlers} busy={busy !== null} error={actionError} call={call} onClose={() => setOpen(null)} />}
    </section>
  );
}
