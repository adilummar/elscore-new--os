"use client";

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../../mentoring-client';
import { computeProgress, describeRequirements, isItemResolved } from '../../checklist-progress';
import { buildOverview } from '../../handover-inventory';
import { describeFieldChange, handoverFieldLabel } from '../../handover-presentation';
import { PRIORITY_LABELS, REASON_LABELS, fmt, pretty, statusVariant } from '../../labels';
import { ChecklistPanel, ItemUpdate } from './ChecklistPanel';
import { EarlierResults } from './EarlierResults';
import { HandoverOverview } from './HandoverOverview';
import { HandoverReview } from './HandoverReview';
import { InformationWorkspace } from './InformationWorkspace';

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

  const [notice, setNotice] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Unsaved edits: warn before the browser tab closes and before leaving a stage or panel.
  const dirtyIds = React.useRef(new Set<string>());
  const [dirtyCount, setDirtyCount] = React.useState(0);
  const markDirty = React.useCallback((id: string, dirty: boolean) => {
    const had = dirtyIds.current.has(id);
    if (dirty === had) return;
    if (dirty) dirtyIds.current.add(id); else dirtyIds.current.delete(id);
    setDirtyCount(dirtyIds.current.size);
  }, []);
  React.useEffect(() => {
    if (dirtyCount === 0) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);
  const confirmLeave = () => dirtyIds.current.size === 0 || window.confirm('You have unsaved changes. Leave without saving?');

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
  const progress = computeProgress(checklist);
  const overview = buildOverview(ws.handover);
  const updateItem = async (itemKey: string, update: ItemUpdate) => {
    await mentoringApi(`${base}/stages/${stage.number}/items/${itemKey}`, 'PATCH', update);
    setNotice('Checklist updated.');
    await load();
  };
  const authorizeException = async (itemKey: string, reason: string) => {
    await mentoringApi(`${base}/stages/${stage.number}/exceptions/${itemKey}`, 'POST', { reason });
    setNotice('Exception recorded.');
    await load();
  };
  const stageOpen = canWork && (stage?.status === 'IN_PROGRESS' || stage?.status === 'PENDING_REVIEW');

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
      {notice && <div role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

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
          <button key={s.number} onClick={() => confirmLeave() && setStageNo(s.number)}
            className={`rounded-md border px-3 py-2 text-left text-xs ${s.number === stage?.number ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'}`}>
            <div className="font-semibold text-slate-800">{s.number}. {s.name}</div>
            <div className="mt-1"><Badge variant={statusVariant(s.status)}>{pretty(s.status)}</Badge></div>
          </button>
        ))}
      </div>

      <div className="flex gap-4 border-b border-slate-200 text-sm">
        {(['checklist', 'tasks', 'history'] as Panel[]).map((p) => (
          <button key={p} onClick={() => confirmLeave() && setPanel(p)} className={`pb-2 ${panel === p ? 'border-b-2 border-brand-600 font-semibold' : 'text-slate-500'}`}>
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
            {/* Stage 1 is submitted from its own panel below, so it has no second completion button here. */}
            {canWork && stage.number !== 1 && (stage.status === 'IN_PROGRESS' || stage.status === 'PENDING_REVIEW') && (
              <Button size="sm" isLoading={busy} disabled={progress.outstandingMandatory.length > 0} title={progress.outstandingMandatory.length > 0 ? 'Resolve every mandatory item first' : undefined}
                onClick={() => run(() => mentoringApi(`${base}/stages/${stage.number}/verify`, 'POST', {}))}>Verify and complete stage {stage.number}</Button>
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

          {stage.number === 1 && (
            <>
              {ws.handover && <HandoverOverview handover={ws.handover} />}
              <HandoverReview
                item={checklist[0]}
                stageStatus={stage.status}
                editable={Boolean(stageOpen)}
                received={overview.received.length}
                required={overview.required.length}
                onSubmit={async () => {
                  try {
                    // Record the review when it is not recorded yet, then complete the stage. Both calls are checked by the API.
                    if (checklist[0] && !isItemResolved(checklist[0])) {
                      await mentoringApi(`${base}/stages/1/items/${checklist[0].key}`, 'PATCH', { state: 'VERIFIED' });
                    }
                    await mentoringApi(`${base}/stages/1/verify`, 'POST', {});
                    setNotice('Handover submitted. Stage 1 is complete and the Meeting with Parents is next.');
                  } finally {
                    // Show what was actually saved, including a review that was recorded when the second call was refused.
                    await load();
                  }
                }}
              />
            </>
          )}

          {stage.number === 2 && (
            <div className="space-y-3">
              {canWork && stage.status === 'NOT_STARTED' && (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Start this stage to collect and verify information with the parent. Until then the information below is read-only.</p>
              )}
              <a href="#meeting-checklist" className="text-sm text-brand-700 hover:underline lg:hidden">Go to the checklist, {describeRequirements(progress)}</a>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
                {ws.handover ? (
                  <InformationWorkspace
                    handover={ws.handover}
                    canEdit={Boolean(viewer.canEditHandover)}
                    onDirtyChange={markDirty}
                    onSave={async (fieldKey, value) => {
                      await mentoringApi(`${base}/handover/fields/${fieldKey}`, 'PUT', { value });
                      setNotice(`${handoverFieldLabel(fieldKey)} saved.`);
                      await load();
                    }}
                    onVerify={async (fieldKey, verified) => {
                      await mentoringApi(`${base}/handover/fields/${fieldKey}/verification`, 'PUT', { verified });
                      setNotice(verified ? `${handoverFieldLabel(fieldKey)} verified.` : `Verification of ${handoverFieldLabel(fieldKey)} withdrawn.`);
                      await load();
                    }}
                  />
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">No handover information is available for this student.</p>
                )}
                <div id="meeting-checklist" className="min-w-0 space-y-3 lg:sticky lg:top-4">
                  <ChecklistPanel
                    items={checklist}
                    editable={Boolean(stageOpen)}
                    canAuthorizeException={Boolean(viewer.isHead) && activation.status !== 'ACTIVATED' && activation.status !== 'CANCELLED'}
                    busy={busy}
                    onDirtyChange={markDirty}
                    onUpdate={updateItem}
                    onAuthorizeException={authorizeException}
                  />
                  <EarlierResults items={Array.isArray(ws.legacyStage1Items) ? ws.legacyStage1Items : []} />
                </div>
              </div>
            </div>
          )}

          {stage.number > 2 && (
            <ChecklistPanel
              items={checklist}
              editable={Boolean(stageOpen)}
              canAuthorizeException={Boolean(viewer.isHead) && activation.status !== 'ACTIVATED' && activation.status !== 'CANCELLED'}
              busy={busy}
              onDirtyChange={markDirty}
              onUpdate={updateItem}
              onAuthorizeException={authorizeException}
            />
          )}
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
              <span className="font-medium">{pretty(e.type)}{e.type.startsWith('HANDOVER_FIELD_') && typeof e.payload?.fieldKey === 'string' ? `: ${handoverFieldLabel(e.payload.fieldKey)}` : ''}</span>
              {e.fromStatus && e.toStatus && <span className="text-slate-500"> · {pretty(e.fromStatus)} → {pretty(e.toStatus)}</span>}
              {e.reason && <span className="text-slate-600"> · {REASON_LABELS[e.reason] ?? e.reason}</span>}
              {e.type === 'HANDOVER_FIELD_UPDATED' && describeFieldChange(e.payload) && (
                <div className="break-words text-xs text-slate-600 [overflow-wrap:anywhere]">{describeFieldChange(e.payload)!.from} → {describeFieldChange(e.payload)!.to}</div>
              )}
              <div className="text-xs text-slate-400">{fmt(e.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
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
            {t.comments?.map((m: any) => <p key={m.id} className="text-xs text-slate-600">Comment: {m.body}</p>)}
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
