'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function HrCard({ data }: { data: any }) {
  const searchParams = useSearchParams();
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

  if (!data) return null;

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Human Resources</CardTitle>
        <Link href={`/dashboard/ceo/hr${qs}`} className="text-sm text-brand-600 cursor-pointer font-medium hover:underline">Directory &rarr;</Link>
      </CardHeader>
      <CardContent>
        <div className="flex space-x-4 mb-6">
          <div className="flex-1">
            <span className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Active</span>
            <span className="text-2xl font-bold text-slate-900">{data.active}</span>
          </div>
          <div className="flex-1">
            <span className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Total</span>
            <span className="text-2xl font-bold text-slate-600">{data.total}</span>
          </div>
        </div>
        
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Headcount by Department</h4>
        <div className="space-y-3">
          {data.headcountByDept?.map((d: any, idx: number) => (
            <div key={idx} className="flex justify-between text-sm">
              <span className="text-slate-600">{d.department}</span>
              <span className="font-medium text-slate-800">{d.count}</span>
            </div>
          ))}
          {(!data.headcountByDept || data.headcountByDept.length === 0) && (
            <div className="text-sm text-slate-500">No active employees assigned to departments.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
