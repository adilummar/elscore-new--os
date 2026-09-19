'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function FinanceCard({ data }: { data: any }) {
  const searchParams = useSearchParams();
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

  if (!data) return null;

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Finance</CardTitle>
        <Link href={`/dashboard/ceo/finance${qs}`} className="text-sm text-brand-600 cursor-pointer font-medium hover:underline">Ledger &rarr;</Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100 mb-4">
            <span className="text-sm text-emerald-800 font-medium block">Period Collections</span>
            <span className="text-2xl font-bold text-emerald-900 block mt-1">AED {(data.periodCollections || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-500">Outstanding Balance</span>
            <span className="font-semibold text-amber-600">AED {(data.outstanding || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-500 text-sm">Target Credit Logic applies actual money received minus registration fees.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
