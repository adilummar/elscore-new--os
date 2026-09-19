import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { fetchApi } from '@/lib/api/client';
import { Users, PhoneCall, Calendar, Trophy, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

export default async function OperationalDashboard() {
  let recentLeads = { data: [] };
  let kpiData: any = null;
  let pipelineData: any = null;
  let upcomingFollowUps = { data: [] };
  let error = null;
  let errorDetails = '';
  
  try {
    const results = await Promise.allSettled([
      fetchApi<any>('/leads?limit=5'),
      fetchApi<any>('/dashboard/kpi'),
      fetchApi<any>('/dashboard/pipeline'),
      fetchApi<any>('/follow-ups?view=upcoming&limit=5')
    ]);
    
    if (results[0].status === 'fulfilled') recentLeads = results[0].value;
    else errorDetails += `Leads error: ${results[0].reason?.message || 'Unknown'}. `;
    
    if (results[1].status === 'fulfilled') kpiData = results[1].value.data || results[1].value;
    else errorDetails += `KPI error: ${results[1].reason?.message || 'Unknown'}. `;
    
    if (results[2].status === 'fulfilled') pipelineData = results[2].value.data || results[2].value;
    else errorDetails += `Pipeline error: ${results[2].reason?.message || 'Unknown'}. `;
    
    if (results[3].status === 'fulfilled') upcomingFollowUps = results[3].value;
    else errorDetails += `Followups error: ${results[3].reason?.message || 'Unknown'}. `;
    
    if (errorDetails) {
      error = errorDetails;
    }
  } catch (e: any) {
    error = e.message;
  }

  const kpis = [
    { title: 'Total Leads', value: kpiData?.totalLeads ?? '--', icon: Users, desc: 'All time active leads' },
    { title: 'Contacted', value: kpiData?.contactedLeads ?? '--', icon: PhoneCall, desc: 'In progress' },
    { title: 'Demo Booked', value: kpiData?.demoBooked ?? '--', icon: Calendar, desc: 'Demos arranged' },
    { title: 'Enrolled', value: kpiData?.enrolled ?? '--', icon: Trophy, desc: 'Successfully converted' },
    { title: 'Conversion Rate', value: kpiData?.conversionRate ?? '--', icon: TrendingUp, desc: 'Lead to Enrollment' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Overview of sales performance and recent activity.</p>
        </div>
      </div>

      {/* KPI Area */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <kpi.icon className="w-5 h-5 text-slate-400" />
                {kpiData ? <Badge variant="success">Active</Badge> : <Badge variant="warning">Unavailable</Badge>}
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-slate-900">{kpi.value}</h3>
                <p className="text-sm font-medium text-slate-500 mt-1">{kpi.title}</p>
                <p className="text-xs text-slate-400 mt-2">{kpi.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Data/Analytics Placeholders */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lead Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              {pipelineData?.pipeline?.length > 0 ? (
                <div className="space-y-4 pt-4">
                  {pipelineData.pipeline.map((p: any) => (
                    <div key={p.status} className="flex items-center">
                      <div className="w-32 text-sm font-medium text-slate-700">{p.status}</div>
                      <div className="flex-1 ml-4">
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                          <div className="bg-brand-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, (p.count / (kpiData?.totalLeads || 1)) * 100)}%` }}></div>
                        </div>
                      </div>
                      <div className="w-12 text-right text-sm font-bold text-slate-900">{p.count}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-md bg-slate-50/50">
                  <p className="text-slate-500 font-medium">No pipeline data available</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Leads by Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-md bg-slate-50/50">
                  <p className="text-slate-500 font-medium">Data Unavailable</p>
                  <p className="text-sm text-slate-400">Missing API: GET /dashboard/sources</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Team Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-md bg-slate-50/50">
                  <p className="text-slate-500 font-medium">Data Unavailable</p>
                  <p className="text-sm text-slate-400">Missing API: GET /dashboard/team</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Operations */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Leads</CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                <div className="p-4 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>
              ) : recentLeads?.data?.length > 0 ? (
                <div className="space-y-4">
                  {recentLeads.data.map((lead: any) => (
                    <Link href={`/leads/${lead.id}`} key={lead.id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0 hover:bg-slate-50 cursor-pointer p-2 rounded transition-colors -mx-2">
                      <div>
                        <p className="text-sm font-medium text-brand-700 hover:underline">{lead.firstName ? `${lead.firstName} ${lead.lastName || ''}` : 'Unknown Name'} <span className="text-xs text-slate-500 font-normal">({lead.primaryPhone})</span></p>
                        <p className="text-xs text-slate-500">{lead.status.replace(/_/g, ' ')}</p>
                      </div>
                      <Badge>{lead.source}</Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 text-sm">
                  No recent leads
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming Follow-ups</CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingFollowUps?.data?.length > 0 ? (
                <div className="space-y-4">
                  {upcomingFollowUps.data.map((fup: any) => (
                    <div key={fup.id} className="flex flex-col border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <Link href={`/leads/${fup.leadId}`} className="text-sm font-bold text-brand-700 hover:underline">
                            {fup.lead?.firstName ? `${fup.lead.firstName} ${fup.lead.lastName || ''}` : 'Unknown Name'} 
                            <span className="text-slate-500 text-xs ml-1 font-normal">({fup.lead?.primaryPhone})</span>
                          </Link>
                          {fup.lead?.assignedToUser && (
                            <p className="text-[10px] text-slate-500 font-medium mt-0.5">Assigned to: {fup.lead.assignedToUser.firstName} {fup.lead.assignedToUser.lastName}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-amber-600">{new Date(fup.scheduledAt).toLocaleDateString()}</p>
                          <p className="text-[10px] font-medium text-slate-500">{new Date(fup.scheduledAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5 italic truncate bg-slate-50 p-1.5 rounded">{fup.remarks || 'No remarks provided'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-slate-500 font-medium">No upcoming follow-ups</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}