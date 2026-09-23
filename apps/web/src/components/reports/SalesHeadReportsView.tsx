import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { fetchApi } from '@/lib/api/client';
import { Users, AlertCircle, TrendingUp, Calendar, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { resolvePeriodToQueryString } from '../ceo/utils';

export async function SalesHeadReportsView({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const apiQs = resolvePeriodToQueryString(searchParams);
  
  let teamPerformance: any = null;
  let pipeline: any = null;
  let demos: any = null;
  let error = null;

  try {
    const [teamRes, pipelineRes, demosRes] = await Promise.all([
      fetchApi<any>(`/analytics/sales-reports/team-performance${apiQs}`),
      fetchApi<any>(`/analytics/sales-reports/pipeline${apiQs}`),
      fetchApi<any>(`/analytics/sales-reports/demos${apiQs}`)
    ]);

    teamPerformance = teamRes.data;
    pipeline = pipelineRes.data;
    demos = demosRes.data;
  } catch (e: any) {
    error = e.message;
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
        Failed to load sales reports: {error}
      </div>
    );
  }

  if (!teamPerformance || !pipeline || !demos) {
    return <div>Loading reports...</div>;
  }

  // Calculate some aggregates
  const totalPipelineLeads = pipeline.reduce((acc: number, item: any) => acc + item.count, 0);

  return (
    <div className="space-y-6 mb-8">
      <div className="flex items-center space-x-4 bg-brand-900 text-white p-6 rounded-xl shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Sales Team Performance</h2>
          <p className="text-brand-200 text-sm mt-1">Counsellor activity, lead pipeline, and demo analytics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pipeline Snapshot */}
        <Card className="md:col-span-1 shadow-sm border-t-4 border-t-blue-500">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-slate-500">Pipeline Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-end border-b pb-2">
                <span className="text-2xl font-bold text-slate-800">{totalPipelineLeads}</span>
                <span className="text-xs text-slate-500 font-medium">TOTAL ACTIVE LEADS</span>
              </div>
              
              <div className="space-y-2">
                {pipeline.map((stage: any) => (
                  <div key={stage.status} className="flex justify-between text-sm">
                    <span className="text-slate-600">{stage.status}</span>
                    <span className="font-semibold text-slate-900">{stage.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Demo Analytics */}
        <Card className="md:col-span-2 shadow-sm border-t-4 border-t-purple-500">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-slate-500">Demo Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg text-center">
                <Calendar className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <span className="block text-2xl font-bold text-slate-800">{demos.total}</span>
                <span className="text-xs text-slate-500">Total Booked</span>
              </div>
              <div className="bg-emerald-50 p-4 rounded-lg text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                <span className="block text-2xl font-bold text-emerald-700">{demos.completed}</span>
                <span className="text-xs text-emerald-600">Completed</span>
              </div>
              <div className="bg-rose-50 p-4 rounded-lg text-center">
                <XCircle className="w-6 h-6 text-rose-500 mx-auto mb-2" />
                <span className="block text-2xl font-bold text-rose-700">{demos.noShow}</span>
                <span className="text-xs text-rose-600">No Shows</span>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg text-center flex flex-col justify-center border border-purple-100">
                <span className="block text-3xl font-black text-purple-700">{demos.completionRate}</span>
                <span className="text-xs font-semibold text-purple-600 mt-1">SHOW RATE</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Counsellor Leaderboard */}
      <Card className="shadow-sm border border-slate-200">
        <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-600" />
            Counsellor Activity & Discipline
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-600">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b">
                <tr>
                  <th className="px-6 py-4 font-semibold">Counsellor</th>
                  <th className="px-6 py-4 font-semibold text-center">Assigned Leads</th>
                  <th className="px-6 py-4 font-semibold text-center">Contacted</th>
                  <th className="px-6 py-4 font-semibold text-center">Enrolled</th>
                  <th className="px-6 py-4 font-semibold text-center">Conversion</th>
                  <th className="px-6 py-4 font-semibold text-center">Overdue Follow-ups</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teamPerformance.performance.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{c.name}</td>
                    <td className="px-6 py-4 text-center">{c.assigned}</td>
                    <td className="px-6 py-4 text-center">{c.contacted}</td>
                    <td className="px-6 py-4 text-center font-semibold text-emerald-600">{c.enrolled}</td>
                    <td className="px-6 py-4 text-center">{c.conversionRate}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.overdueFollowups > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                        {c.overdueFollowups > 0 && <AlertCircle className="w-3.5 h-3.5" />}
                        {c.overdueFollowups}
                      </span>
                    </td>
                  </tr>
                ))}
                {teamPerformance.performance.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      No counsellor data found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {/* Top Overdue Follow-ups */}
      {teamPerformance.recentOverdueFollowups?.length > 0 && (
        <Card className="shadow-sm border-t-4 border-t-rose-500">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-500" />
              Recent Overdue Follow-ups (Requires Attention)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
             <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b">
                  <tr>
                    <th className="px-6 py-3">Lead Name</th>
                    <th className="px-6 py-3">Assigned To</th>
                    <th className="px-6 py-3">Scheduled For</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teamPerformance.recentOverdueFollowups.map((fup: any) => (
                    <tr key={fup.id}>
                      <td className="px-6 py-3 font-medium">{fup.lead.firstName} {fup.lead.lastName}</td>
                      <td className="px-6 py-3">{fup.lead.assignedToUser?.employee?.firstName || fup.lead.assignedToUser?.email || 'Unassigned'}</td>
                      <td className="px-6 py-3 text-rose-600 font-medium">{new Date(fup.scheduledAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
