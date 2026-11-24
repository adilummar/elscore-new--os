"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePermissions } from '@/components/providers/AuthProvider';
import { fmtDate } from '../hiring/constants';
import { Empty, ErrorNote, NoAccess, PageHeader, SkeletonRows } from '../hiring/_components/kit';
import { listPaySlabs } from './actions';
import { rateRange, slabAccess } from './constants';

export default function PaySlabsPage() {
  const { hasPermission } = usePermissions();
  const { canRead, canCreate } = slabAccess(hasPermission);
  const [slabs, setSlabs] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    listPaySlabs().then((r) => (r.ok ? setSlabs(r.data) : setError(r.message)));
  }, [canRead]);

  if (!canRead) return <NoAccess what="Pay Slabs" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pay Slabs"
        subtitle="Hourly pay by grade, KG to Grade 12. A slab can never be edited or deleted; to change pay, create a new slab."
        actions={canCreate ? <Link href="/tutor-hr/pay-slabs/new"><Button>Create slab</Button></Link> : undefined}
      />
      <ErrorNote message={error} />
      <Card>
        {slabs === null && !error ? <SkeletonRows rows={5} /> : slabs && slabs.length === 0 ? (
          <Empty title="No pay slabs yet" hint={canCreate ? 'Create the first slab to start giving tutors a pay rate.' : undefined} />
        ) : slabs && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Currency</th>
                  <th scope="col" className="px-4 py-3 font-medium">Rate per hour (lowest – highest)</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Tutors now</th>
                  <th scope="col" className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slabs.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/tutor-hr/pay-slabs/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{s.currency}</td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{rateRange(s)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-900">{s.currentTutors ?? 0}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
