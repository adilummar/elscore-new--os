"use client";

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../mentoring-client';
import { fmt } from '../labels';
import { Banner, Empty, FIELD_LABEL, FOCUS, ListSkeleton, MUTED, Notice, PANEL, PageHeader, Section, StatusChip, TABLE, TABLE_WRAP, TD, TH, THEAD, TR } from '../mentoring-ui';

export function AllocationClient() {
  const [queue, setQueue] = React.useState<any[]>([]);
  const [load, setLoad] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pick, setPick] = React.useState<Record<string, string>>({});
  const [cap, setCap] = React.useState('');

  const refresh = React.useCallback(async () => {
    try {
      const [q, w] = await Promise.all([mentoringApi('/mentoring/allocation/queue'), mentoringApi('/mentoring/allocation/workload')]);
      setQueue(q);
      setLoad(w);
      setCap(String(w.settings.defaultCapacity));
      setError(null);
    } catch (e: any) { setError(e.message); }
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await refresh(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  // Same eligibility the server uses for manual assignment (account, role, employment, profile), not just "active".
  const mentors = (load?.staff ?? []).filter((s: any) => s.role === 'MENTOR' && s.eligibleForManual);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Allocation and workload" subtitle="Give new students a Mentor and keep each Mentor within capacity." />
      {error && <Banner tone="error">{error}</Banner>}
      {!load && !error && <ListSkeleton rows={4} label="Loading allocation" />}

      {load && (
        <Section title="Automatic allocation">
          <div className={`${PANEL} flex flex-wrap items-end gap-4 p-4 text-sm`}>
            <label><span className={FIELD_LABEL}>Mode</span>
              <Select value={load.settings.allocationMode} onChange={(e) => run(() => mentoringApi('/mentoring/allocation/settings', 'PUT', { allocationMode: e.target.value }))}>
                <option value="AUTO">Automatic (balance workload)</option><option value="MANUAL">Manual only</option>
              </Select></label>
            <div><span className={FIELD_LABEL}>Default capacity per Mentor</span>
              <div className="flex gap-2"><div className="w-24"><Input aria-label="Default capacity per Mentor" type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} /></div>
                <Button size="sm" variant="outline" onClick={() => run(() => mentoringApi('/mentoring/allocation/settings', 'PUT', { defaultCapacity: Number(cap) }))}>Save</Button></div></div>
            <label className="flex min-h-9 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={load.settings.siblingAffinity} onChange={(e) => run(() => mentoringApi('/mentoring/allocation/settings', 'PUT', { siblingAffinity: e.target.checked }))} /> Keep siblings with the same Mentor</label>
            <Button size="sm" isLoading={busy} onClick={() => run(() => mentoringApi('/mentoring/allocation/run-auto', 'POST', {}))}>Run automatic allocation on the queue</Button>
          </div>
        </Section>
      )}

      <Section title={`Allocation queue (${queue.length})`}>
        {queue.length > 0 && load && mentors.length === 0 && (
          <Notice tone="warning">No eligible Mentors yet. Create Mentors in Settings, Users under the Mentoring department. Mentors created earlier appear after you open Mentoring, Staff and choose "Add missing Mentors".</Notice>
        )}
        {load && queue.length === 0 && <Empty title="No students are waiting for a Mentor">New enrolled students appear here until they are allocated.</Empty>}
        {queue.length > 0 && (
          <ul className={`${PANEL} divide-y divide-slate-100 text-sm`} aria-label="Allocation queue">
            {queue.map((q) => (
              <li key={q.activationId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link href={`/mentoring/students/${q.activationId}`} className={`rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>{q.studentName} ({q.studentBusinessId})</Link>
                <span className={`text-xs ${MUTED}`}>Queued {fmt(q.queuedAt)}</span>
                <Select aria-label={`Mentor for ${q.studentName}`} className="w-64" value={pick[q.activationId] ?? ''} onChange={(e) => setPick({ ...pick, [q.activationId]: e.target.value })}>
                  <option value="">Choose a Mentor</option>
                  {mentors.map((m: any) => <option key={m.userId} value={m.userId}>{m.name}, {m.openStudents} of {m.capacity} students</option>)}
                </Select>
                <Button size="sm" disabled={!pick[q.activationId]} isLoading={busy}
                  onClick={() => run(async () => {
                    const m = mentors.find((x: any) => x.userId === pick[q.activationId]);
                    const over = m && m.openStudents >= m.capacity ? window.prompt('This Mentor is at capacity. Reason to allocate anyway?') : undefined;
                    if (m && m.openStudents >= m.capacity && !over) return;
                    await mentoringApi(`/mentoring/allocation/${q.activationId}/assign`, 'POST', { mentorUserId: pick[q.activationId], ...(over ? { overCapacityReason: over } : {}) });
                  })}>Allocate</Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Mentor and counselor workload">
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <caption className="sr-only">Workload of each Mentor and Demo Counselor</caption>
            <thead className={THEAD}><tr>{['Name', 'Role', 'Open students', 'Open tasks', 'Status'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {(load?.staff ?? []).map((s: any) => (
                <tr key={s.userId} className={TR}>
                  <td className={`${TD} font-medium text-slate-900`}>{s.name}</td><td className={TD}>{s.role === 'MENTOR' ? 'Mentor' : 'Demo Counselor'}</td>
                  <td className={TD}>{s.role === 'MENTOR' ? `${s.openStudents} of ${s.capacity}` : 'Not used'}</td>
                  <td className={TD}>{s.openTasks}</td>
                  <td className={TD}>
                    {!s.eligibleForManual ? <><StatusChip tone="danger">Not eligible</StatusChip> <span className={`text-xs ${MUTED}`}>{s.ineligibleReason}</span></> : s.eligibleForAuto ? <StatusChip tone="success">Accepting</StatusChip> : <StatusChip>Manual only</StatusChip>}
                    {s.userStatus === 'PENDING_SETUP' && <span className={`ml-2 text-xs ${MUTED}`}>Awaiting first sign-in</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
