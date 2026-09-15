import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, CreditCard, DollarSign } from 'lucide-react';
import { fetchApi } from '@/lib/api/client';
import { resolvePeriodToQueryString } from './utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export async function CeoFinanceView({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const apiQs = resolvePeriodToQueryString(searchParams);
  let data: any = null;
  let error = null;

  try {
    const res = await fetchApi<any>(`/analytics/ceo/finance${apiQs}`);
    data = res.data;
  } catch (e: any) {
    error = e.message;
  }

  return (
    <div className="space-y-6 mb-8 border-b border-slate-200 pb-8">
      <div className="flex items-center space-x-4 bg-slate-900 text-white p-6 rounded-xl shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Executive Finance Analytics</h2>
          <p className="text-slate-400 text-sm mt-1">Revenue, collections, and outstanding balance</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
          Failed to load finance data: {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-sm border-t-4 border-t-emerald-500">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">Period Collections</p>
                <h2 className="text-5xl font-black text-emerald-700">
                  ${(data.periodCollections || 0).toLocaleString()}
                </h2>
                <p className="text-sm text-emerald-600 mt-2 font-medium">Successfully processed payments</p>
              </div>
              <div className="p-4 bg-emerald-50 rounded-full">
                <DollarSign className="w-10 h-10 text-emerald-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-t-4 border-t-amber-500">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">Outstanding Balance</p>
                <h2 className="text-5xl font-black text-amber-600">
                  ${(data.outstanding || 0).toLocaleString()}
                </h2>
                <p className="text-sm text-amber-700 mt-2 font-medium">Pending future installments</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-full">
                <CreditCard className="w-10 h-10 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 shadow-sm bg-slate-50 border-slate-200">
            <CardContent className="p-6 text-center">
              <p className="text-slate-600 mb-4">
                To view granular ledger entries, individual payment receipts, and refund processing, please navigate to the operational Finance Dashboard.
              </p>
              {/* Note: This routes to the standard system finance page if it exists */}
              <Link href="/reports" className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-brand-600 hover:bg-brand-700">
                Go to Finance Reports &rarr;
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
