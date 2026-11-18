"use client";

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../mentoring-client';
import { fmt } from '../labels';
import {
  Banner,
  Empty,
  FIELD_LABEL,
  FOCUS,
  ListSkeleton,
  MUTED,
  Notice,
  Overlay,
  PANEL,
  PageHeader,
  Section,
  StatusChip,
  TABLE,
  TABLE_WRAP,
  TD,
  TH,
  THEAD,
  TR,
} from '../mentoring-ui';

interface OverCapacityTarget {
  activationId: string;
  studentName: string;
  studentBusinessId: string;
  /** The student's full monthly hours. */
  studentHours: number;
  mentor: {
    userId: string;
    name: string;
    allocatedHours: number;
    monthlyHourLimit: number;
  };
}

export function AllocationClient() {
  const [queue, setQueue] = React.useState<any[]>([]);
  const [load, setLoad] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pick, setPick] = React.useState<Record<string, string>>({});
  const [cap, setCap] = React.useState('');
  const [warnPct, setWarnPct] = React.useState('');

  // Over-capacity confirmation dialog state
  const [target, setTarget] = React.useState<OverCapacityTarget | null>(null);
  const [reason, setReason] = React.useState('');
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const [dialogBusy, setDialogBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const [q, w] = await Promise.all([mentoringApi('/mentoring/allocation/queue'), mentoringApi('/mentoring/allocation/workload')]);
      setQueue(q);
      setLoad(w);
      setCap(String(Number(w.settings.defaultMonthlyHourLimit)));
      setWarnPct(String(w.settings.capacityWarningPercent));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Same eligibility the server uses for manual assignment (account, role, employment, profile), not just "active".
  const mentors = (load?.staff ?? []).filter((s: any) => s.role === 'MENTOR' && s.eligibleForManual);

  const handleAllocateClick = (q: any) => {
    const mentorId = pick[q.activationId];
    if (!mentorId) return;
    const m = mentors.find((x: any) => x.userId === mentorId);
    if (!m) return;

    // The server decides; this only shows the Head what they are about to approve. A student's full monthly hours are charged.
    if (m.allocatedHours + (q.monthlyHours ?? 0) > m.monthlyHourLimit) {
      setTarget({
        activationId: q.activationId,
        studentName: q.studentName,
        studentBusinessId: q.studentBusinessId,
        studentHours: q.monthlyHours ?? 0,
        mentor: {
          userId: m.userId,
          name: m.name,
          allocatedHours: m.allocatedHours,
          monthlyHourLimit: m.monthlyHourLimit,
        },
      });
      setReason('');
      setReasonError(null);
      setDialogError(null);
      return;
    }

    run(async () => {
      await mentoringApi(`/mentoring/allocation/${q.activationId}/assign`, 'POST', { mentorUserId: mentorId });
    });
  };

  const handleConfirmOverCapacity = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!target || dialogBusy) return;

    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError('Please provide a reason for allocating over capacity.');
      return;
    }

    setReasonError(null);
    setDialogError(null);
    setDialogBusy(true);

    try {
      await mentoringApi(`/mentoring/allocation/${target.activationId}/assign`, 'POST', {
        mentorUserId: target.mentor.userId,
        overCapacityReason: trimmed,
      });
      setTarget(null);
      setReason('');
      await refresh();
    } catch (err: any) {
      setDialogError(err.message || 'Failed to allocate student.');
    } finally {
      setDialogBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Allocation and workload" subtitle="Give new students a Mentor and keep each Mentor within capacity." />
      {error && <Banner tone="error">{error}</Banner>}
      {!load && !error && <ListSkeleton rows={4} label="Loading allocation" />}

      {load && (
        <Section title="Automatic allocation">
          <div className={`${PANEL} flex flex-wrap items-end gap-4 p-4 text-sm`}>
            <label>
              <span className={FIELD_LABEL}>Mode</span>
              <Select value={load.settings.allocationMode} onChange={(e) => run(() => mentoringApi('/mentoring/allocation/settings', 'PUT', { allocationMode: e.target.value }))}>
                <option value="AUTO">Automatic (balance workload)</option>
                <option value="MANUAL">Manual only</option>
              </Select>
            </label>
            <div>
              <span className={FIELD_LABEL}>Default monthly hours per Mentor</span>
              <div className="flex gap-2">
                <div className="w-24">
                  <Input aria-label="Default monthly hour limit per Mentor" type="number" min={0} step="0.5" value={cap} onChange={(e) => setCap(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={() => run(() => mentoringApi('/mentoring/allocation/settings', 'PUT', { defaultMonthlyHourLimit: Number(cap) }))}>Save</Button>
              </div>
            </div>
            <div>
              <span className={FIELD_LABEL}>Warn from (% used)</span>
              <div className="flex gap-2">
                <div className="w-20">
                  <Input aria-label="Capacity warning percentage" type="number" min={1} max={100} value={warnPct} onChange={(e) => setWarnPct(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={() => run(() => mentoringApi('/mentoring/allocation/settings', 'PUT', { capacityWarningPercent: Number(warnPct) }))}>Save</Button>
              </div>
            </div>
            <label className="flex min-h-9 items-center gap-2">
              <input type="checkbox" className="h-5 w-5" checked={load.settings.siblingAffinity} onChange={(e) => run(() => mentoringApi('/mentoring/allocation/settings', 'PUT', { siblingAffinity: e.target.checked }))} />
              Keep siblings with the same Mentor
            </label>
            <Button size="sm" isLoading={busy} onClick={() => run(() => mentoringApi('/mentoring/allocation/run-auto', 'POST', {}))}>Run automatic allocation on the queue</Button>
          </div>
        </Section>
      )}

      <Section title={`Allocation queue (${queue.length})`}>
        {queue.length > 0 && load && mentors.length === 0 && (
          <Notice tone="warning">No eligible Mentors yet. Create Mentors in Settings, Users under the Mentoring department. Mentors created earlier appear after you open Mentoring, Staff and choose &quot;Add missing Mentors&quot;.</Notice>
        )}
        {load && queue.length === 0 && <Empty title="No students are waiting for a Mentor">New enrolled students appear here until they are allocated.</Empty>}
        {queue.length > 0 && (
          <ul className={`${PANEL} divide-y divide-slate-100 text-sm`} aria-label="Allocation queue">
            {queue.map((q) => (
              <li key={q.activationId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link href={`/mentoring/students/${q.activationId}`} className={`rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>{q.studentName} ({q.studentBusinessId})</Link>
                <span className={`text-xs ${MUTED}`}>Queued {fmt(q.queuedAt)} · {q.monthlyHours ?? 0} h a month</span>
                <Select aria-label={`Mentor for ${q.studentName}`} className="w-64" value={pick[q.activationId] ?? ''} onChange={(e) => setPick({ ...pick, [q.activationId]: e.target.value })}>
                  <option value="">Choose a Mentor</option>
                  {mentors.map((m: any) => <option key={m.userId} value={m.userId}>{m.name}, {m.allocatedHours} of {m.monthlyHourLimit} hours{q.monthlyHours ? ` (this student adds ${q.monthlyHours})` : ''}</option>)}
                </Select>
                <Button size="sm" disabled={!pick[q.activationId]} isLoading={busy} onClick={() => handleAllocateClick(q)}>
                  Allocate
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Mentor and counselor workload">
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <caption className="sr-only">Workload of each Mentor and Demo Counselor</caption>
            <thead className={THEAD}>
              <tr>{['Name', 'Role', 'Monthly hours used', 'Students', 'Open tasks', 'Status'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {(load?.staff ?? []).map((s: any) => (
                <tr key={s.userId} className={TR}>
                  <td className={`${TD} font-medium text-slate-900`}>{s.name}</td>
                  <td className={TD}>{s.role === 'MENTOR' ? 'Mentor' : 'Demo Counselor'}</td>
                  <td className={TD}>{s.role === 'MENTOR' ? `${s.allocatedHours} of ${s.monthlyHourLimit} h (${s.utilizationPercent}%)` : 'Not used'}</td>
                  <td className={TD}>{s.role === 'MENTOR' ? s.openStudents : 'Not used'}</td>
                  <td className={TD}>{s.openTasks}</td>
                  <td className={TD}>
                    {!s.eligibleForManual ? (
                      <>
                        <StatusChip tone="danger">Not eligible</StatusChip> <span className={`text-xs ${MUTED}`}>{s.ineligibleReason}</span>
                      </>
                    ) : s.eligibleForAuto ? (
                      <StatusChip tone="success">Accepting</StatusChip>
                    ) : (
                      <StatusChip>Manual only</StatusChip>
                    )}
                    {s.userStatus === 'PENDING_SETUP' && <span className={`ml-2 text-xs ${MUTED}`}>Awaiting first sign-in</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Accessible Over-capacity Confirmation Dialog */}
      {target && (
        <Overlay
          variant="dialog"
          size="md"
          title="Mentor over monthly hour limit"
          subtitle={`Over-capacity allocation for ${target.studentName} (${target.studentBusinessId})`}
          onClose={() => {
            if (!dialogBusy) {
              setTarget(null);
              setReason('');
              setReasonError(null);
              setDialogError(null);
            }
          }}
          closeLabel="Cancel allocation"
          testId="over-capacity-dialog"
        >
          <form onSubmit={handleConfirmOverCapacity} className="space-y-4">
            <Notice tone="warning">
              <strong>{target.mentor.name}</strong> has {target.mentor.allocatedHours} of {target.mentor.monthlyHourLimit} monthly hours allocated. This student needs {target.studentHours} more.
              Approving it puts the Mentor over their limit. Only the Mentoring Head can approve this, a reason is required, and the approval is recorded.
            </Notice>

            <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Current Workload</span>
                <span className="mt-1 block text-lg font-bold text-slate-900">{target.mentor.allocatedHours} hours</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Proposed Workload</span>
                <span className="mt-1 block text-lg font-bold text-amber-800">{target.mentor.allocatedHours + target.studentHours} hours</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Capacity Limit</span>
                <span className="mt-1 block text-lg font-bold text-slate-800">{target.mentor.monthlyHourLimit} hours</span>
              </div>
            </div>

            {dialogError && <Banner tone="error">{dialogError}</Banner>}

            <div>
              <label htmlFor="over-capacity-reason" className={FIELD_LABEL}>
                Reason for approving over the monthly limit <span className="text-red-600">*</span>
              </label>
              <textarea
                id="over-capacity-reason"
                className={`w-full rounded-md border p-2.5 text-sm transition-colors ${FOCUS} ${
                  reasonError ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300'
                }`}
                rows={3}
                placeholder="Explain why this student is being assigned to a Mentor who would be over their monthly hour limit..."
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError && e.target.value.trim()) setReasonError(null);
                }}
                disabled={dialogBusy}
                aria-required="true"
                aria-invalid={!!reasonError}
                aria-describedby={reasonError ? 'over-capacity-reason-error' : undefined}
                autoFocus
              />
              {reasonError && (
                <p id="over-capacity-reason-error" className="mt-1 text-xs font-medium text-red-600" role="alert">
                  {reasonError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setTarget(null);
                  setReason('');
                  setReasonError(null);
                  setDialogError(null);
                }}
                disabled={dialogBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={dialogBusy}
                disabled={dialogBusy}
              >
                Confirm allocation
              </Button>
            </div>
          </form>
        </Overlay>
      )}
    </div>
  );
}
