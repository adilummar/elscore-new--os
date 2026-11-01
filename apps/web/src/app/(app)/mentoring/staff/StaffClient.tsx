"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '../actions';

export function StaffClient() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [userId, setUserId] = React.useState('');
  const [role, setRole] = React.useState('MENTOR');
  const [capacity, setCapacity] = React.useState('');

  const load = React.useCallback(() => {
    mentoringApi('/mentoring/staff').then((d) => { setRows(d); setError(null); }).catch((e) => setError(e.message));
  }, []);
  React.useEffect(load, [load]);

  const save = async (id: string, body: any) => {
    try { await mentoringApi(`/mentoring/staff/${id}`, 'PUT', body); load(); } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Mentors and Demo Counselors</h1>
      <p className="text-sm text-slate-600">The user must already hold the Mentor or Demo Counselor role (assign roles in Settings → Users). Here you set capacity and whether they receive students.</p>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded-lg border border-slate-200 bg-white p-3 grid gap-2 md:grid-cols-5">
        <Input placeholder="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <Select value={role} onChange={(e) => setRole(e.target.value)}><option value="MENTOR">Mentor</option><option value="DEMO_COUNSELOR">Demo Counselor</option></Select>
        <Input type="number" min={1} placeholder="Capacity (Mentors)" value={capacity} onChange={(e) => setCapacity(e.target.value)} disabled={role !== 'MENTOR'} />
        <Button size="sm" disabled={!userId.trim()} onClick={() => save(userId.trim(), { role, ...(role === 'MENTOR' && capacity ? { capacity: Number(capacity) } : {}) })}>Add / update profile</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Capacity</th><th className="px-3 py-2">Active</th><th className="px-3 py-2">Accepting students</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.name ?? r.userId}</td>
                <td className="px-3 py-2"><Badge>{r.role === 'MENTOR' ? 'Mentor' : 'Demo Counselor'}</Badge></td>
                <td className="px-3 py-2">{r.role === 'MENTOR' ? (r.capacity ?? 'default') : '—'}</td>
                <td className="px-3 py-2"><input type="checkbox" checked={r.isActive} onChange={(e) => save(r.userId, { role: r.role, isActive: e.target.checked })} /></td>
                <td className="px-3 py-2">{r.role === 'MENTOR' ? <input type="checkbox" checked={r.acceptsAllocation} onChange={(e) => save(r.userId, { role: r.role, acceptsAllocation: e.target.checked })} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
