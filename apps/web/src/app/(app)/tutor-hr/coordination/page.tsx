"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { usePermissions } from '@/components/providers/AuthProvider';
import { getReferenceLists } from '../hiring/actions';
import { fmtDate } from '../hiring/constants';
import { Empty, ErrorNote, NoAccess, PageHeader, SkeletonRows, StatCard } from '../hiring/_components/kit';
import { getCoordinationDashboard, listCoordinationTutors, listCoordinators } from './actions';
import { OBSERVATION_STATUSES, OBSERVATION_VARIANT, observationLabel } from './constants';
import { AssignDialog, ObservationDialog } from './_components/CoordinationDialogs';

/** Coordinator: own assigned tutors. Head of Tutor Management: everyone, with the Coordinator filter. */
export default function CoordinationPage() {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('tutor_coordination.read');
  const isHead = hasPermission('tutor_coordination.manage');
  const canObserve = hasPermission('tutor_coordination.observe');
  const [rows, setRows] = useState<any[] | null>(null);
  const [dash, setDash] = useState<any>(null);
  const [coordinators, setCoordinators] = useState<any[]>([]);
  const [refs, setRefs] = useState<Record<string, any[]>>({ subjects: [], grades: [] });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ q: '', coordinatorId: '', subjectId: '', gradeId: '', observationStatus: '', joinedFrom: '', joinedTo: '' });
  const [picked, setPicked] = useState<string[]>([]);
  const [dlg, setDlg] = useState<null | { kind: 'assign' | 'observe'; tutors: any[] }>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { const t = setTimeout(() => setF((p) => ({ ...p, q: search.trim() })), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    if (!canRead) return;
    getReferenceLists().then((r) => r.ok && setRefs(r.data));
    if (isHead) listCoordinators().then((r) => r.ok && setCoordinators(r.data));
  }, [canRead, isHead]);

  const load = useCallback(async () => {
    if (!canRead) return;
    const p = new URLSearchParams();
    if (f.q) p.set('search', f.q);
    for (const k of ['coordinatorId', 'subjectId', 'gradeId', 'observationStatus', 'joinedFrom', 'joinedTo'] as const) if (f[k]) p.set(k, f[k]);
    const dq = new URLSearchParams(f.coordinatorId ? { coordinatorId: f.coordinatorId } : {});
    const [t, d] = await Promise.all([listCoordinationTutors(p.toString()), getCoordinationDashboard(dq.toString())]);
    if (t.ok) { setRows(t.data.data); setError(null); } else setError(t.message);
    if (d.ok) setDash(d.data); else setError(d.message);
    setPicked([]);
  }, [canRead, f]);
  useEffect(() => { load(); }, [load]);

  if (!canRead) return <NoAccess what="Tutor Coordination" />;

  const m = dash?.metrics;
  const dialog = { onClose: () => setDlg(null), onDone: (msg?: string) => { setNotice(msg ?? null); load(); } };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pickedRows = (rows ?? []).filter((r) => picked.includes(r.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tutor Coordination"
        subtitle={isHead ? 'All coordinators, tutors and workloads.' : 'Tutors currently assigned to you.'}
        actions={isHead && picked.length > 0 && <Button onClick={() => setDlg({ kind: 'assign', tutors: pickedRows })}>Assign {picked.length} selected</Button>}
      />
      {notice && <div role="status" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</div>}
      <ErrorNote message={error} />

      <section aria-label="This month" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total tutors assigned" value={m?.totalAssigned ?? '—'} />
        <StatCard label="Observed this month" value={m?.observedThisMonth ?? '—'} />
        <StatCard label="Not yet observed" value={m?.notYetObserved ?? '—'} tone={m?.notYetObserved ? 'warning' : 'default'} />
        <StatCard label="Pending complaints" value={m?.pendingComplaints ?? '—'} hint="Needs the Mentoring complaints" />
        <StatCard label="Complaints awaiting action" value={m?.complaintsAwaitingAction ?? '—'} hint="Needs the Mentoring complaints" />
      </section>

      {isHead && dash?.coordinators && (
        <Card>
          <CardHeader><CardTitle>Coordinators</CardTitle><p className="text-xs text-slate-500">{dash.unassigned} tutor(s) without a coordinator.</p></CardHeader>
          <CardContent>
            {dash.coordinators.length === 0 ? <p className="text-sm text-slate-500">No tutors are assigned yet.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Coordinator</TableHead><TableHead className="text-right">Assigned</TableHead><TableHead className="text-right">Observed</TableHead><TableHead className="text-right">Pending</TableHead><TableHead className="text-right">Not observed</TableHead><TableHead className="text-right">Coverage</TableHead></TableRow></TableHeader>
                <TableBody>
                  {dash.coordinators.map((c: any) => (
                    <TableRow key={c.coordinator.id}>
                      <TableCell><button type="button" className="text-left hover:text-brand-700" onClick={() => set('coordinatorId', c.coordinator.id)}>{c.coordinator.email}</button></TableCell>
                      <TableCell className="text-right tabular-nums">{c.assigned}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.observed}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.pending}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.notObserved}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.coveragePercent}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
            <Input aria-label="Tutor name" placeholder="Tutor name or Tutor ID" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {isHead && (
            <Select aria-label="Tutor Coordinator" value={f.coordinatorId} onChange={(e) => set('coordinatorId', e.target.value)}>
              <option value="">All coordinators</option>
              <option value="none">Not assigned</option>
              {coordinators.map((c) => <option key={c.id} value={c.id}>{c.email}</option>)}
            </Select>
          )}
          <Select aria-label="Observation status" value={f.observationStatus} onChange={(e) => set('observationStatus', e.target.value)}>
            <option value="">Any observation status</option>
            {OBSERVATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select aria-label="Subject" value={f.subjectId} onChange={(e) => set('subjectId', e.target.value)}>
            <option value="">All subjects</option>
            {refs.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select aria-label="Grade" value={f.gradeId} onChange={(e) => set('gradeId', e.target.value)}>
            <option value="">All grades</option>
            {refs.grades.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <div className="flex gap-2 lg:col-span-2">
            <Input aria-label="Joined from" type="date" value={f.joinedFrom} onChange={(e) => set('joinedFrom', e.target.value)} />
            <Input aria-label="Joined to" type="date" value={f.joinedTo} onChange={(e) => set('joinedTo', e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">Complaint status filter: not available yet (complaints come from Mentoring).</p>
      </Card>

      <Card>
        {rows === null ? <SkeletonRows rows={5} /> : rows.length === 0 ? (
          <Empty title={isHead ? 'No tutors match' : 'No tutors assigned to you yet'} hint={isHead ? undefined : 'The Head of Tutor Management assigns tutors to coordinators.'} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {isHead && <TableHead><span className="sr-only">Select</span></TableHead>}
                  <TableHead>Tutor</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Subjects / grades</TableHead>
                  <TableHead>Qualification</TableHead>
                  <TableHead>Students per grade</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Last observed</TableHead>
                  <TableHead>This month</TableHead>
                  {isHead && <TableHead>Coordinator</TableHead>}
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    {isHead && (
                      <TableCell>
                        <input type="checkbox" aria-label={`Select ${t.name}`} className="h-4 w-4 rounded border-slate-300"
                          disabled={t.status === 'DISCONTINUED'} checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
                      </TableCell>
                    )}
                    <TableCell>
                      <Link href={`/tutor-hr/coordination/${t.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{t.name}</Link>
                      <p className="text-xs text-slate-500">{t.tutorId}</p>
                    </TableCell>
                    <TableCell><span className="tabular-nums">{t.phone ?? '—'}</span><p className="text-xs text-slate-500 break-all">{t.email}</p></TableCell>
                    <TableCell className="text-sm">{t.subjects.join(', ') || '—'}<p className="text-xs text-slate-500">{t.grades.join(', ')}</p></TableCell>
                    <TableCell className="text-sm">{t.qualifications.join(', ') || '—'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{t.studentsPerGrade}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(t.joinedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(t.lastObservedAt)}</TableCell>
                    <TableCell>{t.observationStatus ? <Badge variant={OBSERVATION_VARIANT[t.observationStatus]}>{observationLabel(t.observationStatus)}</Badge> : <span className="text-xs text-slate-500">Not assigned</span>}</TableCell>
                    {isHead && <TableCell className="text-sm">{t.coordinator?.email ?? <span className="text-slate-400">Not Assigned Yet</span>}</TableCell>}
                    <TableCell className="text-right whitespace-nowrap space-x-2">
                      {canObserve && (isHead || t.coordinator) && <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'observe', tutors: [t] })}>Add observation</Button>}
                      {isHead && t.status !== 'DISCONTINUED' && <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'assign', tutors: [t] })}>{t.coordinator ? 'Reassign' : 'Assign'}</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {dlg?.kind === 'assign' && <AssignDialog tutors={dlg.tutors} isOpen {...dialog} />}
      {dlg?.kind === 'observe' && <ObservationDialog tutorId={dlg.tutors[0].id} tutorName={dlg.tutors[0].name} isOpen {...dialog} />}
    </div>
  );
}
