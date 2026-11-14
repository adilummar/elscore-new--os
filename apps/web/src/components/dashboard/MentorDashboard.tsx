"use client";

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  GraduationCap,
  MessageSquare,
  RefreshCw,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { mentoringApi } from '@/app/(app)/mentoring/mentoring-client';
import { ClassWorkspaceDrawer } from '@/app/(app)/mentoring/ClassWorkspaceDrawer';
import { dayLabel, longDayLabel } from '@/app/(app)/mentoring/timetable-view';
import {
  CLASS_STATES,
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  EXAM_STATES,
  PRIORITIES,
  SLA_STATES,
} from '@/app/(app)/mentoring/dashboard-view';

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
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export interface MentorDashboardProps {
  searchParams?: {
    from?: string;
    to?: string;
    period?: string;
  };
}

const HANDOVER_STAGES = [
  { number: 1, name: 'Student Allocation', owner: 'Demo Counselor / Head' },
  { number: 2, name: 'Baseline Assessment', owner: 'Mentor' },
  { number: 3, name: 'Parent Orientation', owner: 'Mentor' },
  { number: 4, name: 'Teacher Matching', owner: 'Mentor' },
  { number: 5, name: 'Schedule Setup', owner: 'Mentor' },
  { number: 6, name: 'Demo & Transition', owner: 'Mentor' },
  { number: 7, name: 'Final Handover', owner: 'Mentoring Head Only' },
];

export default function MentorDashboard({ searchParams }: MentorDashboardProps) {
  // Period & Filter state
  const [period, setPeriod] = React.useState<string>(searchParams?.period || 'week');
  const [from, setFrom] = React.useState<string>(searchParams?.from || '');
  const [to, setTo] = React.useState<string>(searchParams?.to || '');
  const [studentQuery, setStudentQuery] = React.useState<string>('');
  const [subjectFilter, setSubjectFilter] = React.useState<string>('');
  const [tutorFilter, setTutorFilter] = React.useState<string>('');
  const [classStateFilter, setClassStateFilter] = React.useState<string>('');
  const [examStateFilter, setExamStateFilter] = React.useState<string>('');
  const [complaintCategoryFilter, setComplaintCategoryFilter] = React.useState<string>('');
  const [complaintStatusFilter, setComplaintStatusFilter] = React.useState<string>('');
  const [priorityFilter, setPriorityFilter] = React.useState<string>('');
  const [slaStateFilter, setSlaStateFilter] = React.useState<string>('');

  // Loaded data state
  const [summaryData, setSummaryData] = React.useState<any>(null);
  const [activationsData, setActivationsData] = React.useState<any[]>([]);
  const [todayClassesData, setTodayClassesData] = React.useState<any>(null);
  const [examDueData, setExamDueData] = React.useState<any[]>([]);
  const [reviewsData, setReviewsData] = React.useState<any>(null);
  const [complaintsData, setComplaintsData] = React.useState<any>(null);

  // UI state
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openClassKey, setOpenClassKey] = React.useState<string | null>(null);

  // Fetch all dashboard data
  const loadDashboard = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Build overview query with period or custom range
      let overviewQuery = '';
      if (from && to) {
        overviewQuery = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      } else if (period) {
        overviewQuery = `?period=${encodeURIComponent(period)}`;
      }

      const [overviewRes, activationsRes, todayRes, examsRes, reviewsRes, complaintsRes] = await Promise.allSettled([
        mentoringApi(`/mentoring/overview${overviewQuery}`),
        mentoringApi('/mentoring/overview/activations?pageSize=100'),
        mentoringApi('/mentoring/overview/today'),
        mentoringApi('/mentoring/exams/due'),
        mentoringApi('/mentoring/reviews?pageSize=20'),
        mentoringApi('/mentoring/complaints?limit=50'),
      ]);

      if (overviewRes.status === 'fulfilled') setSummaryData(overviewRes.value);
      if (activationsRes.status === 'fulfilled') setActivationsData(activationsRes.value?.rows || []);
      if (todayRes.status === 'fulfilled') setTodayClassesData(todayRes.value);
      if (examsRes.status === 'fulfilled') setExamDueData(examsRes.value?.rows || []);
      if (reviewsRes.status === 'fulfilled') setReviewsData(reviewsRes.value);
      if (complaintsRes.status === 'fulfilled') setComplaintsData(complaintsRes.value);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [period, from, to]);

  React.useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Derived subjects list for filtering
  const allSubjects = React.useMemo(() => {
    const subjectsMap = new Map<string, string>();
    if (todayClassesData?.rows) {
      for (const c of todayClassesData.rows) {
        if (c.subjectName) subjectsMap.set(c.subjectName, c.subjectName);
      }
    }
    if (examDueData) {
      for (const e of examDueData) {
        if (e.subjectName) subjectsMap.set(e.subjectName, e.subjectName);
      }
    }
    return Array.from(subjectsMap.values());
  }, [todayClassesData?.rows, examDueData]);

  // 1. Student overview counts
  const studentMetrics = React.useMemo(() => {
    const total = activationsData.length;
    const newStudents = activationsData.filter(
      (a) => a.stageNumber === 1 || a.status === 'AWAITING_ALLOCATION' || a.status === 'PENDING_DEMO_COUNSELOR',
    ).length;
    const handoverPending = activationsData.filter(
      (a) => a.status === 'AWAITING_ALLOCATION' || a.status === 'PENDING_DEMO_COUNSELOR' || a.status === 'PENDING_HEAD_ALLOCATION',
    ).length;
    const handoverInProgress = activationsData.filter(
      (a) => a.status === 'HANDOVER_IN_PROGRESS' || (a.stageNumber >= 2 && a.stageNumber <= 6),
    ).length;
    const awaitingFinalApproval = activationsData.filter(
      (a) => a.status === 'PENDING_FINAL_APPROVAL' || a.stageNumber === 7,
    ).length;
    const activated = summaryData?.summary?.activeStudents || activationsData.filter((a) => a.status === 'ACTIVE').length;

    return { total, newStudents, handoverPending, handoverInProgress, awaitingFinalApproval, activated };
  }, [activationsData, summaryData]);

  // 2. Teaching hours metrics
  const hoursMetrics = React.useMemo(() => {
    const s = summaryData?.summary || {};
    const scheduled = s.scheduledMinutes || 0;
    const reported = s.reportedMinutes || 0;
    const verified = s.consumedMinutes || 0;
    const remaining = s.remainingMinutes || 0;
    const progressPercent = scheduled > 0 ? Math.min(100, Math.round((verified / scheduled) * 100)) : 0;

    return {
      scheduled: formatHours(scheduled),
      reported: formatHours(reported),
      verified: formatHours(verified),
      remaining: formatHours(remaining),
      progressPercent,
      rawScheduled: scheduled,
      rawVerified: verified,
    };
  }, [summaryData]);

  // 3. Today's class metrics
  const todayCounts = todayClassesData?.counts || {};
  const todayTotal = todayClassesData?.total || Object.values(todayCounts).reduce((a: number, b: any) => a + Number(b || 0), 0) || 0;
  const todayUpcoming = todayCounts.SCHEDULED || 0;
  const todayAwaitingUpdate = todayCounts.AWAITING_TUTOR_UPDATE || 0;
  const todayAwaitingVerification = todayCounts.AWAITING_MENTOR_VERIFICATION || 0;
  const todayVerified = todayCounts.VERIFIED || 0;
  const todayNotConductedOrRescheduled = (todayCounts.NOT_CONDUCTED || 0) + (todayCounts.RESCHEDULED || 0);

  // Filtered Today's Classes list
  const filteredTodayClasses = React.useMemo(() => {
    if (!todayClassesData?.rows) return [];
    let list = todayClassesData.rows;
    if (studentQuery.trim()) {
      const q = studentQuery.toLowerCase().trim();
      list = list.filter((c: any) => c.studentName?.toLowerCase().includes(q) || c.studentId?.toLowerCase().includes(q));
    }
    if (subjectFilter) {
      list = list.filter((c: any) => c.subjectName === subjectFilter);
    }
    if (tutorFilter.trim()) {
      const q = tutorFilter.toLowerCase().trim();
      list = list.filter((c: any) => c.tutorName?.toLowerCase().includes(q));
    }
    if (classStateFilter) {
      list = list.filter((c: any) => c.state === classStateFilter);
    }
    return list;
  }, [todayClassesData?.rows, studentQuery, subjectFilter, tutorFilter, classStateFilter]);

  // Filtered Handover Activations list
  const handoverActivations = React.useMemo(() => {
    let list = activationsData.filter((a) => a.status !== 'ACTIVE' && a.status !== 'CANCELLED');
    if (studentQuery.trim()) {
      const q = studentQuery.toLowerCase().trim();
      list = list.filter((a) => a.studentName?.toLowerCase().includes(q) || a.studentId?.toLowerCase().includes(q));
    }
    return list;
  }, [activationsData, studentQuery]);

  // Filtered Upcoming Exams list
  const filteredExams = React.useMemo(() => {
    if (!examDueData) return [];
    let list = examDueData;
    if (studentQuery.trim()) {
      const q = studentQuery.toLowerCase().trim();
      list = list.filter((e) => e.studentName?.toLowerCase().includes(q) || e.studentId?.toLowerCase().includes(q));
    }
    if (subjectFilter) {
      list = list.filter((e) => e.subjectName === subjectFilter);
    }
    if (examStateFilter) {
      if (examStateFilter === 'SCHEDULED') list = list.filter((e) => !!e.scheduledExam);
      else if (examStateFilter === 'READY_FOR_EXAM') list = list.filter((e) => e.due);
    }
    return list;
  }, [examDueData, studentQuery, subjectFilter, examStateFilter]);

  // Upcoming Parent Meetings list
  const upcomingMeetings = React.useMemo(() => {
    if (!reviewsData?.rows) return [];
    let list = reviewsData.rows;
    if (studentQuery.trim()) {
      const q = studentQuery.toLowerCase().trim();
      list = list.filter((m: any) => m.studentName?.toLowerCase().includes(q));
    }
    return list;
  }, [reviewsData?.rows, studentQuery]);

  // Consolidated Pending Actions Queue
  const pendingActions = React.useMemo(() => {
    const queue: Array<{
      id: string;
      title: string;
      category: 'Class' | 'Exam' | 'Meeting' | 'Complaint' | 'Handover';
      severity: 'danger' | 'warning' | 'info';
      slaText?: string;
      actionText: string;
      actionHref?: string;
      onActionClick?: () => void;
    }> = [];

    // Classes awaiting verification (High/Danger)
    if (todayClassesData?.rows) {
      for (const c of todayClassesData.rows) {
        if (c.state === 'AWAITING_MENTOR_VERIFICATION') {
          queue.push({
            id: `class-verify-${c.key}`,
            title: `Verify class for ${c.studentName} (${c.subjectName || 'Class'})`,
            category: 'Class',
            severity: 'danger',
            slaText: c.warning || 'Verification pending',
            actionText: 'Verify Class',
            onActionClick: () => setOpenClassKey(c.key),
          });
        } else if (c.state === 'AWAITING_TUTOR_UPDATE') {
          queue.push({
            id: `class-update-${c.key}`,
            title: `Missing tutor update for ${c.studentName} (${c.tutorName || 'Tutor'})`,
            category: 'Class',
            severity: 'warning',
            slaText: 'Update missing',
            actionText: 'Follow Up',
            actionHref: `/mentoring/classes?card=classes_awaiting_update`,
          });
        }
      }
    }

    // Complaints breaching or approaching SLA
    if (complaintsData?.rows) {
      for (const comp of complaintsData.rows) {
        if (comp.ack?.state === 'BREACHED') {
          queue.push({
            id: `complaint-${comp.id}`,
            title: `Complaint ${comp.number}: ${comp.title} (${comp.studentName})`,
            category: 'Complaint',
            severity: 'danger',
            slaText: 'Acknowledgement SLA Breached',
            actionText: 'Handle Complaint',
            actionHref: '/mentoring/complaints',
          });
        } else if (comp.ack?.state === 'APPROACHING') {
          queue.push({
            id: `complaint-${comp.id}`,
            title: `Complaint ${comp.number}: ${comp.title} (${comp.studentName})`,
            category: 'Complaint',
            severity: 'warning',
            slaText: 'Ack SLA Approaching',
            actionText: 'Acknowledge',
            actionHref: '/mentoring/complaints',
          });
        }
      }
    }

    // Exams due for scheduling
    if (examDueData) {
      for (const e of examDueData) {
        if (e.due && !e.scheduledExam) {
          queue.push({
            id: `exam-due-${e.activationId}-${e.subjectId}`,
            title: `Exam due for ${e.studentName} in ${e.subjectName} (3.0 verified hours reached)`,
            category: 'Exam',
            severity: 'warning',
            slaText: '3.0 hrs threshold met',
            actionText: 'Schedule Exam',
            actionHref: `/mentoring/students/${e.activationId}?panel=exams`,
          });
        }
      }
    }

    // Overdue Parent Meetings
    if (reviewsData?.rows) {
      for (const m of reviewsData.rows) {
        if (m.overdue) {
          queue.push({
            id: `meeting-${m.activationId}`,
            title: `Monthly parent meeting overdue for ${m.studentName}`,
            category: 'Meeting',
            severity: 'danger',
            slaText: 'Overdue',
            actionText: 'Schedule Meeting',
            actionHref: `/mentoring/students/${m.activationId}?panel=review`,
          });
        }
      }
    }

    // Handover stages blocked or awaiting action
    for (const act of activationsData) {
      if (act.blocked) {
        queue.push({
          id: `act-blocked-${act.activationId}`,
          title: `Handover blocked for ${act.studentName} (Stage ${act.stageNumber}: ${act.stageName})`,
          category: 'Handover',
          severity: 'danger',
          slaText: `${act.daysPending} days pending`,
          actionText: 'Resolve Block',
          actionHref: `/mentoring/students/${act.activationId}`,
        });
      }
    }

    return queue;
  }, [todayClassesData?.rows, complaintsData?.rows, examDueData, reviewsData?.rows, activationsData]);

  const clearAllFilters = () => {
    setStudentQuery('');
    setSubjectFilter('');
    setTutorFilter('');
    setClassStateFilter('');
    setExamStateFilter('');
    setComplaintCategoryFilter('');
    setComplaintStatusFilter('');
    setPriorityFilter('');
    setSlaStateFilter('');
    setFrom('');
    setTo('');
    setPeriod('week');
  };

  const hasActiveFilters = !!(
    studentQuery ||
    subjectFilter ||
    tutorFilter ||
    classStateFilter ||
    examStateFilter ||
    complaintCategoryFilter ||
    complaintStatusFilter ||
    priorityFilter ||
    slaStateFilter ||
    from ||
    to
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-testid="dedicated-mentor-dashboard">
      {/* ─── Header ───────────────────────────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mentor Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            {summaryData?.today ? `Today is ${longDayLabel(summaryData.today)}. ` : ''}
            Operational overview of your assigned students, teaching hours, classes, exams, meetings, and complaints.
          </p>
        </div>

        {/* Primary Workspace Quick-Links */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/mentoring/classes">
            <Button size="sm" variant="outline" className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Classes
            </Button>
          </Link>
          <Link href="/mentoring/exams">
            <Button size="sm" variant="outline" className="flex items-center gap-1">
              <GraduationCap className="h-4 w-4" />
              Exams
            </Button>
          </Link>
          <Link href="/mentoring/reviews">
            <Button size="sm" variant="outline" className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              Meetings
            </Button>
          </Link>
          <Link href="/mentoring/complaints">
            <Button size="sm" variant="outline" className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              Complaints
            </Button>
          </Link>
        </div>
      </header>

      {error && <p role="alert" className="rounded-md bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p>}

      {/* ─── Filter Bar ───────────────────────────────────────────────────────────────────────── */}
      <section aria-label="Dashboard Filters" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs" data-testid="dashboard-filters-bar">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            Operational Filters
          </div>

          {/* Period selector tabs */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => { setPeriod('day'); setFrom(''); setTo(''); }}
              className={`rounded-md px-3 py-1 font-medium transition-all ${period === 'day' && !from ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => { setPeriod('week'); setFrom(''); setTo(''); }}
              className={`rounded-md px-3 py-1 font-medium transition-all ${period === 'week' && !from ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => { setPeriod('month'); setFrom(''); setTo(''); }}
              className={`rounded-md px-3 py-1 font-medium transition-all ${period === 'month' && !from ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => { setPeriod(''); }}
              className={`rounded-md px-3 py-1 font-medium transition-all ${!period || from ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Custom Range
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Student Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Student name or ID..."
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                className="pl-8 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
            <Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
              <option value="">All Subjects</option>
              {allSubjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tutor</label>
            <Input
              placeholder="Filter by tutor..."
              value={tutorFilter}
              onChange={(e) => setTutorFilter(e.target.value)}
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Class Status</label>
            <Select value={classStateFilter} onChange={(e) => setClassStateFilter(e.target.value)}>
              <option value="">All Class Statuses</option>
              {CLASS_STATES.map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Exam Status</label>
            <Select value={examStateFilter} onChange={(e) => setExamStateFilter(e.target.value)}>
              <option value="">All Exam Statuses</option>
              {EXAM_STATES.map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </Select>
          </div>
        </div>

        {/* Custom Date Range if active or toggled */}
        {(!period || from || to) && (
          <div className="grid grid-cols-2 gap-3 sm:w-1/2 pt-1 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">From Date</label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPeriod(''); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">To Date</label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPeriod(''); }} />
            </div>
          </div>
        )}

        {hasActiveFilters && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
            <span className="text-slate-500">Filters applied</span>
            <Button type="button" size="sm" variant="ghost" onClick={clearAllFilters} className="text-xs">
              Clear All Filters
            </Button>
          </div>
        )}
      </section>

      {/* ─── SECTION 1: Student Overview Metrics ──────────────────────────────────────────────── */}
      <section aria-label="Student Overview" className="space-y-3" data-testid="student-overview-group">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-brand-600" />
          Student Overview (Assigned Scope)
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="block text-2xl font-bold text-slate-900">{studentMetrics.total}</span>
            <span className="block text-xs font-medium text-slate-600 mt-1">Total Assigned Students</span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className={`block text-2xl font-bold ${studentMetrics.newStudents > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {studentMetrics.newStudents}
            </span>
            <span className="block text-xs font-medium text-slate-600 mt-1">Newly Received</span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className={`block text-2xl font-bold ${studentMetrics.handoverPending > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {studentMetrics.handoverPending}
            </span>
            <span className="block text-xs font-medium text-slate-600 mt-1">Handover Pending</span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="block text-2xl font-bold text-slate-900">{studentMetrics.handoverInProgress}</span>
            <span className="block text-xs font-medium text-slate-600 mt-1">Handover In Progress</span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className={`block text-2xl font-bold ${studentMetrics.awaitingFinalApproval > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {studentMetrics.awaitingFinalApproval}
            </span>
            <span className="block text-xs font-medium text-slate-600 mt-1">Awaiting Final Head Approval</span>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
            <span className="block text-2xl font-bold text-emerald-800">{studentMetrics.activated}</span>
            <span className="block text-xs font-medium text-emerald-700 mt-1">Activated Students</span>
          </div>
        </div>
      </section>

      {/* ─── SECTION 2: Teaching Hours Overview ────────────────────────────────────────────────── */}
      <section aria-label="Teaching Hours Overview" className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs" data-testid="teaching-hours-group">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-brand-600" />
              Teaching Hours Overview
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Hours breakdown for selected period: <span className="font-semibold text-slate-700">{period === 'day' ? 'Today' : period === 'week' ? 'This Week' : period === 'month' ? 'This Month' : `${from || 'Start'} to ${to || 'End'}`}</span>.
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs font-medium text-slate-500">Verification Progress</span>
            <p className="text-sm font-bold text-slate-900">{hoursMetrics.progressPercent}% of scheduled</p>
          </div>
        </div>

        {/* 4 strictly separated metric cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
            <span className="block text-xs font-medium text-slate-600">Scheduled Hours</span>
            <span className="block text-xl font-bold text-slate-900 mt-1">{hoursMetrics.scheduled}</span>
            <span className="block text-[11px] text-slate-400 mt-0.5">From approved schedule</span>
          </div>

          <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
            <span className="block text-xs font-medium text-slate-600">Tutor-Reported Hours</span>
            <span className="block text-xl font-bold text-slate-900 mt-1">{hoursMetrics.reported}</span>
            <span className="block text-[11px] text-slate-400 mt-0.5">Reported by tutors</span>
          </div>

          <div className="rounded-lg bg-emerald-50 p-3.5 border border-emerald-100">
            <span className="block text-xs font-medium text-emerald-800">Mentor-Verified Hours</span>
            <span className="block text-xl font-bold text-emerald-900 mt-1">{hoursMetrics.verified}</span>
            <span className="block text-[11px] text-emerald-700 mt-0.5">Consumed & payout authorized</span>
          </div>

          <div className="rounded-lg bg-amber-50 p-3.5 border border-amber-100">
            <span className="block text-xs font-medium text-amber-800">Remaining Unverified Hours</span>
            <span className="block text-xl font-bold text-amber-900 mt-1">{hoursMetrics.remaining}</span>
            <span className="block text-[11px] text-amber-700 mt-0.5">Awaiting verification</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs text-slate-600">
            <span>Verified Hours vs Scheduled</span>
            <span className="font-semibold">{hoursMetrics.verified} / {hoursMetrics.scheduled} ({hoursMetrics.progressPercent}%)</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${hoursMetrics.progressPercent}%` }}
            />
          </div>
        </div>

        {/* Mandatory Policy Note */}
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2 border border-slate-200">
          <AlertCircle className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-800">Strict Data Integrity Notice:</span> Only mentor-verified hours count toward student consumption and tutor payout. Tutor-reported hours do not decrement student balances or authorise tutor pay until verified.
          </div>
        </div>
      </section>

      {/* ─── SECTION 3: Today's Class Overview ─────────────────────────────────────────────────── */}
      <section aria-label="Today's Classes Overview" className="space-y-3" data-testid="today-classes-group">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-brand-600" />
            Today&apos;s Class Overview
          </h2>
          <Link href="/mentoring/classes" className="text-xs font-medium text-brand-700 hover:underline flex items-center gap-1">
            Open Classes Workspace <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Link
            href="/mentoring/classes"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-brand-500 hover:shadow-sm"
          >
            <span className="block text-2xl font-bold text-slate-900">{todayTotal}</span>
            <span className="block text-xs font-medium text-slate-600 mt-1">Total Classes Today</span>
          </Link>

          <Link
            href="/mentoring/classes?classState=SCHEDULED"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-brand-500 hover:shadow-sm"
          >
            <span className="block text-2xl font-bold text-slate-900">{todayUpcoming}</span>
            <span className="block text-xs font-medium text-slate-600 mt-1">Upcoming Classes</span>
          </Link>

          <Link
            href="/mentoring/classes?card=classes_awaiting_update"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-brand-500 hover:shadow-sm"
          >
            <span className={`block text-2xl font-bold ${todayAwaitingUpdate > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {todayAwaitingUpdate}
            </span>
            <span className="block text-xs font-medium text-slate-600 mt-1">Awaiting Tutor Updates</span>
          </Link>

          <Link
            href="/mentoring/classes?card=classes_awaiting_verification"
            className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs transition-all hover:border-amber-400 hover:shadow-sm"
          >
            <span className={`block text-2xl font-bold ${todayAwaitingVerification > 0 ? 'text-amber-800' : 'text-slate-900'}`}>
              {todayAwaitingVerification}
            </span>
            <span className="block text-xs font-medium text-amber-900 mt-1">Awaiting Verification</span>
          </Link>

          <Link
            href="/mentoring/classes?card=classes_verified"
            className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs transition-all hover:border-emerald-400 hover:shadow-sm"
          >
            <span className="block text-2xl font-bold text-emerald-800">{todayVerified}</span>
            <span className="block text-xs font-medium text-emerald-700 mt-1">Verified Classes</span>
          </Link>

          <Link
            href="/mentoring/classes?card=classes_not_conducted"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-brand-500 hover:shadow-sm"
          >
            <span className="block text-2xl font-bold text-slate-700">{todayNotConductedOrRescheduled}</span>
            <span className="block text-xs font-medium text-slate-600 mt-1">Not Conducted / Rescheduled</span>
          </Link>
        </div>
      </section>

      {/* ─── SECTION 4: Handover Overview (7 Stages) ────────────────────────────────────────── */}
      <section aria-label="Handover Overview" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs" data-testid="handover-group">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-brand-600" />
            Phase 1 Handover Overview (7 Stages)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Complete stages 2–6 for your assigned students. Stage 7 final approval is strictly restricted to Mentoring Head.
          </p>
        </div>

        {/* 7-Stage Visual Roadmap */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 text-xs">
          {HANDOVER_STAGES.map((s) => (
            <div
              key={s.number}
              className={`rounded-lg border p-2.5 ${s.number === 7 ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-slate-50/70'}`}
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <span>Stage {s.number}</span>
                {s.number === 7 && <span className="text-[10px] text-amber-700 font-bold">HEAD ONLY</span>}
              </div>
              <p className="font-semibold text-slate-900 mt-0.5 truncate" title={s.name}>{s.name}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{s.owner}</p>
            </div>
          ))}
        </div>

        {/* Students in Handover Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm" data-testid="handover-students-table">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Student</th>
                <th className="px-3 py-2.5">Current Stage</th>
                <th className="px-3 py-2.5">Days Pending</th>
                <th className="px-3 py-2.5">Responsible Role</th>
                <th className="px-3 py-2.5">Next Required Action</th>
                <th className="px-3 py-2.5 text-right">Student Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {handoverActivations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-slate-500">
                    No students currently pending in Phase 1 handover.
                  </td>
                </tr>
              ) : (
                handoverActivations.map((a) => (
                  <tr key={a.activationId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {a.studentName}
                      {a.studentId ? <span className="ml-1 text-xs text-slate-500 font-normal">({a.studentId})</span> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={a.stageNumber === 7 ? 'warning' : 'default'} className="text-xs">
                        Stage {a.stageNumber}: {a.stageName || a.statusLabel}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700">
                      <span className={a.daysPending > 5 ? 'font-semibold text-amber-700' : ''}>
                        {a.daysPending} days
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {a.stageNumber === 7 ? (
                        <span className="font-semibold text-amber-800">Mentoring Head (Restricted)</span>
                      ) : (
                        <span className="text-slate-700">{a.responsible}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-800 max-w-xs truncate" title={a.nextAction}>
                      {a.nextAction}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/mentoring/students/${a.activationId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── SECTION 5: Daily & Upcoming Operations ────────────────────────────────────────────── */}
      <section aria-label="Daily and Upcoming Operations" className="space-y-6" data-testid="daily-operations-group">
        <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">
          Daily & Upcoming Operations
        </h2>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Sub-section A: Today's Classes */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-brand-600" />
                Today&apos;s Classes ({filteredTodayClasses.length})
              </h3>
              <Link href="/mentoring/classes" className="text-xs font-medium text-brand-700 hover:underline">
                View All
              </Link>
            </div>

            {filteredTodayClasses.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No classes scheduled for today.</p>
            ) : (
              <div className="space-y-2.5">
                {filteredTodayClasses.map((c: any) => {
                  const isAwaitingVerification = c.state === 'AWAITING_MENTOR_VERIFICATION';
                  const isAwaitingUpdate = c.state === 'AWAITING_TUTOR_UPDATE';
                  const isVerified = c.state === 'VERIFIED';
                  const isCorrection = c.state === 'RETURNED_FOR_CORRECTION';

                  let actionBadge = <Badge variant="default" className="text-xs">No action needed</Badge>;
                  if (isAwaitingVerification) actionBadge = <Badge variant="warning" className="text-xs">Awaiting verification</Badge>;
                  else if (isAwaitingUpdate) actionBadge = <Badge variant="info" className="text-xs">Follow up with tutor</Badge>;
                  else if (isVerified) actionBadge = <Badge variant="success" className="text-xs">Verified</Badge>;
                  else if (isCorrection) actionBadge = <Badge variant="danger" className="text-xs">Returned for correction</Badge>;

                  return (
                    <article
                      key={c.key}
                      className={`rounded-lg border p-3.5 transition-colors ${isAwaitingVerification ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}
                      data-testid="today-class-card"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">
                            {c.studentName} — <span className="font-normal text-slate-600">{c.subjectName}</span>
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Tutor: {c.tutorName} • Time: {formatMinute(c.startMinute)} – {formatMinute(c.endMinute)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {actionBadge}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                        <span className="text-slate-500">{c.stateLabel}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant={isAwaitingVerification ? 'primary' : 'outline'}
                          onClick={() => setOpenClassKey(c.key)}
                          data-testid="open-verification-btn"
                          className="text-xs h-7 px-2.5"
                        >
                          Open Verification
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sub-section B: Upcoming Exams */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-brand-600" />
                Upcoming Exams & 3-Hour Progress
              </h3>
              <Link href="/mentoring/exams" className="text-xs font-medium text-brand-700 hover:underline">
                View All
              </Link>
            </div>

            {filteredExams.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No exams or verified hours tracked.</p>
            ) : (
              <div className="space-y-2.5">
                {filteredExams.slice(0, 6).map((e: any) => {
                  const verifiedHours = (e.verifiedMinutes / 60).toFixed(1);
                  const thresholdHours = (e.thresholdMinutes / 60).toFixed(1);
                  const status = e.scheduledExam
                    ? `Scheduled (${dayLabel(e.scheduledExam.date)})`
                    : e.due
                    ? 'Eligible (3.0 hrs reached)'
                    : 'Hours pending';

                  return (
                    <article
                      key={`${e.activationId}-${e.subjectId}`}
                      className="rounded-lg border border-slate-200 bg-white p-3.5"
                      data-testid="upcoming-exam-card"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">{e.studentName}</h4>
                          <p className="text-xs text-slate-500">{e.subjectName}</p>
                        </div>
                        <Badge
                          variant={e.scheduledExam ? 'info' : e.due ? 'success' : 'default'}
                          className="text-xs"
                        >
                          {status}
                        </Badge>
                      </div>

                      {/* 3-hour verified progress bar */}
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-600">
                          <span>Verified Class Time</span>
                          <span className="font-semibold">{verifiedHours} / {thresholdHours} hrs ({e.progressPercent}%)</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full ${e.due ? 'bg-emerald-600' : 'bg-brand-500'}`}
                            style={{ width: `${e.progressPercent}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-2.5 flex justify-end">
                        <Link
                          href={`/mentoring/students/${e.activationId}?panel=exams`}
                          className="text-xs font-medium text-brand-700 hover:underline flex items-center gap-1"
                        >
                          Open Student Exams <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sub-section C: Upcoming Parent Meetings */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-600" />
                Upcoming Parent Meetings
              </h3>
              <Link href="/mentoring/reviews" className="text-xs font-medium text-brand-700 hover:underline">
                View All
              </Link>
            </div>

            {upcomingMeetings.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No upcoming parent meetings.</p>
            ) : (
              <div className="space-y-2.5">
                {upcomingMeetings.slice(0, 5).map((m: any) => {
                  const prep = m.preparation;
                  let prepLabel = 'Preparation Pending';
                  let prepTone: 'default' | 'info' | 'success' | 'warning' = 'default';

                  if (prep?.examsReviewed && prep?.nextPlanApproved) {
                    prepLabel = 'Preparation Complete';
                    prepTone = 'success';
                  } else if (prep?.tutorObservations > 0 || prep?.examsReviewed) {
                    prepLabel = 'Preparation In Progress';
                    prepTone = 'warning';
                  }

                  return (
                    <article
                      key={m.activationId}
                      className="rounded-lg border border-slate-200 bg-white p-3.5"
                      data-testid="upcoming-meeting-card"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">{m.studentName}</h4>
                          <p className="text-xs text-slate-500">
                            Parent: {m.parentName || 'Parent'} • Date: {m.date ? dayLabel(m.date) : 'Unscheduled'}
                          </p>
                        </div>
                        <Badge variant={m.overdue ? 'danger' : prepTone} className="text-xs">
                          {m.overdue ? 'Overdue' : prepLabel}
                        </Badge>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                        <span className="text-slate-500">Status: {m.stateLabel}</span>
                        <Link
                          href={`/mentoring/students/${m.activationId}?panel=review`}
                          className="font-medium text-brand-700 hover:underline flex items-center gap-1"
                        >
                          Review Workspace <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sub-section D: Pending Actions Queue */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Pending Actions Queue ({pendingActions.length})
              </h3>
              <span className="text-xs text-slate-500">Prioritized Attention</span>
            </div>

            {pendingActions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <span>All caught up! No urgent pending actions required.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {pendingActions.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-xs ${item.severity === 'danger' ? 'border-red-200 bg-red-50/50' : item.severity === 'warning' ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50/50'}`}
                    data-testid="pending-action-item"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">{item.category}</Badge>
                        <Badge
                          variant={item.severity === 'danger' ? 'danger' : item.severity === 'warning' ? 'warning' : 'info'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {item.slaText || item.severity}
                        </Badge>
                      </div>
                      <p className="font-semibold text-slate-900 truncate" title={item.title}>
                        {item.title}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {item.onActionClick ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={item.onActionClick}
                          className="text-xs h-7 px-2.5"
                        >
                          {item.actionText}
                        </Button>
                      ) : item.actionHref ? (
                        <Link href={item.actionHref}>
                          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5">
                            {item.actionText}
                          </Button>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Class Verification Drawer ───────────────────────────────────────────────────────── */}
      {openClassKey && (
        <ClassWorkspaceDrawer
          role="MENTOR"
          classKey={openClassKey}
          onClose={() => setOpenClassKey(null)}
          onChanged={() => void loadDashboard()}
        />
      )}
    </div>
  );
}
