import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { fetchApi } from '@/lib/api/client';
import { Users, PhoneCall, Calendar, Trophy, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { getSession } from '@/lib/api/auth';

export default async function OperationalDashboard() {
  const user = await getSession();
  const isSalesHead = user?.permissions?.includes('target.read.team');

  let recentLeads = { data: [] };
  let kpiData: any = null;
  let pipelineData: any = null;
  let sourcesData: any = null;
  let teamData: any = null;
  let upcomingFollowUps = { data: [] };
  let error = null;
  let errorDetails = '';
  
  try {
    const results = await Promise.allSettled([
      fetchApi<any>('/leads?limit=5'),
      fetchApi<any>('/dashboard/kpi'),
      fetchApi<any>('/dashboard/pipeline'),
      fetchApi<any>('/follow-ups?view=upcoming&limit=5'),
      fetchApi<any>('/dashboard/sources'),
      fetchApi<any>('/dashboard/team')
    ]);
    
    if (results[0].status === 'fulfilled') recentLeads = results[0].value;
    else errorDetails += `Leads error: ${results[0].reason?.message || 'Unknown'}. `;
    
    if (results[1].status === 'fulfilled') kpiData = results[1].value.data || results[1].value;
    else errorDetails += `KPI error: ${results[1].reason?.message || 'Unknown'}. `;
    
    if (results[2].status === 'fulfilled') pipelineData = results[2].value.data || results[2].value;
    else errorDetails += `Pipeline error: ${results[2].reason?.message || 'Unknown'}. `;
    
    if (results[3].status === 'fulfilled') upcomingFollowUps = results[3].value;
    else errorDetails += `Followups error: ${results[3].reason?.message || 'Unknown'}. `;
    
    if (results[4].status === 'fulfilled') sourcesData = results[4].value.data || results[4].value;
    else errorDetails += `Sources error: ${results[4].reason?.message || 'Unknown'}. `;

    if (results[5].status === 'fulfilled') teamData = results[5].value.data || results[5].value;
    else errorDetails += `Team error: ${results[5].reason?.message || 'Unknown'}. `;

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
          
          <div className={`grid grid-cols-1 ${isSalesHead ? 'sm:grid-cols-2' : ''} gap-6`}>
            <Card>
              <CardHeader>
                <CardTitle>Leads by Source</CardTitle>
              </CardHeader>
              <CardContent>
                {sourcesData?.sources?.length > 0 ? (
                  <div className="space-y-4 pt-2 max-h-48 overflow-y-auto pr-2">
                    {sourcesData.sources.map((s: any) => (
                      <div key={s.source} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">{s.source}</span>
                        <span className="text-sm font-bold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full">{s.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-md bg-slate-50/50">
                    <p className="text-slate-500 font-medium">No source data</p>
                  </div>
                )}
              </CardContent>
            </Card>
            {isSalesHead && (
              <Card>
                <CardHeader>
                  <CardTitle>Team Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  {teamData?.team?.length > 0 ? (
                    <div className="space-y-4 pt-2 max-h-48 overflow-y-auto pr-2">
                      {teamData.team.map((t: any) => (
                        <div key={t.name} className="flex flex-col">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-slate-800">{t.name}</span>
                            <span className="text-xs font-semibold text-emerald-600">{t.enrolled} Enrolled</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (t.enrolled / (Math.max(t.assigned, 1))) * 100)}%` }}></div>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-0.5">{t.assigned} Leads Assigned</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-md bg-slate-50/50">
                      <p className="text-slate-500 font-medium">No team data</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
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
                    <div key={lead.id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0 hover:bg-slate-50 p-2 rounded transition-colors -mx-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                            {lead.firstName ? `${lead.firstName} ${lead.lastName || ''}` : 'Unknown Name'}
                          </Link>
                          <span className="text-xs text-slate-500 font-normal">({lead.primaryPhone})</span>
                          <div className="flex items-center gap-1 opacity-70">
                            <a href={`tel:${lead.primaryPhone}`} className="p-0.5 hover:bg-brand-50 hover:text-brand-600 rounded transition-colors" title="Call">
                              <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            </a>
                            {lead.whatsappNumber && (
                              <a href={`https://wa.me/${lead.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-0.5 hover:bg-green-50 hover:text-green-600 rounded transition-colors" title="WhatsApp">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                              </a>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{lead.status.replace(/_/g, ' ')}</p>
                      </div>
                      <Badge>{lead.source}</Badge>
                    </div>
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link href={`/leads/${fup.leadId}`} className="text-sm font-bold text-brand-700 hover:underline">
                              {fup.lead?.firstName ? `${fup.lead.firstName} ${fup.lead.lastName || ''}` : 'Unknown Name'} 
                            </Link>
                            <span className="text-slate-500 text-xs font-normal">({fup.lead?.primaryPhone})</span>
                            <div className="flex items-center gap-1 opacity-70">
                              <a href={`tel:${fup.lead?.primaryPhone}`} className="p-0.5 hover:bg-brand-50 hover:text-brand-600 rounded transition-colors" title="Call">
                                <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                              </a>
                              {fup.lead?.whatsappNumber && (
                                <a href={`https://wa.me/${fup.lead.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-0.5 hover:bg-green-50 hover:text-green-600 rounded transition-colors" title="WhatsApp">
                                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                                </a>
                              )}
                            </div>
                          </div>
                          {fup.lead?.assignedToUser && (
                            <p className="text-[10px] text-slate-500 font-medium mt-0.5">Assigned to: {fup.lead.assignedToUser.employee?.firstName} {fup.lead.assignedToUser.employee?.lastName}</p>
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