'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function MarketingCard({ data }: { data: any }) {
  const searchParams = useSearchParams();
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

  if (!data) return null;

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Marketing</CardTitle>
        <Link href={`/dashboard/ceo/marketing${qs}`} className="text-sm text-brand-600 cursor-pointer font-medium hover:underline">Attribution &rarr;</Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-500">Marketing Leads (Total)</span>
            <span className="font-semibold text-slate-900">{data.totalMarketing}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-500">New Leads (Period)</span>
            <span className="font-semibold text-slate-900">{data.newMarketing}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-500">Enrolled (Period)</span>
            <span className="font-semibold text-slate-900">{data.enrolled}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-500">Conversion</span>
            <span className="font-semibold text-emerald-600">{data.conversionRate}</span>
          </div>

          <div className="pt-2 mt-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top Sources</h4>
            <div className="space-y-3">
              {data.sources?.map((s: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-slate-600">{s.channel}</span>
                  <span className="font-medium text-slate-800">{s.leads}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
