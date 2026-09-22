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
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
            <CardTitle className="text-base font-bold text-slate-800">Team Overdue Overview</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-96 overflow-auto">
            {data?.performance ? (
              <div className="divide-y divide-slate-100">
                {data.performance
                  .sort((a: any, b: any) => b.overdueFollowups - a.overdueFollowups)
                  .map((c: any) => (
                  <div key={c.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="font-medium text-slate-900">{c.name}</div>
                    <div className="flex space-x-4 text-sm">
                      <div className={`font-medium ${c.overdueFollowups > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                        Overdue: <span className="font-bold">{c.overdueFollowups || 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 text-sm">No follow-up data available.</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
            <CardTitle className="text-base font-bold text-slate-800">Action Required: Overdue Leads</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-96 overflow-auto">
            {data?.recentOverdueFollowups?.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {data.recentOverdueFollowups.map((fu: any) => {
                  const leadName = fu.lead ? `${fu.lead.firstName || ''} ${fu.lead.lastName || ''}`.trim() : 'Unknown Lead';
                  const assignee = fu.lead?.assignedToUser;
                  const assigneeName = assignee?.employee ? `${assignee.employee.firstName} ${assignee.employee.lastName}` : (assignee?.email || 'Unassigned');

                  return (
                    <div key={fu.id} className="p-4 hover:bg-rose-50/50 transition-colors group">
                      <div className="flex justify-between items-start mb-1">
                        <a href={`/leads/${fu.leadId}`} className="font-semibold text-slate-900 group-hover:text-brand-600 transition-colors">
                          {leadName || 'Unnamed Lead'}
                        </a>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">OVERDUE</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-[10px]">
                            {assigneeName.charAt(0).toUpperCase()}
                          </span>
                          <span className="font-medium text-slate-700">{assigneeName}</span>
                        </div>
                        <span className="opacity-50">•</span>
                        <span>{new Date(fu.scheduledAt).toLocaleString()}</span>
                      </div>
                      {fu.remarks && <p className="text-xs text-slate-500 mt-2 line-clamp-1 italic">&quot;{fu.remarks}&quot;</p>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-3">✓</div>
                <p className="text-slate-900 font-medium">All caught up!</p>
                <p className="text-slate-500 text-sm mt-1">There are no overdue follow-ups.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
