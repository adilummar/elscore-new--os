"use client";

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../actions';
import { fmt } from '../labels';

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
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Allocation and workload</h1>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {load && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="font-semibold">Automatic allocation</h2>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="space-y-1"><span className="block text-slate-600">Mode</span>
              <Select value={load.settings.allocationMode} onChange={(e) => run(() => mentoringApi('/mentoring/allocation/settings', 'PUT', { allocationMode: e.target.value }))}>
                <option value="AUTO">Automatic (balance workload)</option><option value="MANUAL">Manual only</option>
              </Select></label>
            <label className="space-y-1"><span className="block text-slate-600">Default capacity per Mentor</span>
              <div className="flex gap-2"><div className="w-24"><Input type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} /></div>
                <Button size="sm" variant="outline" onClick={() => run(() => mentoringApi('/mentoring/allocation/settings', 'PUT', { defaultCapacity: Number(cap) }))}>Save</Button></div></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={load.settings.siblingAffinity} onChange={(e) => run(() => mentoringApi('/mentoring/allocation/settings', 'PUT', { siblingAffinity: e.target.checked }))} /> Keep siblings with the same Mentor</label>
            <Button size="sm" isLoading={busy} onClick={() => run(() => mentoringApi('/mentoring/allocation/run-auto', 'POST', {}))}>Run automatic allocation on the queue</Button>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Allocation queue ({queue.length})</h2>
        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
          {queue.length === 0 && <p className="p-4 text-slate-500">No students are waiting for a Mentor.</p>}
          {queue.length > 0 && load && mentors.length === 0 && (
            <p className="p-4 text-amber-700 bg-amber-50">No eligible Mentors yet. Create Mentors in Settings → Users under the Mentoring department. Mentors created earlier appear after you open Mentoring → Staff and choose “Add missing Mentors”.</p>
          )}
          {queue.map((q) => (
            <div key={q.activationId} className="p-3 flex flex-wrap items-center gap-3">
              <Link href={`/mentoring/students/${q.activationId}`} className="font-medium text-brand-700 hover:underline">{q.studentName} ({q.studentBusinessId})</Link>
              <span className="text-xs text-slate-500">Queued {fmt(q.queuedAt)}</span>
              <Select className="w-64" value={pick[q.activationId] ?? ''} onChange={(e) => setPick({ ...pick, [q.activationId]: e.target.value })}>
                <option value="">Choose Mentor…</option>
                {mentors.map((m: any) => <option key={m.userId} value={m.userId}>{m.name} — {m.openStudents}/{m.capacity}</option>)}
              </Select>
              <Button size="sm" disabled={!pick[q.activationId]} isLoading={busy}
                onClick={() => run(async () => {
                  const m = mentors.find((x: any) => x.userId === pick[q.activationId]);
                  const over = m && m.openStudents >= m.capacity ? window.prompt('This Mentor is at capacity. Reason to allocate anyway?') : undefined;
                  if (m && m.openStudents >= m.capacity && !over) return;
                  await mentoringApi(`/mentoring/allocation/${q.activationId}/assign`, 'POST', { mentorUserId: pick[q.activationId], ...(over ? { overCapacityReason: over } : {}) });
                })}>Allocate</Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Mentor and counselor workload</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Open students</th><th className="px-3 py-2">Open tasks</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>
              {(load?.staff ?? []).map((s: any) => (
                <tr key={s.userId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{s.name}</td><td className="px-3 py-2">{s.role === 'MENTOR' ? 'Mentor' : 'Demo Counselor'}</td>
                  <td className="px-3 py-2">{s.role === 'MENTOR' ? `${s.openStudents} / ${s.capacity}` : '—'}</td>
                  <td className="px-3 py-2">{s.openTasks}</td>
                  <td className="px-3 py-2">
                    {!s.eligibleForManual ? <><Badge variant="danger">Not eligible</Badge> <span className="text-xs text-slate-500">{s.ineligibleReason}</span></> : s.eligibleForAuto ? <Badge variant="success">Accepting</Badge> : <Badge>Manual only</Badge>}
                    {s.userStatus === 'PENDING_SETUP' && <span className="ml-2 text-xs text-slate-500">Awaiting first sign-in</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
