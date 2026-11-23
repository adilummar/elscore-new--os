"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { usePermissions } from '@/components/providers/AuthProvider';
import { fmtDate } from '../hiring/constants';
import { Empty, ErrorNote, NoAccess, PageHeader, SkeletonRows } from '../hiring/_components/kit';
import { listTutors } from '../training/actions';

/**
 * Tutors who passed both training sessions and were marked Ready for Assignment.
 * Profile sections and tutor workflows are specified separately and are not built yet.
 */
export default function TutorsPage() {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('tutor_hr.tutors.read');
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => {
    if (!canRead) return;
    const r = await listTutors(q ? `search=${encodeURIComponent(q)}` : '');
    if (r.ok) { setRows(r.data); setError(null); } else setError(r.message);
  }, [canRead, q]);
  useEffect(() => { load(); }, [load]);

  if (!canRead) return <NoAccess what="Tutors" />;

  return (
    <div className="space-y-5">
      <PageHeader title="Tutors" subtitle={rows ? `${rows.length} tutor${rows.length === 1 ? '' : 's'}` : undefined} />
      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
          <Input aria-label="Search tutors" placeholder="Tutor ID, name, email or phone" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>
      <ErrorNote message={error} />
      <Card>
        {rows === null ? <SkeletonRows rows={5} /> : rows.length === 0 ? (
          <Empty title={q ? 'No tutors match this search' : 'No tutors yet'} hint={q ? undefined : 'Trainees appear here after both sessions are passed and they are marked Ready for Assignment.'} />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tutor ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Login email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-semibold tabular-nums">{t.tutorId}</TableCell>
                      <TableCell>
                        {t.candidateId ? <Link href={`/tutor-hr/hiring/candidates/${t.candidateId}`} className="text-slate-900 hover:text-brand-700">{t.name}</Link> : t.name}
                        {t.accountPendingFirstLogin && <p className="text-xs text-amber-700">Has not changed the temporary password yet</p>}
                      </TableCell>
                      <TableCell className="break-all">{t.email}</TableCell>
                      <TableCell className="tabular-nums">{t.phone ?? '—'}</TableCell>
                      <TableCell><Badge variant={t.status === 'ACTIVE' ? 'success' : 'default'}>{t.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-slate-600">{fmtDate(t.verifiedAt)}{t.verifiedBy ? ` · ${t.verifiedBy.email}` : ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="md:hidden divide-y divide-slate-100">
              {rows.map((t) => (
                <li key={t.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{t.name}</p>
                      <p className="text-xs text-slate-500 break-all">{t.tutorId} · {t.email}</p>
                    </div>
                    <Badge variant={t.status === 'ACTIVE' ? 'success' : 'default'}>{t.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <p className="text-xs text-slate-500">New tutors start as Inactive until their first class. Tutor profiles, availability, salary and the other Tutor sections are specified separately.</p>
    </div>
  );
}
