"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ClipboardCheck, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { usePermissions } from '@/components/providers/AuthProvider';
import { getDashboard } from './actions';
import { DECISIONS, STAGES, fmtDateTime } from './constants';
import { Empty, ErrorNote, PageHeader, SkeletonRows, SlaBadge, StatCard } from './_components/kit';

const ACTION_LABEL = (a: string) =>
  a.replace(/^TUTOR_/, '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function HiringDashboardPage() {
  const { hasPermission } = usePermissions();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getDashboard();
    if (r.ok) { setData(r.data); setError(null); } else setError(r.message);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const count = (list: any[] | undefined, key: string, v: string) =>
    list?.find((x) => x[key] === v)?.candidates ?? 0;
  const total = data ? STAGES.reduce((n, s) => n + count(data.pipeline, 'stage', s.value), 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hiring"
        subtitle={data?.scope === 'DEPARTMENT' ? 'Department-wide recruitment overview' : 'Your demos and evaluations. Pipeline and decision counts cover all candidates.'}
        actions={
          <>
            {hasPermission('tutor_lead.create') && (
              <Link href="/tutor-hr/hiring/candidates/new"><Button><Plus className="w-4 h-4 mr-1.5" />Register lead</Button></Link>
            )}
            <Link href="/tutor-hr/hiring/candidates"><Button variant="outline"><Users className="w-4 h-4 mr-1.5" />Candidates</Button></Link>
            <Link href="/tutor-hr/hiring/demos"><Button variant="outline"><CalendarClock className="w-4 h-4 mr-1.5" />Demo calendar</Button></Link>
          </>
        }
      />
      <ErrorNote message={error} />
      {loading && !data ? (
        <Card><SkeletonRows rows={5} /></Card>
      ) : data ? (
        <>
          <section aria-label="Pipeline" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="In pipeline" value={total} />
            {STAGES.map((s) => (
              <StatCard key={s.value} label={s.label} value={count(data.pipeline, 'stage', s.value)} />
            ))}
          </section>

          <section aria-label="Evaluation SLA" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Evaluations pending" value={data.pendingEvaluations.length} tone={data.pendingEvaluations.length ? 'warning' : 'default'} hint="Within the two-working-hour window" />
            <StatCard label="Evaluations overdue" value={data.overdueEvaluations.length} tone={data.overdueEvaluations.length ? 'danger' : 'default'} hint="Tutor Head is notified automatically" />
            <StatCard label="Demos today" value={data.todaysDemos.length} />
          </section>
          {data.slaNotConfigured && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Working hours are not configured, so evaluation deadlines and overdue alerts are off.
              {hasPermission('tutor_hiring.settings') && (<> <Link className="underline font-medium" href="/tutor-hr/hiring/settings">Set working hours</Link>.</>)}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-slate-400" aria-hidden />Today&apos;s demos</CardTitle></CardHeader>
              <CardContent>
                {data.todaysDemos.length === 0 ? <Empty title="No demos today" /> : (
                  <ul className="divide-y divide-slate-100">
                    {data.todaysDemos.map((d: any) => (
                      <li key={d.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link className="font-medium text-slate-900 hover:text-brand-700" href={`/tutor-hr/hiring/candidates/${d.tutorLead.id}`}>
                            {`${d.tutorLead.firstName} ${d.tutorLead.lastName}`.trim() || d.tutorLead.businessId}
                          </Link>
                          <p className="text-xs text-slate-500">{fmtDateTime(d.scheduledAt)} · {d.assignedTo.email}</p>
                        </div>
                        <SlaBadge state={d.evaluationSla.state} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-slate-400" aria-hidden />Evaluations to complete</CardTitle></CardHeader>
              <CardContent>
                {[...data.overdueEvaluations, ...data.pendingEvaluations].length === 0 ? <Empty title="Nothing waiting" hint="Attended demos that need an evaluation appear here." /> : (
                  <ul className="divide-y divide-slate-100">
                    {[...data.overdueEvaluations, ...data.pendingEvaluations].map((d: any) => (
                      <li key={d.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link className="font-medium text-slate-900 hover:text-brand-700" href={`/tutor-hr/hiring/candidates/${d.tutorLead.id}`}>
                            {`${d.tutorLead.firstName} ${d.tutorLead.lastName}`.trim() || d.tutorLead.businessId}
                          </Link>
                          <p className="text-xs text-slate-500">Due {fmtDateTime(d.evaluationSla.dueAt)} · {d.attendedBy?.email ?? d.assignedTo.email}</p>
                        </div>
                        <SlaBadge state={d.evaluationSla.state} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card>
              <CardHeader><CardTitle>Decisions</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {DECISIONS.map((d) => (
                    <li key={d.value} className="flex justify-between text-sm">
                      <span className="text-slate-600">{d.label}</span>
                      <span className="font-semibold tabular-nums">{count(data.decisions, 'decision', d.value)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Demo workload today</CardTitle></CardHeader>
              <CardContent>
                {data.workloadSummary.length === 0 ? <Empty title="No assignments today" /> : (
                  <ul className="space-y-2">
                    {data.workloadSummary.map((w: any) => (
                      <li key={w.userId} className="flex justify-between text-sm gap-2">
                        <span className="text-slate-600 truncate">{w.email}</span>
                        <span className="tabular-nums whitespace-nowrap">{w.total} demo{w.total === 1 ? '' : 's'}{w.overdueEvaluations ? ` · ${w.overdueEvaluations} overdue` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
              <CardContent>
                {data.recentActivity.length === 0 ? <Empty title="No activity yet" /> : (
                  <ul className="space-y-2">
                    {data.recentActivity.map((a: any) => (
                      <li key={a.id} className="text-sm">
                        <Link className="text-slate-800 hover:text-brand-700" href={`/tutor-hr/hiring/candidates/${a.entityId}`}>{ACTION_LABEL(a.action)}</Link>
                        <span className="block text-xs text-slate-500">{fmtDateTime(a.timestamp)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
