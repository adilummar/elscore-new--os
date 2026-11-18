"use client";

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DashboardCapacity } from '../CapacityPanels';
import { mentoringApi } from '../mentoring-client';
import { Banner, ListSkeleton, MUTED, PANEL, PageHeader, StatusChip, TABLE, TABLE_WRAP, TD, TH, THEAD, TR } from '../mentoring-ui';

export function StaffClient() {
  const [rows, setRows] = React.useState<any[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [userId, setUserId] = React.useState('');
  const [role, setRole] = React.useState('MENTOR');
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    mentoringApi('/mentoring/staff').then((d) => { setRows(d); setError(null); }).catch((e) => setError(e.message));
  }, []);
  React.useEffect(load, [load]);

  const syncMentors = async () => {
    try {
      const r = await mentoringApi('/mentoring/staff/sync', 'POST', {});
      setNotice(`Added ${r.created} Mentor profile(s). ${r.alreadyHadProfile} already had one; ${r.skipped} Mentor(s) outside the Mentoring department were skipped.`);
      setError(null);
      load();
    } catch (e: any) { setError(e.message); }
  };

  const save = async (id: string, body: any) => {
    try { await mentoringApi(`/mentoring/staff/${id}`, 'PUT', body); load(); } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Mentors and counselors" subtitle="A person must already hold the Mentor or Demo Counselor role (assign roles in Settings, Users). Here you set whether they receive students and each Mentor's monthly hour limit." />
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Button size="sm" onClick={syncMentors}>Add missing Mentors</Button>
        <span className={MUTED}>Creates the staff profile for every Mentor in the Mentoring department who does not have one yet. New Mentors get theirs automatically.</span>
      </div>

      <DashboardCapacity />

      <div className={`${PANEL} grid gap-3 p-4 md:grid-cols-3`}>
        <Input aria-label="User ID" placeholder="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}><option value="MENTOR">Mentor</option><option value="DEMO_COUNSELOR">Demo Counselor</option></Select>
        <Button size="sm" disabled={!userId.trim()} onClick={() => save(userId.trim(), { role })}>Add or update profile</Button>
      </div>

      {!rows && !error && <ListSkeleton rows={4} label="Loading the staff" />}
      {rows && (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <caption className="sr-only">Mentors and Demo Counselors</caption>
            <thead className={THEAD}><tr>{['Name', 'Role', 'Active', 'Accepting students'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={TR}>
                  <td className={`${TD} font-medium text-slate-900`}>{r.name ?? r.userId}</td>
                  <td className={TD}><StatusChip>{r.role === 'MENTOR' ? 'Mentor' : 'Demo Counselor'}</StatusChip></td>
                  <td className={TD}><input type="checkbox" className="h-5 w-5" aria-label={`${r.name ?? r.userId} is active`} checked={r.isActive} onChange={(e) => save(r.userId, { role: r.role, isActive: e.target.checked })} /></td>
                  <td className={TD}>{r.role === 'MENTOR' ? <input type="checkbox" className="h-5 w-5" aria-label={`${r.name ?? r.userId} accepts students`} checked={r.acceptsAllocation} onChange={(e) => save(r.userId, { role: r.role, acceptsAllocation: e.target.checked })} /> : 'Not used'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
