import * as React from 'react';
import { fetchApi } from '@/lib/api/client';
import { resolvePeriodToQueryString } from './utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PeriodSelector } from './PeriodSelector';

const STATUS_ORDER = ['NEW', 'CONTACTED', 'DEMO_BOOKED', 'NEGOTIATION', 'ENROLLED', 'PAID', 'LOST', 'JUNK', 'NOT_INTERESTED'];

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800 border-blue-200',
  CONTACTED: 'bg-amber-100 text-amber-800 border-amber-200',
  DEMO_BOOKED: 'bg-purple-100 text-purple-800 border-purple-200',
  NEGOTIATION: 'bg-orange-100 text-orange-800 border-orange-200',
  ENROLLED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PAID: 'bg-green-100 text-green-800 border-green-200',
  LOST: 'bg-rose-100 text-rose-800 border-rose-200',
  JUNK: 'bg-slate-100 text-slate-800 border-slate-200',
  NOT_INTERESTED: 'bg-slate-100 text-slate-800 border-slate-200',
};

export async function CeoLeadsView({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const apiQs = resolvePeriodToQueryString(searchParams);
  let pipelineData: any = null;
  let overviewData: any = null;
  
  try {
    const results = await Promise.allSettled([
      fetchApi<any>(`/analytics/ceo/pipeline${apiQs}`),
      fetchApi<any>(`/analytics/ceo/overview${apiQs}`)
    ]);
    
    if (results[0].status === 'fulfilled') pipelineData = results[0].value.data;
    if (results[1].status === 'fulfilled') overviewData = results[1].value.data;
  } catch (e: any) {
    // Ignore errors for resilient rendering
  }

  const pipelineMap = new Map();
  let pipelineTotal = 0;
  if (pipelineData) {
    pipelineData.forEach((s: any) => {
      pipelineMap.set(s.status, s.count);
      pipelineTotal += s.count;
    });
  }

  const totalLeads = pipelineTotal > 0 ? pipelineTotal : 1;
  const displayTotalLeads = overviewData?.activeLeads ?? '--';

  return (
    <div className="space-y-6 mb-8 border-b border-slate-200 pb-8">
      <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-xl shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Executive Lead Analytics</h2>
          <p className="text-slate-400 mt-1 text-sm">Pipeline state, sources, and ownership overview</p>
        </div>
        <PeriodSelector currentPeriod={searchParams.period || '30d'} currentFrom={searchParams.from || ''} currentTo={searchParams.to || ''} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="bg-slate-50 border-b border-slate-100">
            <CardTitle className="text-lg text-slate-800">Current Pipeline Bottlenecks</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pipelineData ? (
              <div className="divide-y divide-slate-100">
                {STATUS_ORDER.map(status => {
                  const count = pipelineMap.get(status) || 0;
                  const percent = Math.round((count / totalLeads) * 100) || 0;
                  const colorClass = STATUS_COLORS[status] || 'bg-slate-100 text-slate-800';
                  
                  return (
                    <div key={status} className="p-4 flex items-center hover:bg-slate-50 transition-colors">
                      <div className="w-40">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
                          {status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex-1 ml-4 mr-6">
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className={`h-2 rounded-full ${count > 0 ? 'bg-brand-500' : ''}`} style={{ width: `${Math.min(100, percent)}%` }}></div>
                        </div>
                      </div>
                      <div className="w-16 text-right">
                        <div className="text-sm font-bold text-slate-900">{count}</div>
                        <div className="text-xs text-slate-400">{percent}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 text-sm">No pipeline data available.</div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="bg-slate-50 border-b border-slate-100">
              <CardTitle className="text-lg text-slate-800">Lead Top KPIs</CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-2 gap-4">
              <div className="bg-brand-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-brand-700">{displayTotalLeads}</div>
                <div className="text-xs font-medium text-brand-600 mt-1 uppercase tracking-wide">Active Leads</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-emerald-700">{overviewData?.enrolled ?? '--'}</div>
                <div className="text-xs font-medium text-emerald-600 mt-1 uppercase tracking-wide">Enrolled</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
