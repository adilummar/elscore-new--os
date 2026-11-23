"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { usePermissions } from '@/components/providers/AuthProvider';
import { getReferenceLists } from '../hiring/actions';
import { fmtDate } from '../hiring/constants';
import { Empty, ErrorNote, Field, NoAccess, PageHeader, SkeletonRows, StatCard } from '../hiring/_components/kit';
import { getTutorSummary, searchTutors } from './actions';
import { STATUS_VARIANT, TUTOR_STATUSES } from './constants';

const statusLabel = (s: string) => TUTOR_STATUSES.find((x) => x.value === s)?.label ?? s;

/** Central Tutor Dashboard: summary cards (default: current month) and the searchable tutor list. */
export default function TutorsPage() {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('tutor_hr.tutors.read');
  const canOpen = hasPermission('tutor_hr.profile.read');
  const [rows, setRows] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [refs, setRefs] = useState<Record<string, any[]>>({ subjects: [], grades: [] });
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ q: '', status: '', subjectId: '', gradeId: '', minEnglishRating: '', from: '', to: '', sort: 'verifiedAt:desc' });
  const [period, setPeriod] = useState({ from: '', to: '' });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { const t = setTimeout(() => setF((p) => ({ ...p, q: search.trim() })), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { if (canRead) getReferenceLists().then((r) => r.ok && setRefs(r.data)); }, [canRead]);

  const load = useCallback(async () => {
    if (!canRead) return;
    const p = new URLSearchParams();
    if (f.q) p.set('search', f.q);
    for (const k of ['status', 'subjectId', 'gradeId', 'minEnglishRating', 'from', 'to'] as const) if (f[k]) p.set(k, f[k]);
    const [sortBy, sortDir] = f.sort.split(':');
    p.set('sortBy', sortBy); p.set('sortDir', sortDir);
    const r = await searchTutors(p.toString());
    if (r.ok) { setRows(r.data); setError(null); } else setError(r.message);
  }, [canRead, f]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canRead) return;
    const p = new URLSearchParams();
    if (period.from) p.set('from', period.from);
    if (period.to) p.set('to', period.to);
    getTutorSummary(p.toString()).then((r) => (r.ok ? setSummary(r.data) : setError(r.message)));
  }, [canRead, period]);

  if (!canRead) return <NoAccess what="Tutors" />;

  return (
    <div className="space-y-5">
      <PageHeader title="Tutors" subtitle={rows ? `${rows.length} tutor${rows.length === 1 ? '' : 's'} shown` : undefined} />

      <section aria-label="Summary" className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From" htmlFor="s-from"><Input id="s-from" type="date" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} /></Field>
          <Field label="To" htmlFor="s-to"><Input id="s-to" type="date" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} /></Field>
          <p className="text-xs text-slate-500 pb-2">{period.from || period.to ? 'New Tutors in the chosen period.' : 'New Tutors this month.'} Other cards show current counts.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Active Tutors" value={summary?.active ?? '—'} />
          <StatCard label="Total Tutors" value={summary?.total ?? '—'} />
          <StatCard label="New Tutors" value={summary?.newTutors ?? '—'} hint="By verification date" />
          <StatCard label="Inactive Tutors" value={summary?.inactive ?? '—'} />
          <StatCard label="Suspended Tutors" value={summary?.suspended ?? '—'} tone={summary?.suspended ? 'warning' : 'default'} />
        </div>
      </section>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
            <Input aria-label="Search tutors" placeholder="Tutor ID, name, email or phone" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Status" value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All statuses</option>
            {TUTOR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select aria-label="Sort" value={f.sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="verifiedAt:desc">Newest first</option>
            <option value="verifiedAt:asc">Oldest first</option>
            <option value="name:asc">Name</option>
            <option value="tutorCode:asc">Tutor ID</option>
          </Select>
          <Select aria-label="Subject" value={f.subjectId} onChange={(e) => set('subjectId', e.target.value)}>
            <option value="">All subjects</option>
            {refs.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select aria-label="Grade" value={f.gradeId} onChange={(e) => set('gradeId', e.target.value)}>
            <option value="">All grades</option>
            {refs.grades.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select aria-label="English communication rating" value={f.minEnglishRating} onChange={(e) => set('minEnglishRating', e.target.value)}>
            <option value="">Any English rating</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n === 5 ? '5' : `${n} or higher`}</option>)}
          </Select>
          <div className="flex gap-2">
            <Input aria-label="Joined from" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />
            <Input aria-label="Joined to" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />
          </div>
        </div>
      </Card>
      <ErrorNote message={error} />

      <Card>
        {rows === null ? <SkeletonRows rows={5} /> : rows.length === 0 ? (
          <Empty title="No tutors match" hint="Trainees appear here after both sessions are passed and they are marked Ready for Assignment." />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tutor</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Subjects / grades</TableHead>
                    <TableHead>English</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        {canOpen ? <Link href={`/tutor-hr/tutors/${t.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{t.name}</Link> : <span className="font-semibold">{t.name}</span>}
                        <p className="text-xs text-slate-500">{t.tutorId}</p>
                        {t.accountPendingFirstLogin && <p className="text-xs text-amber-700">Has not changed the temporary password yet</p>}
                      </TableCell>
                      <TableCell><span className="tabular-nums">{t.phone ?? '—'}</span><p className="text-xs text-slate-500 break-all">{t.email}</p></TableCell>
                      <TableCell className="text-sm text-slate-600">{t.subjects.join(', ') || '—'}<p className="text-xs text-slate-500">{t.grades.join(', ')}</p></TableCell>
                      <TableCell className="tabular-nums">{t.englishRating ? `${t.englishRating}/5` : '—'}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[t.status] ?? 'default'}>{statusLabel(t.status)}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-slate-600">{fmtDate(t.verifiedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="md:hidden divide-y divide-slate-100">
              {rows.map((t) => (
                <li key={t.id}>
                  <Link href={canOpen ? `/tutor-hr/tutors/${t.id}` : '#'} className="block p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{t.name}</p>
                        <p className="text-xs text-slate-500 break-all">{t.tutorId} · {t.phone}</p>
                      </div>
                      <Badge variant={STATUS_VARIANT[t.status] ?? 'default'}>{statusLabel(t.status)}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <p className="text-xs text-slate-500">Availability by time slot, Students, Class History and Salary are added in later phases.</p>
    </div>
  );
}
