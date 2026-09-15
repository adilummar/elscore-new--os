import * as React from 'react';
import { fetchApi } from '@/lib/api/client';
import { resolvePeriodToQueryString } from './utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PeriodSelector } from './PeriodSelector';

export async function CeoFollowupsView({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const apiQs = resolvePeriodToQueryString(searchParams);
  let data: any = null;
  let error = null;

  try {
    const res = await fetchApi<any>(`/analytics/ceo/sales${apiQs}`); // Reuse sales API for now since it returns overdue followups
    data = res.data;
  } catch (e: any) {
    error = e.message;
  }

  return (
    <div className="space-y-6 mb-8 border-b border-slate-200 pb-8">
      <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-xl shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Executive Follow-up Health</h2>
          <p className="text-slate-400 text-sm mt-1">Team responsiveness and overdue metrics</p>
        </div>
        <PeriodSelector currentPeriod={searchParams.period || '30d'} currentFrom={searchParams.from || ''} currentTo={searchParams.to || ''} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="bg-slate-50 border-b border-slate-100">
            <CardTitle className="text-lg text-slate-800">Team Follow-up Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data?.performance ? (
              <div className="divide-y divide-slate-100">
                {data.performance.map((c: any) => (
                  <div key={c.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="font-medium text-slate-900">{c.name}</div>
                    <div className="flex space-x-4 text-sm">
                      <div className="text-slate-500">Overdue: <span className="font-bold text-rose-600">{c.overdueFollowups || 0}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 text-sm">No follow-up data available.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
