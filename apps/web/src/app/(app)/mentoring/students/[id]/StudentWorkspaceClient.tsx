"use client";

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../../mentoring-client';
import { formatHandoverValue } from '../../handover-presentation';
import { ITEM_STATE_LABELS, PRIORITY_LABELS, REASON_LABELS, fmt, pretty, statusVariant } from '../../labels';
import { HandoverSummary } from './HandoverSummary';

type Panel = 'checklist' | 'tasks' | 'history';

export function StudentWorkspaceClient({ activationId, initialWorkspace, initialPanel }: { activationId: string; initialWorkspace?: any; initialPanel?: Panel }) {
  const [ws, setWs] = React.useState<any>(initialWorkspace ?? null);
  const [counselors, setCounselors] = React.useState<any[]>([]);
  const [stageNo, setStageNo] = React.useState<number | null>(null);
  const [panel, setPanel] = React.useState<Panel>(initialPanel ?? 'checklist');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState<null | 'pause' | 'block' | 'return' | 'task'>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await mentoringApi(`/mentoring/students/${activationId}`);
      setWs(data);
      setStageNo((cur) => cur ?? data.activation.currentStage);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [activationId]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    mentoringApi('/mentoring/counselors').then(setCounselors).catch(() => setCounselors([]));
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  if (!ws) return <p className="text-slate-500">{error ?? 'Loading…'}</p>;

  // A partly filled workspace (no tasks, no history, no parent, no Mentor yet) must still render.
  const activation = ws.activation ?? {};
  const student = ws.student ?? {};
  const parent = ws.parent ?? null;
  const viewer = ws.viewer ?? {};
  const openHold = ws.openHold ?? null;
  const stages: any[] = Array.isArray(ws.stages) ? ws.stages : [];
  const tasks: any[] = Array.isArray(ws.tasks) ? ws.tasks : [];
  const events: any[] = Array.isArray(ws.events) ? ws.events : [];
  const view = { ...ws, stages, tasks, events, viewer };
  const stage = stages.find((s: any) => s.number === (stageNo ?? activation.currentStage)) ?? stages[0];
  const checklist: any[] = Array.isArray(stage?.checklist) ? stage.checklist : [];
  const parentLine = parent ? [parent.name, parent.primaryPhone].filter(Boolean).join(' · ') : '';
  const canWork = viewer.isMentor && activation.status === 'ACTIVATION_IN_PROGRESS';
  const canHold = (viewer.isMentor || viewer.isHead) && activation.status === 'ACTIVATION_IN_PROGRESS';
  const onHold = activation.status === 'ACTIVATION_ON_HOLD' || activation.status === 'ACTIVATION_BLOCKED';
  const base = `/mentoring/students/${activationId}`;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Link href="/mentoring/students" className="text-sm text-brand-700 hover:underline">← All students</Link>

      <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{[student.firstName, student.lastName].filter(Boolean).join(' ') || 'Student'} {student.businessId && <span className="text-slate-500 font-normal">({student.businessId})</span>}</h1>
          <p className="text-sm text-slate-600">{student.grade?.name ?? student.currentGrade ?? 'Grade n/a'} · {student.curriculum?.name ?? 'Curriculum n/a'}</p>
          <p className="text-sm text-slate-600">Mentor: {activation.currentMentorName ?? <em>unallocated</em>}</p>
          <p className="text-sm text-slate-600">Parent / Guardian: {parentLine || <em>details not provided</em>}</p>
        </div>
        {activation.status && <Badge variant={statusVariant(activation.status)}>{pretty(activation.status)}</Badge>}
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {openHold && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm space-y-1">
          <p className="font-semibold text-amber-900">{openHold.kind === 'HOLD' ? 'Workflow paused' : 'Workflow blocked'} at stage {stages.find((s: any) => s.status === 'ON_HOLD' || s.status === 'BLOCKED')?.number}</p>
          <p>Reason: {openHold.reason}</p>
          {openHold.pendingAction && <p>Pending action: {openHold.pendingAction}</p>}
          {openHold.dependency && <p>Missing dependency: {openHold.dependency}</p>}
          <p>Follow-up: {fmt(openHold.followUpAt)} · Paused {fmt(openHold.createdAt)}</p>
          {(viewer.isMentor || viewer.isHead) && (
            <Button size="sm" isLoading={busy} onClick={() => run(() => mentoringApi(`${base}/resume`, 'POST', {}))}>Resume exactly where it stopped</Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {stages.map((s: any) => (
          <button key={s.number} onClick={() => setStageNo(s.number)}
            className={`rounded-md border px-3 py-2 text-left text-xs ${s.number === stage?.number ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'}`}>
            <div className="font-semibold text-slate-800">{s.number}. {s.name}</div>
            <div className="mt-1"><Badge variant={statusVariant(s.status)}>{pretty(s.status)}</Badge></div>
          </button>
        ))}
      </div>

      <div className="flex gap-4 border-b border-slate-200 text-sm">
        {(['checklist', 'tasks', 'history'] as Panel[]).map((p) => (
          <button key={p} onClick={() => setPanel(p)} className={`pb-2 ${panel === p ? 'border-b-2 border-brand-600 font-semibold' : 'text-slate-500'}`}>
            {p === 'checklist' ? 'Checklist' : p === 'tasks' ? `Tasks (${tasks.length})` : 'History'}
          </button>
        ))}
      </div>

      {panel === 'checklist' && stage && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {canWork && stage.status === 'NOT_STARTED' && (
              <Button size="sm" isLoading={busy} onClick={() => run(() => mentoringApi(`${base}/stages/${stage.number}/start`, 'POST', {}))}>Start stage {stage.number}</Button>
            )}
            {canWork && (stage.status === 'IN_PROGRESS' || stage.status === 'PENDING_REVIEW') && (
              <Button size="sm" isLoading={busy} onClick={() => run(() => mentoringApi(`${base}/stages/${stage.number}/verify`, 'POST', {}))}>Verify and complete stage {stage.number}</Button>
            )}
            {canHold && <Button size="sm" variant="outline" onClick={() => setForm('pause')}>Pause</Button>}
            {canHold && <Button size="sm" variant="outline" onClick={() => setForm('block')}>Report blocker</Button>}
            {viewer.isHead && activation.status !== 'ACTIVATED' && activation.status !== 'CANCELLED' && (
              <Button size="sm" variant="danger" onClick={() => {
                const reason = window.prompt('Reason for cancelling this activation?');
                if (reason) run(() => mentoringApi(`${base}/cancel`, 'POST', { reason }));
              }}>Cancel activation</Button>
            )}
          </div>

          {form === 'pause' || form === 'block' ? (
            <HoldForm kind={form} counselors={counselors} mentorId={activation.currentMentorUserId} meId={viewer.userId}
              onCancel={() => setForm(null)}
              onSubmit={(body: any) => run(async () => { await mentoringApi(`${base}/${form}`, 'POST', body); setForm(null); })} />
          ) : null}

          {activation.status === 'PENDING_FINAL_APPROVAL' && viewer.isHead && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
              <p className="font-semibold">All seven stages are complete. Final Phase 1 activation approval</p>
              <div className="flex gap-2">
                <Button size="sm" isLoading={busy} onClick={() => run(() => mentoringApi(`${base}/approval`, 'POST', { decision: 'APPROVED' }))}>Approve activation</Button>
                <Button size="sm" variant="outline" onClick={() => setForm('return')}>Return to Mentor</Button>
              </div>
              {form === 'return' && <ReturnForm onCancel={() => setForm(null)} onSubmit={(body: any) => run(async () => { await mentoringApi(`${base}/approval`, 'POST', { decision: 'RETURNED', ...body }); setForm(null); })} />}
            </div>
          )}

          {stage.number === 1 && ws.handover && <HandoverSummary handover={ws.handover} />}

          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
            {checklist.map((item: any) => (
              <ChecklistRow key={item.key} item={item} stage={stage} editable={canWork && (stage.status === 'IN_PROGRESS' || stage.status === 'PENDING_REVIEW')}
                canException={viewer.isHead && item.mandatory && !item.exception && item.state !== 'VERIFIED'} busy={busy}
                onSave={(body: any) => run(() => mentoringApi(`${base}/stages/${stage.number}/items/${item.key}`, 'PATCH', body))}
                onException={() => { const reason = window.prompt(`Reason for the exception on "${item.label}"?`); if (reason) run(() => mentoringApi(`${base}/stages/${stage.number}/exceptions/${item.key}`, 'POST', { reason })); }} />
            ))}
          </div>
        </div>
      )}

      {panel === 'tasks' && (
        <TaskPanel ws={view} stage={stage ?? { number: 1, checklist: [] }} counselors={counselors} busy={busy} run={run} showForm={form === 'task'} setShowForm={(v: boolean) => setForm(v ? 'task' : null)} />
      )}

      {panel === 'history' && (
        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
          {events.length === 0 && <p className="p-4 text-slate-500">History is visible to the Mentor and the Mentoring Head.</p>}
          {events.map((e: any) => (
            <div key={e.id} className="p-3">
              <span className="font-medium">{pretty(e.type)}</span>
              {e.fromStatus && e.toStatus && <span className="text-slate-500"> · {pretty(e.fromStatus)} → {pretty(e.toStatus)}</span>}
              {e.reason && <span className="text-slate-600"> · {REASON_LABELS[e.reason] ?? e.reason}</span>}
              <div className="text-xs text-slate-400">{fmt(e.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ item, editable, canException, busy, onSave, onException }: any) {
  const [state, setState] = React.useState(item.state);
  const [note, setNote] = React.useState(item.note ?? '');
  const [reason, setReason] = React.useState(item.reason ?? '');
  const [value, setValue] = React.useState(typeof item.value === 'string' ? item.value : item.value ? formatHandoverValue(item.key, item.value) : '');
  React.useEffect(() => { setState(item.state); setNote(item.note ?? ''); setReason(item.reason ?? ''); }, [item.state, item.note, item.reason]);
  const needsReason = state === 'UNAVAILABLE' || state === 'NOT_APPLICABLE';

  return (
    <div className="p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-800">{item.label}</span>
        {item.mandatory ? <Badge variant="info">Mandatory</Badge> : <Badge>Advisory</Badge>}
        {item.exception && <Badge variant="warning">Exception authorised</Badge>}
        <Badge variant={statusVariant(item.state)}>{ITEM_STATE_LABELS[item.state] ?? pretty(item.state)}</Badge>
      </div>
      {editable ? (
        <div className="grid gap-2 md:grid-cols-4">
          <Select value={state} onChange={(e) => setState(e.target.value)}>
            {Object.entries(ITEM_STATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input placeholder="Entered information" value={value} onChange={(e) => setValue(e.target.value)} />
          <Input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          {needsReason ? <Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} /> : <span />}
          <Button size="sm" isLoading={busy} onClick={() => onSave({ state, note, value: value || undefined, ...(needsReason ? { reason } : {}) })}>Save</Button>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {item.value ? `Entered: ${typeof item.value === 'string' ? item.value : formatHandoverValue(item.key, item.value)}` : ''} {item.note ? `· Note: ${item.note}` : ''} {item.reason ? `· Reason: ${item.reason}` : ''}
        </p>
      )}
      {canException && <button className="text-xs text-brand-700 hover:underline" onClick={onException}>Authorise exception…</button>}
    </div>
  );
}

function HoldForm({ kind, counselors, mentorId, meId, onSubmit, onCancel }: any) {
  const [reason, setReason] = React.useState('');
  const [detail, setDetail] = React.useState('');
  const [responsible, setResponsible] = React.useState(meId);
  const [followUp, setFollowUp] = React.useState('');
  const people = [{ userId: meId, name: 'Me' }, ...(mentorId && mentorId !== meId ? [{ userId: mentorId, name: 'Assigned Mentor' }] : []), ...counselors];
  const valid = reason.trim() && detail.trim() && responsible && followUp;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 grid gap-2 md:grid-cols-2">
      <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Input placeholder={kind === 'pause' ? 'Pending action' : 'Missing dependency'} value={detail} onChange={(e) => setDetail(e.target.value)} />
      <Select value={responsible} onChange={(e) => setResponsible(e.target.value)}>{people.map((p: any) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</Select>
      <input type="datetime-local" className="h-10 rounded-md border border-slate-300 px-3 text-sm" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" disabled={!valid} onClick={() => onSubmit({ reason, [kind === 'pause' ? 'pendingAction' : 'dependency']: detail, responsibleUserId: responsible, followUpAt: new Date(followUp).toISOString() })}>
          {kind === 'pause' ? 'Pause workflow' : 'Mark blocked'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Close</Button>
      </div>
    </div>
  );
}

function ReturnForm({ onSubmit, onCancel }: any) {
  const [stage, setStage] = React.useState('1');
  const [comment, setComment] = React.useState('');
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <Select value={stage} onChange={(e) => setStage(e.target.value)}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>Return to stage {n}</option>)}</Select>
      <Input placeholder="Comment for the Mentor (required)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" disabled={!comment.trim()} onClick={() => onSubmit({ comment, returnToStage: Number(stage) })}>Return</Button><Button size="sm" variant="ghost" onClick={onCancel}>Close</Button></div>
    </div>
  );
}

function TaskPanel({ ws, stage, counselors, busy, run, showForm, setShowForm }: any) {
  const { viewer } = ws;
  const canManage = viewer.isMentor || viewer.isHead;
  const [title, setTitle] = React.useState('');
  const [assignee, setAssignee] = React.useState('');
  const [due, setDue] = React.useState('');
  const [priority, setPriority] = React.useState('MEDIUM');
  const [collect, setCollect] = React.useState<{ [taskId: string]: { itemKey: string; value: string } }>({});
  const call = (taskId: string, action: string, body: unknown = {}) => run(() => mentoringApi(`/mentoring/tasks/${taskId}/${action}`, 'POST', body));

  return (
    <div className="space-y-3">
      {canManage && (
        <div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>New task for a Demo Counselor</Button>
          {showForm && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 grid gap-2 md:grid-cols-5">
              <Input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Select counselor</option>{counselors.map((c: any) => <option key={c.userId} value={c.userId}>{c.name}</option>)}</Select>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</Select>
              <input type="datetime-local" className="h-10 rounded-md border border-slate-300 px-3 text-sm" value={due} onChange={(e) => setDue(e.target.value)} />
              <Button size="sm" disabled={!title.trim() || !assignee} isLoading={busy}
                onClick={() => run(async () => {
                  await mentoringApi('/mentoring/tasks', 'POST', { activationId: ws.activation.id, stageNumber: stage.number, title, assigneeUserId: assignee, priority, ...(due ? { dueAt: new Date(due).toISOString() } : {}) });
                  setTitle(''); setShowForm(false);
                })}>Assign (stage {stage.number})</Button>
            </div>
          )}
        </div>
      )}
      {ws.tasks.length === 0 && <p className="text-sm text-slate-500">No tasks yet.</p>}
      {ws.tasks.map((t: any) => {
        const mine = t.assigneeUserId === viewer.userId;
        const open = ['OPEN', 'IN_PROGRESS', 'RETURNED'].includes(t.status);
        const c = collect[t.id] ?? { itemKey: '', value: '' };
        return (
          <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t.title}</span>
              <Badge variant={statusVariant(t.status)}>{pretty(t.status)}</Badge><Badge>{PRIORITY_LABELS[t.priority] ?? pretty(t.priority)}</Badge>
              {t.dueAt && <span className="text-xs text-slate-500">Due {fmt(t.dueAt)}</span>}
            </div>
            {t.returnReason && <p className="text-xs text-red-600">Returned: {t.returnReason}</p>}
            {t.comments?.map((m: any) => <p key={m.id} className="text-xs text-slate-600">💬 {m.body}</p>)}
            <div className="flex flex-wrap gap-2">
              {mine && (t.status === 'OPEN' || t.status === 'RETURNED') && <Button size="sm" onClick={() => call(t.id, 'start')}>Start</Button>}
              {mine && open && <Button size="sm" variant="outline" onClick={() => call(t.id, 'submit', {})}>Submit for verification</Button>}
              {mine && open && <Button size="sm" variant="ghost" onClick={() => { const r = window.prompt('Why are you pausing this task?'); if (r) call(t.id, 'hold', { reason: r }); }}>Pause task</Button>}
              {mine && t.status === 'ON_HOLD' && <Button size="sm" onClick={() => call(t.id, 'resume')}>Resume task</Button>}
              {canManage && t.status === 'SUBMITTED' && <Button size="sm" onClick={() => call(t.id, 'verify')}>Verify</Button>}
              {canManage && t.status === 'SUBMITTED' && <Button size="sm" variant="outline" onClick={() => { const r = window.prompt('What needs to be corrected?'); if (r) call(t.id, 'return', { reason: r }); }}>Return</Button>}
              {canManage && !['VERIFIED', 'CANCELLED'].includes(t.status) && <Button size="sm" variant="ghost" onClick={() => { const r = window.prompt('Reason for cancelling?'); if (r) call(t.id, 'cancel', { reason: r }); }}>Cancel</Button>}
            </div>
            {mine && open && t.stageId && (
              <div className="grid gap-2 md:grid-cols-4">
                <Select value={c.itemKey} onChange={(e) => setCollect({ ...collect, [t.id]: { ...c, itemKey: e.target.value } })}>
                  <option value="">Item to update…</option>
                  {ws.stages.flatMap((s: any) => (s.checklist ?? []).filter((i: any) => i.state === 'PENDING_COLLECTION' || i.state === 'COLLECTED').map((i: any) => ({ ...i, stageNo: s.number }))).filter((i: any) => i.stageNo === stage.number).map((i: any) => <option key={i.key} value={i.key}>{i.label}</option>)}
                </Select>
                <Input placeholder="Information collected" value={c.value} onChange={(e) => setCollect({ ...collect, [t.id]: { ...c, value: e.target.value } })} />
                <Button size="sm" disabled={!c.itemKey || !c.value} onClick={() => call(t.id, 'collect', { itemKey: c.itemKey, value: c.value })}>Save collected information</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
