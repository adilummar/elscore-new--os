"use client";

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { mentoringApi } from '@/app/(app)/mentoring/mentoring-client';
import { DashboardCapacity } from '@/app/(app)/mentoring/CapacityPanels';
import { studentHoursText } from '@/app/(app)/mentoring/capacity-view';
import { longDayLabel } from '@/app/(app)/mentoring/timetable-view';
import { hoursText as minutesText } from '@/app/(app)/mentoring/overview-view';
import { mentorLines, pipeline, todayCells } from './head-dashboard-view';
import {
  Banner, Empty, FOCUS, ListSkeleton, MUTED, PANEL, PageHeader, Section, Segmented, StatTile, StatusChip, TABLE, TABLE_WRAP, TD, TH, THEAD, TR, linkButton,
} from '@/app/(app)/mentoring/mentoring-ui';
import type { ChipTone } from '@/app/(app)/mentoring/mentoring-ui';

/** The parts of the page, by name, so a failed request says what is missing instead of showing zeros. */
const PARTS = ['Handovers', 'Complaints', 'Mentor work', 'Allocation queue', 'Parent meetings', 'Exams', 'Department figures'] as const;
const PERIODS = [{ key: 'day', label: 'Today' }, { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }];

type Severity = 'danger' | 'warning';
export interface HeadItem { id: string; category: 'Approval' | 'Workflow' | 'Complaint'; severity: Severity; reason: string; title: string; actionText: string; href: string }
const TONE: Record<Severity, ChipTone> = { danger: 'danger', warning: 'warning' };

/** What waits on the Mentoring Head's decision, worst first. Every action opens a screen the API still authorises. */
export function buildHeadQueue(d: { activations: any[]; complaints: any[] }): HeadItem[] {
  const out: HeadItem[] = [];
  for (const a of d.activations) {
    if (a.status === 'PENDING_FINAL_APPROVAL') out.push({ id: `approve-${a.activationId}`, category: 'Approval', severity: 'warning', reason: `${a.daysPending ?? 0} days waiting`, title: `Final approval of ${a.studentName}`, actionText: 'Review and approve', href: `/mentoring/students/${a.activationId}` });
    else if (a.blocked || a.status === 'ACTIVATION_BLOCKED' || a.status === 'ACTIVATION_ON_HOLD') out.push({ id: `stuck-${a.activationId}`, category: 'Workflow', severity: 'danger', reason: a.status === 'ACTIVATION_ON_HOLD' ? 'On hold' : 'Blocked', title: `${a.studentName} is stuck at stage ${a.stageNumber}${a.stageName ? `, ${a.stageName}` : ''}`, actionText: 'Open workflow', href: `/mentoring/students/${a.activationId}` });
  }
  for (const c of d.complaints) {
    if (c.ack?.state === 'BREACHED') out.push({ id: `complaint-${c.id}`, category: 'Complaint', severity: 'danger', reason: 'Response time missed', title: `Complaint ${c.number}, ${c.title} (${c.studentName})`, actionText: 'Handle complaint', href: '/mentoring/complaints' });
    else if (c.ack?.state === 'APPROACHING') out.push({ id: `complaint-${c.id}`, category: 'Complaint', severity: 'warning', reason: 'Response due soon', title: `Complaint ${c.number}, ${c.title} (${c.studentName})`, actionText: 'Handle complaint', href: '/mentoring/complaints' });
  }
  const rank = { danger: 0, warning: 1 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export default function HeadDashboard() {
  const [today, setToday] = React.useState<string | null>(null);
  const [activations, setActivations] = React.useState<any[]>([]);
  const [complaints, setComplaints] = React.useState<any[]>([]);
  const [mentors, setMentors] = React.useState<any[]>([]);
  const [queueRows, setQueueRows] = React.useState<any[]>([]);
  const [meetings, setMeetings] = React.useState<any[]>([]);
  const [exams, setExams] = React.useState<any[]>([]);
  const [overview, setOverview] = React.useState<any>(null);
  const [todayCounts, setTodayCounts] = React.useState<Record<string, number> | null>(null);
  const [period, setPeriod] = React.useState('month');
  const [loading, setLoading] = React.useState(true);
  const [loadedOnce, setLoadedOnce] = React.useState(false);
  const [failed, setFailed] = React.useState<string[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      mentoringApi('/mentoring/overview/activations?pageSize=100'),
      mentoringApi('/mentoring/complaints?limit=50'),
      mentoringApi(`/mentoring/overview/mentors?pageSize=100&period=${period}`),
      mentoringApi('/mentoring/allocation/queue'),
      mentoringApi('/mentoring/reviews?pageSize=50'),
      mentoringApi('/mentoring/exams/due'),
      mentoringApi(`/mentoring/overview?period=${period}`),
      mentoringApi('/mentoring/overview/today'),
    ]);
    const [a, c, m, q, r, e, o, t] = results;
    if (o.status === 'fulfilled') setOverview(o.value);
    if (t.status === 'fulfilled') setTodayCounts(t.value?.counts ?? null);
    if (a.status === 'fulfilled') setActivations(a.value?.rows || []);
    if (c.status === 'fulfilled') setComplaints(c.value?.rows || []);
    if (m.status === 'fulfilled') setMentors(m.value?.rows || []);
    if (q.status === 'fulfilled') setQueueRows(Array.isArray(q.value) ? q.value : q.value?.rows || []);
    if (r.status === 'fulfilled') setMeetings(r.value?.rows || []);
    if (e.status === 'fulfilled') setExams(e.value?.rows || []);
    if (t.status === 'fulfilled' && t.value?.today) setToday(t.value.today);
    setFailed(results.slice(0, 7).flatMap((x, i) => (x.status === 'rejected' ? [PARTS[i]] : [])));
    setLoading(false);
    setLoadedOnce(true);
  }, [period]);
  React.useEffect(() => { void load(); }, [load]);

  const firstLoad = loading && !loadedOnce;
  const missing = (p: (typeof PARTS)[number]) => failed.includes(p);
  const queue = React.useMemo(() => buildHeadQueue({ activations, complaints }), [activations, complaints]);
  const urgent = queue.filter((i) => i.severity === 'danger').length;
  const overdueMeetings = meetings.filter((m) => m.overdue).length;
  const examsDue = exams.filter((x) => x.due && !x.scheduledExam).length;
  // Mentors with work waiting, most waiting first. Opening a row shows that Mentor's classes or students.
  const lines = React.useMemo(() => mentorLines(mentors), [mentors]);
  const stages = React.useMemo(() => pipeline(activations), [activations]);
  const maxStage = Math.max(1, ...stages.map((x) => x.count));
  const sum = overview?.summary;
  const glance = (v: React.ReactNode) => (firstLoad ? '...' : missing('Department figures') ? 'n/a' : v);
  const cell = (p: (typeof PARTS)[number], v: number) => (firstLoad ? '...' : missing(p) ? 'n/a' : v);

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-testid="mentoring-head-dashboard">
      <PageHeader
        title="Mentoring dashboard"
        subtitle={today ? `Today is ${longDayLabel(today)}.` : 'What needs your decision.'}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Period for hours and Mentor figures" value={period} onChange={setPeriod} items={PERIODS} />
            <Link href="/mentoring/overview" className={linkButton('secondary')}>Department overview</Link>
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh the dashboard" className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />Refresh
            </Button>
          </div>
        )}
      />

      {!firstLoad && failed.length > 0 && <Banner tone="warning" onRetry={() => void load()}>{failed.join(', ')} could not be loaded, so those figures show n/a instead of zero.</Banner>}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="The department at a glance" data-testid="head-glance">
        <li><StatTile href="/mentoring/students" value={glance(sum?.activeStudents ?? 0)} label="Active students" /></li>
        <li><StatTile href="/mentoring/students?status=ACTIVATION_IN_PROGRESS" value={glance(sum?.ongoingActivations ?? 0)} label="In activation" hint="Not active yet" /></li>
        <li><StatTile href="/mentoring/overview" value={glance(minutesText(sum?.scheduledMinutes ?? 0))} label="Hours scheduled" hint="From the approved timetable" /></li>
        <li><StatTile href="/mentoring/overview" value={glance(minutesText(sum?.consumedMinutes ?? 0))} label="Hours verified" hint="Counted after a Mentor verifies" /></li>
        <li><StatTile href="/mentoring/classes?card=classes_awaiting_verification" value={glance(sum?.pendingVerification ?? 0)} label="Classes to verify" attention={(sum?.pendingVerification ?? 0) > 0} /></li>
      </ul>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {firstLoad ? <ListSkeleton rows={5} label="Loading the dashboard" /> : (
            <>
              <Section title={`Needs your decision (${queue.length})`} aside={urgent > 0 ? `${urgent} urgent` : 'Worst first'}>
                {queue.length === 0 ? (
                  <div className={`${PANEL} flex items-center gap-3 px-4 py-3`} data-testid="head-queue-empty">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                    <p className="text-sm text-slate-800"><span className="font-semibold">Nothing is waiting on your decision.</span> Final approvals, stuck workflows and urgent complaints appear here.</p>
                  </div>
                ) : (
                  <ul className={`${PANEL} divide-y divide-slate-100`} aria-label="Decisions waiting">
                    {queue.slice(0, 10).map((i) => (
                      <li key={i.id} className={`flex flex-wrap items-center justify-between gap-3 border-l-4 px-4 py-3 ${i.severity === 'danger' ? 'border-l-rose-600' : 'border-l-amber-500'}`} data-testid="head-queue-item" data-severity={i.severity}>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5"><StatusChip tone="neutral">{i.category}</StatusChip><StatusChip tone={TONE[i.severity]}>{i.reason}</StatusChip></div>
                          <p className="text-sm font-medium text-slate-900">{i.title}</p>
                        </div>
                        <Link href={i.href} className={linkButton(i.severity === 'danger' ? 'primary' : 'secondary')}>{i.actionText}</Link>
                      </li>
                    ))}
                  </ul>
                )}
                {queue.length > 10 && <p className={`text-sm ${MUTED}`}>Showing the first 10. <Link href="/mentoring/approvals" className={`inline-flex min-h-11 items-center rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>Open Final approvals</Link> or <Link href="/mentoring/complaints" className={`inline-flex min-h-11 items-center rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>Complaints</Link> for the rest.</p>}
              </Section>

              <Section title="Mentor work waiting" aside={<Link href="/mentoring/classes?card=classes_awaiting_verification" className={`inline-flex min-h-11 items-center gap-1 rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>All classes <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="head-overdue">
                  {[
                    { href: '/mentoring/meetings', label: 'Overdue parent meetings', v: cell('Parent meetings', overdueMeetings), part: 'Parent meetings' as const, n: overdueMeetings },
                    { href: '/mentoring/exams', label: 'Exams ready to schedule', v: cell('Exams', examsDue), part: 'Exams' as const, n: examsDue },
                    { href: '/mentoring/complaints', label: 'Complaints past response time', v: cell('Complaints', complaints.filter((c) => c.ack?.state === 'BREACHED').length), part: 'Complaints' as const, n: complaints.filter((c) => c.ack?.state === 'BREACHED').length },
                  ].map((s) => (
                    <Link key={s.href} href={s.href} className={`${PANEL} block p-3 transition-shadow hover:shadow-floating ${FOCUS}`}>
                      <dd className={`text-2xl font-semibold ${s.n > 0 ? 'text-amber-800' : 'text-slate-900'}`}>{s.v}</dd>
                      <dt className={`text-sm ${MUTED}`}>{s.label}</dt>
                    </Link>
                  ))}
                </dl>
                {missing('Mentor work') ? null : lines.length === 0 ? <Empty title="No Mentor has students yet">Mentor figures appear once students are allocated.</Empty> : (
                  <div className={TABLE_WRAP} data-testid="head-mentor-work">
                    <table className={TABLE}>
                      <caption className="sr-only">Work and hours of each Mentor</caption>
                      <thead className={THEAD}><tr>{['Mentor', 'Students', 'To verify', 'Pending tasks', 'Hours verified'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}<th scope="col" className={TH}><span className="sr-only">Open</span></th></tr></thead>
                      <tbody>
                        {lines.map((m) => (
                          <tr key={m.mentorUserId} className={TR}>
                            <td className={`${TD} font-medium text-slate-900`}>{m.name}</td>
                            <td className={TD}>{m.students}</td>
                            <td className={`${TD} ${m.toVerify > 0 ? 'font-semibold text-amber-800' : ''}`}>{m.toVerify}</td>
                            <td className={TD}>{m.pendingTasks}</td>
                            <td className={TD}>{m.verifiedHours} of {m.scheduledHours} h <span className={`text-xs ${MUTED}`}>({m.percent}%)</span></td>
                            <td className={`${TD} text-right`}><Link href={`/mentoring/classes?card=classes_awaiting_verification&mentorUserId=${encodeURIComponent(m.mentorUserId)}`} className={linkButton('secondary')} aria-label={`Open the classes of ${m.name} waiting for verification`}>Open classes</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <Section title="Activation pipeline" aside={<Link href="/mentoring/students?status=ACTIVATION_IN_PROGRESS" className={`inline-flex min-h-11 items-center rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>Students in activation</Link>}>
                <ol className={`${PANEL} grid grid-cols-7 gap-1 p-3`} aria-label="Students at each activation stage" data-testid="head-pipeline">
                  {stages.map((x) => (
                    <li key={x.stage} className="flex flex-col items-center text-center" title={x.name || `Stage ${x.stage}`}>
                      <span className={`text-lg font-semibold ${x.stuck > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{missing('Handovers') ? 'n/a' : x.count}</span>
                      <span className="mt-1 flex h-16 w-full items-end rounded bg-slate-100"><span className={`block w-full rounded ${x.stuck > 0 ? 'bg-rose-500' : 'bg-brand-500'}`} style={{ height: `${Math.round((x.count / maxStage) * 100)}%` }} /></span>
                      <span className="mt-1 text-xs text-slate-700">Stage {x.stage}</span>
                      {x.stuck > 0 && <span className="text-xs font-medium text-rose-800">{x.stuck} stuck</span>}
                      {x.longestDays > 0 && <span className={`text-xs ${MUTED}`}>{x.longestDays} d longest</span>}
                    </li>
                  ))}
                </ol>
              </Section>

              <Section title="Team classes today" aside={<Link href="/mentoring/classes" className={`inline-flex min-h-11 items-center rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>All classes</Link>}>
                <ul className="flex flex-wrap gap-2" data-testid="head-today">
                  {todayCells(todayCounts).map((c) => (
                    <li key={c.key}><Link href={c.href} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${FOCUS} ${c.attention ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><span className="font-semibold">{c.n}</span>{c.label}</Link></li>
                  ))}
                </ul>
              </Section>

            </>
          )}
        </div>

        <aside aria-label="Capacity and allocation" className="min-w-0 space-y-6" data-testid="head-rail">
          <DashboardCapacity compact />
          {!firstLoad && (
            <Section title={`Students waiting for a Mentor (${missing('Allocation queue') ? 'n/a' : queueRows.length})`} aside={<Link href="/mentoring/allocation" className={`inline-flex min-h-11 items-center rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>Allocation</Link>}>
              {queueRows.length === 0 ? <Empty title="Nobody is waiting">New students appear here until a Mentor is allocated.</Empty> : (
                <ul className={`${PANEL} divide-y divide-slate-100`} data-testid="head-allocation-queue">
                  {queueRows.slice(0, 5).map((r: any) => (
                    <li key={r.activationId} className="flex items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{r.studentName}</p><p className={`text-sm ${MUTED}`}>{studentHoursText(r.monthlyHours)}</p></div>
                      <Link href="/mentoring/allocation" className={linkButton('secondary')}>Allocate</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}
