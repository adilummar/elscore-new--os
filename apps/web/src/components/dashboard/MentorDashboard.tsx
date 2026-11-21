"use client";

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, MessageSquare, RefreshCw, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { mentoringApi } from '@/app/(app)/mentoring/mentoring-client';
import { DashboardCapacity } from '@/app/(app)/mentoring/CapacityPanels';
import { ClassWorkspaceDrawer } from '@/app/(app)/mentoring/ClassWorkspaceDrawer';
import { STATE_TONE } from '@/app/(app)/mentoring/class-view';
import { dayLabel, longDayLabel } from '@/app/(app)/mentoring/timetable-view';
import {
  Banner, Empty, FOCUS, ListSkeleton, MUTED, Overlay, PANEL, PageHeader, ProgressBar, Section, StatusChip, chipTone, linkButton,
} from '@/app/(app)/mentoring/mentoring-ui';
import type { ChipTone } from '@/app/(app)/mentoring/mentoring-ui';

function formatMinute(min: number | null | undefined): string {
  if (min === null || min === undefined) return '';
  return `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`;
}

export interface MentorDashboardProps {
  searchParams?: { from?: string; to?: string; period?: string };
}

const TOTAL_STAGES = 7;
/** The parts of the page, by name, so a failed request can say what is missing instead of showing zeros. */
const PARTS = ['Handovers', "Today's classes", 'Exams', 'Parent meetings', 'Complaints', 'Classes to verify'] as const;

type Severity = 'danger' | 'warning' | 'info';
interface QueueItem {
  id: string; student: string; title: string; category: 'Class' | 'Exam' | 'Meeting' | 'Complaint' | 'Handover'; severity: Severity; reason: string; actionText: string; actionHref?: string; onActionClick?: () => void;
}
const RANK: Record<Severity, number> = { danger: 0, warning: 1, info: 2 };
const SEVERITY_TONE: Record<Severity, ChipTone> = { danger: 'danger', warning: 'warning', info: 'info' };

/** Everything that waits on this Mentor, worst first. Red is kept for missed deadlines; work that is simply theirs to do is amber. */
export function buildQueue(d: { classes: any[]; complaints: any[]; exams: any[]; reviews: any[]; activations: any[] }, onVerify: (key: string) => void): QueueItem[] {
  const out: QueueItem[] = [];
  for (const c of d.classes) {
    if (c.state === 'AWAITING_MENTOR_VERIFICATION') out.push({ id: `class-verify-${c.key}`, student: c.studentName, title: `Verify the ${c.subjectName || 'class'} class of ${c.studentName}`, category: 'Class', severity: 'warning', reason: c.warning || 'Waiting for your verification', actionText: 'Verify class', onActionClick: () => onVerify(c.key) });
    else if (c.state === 'AWAITING_TUTOR_UPDATE') out.push({ id: `class-update-${c.key}`, student: c.studentName, title: `${c.tutorName || 'The tutor'} has not sent the update for ${c.studentName}`, category: 'Class', severity: 'info', reason: 'Update missing', actionText: 'Follow up', actionHref: '/mentoring/classes?card=classes_awaiting_update' });
  }
  for (const comp of d.complaints) {
    if (comp.ack?.state === 'BREACHED') out.push({ id: `complaint-${comp.id}`, student: comp.studentName, title: `Complaint ${comp.number}, ${comp.title} (${comp.studentName})`, category: 'Complaint', severity: 'danger', reason: 'Acknowledgement time missed', actionText: 'Handle complaint', actionHref: '/mentoring/complaints' });
    else if (comp.ack?.state === 'APPROACHING') out.push({ id: `complaint-${comp.id}`, student: comp.studentName, title: `Complaint ${comp.number}, ${comp.title} (${comp.studentName})`, category: 'Complaint', severity: 'warning', reason: 'Acknowledgement due soon', actionText: 'Acknowledge', actionHref: '/mentoring/complaints' });
  }
  for (const e of d.exams) {
    if (e.due && !e.scheduledExam) out.push({ id: `exam-due-${e.activationId}-${e.subjectId}`, student: e.studentName, title: `Schedule the ${e.subjectName} exam for ${e.studentName}`, category: 'Exam', severity: 'warning', reason: '3 verified hours reached', actionText: 'Schedule exam', actionHref: `/mentoring/students/${e.activationId}?panel=exams` });
  }
  for (const m of d.reviews) {
    if (m.overdue) out.push({ id: `meeting-${m.activationId}`, student: m.studentName, title: `Monthly parent meeting for ${m.studentName}`, category: 'Meeting', severity: 'danger', reason: 'Overdue', actionText: 'Schedule meeting', actionHref: `/mentoring/students/${m.activationId}?panel=review` });
  }
  for (const act of d.activations) {
    if (act.blocked) out.push({ id: `act-blocked-${act.activationId}`, student: act.studentName, title: `Handover of ${act.studentName} is blocked at stage ${act.stageNumber}, ${act.stageName}`, category: 'Handover', severity: 'danger', reason: `${act.daysPending} days pending`, actionText: 'Resolve block', actionHref: `/mentoring/students/${act.activationId}` });
  }
  // One worklist: whatever is overdue first, then today's classes, exams to schedule, meetings, and last the classes waiting for the Mentor to verify.
  const group = (i: QueueItem) => (i.severity === 'danger' ? 0 : i.id.startsWith('class-update') ? 1 : i.category === 'Exam' ? 2 : i.category === 'Meeting' || i.category === 'Complaint' ? 3 : 4);
  return out.sort((a, b) => group(a) - group(b) || RANK[a.severity] - RANK[b.severity]);
}

export default function MentorDashboard(_props: MentorDashboardProps = {}) {
  const [today, setToday] = React.useState<string | null>(null);
  const [activationsData, setActivationsData] = React.useState<any[]>([]);
  const [todayClassesData, setTodayClassesData] = React.useState<any>(null);
  const [examDueData, setExamDueData] = React.useState<any[]>([]);
  const [reviewsData, setReviewsData] = React.useState<any>(null);
  const [complaintsData, setComplaintsData] = React.useState<any>(null);
  const [verifyRows, setVerifyRows] = React.useState<any[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [loadedOnce, setLoadedOnce] = React.useState(false);
  const [failed, setFailed] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [openClassKey, setOpenClassKey] = React.useState<string | null>(null);

  const loadDashboard = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The hours and period figures live on Overview; the dashboard only loads what waits on the Mentor today.
      const results = await Promise.allSettled([
        mentoringApi('/mentoring/overview/activations?pageSize=100'),
        mentoringApi('/mentoring/overview/today'),
        mentoringApi('/mentoring/exams/due'),
        mentoringApi('/mentoring/reviews?pageSize=20'),
        mentoringApi('/mentoring/complaints?limit=50'),
        // Classes waiting for the Mentor from any earlier day, not only today's, so none is forgotten.
        mentoringApi('/mentoring/class-workspace/list?card=classes_awaiting_verification&pageSize=100'),
      ]);
      const [activationsRes, todayRes, examsRes, reviewsRes, complaintsRes, verifyRes] = results;
      if (verifyRes.status === 'fulfilled') setVerifyRows(verifyRes.value?.rows || []);
      if (activationsRes.status === 'fulfilled') setActivationsData(activationsRes.value?.rows || []);
      if (todayRes.status === 'fulfilled') { setTodayClassesData(todayRes.value); if (todayRes.value?.today) setToday(todayRes.value.today); }
      if (examsRes.status === 'fulfilled') setExamDueData(examsRes.value?.rows || []);
      if (reviewsRes.status === 'fulfilled') setReviewsData(reviewsRes.value);
      if (complaintsRes.status === 'fulfilled') setComplaintsData(complaintsRes.value);
      setFailed(results.flatMap((r, i) => (r.status === 'rejected' ? [PARTS[i]] : [])));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The dashboard could not be loaded.');
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, []);

  React.useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const missing = (part: (typeof PARTS)[number]) => failed.includes(part);
  const firstLoad = loading && !loadedOnce;

  const counts = todayClassesData?.counts || {};
  const todayTotal = todayClassesData?.total || Object.values(counts).reduce((a: number, b: any) => a + Number(b || 0), 0) || 0;
  const waitingMentor = verifyRows.length;
  const todayClasses = React.useMemo(() => [...(todayClassesData?.rows ?? [])].sort((a: any, b: any) => (a.startMinute ?? 0) - (b.startMinute ?? 0)), [todayClassesData?.rows]);

  // Today's classes plus every class still waiting for verification, each once.
  const workClasses = React.useMemo(() => {
    const seen = new Set<string>();
    return [...(todayClassesData?.rows ?? []), ...verifyRows].filter((c: any) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
  }, [todayClassesData?.rows, verifyRows]);
  const queue = React.useMemo(() => buildQueue({ classes: workClasses, complaints: complaintsData?.rows ?? [], exams: examDueData, reviews: reviewsData?.rows ?? [], activations: activationsData }, setOpenClassKey), [workClasses, complaintsData?.rows, examDueData, reviewsData?.rows, activationsData]);

  // Exams and meetings that are already booked. Anything that still needs the Mentor to act is in "Needs you now" above, never listed twice.
  const upcomingExams = React.useMemo(() => examDueData.filter((e) => e.scheduledExam).sort((a, b) => String(a.scheduledExam.date).localeCompare(String(b.scheduledExam.date))).slice(0, 3), [examDueData]);
  const upcomingMeetings = React.useMemo(() => (reviewsData?.rows ?? []).filter((m: any) => m.date && !m.overdue).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date))).slice(0, 3), [reviewsData?.rows]);
  const handovers = React.useMemo(() => activationsData.filter((a) => a.status !== 'ACTIVE' && a.status !== 'CANCELLED').sort((a, b) => (b.daysPending || 0) - (a.daysPending || 0)), [activationsData]);

  const examsToSchedule = examDueData.filter((e) => e.due && !e.scheduledExam).length;
  const meetingsOverdue = (reviewsData?.rows ?? []).filter((m: any) => m.overdue).length;
  const complaintsUrgent = (complaintsData?.rows ?? []).filter((c: any) => c.ack?.state === 'BREACHED' || c.ack?.state === 'APPROACHING').length;
  const urgentCount = queue.filter((i) => i.severity === 'danger').length;

  // A shortcut shows while loading and whenever it has something to act on; an empty one is just the sidebar link again.
  const shortcuts = [
    { href: '/mentoring/classes', label: 'Classes', Icon: CalendarDays, part: "Today's classes" as const, n: waitingMentor, hint: 'to verify' },
    { href: '/mentoring/exams', label: 'Exams', Icon: ClipboardCheck, part: 'Exams' as const, n: examsToSchedule, hint: 'to schedule' },
    { href: '/mentoring/meetings', label: 'Meetings', Icon: Video, part: 'Parent meetings' as const, n: meetingsOverdue, hint: 'overdue' },
    { href: '/mentoring/complaints', label: 'Complaints', Icon: MessageSquare, part: 'Complaints' as const, n: complaintsUrgent, hint: 'to acknowledge' },
  ].filter((s) => firstLoad || missing(s.part) || s.n > 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-testid="dedicated-mentor-dashboard">
      <PageHeader
        title="Mentor dashboard"
        subtitle={today ? `Today is ${longDayLabel(today)}.` : 'What needs you today.'}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/mentoring/overview" className={linkButton('secondary')}>Hours and workload</Link>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadDashboard()} disabled={loading} aria-label="Refresh the dashboard" className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />Refresh
            </Button>
          </div>
        )}
      />

      {shortcuts.length > 0 && (
        <nav aria-label="Mentoring workspaces" data-testid="dashboard-kpis">
          <ul className="flex flex-wrap gap-2">
            {shortcuts.map(({ href, label, Icon, part, n, hint }) => (
              <li key={href}>
                <Link href={href} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${FOCUS} ${n > 0 ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                  <span className="font-semibold">{firstLoad ? '...' : missing(part) ? 'n/a' : n}</span>
                  {!firstLoad && !missing(part) && <span className="text-xs">{hint}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {error && <Banner tone="error" onRetry={() => void loadDashboard()}>{error}</Banner>}
      {!error && failed.length > 0 && <Banner tone="warning" onRetry={() => void loadDashboard()}>{failed.join(', ')} could not be loaded, so those figures show n/a instead of zero.</Banner>}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {firstLoad ? <ListSkeleton rows={5} label="Loading the dashboard" /> : (
            <>
              <div id="needs-you" className="scroll-mt-20">
                <Section title={`Needs you now (${queue.length})`} aside={urgentCount > 0 ? `${urgentCount} past the deadline` : 'Worst first'}>
                  {queue.length === 0 ? (
                    <div className={`${PANEL} flex items-center gap-3 px-4 py-3`} data-testid="queue-empty">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                      <p className="text-sm text-slate-800"><span className="font-semibold">Nothing is waiting on you.</span> New work appears here as classes, exams and complaints need you.</p>
                    </div>
                  ) : (
                    <ul className={`${PANEL} divide-y divide-slate-100`} aria-label="Pending actions">
                      {queue.map((item) => (
                        <li key={item.id} className={`flex flex-wrap items-center justify-between gap-3 border-l-4 px-4 py-3 ${item.severity === 'danger' ? 'border-l-rose-600' : item.severity === 'warning' ? 'border-l-amber-500' : 'border-l-sky-400'}`} data-testid="pending-action-item" data-severity={item.severity}>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              <StatusChip tone="neutral">{item.category}</StatusChip>
                              <StatusChip tone={SEVERITY_TONE[item.severity]}>{item.reason}</StatusChip>
                            </div>
                            <p className="text-sm font-medium text-slate-900">{item.title}</p>
                          </div>
                          {item.onActionClick
                            ? <button type="button" onClick={item.onActionClick} className={linkButton(item.severity === 'info' ? 'secondary' : 'primary')}>{item.actionText}</button>
                            : <Link href={item.actionHref ?? '#'} className={linkButton(item.severity === 'info' ? 'secondary' : 'primary')}>{item.actionText}</Link>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

              <Section title={`Today's schedule (${todayTotal})`} aside={<Link href="/mentoring/classes" className={`inline-flex min-h-11 items-center gap-1 rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>All classes <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}>
                {todayClasses.length === 0 ? <Empty title="No classes today">Nothing is scheduled for today. Open Classes to look at another day.</Empty> : (
                  <ul className={`${PANEL} divide-y divide-slate-100`} data-testid="today-classes-group" aria-label="Classes today">
                    {todayClasses.map((c: any) => {
                      const mine = c.state === 'AWAITING_MENTOR_VERIFICATION';
                      return (
                        <li key={c.key} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${mine ? 'shadow-[inset_3px_0_0_0_#d97706]' : ''}`} data-testid="today-class-card">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{c.studentName} <span className="font-normal text-slate-700">{c.subjectName}</span></p>
                            <p className={`text-sm ${MUTED}`}>{formatMinute(c.startMinute)} to {formatMinute(c.endMinute)} with {c.tutorName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusChip tone={chipTone(STATE_TONE[c.state as keyof typeof STATE_TONE])}>{c.stateLabel}</StatusChip>
                            <button type="button" onClick={() => setOpenClassKey(c.key)} data-testid="open-verification-btn" aria-label={`Open the ${c.subjectName} class of ${c.studentName}`} className={linkButton(mine ? 'primary' : 'secondary', true)}>
                              {mine ? 'Verify class' : 'Open class'}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              {handovers.length > 0 && (
                <Section title={`New students in handover (${handovers.length})`} aside={<Link href="/mentoring/students" className={`inline-flex min-h-11 items-center rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>All students</Link>}>
                  <ul className={`${PANEL} divide-y divide-slate-100`} data-testid="handover-group" aria-label="Students in handover">
                    {handovers.slice(0, 5).map((a) => (
                      <li key={a.activationId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="handover-student">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{a.studentName}{a.studentId ? <span className={`ml-1.5 text-xs font-normal ${MUTED}`}>{a.studentId}</span> : null}</p>
                          <p className={`text-sm ${MUTED}`}>Stage {a.stageNumber} of {TOTAL_STAGES}{a.stageName ? `, ${a.stageName}` : ''}. {a.daysPending} days. {a.stageNumber === 7 ? 'Waiting for the Mentoring Head' : a.nextAction}</p>
                          <div className="mt-1.5 max-w-xs"><ProgressBar percent={Math.round(((a.stageNumber || 0) / TOTAL_STAGES) * 100)} label={`${a.studentName} handover progress`} tone={a.stageNumber === 7 ? 'amber' : 'brand'} /></div>
                        </div>
                        <Link href={`/mentoring/students/${a.activationId}`} className={linkButton('secondary')} aria-label={`Open ${a.studentName}`}>Open</Link>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>

        <aside aria-label="Capacity, exams and meetings" className="min-w-0 space-y-6" data-testid="dashboard-rail">
          <DashboardCapacity compact />
          {!firstLoad && (
            <div className="space-y-6" data-testid="daily-operations-group">
              {upcomingExams.length > 0 && (
                <Section title="Exams coming up" aside={<Link href="/mentoring/exams" className={`inline-flex min-h-11 items-center rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>View all</Link>}>
                  <ul className={`${PANEL} divide-y divide-slate-100`}>
                    {upcomingExams.map((e: any) => (
                      <li key={`${e.activationId}-${e.subjectId}`} className="flex items-center justify-between gap-2 px-4 py-3" data-testid="upcoming-exam-card">
                        <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{e.studentName}</p><p className={`text-sm ${MUTED}`}>{e.subjectName}, {dayLabel(e.scheduledExam.date)}</p></div>
                        <Link href={`/mentoring/students/${e.activationId}?panel=exams`} className={linkButton('secondary')}>Open</Link>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {upcomingMeetings.length > 0 && (
                <Section title="Parent meetings coming up" aside={<Link href="/mentoring/meetings" className={`inline-flex min-h-11 items-center rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>View all</Link>}>
                  <ul className={`${PANEL} divide-y divide-slate-100`}>
                    {upcomingMeetings.map((m: any) => (
                      <li key={m.activationId} className="flex items-center justify-between gap-2 px-4 py-3" data-testid="upcoming-meeting-card">
                        <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{m.studentName}</p><p className={`text-sm ${MUTED}`}>{dayLabel(m.date)}. {m.stateLabel}</p></div>
                        <Link href={`/mentoring/students/${m.activationId}?panel=review`} className={linkButton('secondary')}>Open review</Link>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}
        </aside>
      </div>

      {openClassKey && (
        <Overlay title="Class verification" size="xl" testId="class-verification-overlay" onClose={() => setOpenClassKey(null)}>
          <ClassWorkspaceDrawer role="MENTOR" classKey={openClassKey} onClose={() => setOpenClassKey(null)} onChanged={() => void loadDashboard()} />
        </Overlay>
      )}
    </div>
  );
}
