"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { usePermissions } from '@/components/providers/AuthProvider';
import { fmtDate } from '../../hiring/constants';
import { Empty, ErrorNote, NoAccess, SkeletonRows } from '../../hiring/_components/kit';
import { RateGrid, gridRates } from '../_components/RateGrid';
import { getPaySlab, getSlabTutors } from '../actions';
import { ASSIGNMENT_STATUS, SOURCE_LABEL, fmtMonth, slabAccess } from '../constants';

export default function PaySlabDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = usePermissions();
  const { canRead, canViewSalary } = slabAccess(hasPermission);
  const [slab, setSlab] = useState<any>(null);
  const [tutors, setTutors] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    getPaySlab(id).then((r) => (r.ok ? setSlab(r.data) : setError(r.message)));
    getSlabTutors(id).then((r) => (r.ok ? setTutors(r.data) : setError(r.message)));
  }, [id, canRead]);

  if (!canRead) return <NoAccess what="Pay Slabs" />;
  if (!slab) return error ? <ErrorNote message={error} /> : <Card><SkeletonRows rows={5} /></Card>;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Link href="/tutor-hr/pay-slabs" aria-label="Back to Pay Slabs" className="mt-1.5 text-slate-500 hover:text-slate-900"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{slab.name}</h1>
            <Badge variant="info">{slab.currency}</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">Created {fmtDate(slab.createdAt)}. This slab cannot be edited or deleted.</p>
        </div>
      </div>
      <ErrorNote message={error} />

      <Card>
        <CardHeader><CardTitle>Rates per hour</CardTitle></CardHeader>
        <CardContent><RateGrid rates={gridRates(slab.rates)} currency={slab.currency} label={`Hourly rates of ${slab.name}`} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tutors on this slab</CardTitle>
          <p className="text-xs text-slate-500">Current, scheduled, past and cancelled assignments. A month runs from the 1st; &quot;Present&quot; means still on it.</p>
        </CardHeader>
        {tutors === null ? <SkeletonRows rows={3} /> : tutors.length === 0 ? <Empty title="No tutors have been on this slab" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th scope="col" className="px-4 py-3 font-medium">Tutor</th>
                  <th scope="col" className="px-4 py-3 font-medium">From</th>
                  <th scope="col" className="px-4 py-3 font-medium">To</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Given by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tutors.map((t) => {
                  const st = ASSIGNMENT_STATUS[t.status] ?? ASSIGNMENT_STATUS.PAST;
                  const label = <>{t.tutorName} <span className="text-slate-500">· {t.tutorCode}</span></>;
                  return (
                    <tr key={t.assignmentId}>
                      <td className="px-4 py-3">
                        {canViewSalary
                          ? <Link className="font-medium text-brand-700 hover:underline" href={`/tutor-hr/tutors/${t.tutorProfileId}?tab=Salary`}>{label}</Link>
                          : <span className="font-medium text-slate-900">{label}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{fmtMonth(t.fromMonth)}</td>
                      <td className="px-4 py-3 text-slate-700">{fmtMonth(t.toMonth)}</td>
                      <td className="px-4 py-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td className="px-4 py-3 text-slate-500">{SOURCE_LABEL[t.source] ?? t.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
