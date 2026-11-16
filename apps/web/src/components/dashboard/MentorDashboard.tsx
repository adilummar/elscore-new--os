"use client";

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, RefreshCw, Search, SlidersHorizontal, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '@/app/(app)/mentoring/mentoring-client';
import { ClassWorkspaceDrawer } from '@/app/(app)/mentoring/ClassWorkspaceDrawer';
import { STATE_TONE } from '@/app/(app)/mentoring/class-view';
import { dayLabel, longDayLabel } from '@/app/(app)/mentoring/timetable-view';
import { CLASS_STATES, EXAM_STATES } from '@/app/(app)/mentoring/dashboard-view';
import { studentsHref } from '@/app/(app)/mentoring/student-hub-view';
import {
  Banner, Empty, FIELD_LABEL, FOCUS, ListSkeleton, MUTED, Overlay, PANEL, PageHeader, ProgressBar, Section, Segmented, StatTile, StatusChip, TABLE, TABLE_WRAP, TD, TH, THEAD, TR, chipTone, linkButton,
} from '@/app/(app)/mentoring/mentoring-ui';
import type { ChipTone } from '@/app/(app)/mentoring/mentoring-ui';

function formatHours(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 hrs';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} hrs`;
  if (h === 0) return `${m} mins`;
  return `${h}h ${m}m`;
}

function formatMinute(min: number | null | undefined): string {
  if (min === null || min === undefined) return '';
  return `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`;
}

export interface MentorDashboardProps {
  searchParams?: { from?: string; to?: string; period?: string };
}

const PERIODS = [{ key: 'day', label: 'Today' }, { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }, { key: 'custom', label: 'Custom dates' }];
const PERIOD_WORDS: Record<string, string> = { day: 'today', week: 'this week', month: 'this month' };
const TOTAL_STAGES = 7;
/** The parts of the page, by name, so a failed request can say what is missing instead of showing zeros. */
const PARTS = ['Student counts and hours', 'Handovers', "Today's classes", 'Exams', 'Parent meetings', 'Complaints'] as const;

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
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export default function MentorDashboard({ searchParams }: MentorDashboardProps) {
  const [period, setPeriod] = React.useState<string>(searchParams?.from && searchParams?.to ? 'custom' : searchParams?.period || 'week');
  const [from, setFrom] = React.useState<string>(searchParams?.from || '');
  const [to, setTo] = React.useState<string>(searchParams?.to || '');
  const [studentQuery, setStudentQuery] = React.useState('');
  const [subjectFilter, setSubjectFilter] = React.useState('');
  const [tutorFilter, setTutorFilter] = React.useState('');
  const [classStateFilter, setClassStateFilter] = React.useState('');
  const [examStateFilter, setExamStateFilter] = React.useState('');
  const [moreFilters, setMoreFilters] = React.useState(false);

  const [summaryData, setSummaryData] = React.useState<any>(null);
  const [activationsData, setActivationsData] = React.useState<any[]>([]);
  const [todayClassesData, setTodayClassesData] = React.useState<any>(null);
  const [examDueData, setExamDueData] = React.useState<any[]>([]);
  const [reviewsData, setReviewsData] = React.useState<any>(null);
  const [complaintsData, setComplaintsData] = React.useState<any>(null);

  const [loading, setLoading] = React.useState(true);
  const [loadedOnce, setLoadedOnce] = React.useState(false);
  const [failed, setFailed] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [openClassKey, setOpenClassKey] = React.useState<string | null>(null);

  const loadDashboard = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let overviewQuery = '';
      if (from && to) overviewQuery = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      else if (period && period !== 'custom') overviewQuery = `?period=${encodeURIComponent(period)}`;

      const results = await Promise.allSettled([
        mentoringApi(`/mentoring/overview${overviewQuery}`),
        mentoringApi('/mentoring/overview/activations?pageSize=100'),
        mentoringApi('/mentoring/overview/today'),
        mentoringApi('/mentoring/exams/due'),
        mentoringApi('/mentoring/reviews?pageSize=20'),
        mentoringApi('/mentoring/complaints?limit=50'),
      ]);
      const [overviewRes, activationsRes, todayRes, examsRes, reviewsRes, complaintsRes] = results;
      if (overviewRes.status === 'fulfilled') setSummaryData(overviewRes.value);
      if (activationsRes.status === 'fulfilled') setActivationsData(activationsRes.value?.rows || []);
      if (todayRes.status === 'fulfilled') setTodayClassesData(todayRes.value);
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
  }, [period, from, to]);

  React.useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const q = studentQuery.toLowerCase().trim();
  const matchesStudent = (name?: string, id?: string) => !q || !!name?.toLowerCase().includes(q) || !!id?.toLowerCase().includes(q);
  const missing = (part: (typeof PARTS)[number]) => failed.includes(part);

  const allSubjects = React.useMemo(() => {
    const names = new Set<string>();
    for (const c of todayClassesData?.rows ?? []) if (c.subjectName) names.add(c.subjectName);
    for (const e of examDueData) if (e.subjectName) names.add(e.subjectName);
    return Array.from(names);
  }, [todayClassesData?.rows, examDueData]);

  const studentMetrics = React.useMemo(() => {
    const awaiting = (a: any) => a.status === 'AWAITING_ALLOCATION' || a.status === 'PENDING_DEMO_COUNSELOR' || a.status === 'PENDING_HEAD_ALLOCATION';
    return {
      total: activationsData.length,
      newStudents: activationsData.filter((a) => a.stageNumber === 1 || a.status === 'AWAITING_ALLOCATION' || a.status === 'PENDING_DEMO_COUNSELOR').length,
      handoverPending: activationsData.filter(awaiting).length,
      handoverInProgress: activationsData.filter((a) => a.status === 'HANDOVER_IN_PROGRESS' || (a.stageNumber >= 2 && a.stageNumber <= 6)).length,
      awaitingFinalApproval: activationsData.filter((a) => a.status === 'PENDING_FINAL_APPROVAL' || a.stageNumber === 7).length,
      activated: summaryData?.summary?.activeStudents || activationsData.filter((a) => a.status === 'ACTIVE').length,
    };
  }, [activationsData, summaryData]);

  const hours = React.useMemo(() => {
    const s = summaryData?.summary || {};
    const scheduled = s.scheduledMinutes || 0;
    const verified = s.consumedMinutes || 0;
    return {
      scheduled: formatHours(scheduled), reported: formatHours(s.reportedMinutes || 0), verified: formatHours(verified), notVerified: formatHours(s.remainingMinutes || 0),
      percent: scheduled > 0 ? Math.min(100, Math.round((verified / scheduled) * 100)) : 0,
    };
  }, [summaryData]);

  const counts = todayClassesData?.counts || {};
  const todayTotal = todayClassesData?.total || Object.values(counts).reduce((a: number, b: any) => a + Number(b || 0), 0) || 0;
  const waitingTutor = counts.AWAITING_TUTOR_UPDATE || 0;
  const waitingMentor = counts.AWAITING_MENTOR_VERIFICATION || 0;

  const todayClasses = React.useMemo(() => (todayClassesData?.rows ?? []).filter((c: any) =>
    matchesStudent(c.studentName, c.studentId) && (!subjectFilter || c.subjectName === subjectFilter) && (!tutorFilter.trim() || c.tutorName?.toLowerCase().includes(tutorFilter.toLowerCase().trim())) && (!classStateFilter || c.state === classStateFilter),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [todayClassesData?.rows, q, subjectFilter, tutorFilter, classStateFilter]);

  const handovers = React.useMemo(() => activationsData.filter((a) => a.status !== 'ACTIVE' && a.status !== 'CANCELLED' && matchesStudent(a.studentName, a.studentId)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [activationsData, q]);

  const exams = React.useMemo(() => examDueData.filter((e) => matchesStudent(e.studentName, e.studentId) && (!subjectFilter || e.subjectName === subjectFilter)
    && (!examStateFilter || (examStateFilter === 'SCHEDULED' ? !!e.scheduledExam : examStateFilter === 'READY_FOR_EXAM' ? e.due : true))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [examDueData, q, subjectFilter, examStateFilter]);

  const meetings = React.useMemo(() => (reviewsData?.rows ?? []).filter((m: any) => matchesStudent(m.studentName, m.studentId)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [reviewsData?.rows, q]);

  const queue = React.useMemo(() => buildQueue({ classes: todayClassesData?.rows ?? [], complaints: complaintsData?.rows ?? [], exams: examDueData, reviews: reviewsData?.rows ?? [], activations: activationsData }, setOpenClassKey), [todayClassesData?.rows, complaintsData?.rows, examDueData, reviewsData?.rows, activationsData]);
  const visibleQueue = queue.filter((i) => matchesStudent(i.student));

  const filtersActive = !!(studentQuery || subjectFilter || tutorFilter || classStateFilter || examStateFilter || from || to);
  const clearFilters = () => { setStudentQuery(''); setSubjectFilter(''); setTutorFilter(''); setClassStateFilter(''); setExamStateFilter(''); setFrom(''); setTo(''); setPeriod('week'); };
  const periodWords = period === 'custom' ? `${from || 'the start'} to ${to || 'today'}` : PERIOD_WORDS[period] ?? 'this period';
  const value = (part: (typeof PARTS)[number], v: React.ReactNode) => (missing(part) ? 'n/a' : v);
  const firstLoad = loading && !loadedOnce;

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-testid="dedicated-mentor-dashboard">
<PageHeader
        title="Mentor dashboard"
        subtitle={<>{summaryData?.today ? `Today is ${longDayLabel(summaryData.today)}. ` : ''}What needs you first, then your day, exams, parent meetings and new students.</>}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link href={studentsHref()}>
              <Button size="sm" variant="outline" className="flex items-center gap-1">
                <Users className="h-4 w-4" aria-hidden="true" />
                Students
              </Button>
            </Link>
            <Link href={studentsHref({ pendingVerification: true })}>
              <Button size="sm" variant="outline" className="flex items-center gap-1">
                To verify
              </Button>
            </Link>
            <Link href={studentsHref({ upcomingExam: true })}>
              <Button size="sm" variant="outline" className="flex items-center gap-1">
                Exams soon
              </Button>
            </Link>
            <Segmented label="Period for hours" value={period} onChange={(k) => { setPeriod(k); if (k !== 'custom') { setFrom(''); setTo(''); } }} items={PERIODS} />
            <Button type="button" size="sm" variant="outline" onClick={() => void loadDashboard()} disabled={loading} aria-label="Refresh the dashboard" className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />Refresh
            </Button>
          </div>
        )}
      />

      <nav aria-label="Mentoring workspaces" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex min-w-max gap-2">
          {[['/mentoring/classes', 'Classes'], ['/mentoring/exams', 'Exams'], ['/mentoring/meetings', 'Meetings'], ['/mentoring/complaints', 'Complaints']].map(([href, label]) => (
            <li key={href}><Link href={href} className={linkButton('secondary')}>{label}</Link></li>
          ))}
        </ul>
      </nav>

      {error && <Banner tone="error" onRetry={() => void loadDashboard()}>{error}</Banner>}
      {!error && failed.length > 0 && <Banner tone="warning" onRetry={() => void loadDashboard()}>{failed.join(', ')} could not be loaded, so those figures show n/a instead of zero.</Banner>}

      <section aria-label="Find and filter" className={`${PANEL} space-y-3 p-4`} data-testid="dashboard-filters-bar">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1 text-sm">
            <span className={FIELD_LABEL}>Student name or ID</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-600" aria-hidden="true" />
              <Input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} className="pl-8" />
            </span>
          </label>
          <Button type="button" size="sm" variant="outline" onClick={() => setMoreFilters((v) => !v)} aria-expanded={moreFilters} aria-controls="more-filters" className="gap-1.5">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />More filters
          </Button>
          {filtersActive && <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>}
        </div>
        {moreFilters && (
          <div id="more-filters" className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm"><span className={FIELD_LABEL}>Subject</span><Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}><option value="">All subjects</option>{allSubjects.map((s) => <option key={s} value={s}>{s}</option>)}</Select></label>
            <label className="text-sm"><span className={FIELD_LABEL}>Tutor</span><Input value={tutorFilter} onChange={(e) => setTutorFilter(e.target.value)} /></label>
            <label className="text-sm"><span className={FIELD_LABEL}>Class status</span><Select value={classStateFilter} onChange={(e) => setClassStateFilter(e.target.value)}><option value="">Any</option>{CLASS_STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
            <label className="text-sm"><span className={FIELD_LABEL}>Exam status</span><Select value={examStateFilter} onChange={(e) => setExamStateFilter(e.target.value)}><option value="">Any</option>{EXAM_STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
            {period === 'custom' && (
              <>
                <label className="text-sm"><span className={FIELD_LABEL}>Hours from</span><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label className="text-sm"><span className={FIELD_LABEL}>Hours to</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
              </>
            )}
          </div>
        )}
        {!moreFilters && period === 'custom' && (
          <div className="grid max-w-md grid-cols-2 gap-3 border-t border-slate-100 pt-3">
            <label className="text-sm"><span className={FIELD_LABEL}>Hours from</span><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="text-sm"><span className={FIELD_LABEL}>Hours to</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
      </section>

      {firstLoad ? <ListSkeleton rows={5} label="Loading the dashboard" /> : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Section title={`Needs you now (${visibleQueue.length})`} aside="Worst first" className="lg:col-span-2">
              {visibleQueue.length === 0 ? (
                <div className={`${PANEL} flex flex-col items-center gap-2 px-6 py-10 text-center`} data-testid="queue-empty">
                  <CheckCircle2 className="h-8 w-8 text-emerald-700" aria-hidden="true" />
                  <p className="text-base font-semibold text-slate-900">Nothing is waiting on you</p>
                  <p className={`text-sm ${MUTED}`}>{filtersActive ? 'Clear the filters to see everything.' : 'New work appears here as classes, exams and complaints need you.'}</p>
                </div>
              ) : (
                <ul className={`${PANEL} divide-y divide-slate-100`} aria-label="Pending actions">
                  {visibleQueue.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="pending-action-item" data-severity={item.severity}>
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

            <Section title="Today" aside={<Link href="/mentoring/classes" className={`inline-flex items-center gap-1 rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>All classes <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>} className="" >
              <div className="grid grid-cols-2 gap-3" data-testid="today-classes-group">
                <StatTile href="/mentoring/classes" value={value("Today's classes", todayTotal)} label="Classes today" testId="stat-today" />
                <StatTile href="/mentoring/classes?state=SCHEDULED" value={value("Today's classes", counts.SCHEDULED || 0)} label="Still to come" />
                <StatTile href="/mentoring/classes?card=classes_awaiting_update" value={value("Today's classes", waitingTutor)} label="Waiting for the tutor" attention={waitingTutor > 0} />
                <StatTile href="/mentoring/classes?card=classes_awaiting_verification" value={value("Today's classes", waitingMentor)} label="Waiting for you" attention={waitingMentor > 0} />
                <StatTile href="/mentoring/classes?card=classes_verified" value={value("Today's classes", counts.VERIFIED || 0)} label="Verified" />
                <StatTile href="/mentoring/classes?card=classes_not_conducted" value={value("Today's classes", (counts.NOT_CONDUCTED || 0) + (counts.RESCHEDULED || 0))} label="Not held or moved" />
              </div>
            </Section>
          </div>

          <Section title={`Today's classes (${todayClasses.length})`} aside={<Link href="/mentoring/classes" className={`rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>View all</Link>}>
            {todayClasses.length === 0 ? <Empty title="No classes today">{filtersActive ? 'No class matches these filters.' : 'Nothing is scheduled for today. Open Classes to look at another day.'}</Empty> : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {todayClasses.map((c: any) => {
                  const mine = c.state === 'AWAITING_MENTOR_VERIFICATION';
                  return (
                    <li key={c.key} className={`${PANEL} p-4 ${mine ? 'shadow-[inset_3px_0_0_0_#d97706]' : ''}`} data-testid="today-class-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{c.studentName}</p>
                          <p className="text-sm text-slate-700">{c.subjectName}, {formatMinute(c.startMinute)} to {formatMinute(c.endMinute)}</p>
                          <p className={`text-sm ${MUTED}`}>Tutor: {c.tutorName}</p>
                        </div>
                        <StatusChip tone={chipTone(STATE_TONE[c.state as keyof typeof STATE_TONE])}>{c.stateLabel}</StatusChip>
                      </div>
                      <button type="button" onClick={() => setOpenClassKey(c.key)} data-testid="open-verification-btn" aria-label={`Open the ${c.subjectName} class of ${c.studentName}`} className={`${linkButton(mine ? 'primary' : 'secondary', true)} mt-3`}>
                        {mine ? 'Verify class' : 'Open class'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <div className="grid gap-6 lg:grid-cols-2" data-testid="daily-operations-group">
            <Section title="Exams and the 3 hour mark" aside={<Link href="/mentoring/exams" className={`rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>View all</Link>}>
              {exams.length === 0 ? <Empty title="No exams to track">Exams appear once a student has verified class time.</Empty> : (
                <ul className="space-y-3">
                  {exams.slice(0, 6).map((e: any) => (
                    <li key={`${e.activationId}-${e.subjectId}`} className={`${PANEL} p-4`} data-testid="upcoming-exam-card">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="font-semibold text-slate-900">{e.studentName}</p><p className={`text-sm ${MUTED}`}>{e.subjectName}</p></div>
                        <StatusChip tone={e.scheduledExam ? 'info' : e.due ? 'success' : 'neutral'}>{e.scheduledExam ? `Scheduled ${dayLabel(e.scheduledExam.date)}` : e.due ? 'Ready to schedule' : 'Hours pending'}</StatusChip>
                      </div>
                      <div className="mt-3 space-y-1">
                        <div className={`flex justify-between text-sm ${MUTED}`}><span>Verified class time</span><span className="font-medium text-slate-800">{(e.verifiedMinutes / 60).toFixed(1)} of {(e.thresholdMinutes / 60).toFixed(1)} hrs</span></div>
                        <ProgressBar percent={e.progressPercent} label={`${e.studentName}, ${e.subjectName} verified time`} />
                      </div>
                      <Link href={`/mentoring/students/${e.activationId}?panel=exams`} className={`${linkButton('secondary')} mt-3`}>Open student exams</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Parent meetings" aside={<Link href="/mentoring/meetings" className={`rounded font-medium text-brand-700 hover:underline ${FOCUS}`}>View all</Link>}>
              {meetings.length === 0 ? <Empty title="No parent meetings coming up">Monthly meetings appear here when they are due.</Empty> : (
                <ul className="space-y-3">
                  {meetings.slice(0, 5).map((m: any) => {
                    const prep = m.preparation;
                    const done = prep?.examsReviewed && prep?.nextPlanApproved;
                    const some = prep?.tutorObservations > 0 || prep?.examsReviewed;
                    return (
                      <li key={m.activationId} className={`${PANEL} p-4`} data-testid="upcoming-meeting-card">
                        <div className="flex items-start justify-between gap-2">
                          <div><p className="font-semibold text-slate-900">{m.studentName}</p><p className={`text-sm ${MUTED}`}>Parent: {m.parentName || 'not recorded'}. {m.date ? dayLabel(m.date) : 'Not scheduled'}</p></div>
                          <StatusChip tone={m.overdue ? 'danger' : done ? 'success' : some ? 'warning' : 'neutral'}>{m.overdue ? 'Overdue' : done ? 'Prepared' : some ? 'Preparing' : 'Not prepared'}</StatusChip>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className={`text-sm ${MUTED}`}>{m.stateLabel}</span>
                          <Link href={`/mentoring/students/${m.activationId}?panel=review`} className={linkButton('secondary')}>Open review</Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>

          <Section title="New students in handover" aside={`${studentMetrics.total} assigned, ${studentMetrics.activated} active`} className="" >
            <div data-testid="handover-group" className="space-y-3">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="student-overview-group">
                <li><StatTile value={value('Handovers', studentMetrics.newStudents)} label="Newly received" attention={studentMetrics.newStudents > 0} /></li>
                <li><StatTile value={value('Handovers', studentMetrics.handoverPending)} label="Waiting to start" attention={studentMetrics.handoverPending > 0} /></li>
                <li><StatTile value={value('Handovers', studentMetrics.handoverInProgress)} label="In progress" /></li>
                <li><StatTile value={value('Handovers', studentMetrics.awaitingFinalApproval)} label="Waiting for the Head" hint="Final approval is the Head's" attention={studentMetrics.awaitingFinalApproval > 0} /></li>
                <li><StatTile value={value('Student counts and hours', studentMetrics.activated)} label="Active students" /></li>
              </ul>
              <div className={TABLE_WRAP}>
                <table className={TABLE} data-testid="handover-students-table">
                  <caption className="sr-only">Students in Phase 1 handover</caption>
                  <thead className={THEAD}><tr>{['Student', 'Stage', 'Days waiting', 'Who acts', 'Next step'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}<th scope="col" className={TH}><span className="sr-only">Open</span></th></tr></thead>
                  <tbody>
                    {handovers.length === 0 ? <tr><td colSpan={6} className={`${TD} py-8 text-center ${MUTED}`}>No students are waiting in Phase 1 handover.</td></tr> : handovers.map((a) => (
                      <tr key={a.activationId} className={TR}>
                        <td className={`${TD} font-medium text-slate-900`}>{a.studentName}{a.studentId ? <span className={`ml-1.5 text-xs font-normal ${MUTED}`}>{a.studentId}</span> : null}</td>
                        <td className={`${TD} min-w-[11rem]`}>
                          <p className="text-slate-900">Stage {a.stageNumber} of {TOTAL_STAGES}{a.stageName ? `, ${a.stageName}` : ''}</p>
                          <div className="mt-1.5"><ProgressBar percent={Math.round(((a.stageNumber || 0) / TOTAL_STAGES) * 100)} label={`${a.studentName} handover progress`} tone={a.stageNumber === 7 ? 'amber' : 'brand'} /></div>
                        </td>
                        <td className={`${TD} ${a.daysPending > 5 ? 'font-semibold text-amber-700' : 'text-slate-700'}`}>{a.daysPending} days</td>
                        <td className={`${TD} text-slate-700`}>{a.stageNumber === 7 ? 'Mentoring Head only' : a.responsible}</td>
                        <td className={`${TD} max-w-xs text-slate-800`}>{a.nextAction}</td>
                        <td className={`${TD} text-right`}><Link href={`/mentoring/students/${a.activationId}`} className={linkButton('secondary')} aria-label={`Open ${a.studentName}`}>Open</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          <Section title="Teaching hours" aside={`Counted for ${periodWords}`}>
            <div className={`${PANEL} space-y-4 p-4`} data-testid="teaching-hours-group">
              <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[['Scheduled', hours.scheduled, 'From the approved timetable'], ['Reported by tutors', hours.reported, 'Not counted until you verify'], ['Verified by you', hours.verified, 'Counts for the student and tutor pay'], ['Not yet verified', hours.notVerified, 'Scheduled and still open']].map(([label, v, hint]) => (
                  <div key={label}><dt className={`text-sm ${MUTED}`}>{label}</dt><dd className="mt-0.5 text-xl font-semibold text-slate-900">{missing('Student counts and hours') ? 'n/a' : v}</dd><dd className={`text-xs ${MUTED}`}>{hint}</dd></div>
                ))}
              </dl>
              <div className="space-y-1.5">
                <div className={`flex justify-between text-sm ${MUTED}`}><span>Verified against scheduled</span><span className="font-medium text-slate-800">{hours.verified} of {hours.scheduled} ({hours.percent}%)</span></div>
                <ProgressBar percent={hours.percent} label="Verified hours against scheduled hours" />
              </div>
              <p className={`text-sm ${MUTED}`}>Only hours you verify count toward student consumption and tutor payout. Hours a tutor reports do not change a balance or release pay until you verify them.</p>
            </div>
          </Section>
        </>
      )}

      {openClassKey && (
        <Overlay title="Class verification" size="xl" testId="class-verification-overlay" onClose={() => setOpenClassKey(null)}>
          <ClassWorkspaceDrawer role="MENTOR" classKey={openClassKey} onClose={() => setOpenClassKey(null)} onChanged={() => void loadDashboard()} />
        </Overlay>
      )}
    </div>
  );
}
