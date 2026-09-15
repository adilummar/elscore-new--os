'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function DemoCard({ data }: { data: any }) {
  const searchParams = useSearchParams();
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

  if (!data) return null;

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Demos</CardTitle>
        <Link href={`/dashboard/ceo/demos${qs}`} className="text-sm text-brand-600 cursor-pointer font-medium hover:underline">Schedule &rarr;</Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 p-3 rounded-lg text-center">
            <span className="text-2xl font-bold text-slate-800 block">{data.total}</span>
            <span className="text-xs text-slate-500 uppercase">Total Demos</span>
          </div>
          <div className="bg-emerald-50 p-3 rounded-lg text-center">
            <span className="text-2xl font-bold text-emerald-700 block">{data.completionRate}</span>
            <span className="text-xs text-emerald-600 uppercase">Completion %</span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600">Scheduled</span>
            <span className="font-medium">{data.scheduled}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600">Completed</span>
            <span className="font-medium text-emerald-600">{data.completed}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600">No-Show</span>
            <span className="font-medium text-red-600">{data.noShow}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600">Cancelled</span>
            <span className="font-medium text-slate-400">{data.cancelled}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
