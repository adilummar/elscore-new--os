"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  getAttendanceStatusAction,
  getAttendanceHistoryAction,
  performAttendanceAction,
  getDailySummaryAction,
  getAttendanceDashboardSummaryAction,
  getAttendanceReportAction,
} from "./actions";
import { fmtTime, BUSINESS_TIMEZONE } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { usePermissions } from "@/components/providers/AuthProvider";
import {
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  Clock,
  RefreshCw,
  Search,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  UserCheck,
  Download,
  Filter,
  X,
  FileSpreadsheet,
} from "lucide-react";

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface SummaryMetrics {
  totalActiveStaff: number;
  present: number;
  absent: number;
  onLeave: number;
  lateArrivals: number;
  unmarked: number;
  expectedToWork: number;
  attendanceRate: number;
}

interface StaffRecord {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  department?: { id: string; name: string; code: string } | null;
  roles?: { id: string; name: string; code: string }[];
  attendanceStatus: 'PRESENT' | 'ON_LEAVE' | 'ABSENT' | 'UNMARKED' | 'WEEKEND_OFF' | 'SCHEDULED';
  isLate: boolean;
  lateMinutes: number;
  session?: {
    id: string;
    status: string;
    note: string | null;
    netDurationMinutes: number;
    breakDurationMinutes: number;
    grossDurationMinutes: number;
    checkInTime: string | null;
    checkOutTime: string | null;
  } | null;
  leave?: {
    id: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string | null;
  } | null;
}

interface DailyAttendanceBreakdown {
  date: string;
  status: 'PRESENT' | 'ON_LEAVE' | 'ABSENT' | 'UNMARKED' | 'WEEKEND_OFF' | 'SCHEDULED' | 'NOT_HIRED' | 'DEPARTED';
  isWeekend: boolean;
  isLate: boolean;
  lateMinutes: number;
  session?: {
    id: string;
    status: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    netDurationMinutes: number;
    breakDurationMinutes: number;
    grossDurationMinutes: number;
    note: string | null;
  } | null;
  leave?: {
    id: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string | null;
  } | null;
}

interface ReportEmployee {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  department?: { id: string; name: string; code: string } | null;
  roles?: { id: string; name: string; code: string }[];
  expectedWorkingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  onLeaveDays: number;
  weeklyOffDays: number;
  unmarkedDays: number;
  attendancePercentage: number;
  totalWorkedMinutes: number;
  workedHoursStr: string;
  dailyRecords: DailyAttendanceBreakdown[];
}

interface PeriodSummary {
  totalEmployees: number;
  expectedWorkingDays: number;
  presentDays: number;
  absentDays: number;
  onLeaveDays: number;
  lateDays: number;
  weeklyOffDays: number;
  avgAttendanceRate: number;
  totalWorkedHours: string;
}

// ─── Stat Card Component with Tooltip Definitions ───────────────────────────
function MetricCard({
  title,
  value,
  subtext,
  definition,
  icon: Icon,
  accentColor,
}: {
  title: string;
  value: string | number;
  subtext: string;
  definition: string;
  icon: React.ElementType;
  accentColor: {
    bg: string;
    text: string;
    border: string;
    iconBg: string;
  };
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-4 shadow-sm transition-all hover:shadow-md ${accentColor.border}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
              {title}
            </span>
            <div className="group relative cursor-pointer" title={definition}>
              <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
              <div className="pointer-events-none absolute left-0 bottom-full z-30 mb-1.5 hidden w-64 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] leading-tight text-white shadow-lg group-hover:block">
                {definition}
              </div>
            </div>
          </div>
          <p className={`text-2xl font-bold tracking-tight ${accentColor.text}`}>
            {value}
          </p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accentColor.iconBg}`}>
          <Icon className={`h-5 w-5 ${accentColor.text}`} />
        </div>
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-500 border-t border-slate-100 pt-2">
        {subtext}
      </p>
    </div>
  );
}

export default function AttendancePage() {
  const { hasPermission } = usePermissions();

  const canViewTeam =
    hasPermission("attendance.read.team") ||
    hasPermission("employee.read-all") ||
    hasPermission("analytics.ceo.read");

  // Navigation tab state: 'daily' | 'report' | 'my'
  const [activeTab, setActiveTab] = useState<'daily' | 'report' | 'my'>(() =>
    canViewTeam ? 'daily' : 'my'
  );

  useEffect(() => {
    if (canViewTeam && activeTab === 'my') {
      // Keep 'my' if clicked by user, but default is 'daily'
    }
  }, [canViewTeam, activeTab]);

  const getTodayIstString = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE || 'Asia/Kolkata' });

  const getCurrentMonthString = () => {
    const today = getTodayIstString();
    return today.substring(0, 7); // 'YYYY-MM'
  };

  // Shared departments list
  const [departments, setDepartments] = useState<{ id: string; name: string; code: string }[]>([]);

  // ══════════════════════════════════════════════════════════════════════════
  // ── 1. DAILY DASHBOARD STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [dailyDate, setDailyDate] = useState<string>(getTodayIstString());
  const [dailyDepartment, setDailyDepartment] = useState<string>('all');
  const [dailySearchQuery, setDailySearchQuery] = useState<string>('');
  const [dailyStatusFilter, setDailyStatusFilter] = useState<string>('ALL');

  const [dailyMetrics, setDailyMetrics] = useState<SummaryMetrics>({
    totalActiveStaff: 0,
    present: 0,
    absent: 0,
    onLeave: 0,
    lateArrivals: 0,
    unmarked: 0,
    expectedToWork: 0,
    attendanceRate: 0,
  });

  const [dailyStaffRecords, setDailyStaffRecords] = useState<StaffRecord[]>([]);
  const [isLoadingDaily, setIsLoadingDaily] = useState<boolean>(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [isDailyWeekend, setIsDailyWeekend] = useState<boolean>(false);
  const [isDailyToday, setIsDailyToday] = useState<boolean>(true);

  const loadDailyData = useCallback(async () => {
    if (!canViewTeam) return;
    setIsLoadingDaily(true);
    setDailyError(null);
    try {
      const data = await getAttendanceDashboardSummaryAction(dailyDate, dailyDepartment);
      if (data) {
        setDailyMetrics(data.metrics || {
          totalActiveStaff: 0,
          present: 0,
          absent: 0,
          onLeave: 0,
          lateArrivals: 0,
          unmarked: 0,
          expectedToWork: 0,
          attendanceRate: 0,
        });
        setDailyStaffRecords(data.records || []);
        if (Array.isArray(data.departments) && data.departments.length > 0) {
          setDepartments(data.departments);
        }
        setIsDailyWeekend(Boolean(data.isWeekend));
        setIsDailyToday(Boolean(data.isToday));
      }
    } catch (err: any) {
      console.error('Failed to load daily attendance:', err);
      setDailyError(err.message || 'Failed to load daily attendance summary');
    } finally {
      setIsLoadingDaily(false);
    }
  }, [canViewTeam, dailyDate, dailyDepartment]);

  useEffect(() => {
    if (canViewTeam && activeTab === 'daily') {
      loadDailyData();
    }
  }, [canViewTeam, activeTab, loadDailyData]);

  const shiftDailyDate = (deltaDays: number) => {
    try {
      const [year, month, day] = dailyDate.split('-').map(Number);
      const curr = new Date(Date.UTC(year, month - 1, day));
      curr.setUTCDate(curr.getUTCDate() + deltaDays);
      setDailyDate(curr.toISOString().split('T')[0]);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredDailyRecords = useMemo(() => {
    return dailyStaffRecords.filter((rec) => {
      if (dailySearchQuery.trim()) {
        const query = dailySearchQuery.toLowerCase();
        const matchName = rec.fullName.toLowerCase().includes(query);
        const matchId = rec.businessId.toLowerCase().includes(query);
        const matchEmail = rec.email.toLowerCase().includes(query);
        const matchDept = rec.department?.name?.toLowerCase().includes(query);
        if (!matchName && !matchId && !matchEmail && !matchDept) return false;
      }

      if (dailyStatusFilter === 'ALL') return true;
      if (dailyStatusFilter === 'PRESENT') return rec.attendanceStatus === 'PRESENT';
      if (dailyStatusFilter === 'LATE') return rec.isLate;
      if (dailyStatusFilter === 'ON_LEAVE') return rec.attendanceStatus === 'ON_LEAVE';
      if (dailyStatusFilter === 'ABSENT') return rec.attendanceStatus === 'ABSENT' || rec.attendanceStatus === 'UNMARKED';
      return true;
    });
  }, [dailyStaffRecords, dailySearchQuery, dailyStatusFilter]);

  // ══════════════════════════════════════════════════════════════════════════
  // ── 2. ATTENDANCE REPORT STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [reportMode, setReportMode] = useState<'month' | 'custom'>('month');
  const [reportMonth, setReportMonth] = useState<string>(getCurrentMonthString());
  const [reportStartDate, setReportStartDate] = useState<string>(`${getCurrentMonthString()}-01`);
  const [reportEndDate, setReportEndDate] = useState<string>(getTodayIstString());
  const [reportDepartment, setReportDepartment] = useState<string>('all');
  const [reportSearchQuery, setReportSearchQuery] = useState<string>('');

  const [periodSummary, setPeriodSummary] = useState<PeriodSummary>({
    totalEmployees: 0,
    expectedWorkingDays: 0,
    presentDays: 0,
    absentDays: 0,
    onLeaveDays: 0,
    lateDays: 0,
    weeklyOffDays: 0,
    avgAttendanceRate: 0,
    totalWorkedHours: '0h 0m',
  });

  const [reportEmployees, setReportEmployees] = useState<ReportEmployee[]>([]);
  const [reportAppliedRange, setReportAppliedRange] = useState<{ start: string; end: string }>({
    start: `${getCurrentMonthString()}-01`,
    end: getTodayIstString(),
  });
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Expanded employee row for daily breakdown
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  const loadReportData = useCallback(async () => {
    if (!canViewTeam) return;
    setIsLoadingReport(true);
    setReportError(null);
    try {
      const params: any = { departmentId: reportDepartment };
      if (reportMode === 'month') {
        params.month = reportMonth;
      } else {
        params.startDate = reportStartDate;
        params.endDate = reportEndDate;
      }

      const res = await getAttendanceReportAction(params);
      if (res) {
        setPeriodSummary(res.periodSummary || {
          totalEmployees: 0,
          expectedWorkingDays: 0,
          presentDays: 0,
          absentDays: 0,
          onLeaveDays: 0,
          lateDays: 0,
          weeklyOffDays: 0,
          avgAttendanceRate: 0,
          totalWorkedHours: '0h 0m',
        });
        setReportEmployees(res.employees || []);
        setReportAppliedRange({ start: res.startDate, end: res.endDate });
        if (Array.isArray(res.departments) && res.departments.length > 0) {
          setDepartments(res.departments);
        }
      }
    } catch (err: any) {
      console.error('Failed to load attendance report:', err);
      setReportError(err.message || 'Failed to generate attendance report');
    } finally {
      setIsLoadingReport(false);
    }
  }, [canViewTeam, reportMode, reportMonth, reportStartDate, reportEndDate, reportDepartment]);

  useEffect(() => {
    if (canViewTeam && activeTab === 'report') {
      loadReportData();
    }
  }, [canViewTeam, activeTab, loadReportData]);

  const clearReportFilters = () => {
    setReportMode('month');
    setReportMonth(getCurrentMonthString());
    setReportStartDate(`${getCurrentMonthString()}-01`);
    setReportEndDate(getTodayIstString());
    setReportDepartment('all');
    setReportSearchQuery('');
  };

  const filteredReportEmployees = useMemo(() => {
    return reportEmployees.filter((emp) => {
      if (!reportSearchQuery.trim()) return true;
      const query = reportSearchQuery.toLowerCase();
      return (
        emp.fullName.toLowerCase().includes(query) ||
        emp.businessId.toLowerCase().includes(query) ||
        emp.email.toLowerCase().includes(query) ||
        (emp.department?.name && emp.department.name.toLowerCase().includes(query))
      );
    });
  }, [reportEmployees, reportSearchQuery]);

  // CSV Export
  const handleExportCsv = () => {
    if (filteredReportEmployees.length === 0) {
      alert('No staff attendance data to export.');
      return;
    }

    const deptName =
      reportDepartment === 'all'
        ? 'All Departments'
        : departments.find((d) => d.id === reportDepartment)?.name || reportDepartment;

    const headers = [
      'Employee ID',
      'Employee Name',
      'Email',
      'Department',
      'Expected Working Days',
      'Present Days',
      'Absent Days',
      'Late Days',
      'Approved Leave Days',
      'Weekly Offs',
      'Attendance %',
      'Worked Hours',
    ];

    const rows = filteredReportEmployees.map((emp) => [
      `"${emp.businessId}"`,
      `"${emp.fullName.replace(/"/g, '""')}"`,
      `"${emp.email}"`,
      `"${(emp.department?.name || 'Unassigned').replace(/"/g, '""')}"`,
      emp.expectedWorkingDays,
      emp.presentDays,
      emp.absentDays,
      emp.lateDays,
      emp.onLeaveDays,
      emp.weeklyOffDays,
      `"${emp.attendancePercentage}%"`,
      `"${emp.workedHoursStr}"`,
    ]);

    // Summary totals row
    const totalsRow = [
      '"TOTALS / AVERAGE"',
      '""',
      '""',
      '""',
      periodSummary.expectedWorkingDays,
      periodSummary.presentDays,
      periodSummary.absentDays,
      periodSummary.lateDays,
      periodSummary.onLeaveDays,
      periodSummary.weeklyOffDays,
      `"Avg: ${periodSummary.avgAttendanceRate}%"`,
      `"${periodSummary.totalWorkedHours}"`,
    ];

    const csvContent = [
      `"EL SCORE OS - Staff Attendance Report"`,
      `"Period: ${reportAppliedRange.start} to ${reportAppliedRange.end} (${BUSINESS_TIMEZONE}) | Department: ${deptName}"`,
      `"Generated At: ${new Date().toISOString()}"`,
      '',
      headers.join(','),
      ...rows.map((r) => r.join(',')),
      '',
      totalsRow.join(','),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `attendance-report-${reportAppliedRange.start}-to-${reportAppliedRange.end}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ── 3. MY ATTENDANCE STATE (INDIVIDUAL WORKFLOW PRESERVED 100%)
  // ══════════════════════════════════════════════════════════════════════════
  const [myStatus, setMyStatus] = useState<any>(null);
  const [myHistory, setMyHistory] = useState<any[]>([]);
  const [myNote, setMyNote] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);

  const [dailySummary, setDailySummary] = useState<any>(null);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [isCheckOutModalOpen, setIsCheckOutModalOpen] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  const showToast = (message: string, type: 'success' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchMyStatus = async () => {
    try {
      const data = await getAttendanceStatusAction();
      if (data) {
        setMyStatus({
          state:
            data.status === 'ACTIVE'
              ? 'Working'
              : data.status === 'ON_BREAK'
              ? 'On Break'
              : 'Day Complete',
          workedTime: `${Math.floor((data.netDurationMinutes || 0) / 60)}h ${(data.netDurationMinutes || 0) % 60}m`,
          breakTime: `${Math.floor((data.breakDurationMinutes || 0) / 60)}h ${(data.breakDurationMinutes || 0) % 60}m`,
          note: data.note,
        });
      } else {
        setMyStatus(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMyHistory = async () => {
    try {
      const data = await getAttendanceHistoryAction();
      if (Array.isArray(data)) {
        setMyHistory(
          data.map((s: any) => {
            const checkInEvent = s.events?.find((e: any) => e.eventType === 'CHECK_IN');
            const checkOutEvent = s.events?.find(
              (e: any) => e.eventType === 'CHECK_OUT' || e.eventType === 'AUTO_CHECK_OUT',
            );
            return {
              id: s.id,
              date: s.calendarDate,
              checkIn: checkInEvent ? fmtTime(checkInEvent.timestamp) : '-',
              checkOut: checkOutEvent ? fmtTime(checkOutEvent.timestamp) : '-',
              workedTime: `${Math.floor((s.netDurationMinutes || 0) / 60)}h ${(s.netDurationMinutes || 0) % 60}m`,
              note: s.note,
            };
          }),
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchMyStatus();
    fetchMyHistory();
  }, []);

  const handleAction = async (action: string) => {
    try {
      const res = await performAttendanceAction(action, action === 'CHECK_IN' ? myNote : undefined);
      if (!res.success) {
        showToast(res.error, 'warning');
        return;
      }
      showToast('Action successful', 'success');
      if (action === 'CHECK_IN') {
        setMyNote('');
        setIsCheckInModalOpen(false);
      }
      if (action === 'CHECK_OUT') {
        setIsCheckOutModalOpen(false);
      }
      fetchMyStatus();
      fetchMyHistory();
      if (canViewTeam) {
        loadDailyData();
      }
    } catch (e) {
      console.error(e);
      showToast('An unexpected error occurred', 'warning');
    }
  };

  const loadSummary = async () => {
    setIsLoadingSummary(true);
    try {
      const res = await getDailySummaryAction();
      setDailySummary(
        res || { pendingFollowUps: [], completedFollowUps: [], pendingDemos: [], completedDemos: [] },
      );
    } catch (e) {
      console.error('Failed to load summary', e);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Top Header & Tab Navigation ──────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            {canViewTeam && activeTab === 'report'
              ? 'Staff Attendance Reports'
              : canViewTeam && activeTab === 'daily'
              ? 'Daily Staff Attendance Dashboard'
              : 'My Attendance'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {canViewTeam && activeTab === 'report'
              ? 'Monthly & custom date-range employee attendance breakdown, percentages, and exports.'
              : canViewTeam && activeTab === 'daily'
              ? 'Real-time company attendance records, working hours, and workforce metrics.'
              : 'Record your daily check-in, breaks, working hours, and task progress.'}
          </p>
        </div>

        {canViewTeam && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('daily')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'daily'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Daily Attendance
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'report'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Attendance Reports
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('my')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'my'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              My Attendance
              {myStatus?.state === 'Working' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: DAILY ATTENDANCE DASHBOARD ──────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {canViewTeam && activeTab === 'daily' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Date:</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shiftDailyDate(-1)}
                  title="Previous Day"
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <input
                  type="date"
                  value={dailyDate}
                  onChange={(e) => setDailyDate(e.target.value)}
                  className="border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 h-8"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shiftDailyDate(1)}
                  title="Next Day"
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDailyDate(getTodayIstString())}
                  className={`h-8 text-xs ${dailyDate === getTodayIstString() ? 'bg-primary/10 text-primary border-primary/30 font-semibold' : ''}`}
                >
                  Today
                </Button>
                {isDailyWeekend ? (
                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[11px]">
                    Weekend (Weekly Off)
                  </Badge>
                ) : isDailyToday ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px]">
                    Today (In Progress)
                  </Badge>
                ) : (
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[11px]">
                    Past Date (Finalized)
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={dailyDepartment}
                  onChange={(e) => setDailyDepartment(e.target.value)}
                  className="border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 h-8"
                >
                  <option value="all">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter staff or ID..."
                  value={dailySearchQuery}
                  onChange={(e) => setDailySearchQuery(e.target.value)}
                  className="border border-slate-300 rounded-md pl-8 pr-3 py-1 text-xs font-normal text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 h-8 w-44"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={loadDailyData}
                disabled={isLoadingDaily}
                className="h-8 px-2.5 text-xs flex items-center gap-1 text-slate-600"
                title="Refresh Attendance Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDaily ? 'animate-spin text-primary' : ''}`} />
                <span className="hidden md:inline">Refresh</span>
              </Button>
            </div>
          </div>

          {dailyError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{dailyError}</span>
              </div>
              <Button size="sm" variant="outline" onClick={loadDailyData} className="h-7 text-xs bg-white">
                Retry
              </Button>
            </div>
          )}

          {/* 6 Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricCard
              title="Total Active Staff"
              value={dailyMetrics.totalActiveStaff}
              subtext="Eligible workforce for this date"
              definition="Total active employees in PROBATION, ACTIVE, or NOTICE_PERIOD lifecycle states who were hired on or before this date."
              icon={Users}
              accentColor={{
                bg: "bg-slate-50",
                text: "text-slate-900",
                border: "border-slate-200",
                iconBg: "bg-slate-100",
              }}
            />
            <MetricCard
              title="Present"
              value={dailyMetrics.present}
              subtext="Qualifying check-in recorded"
              definition="Employees with a valid attendance session (Active, On Break, Completed, or Auto Checked Out) on this date."
              icon={CheckCircle2}
              accentColor={{
                bg: "bg-emerald-50",
                text: "text-emerald-700",
                border: "border-emerald-200",
                iconBg: "bg-emerald-100",
              }}
            />
            <MetricCard
              title={isDailyToday ? "Absent / Unmarked" : "Absent"}
              value={dailyMetrics.absent}
              subtext={isDailyToday ? "No check-in or leave yet today" : "Expected to work with no attendance"}
              definition="Employees expected to work on this working day who have no qualifying attendance record and no approved leave."
              icon={XCircle}
              accentColor={{
                bg: "bg-rose-50",
                text: "text-rose-700",
                border: "border-rose-200",
                iconBg: "bg-rose-100",
              }}
            />
            <MetricCard
              title="On Leave"
              value={dailyMetrics.onLeave}
              subtext="Covered by approved leave"
              definition="Employees who have an approved leave request covering this calendar date and did not check in to work."
              icon={Calendar}
              accentColor={{
                bg: "bg-sky-50",
                text: "text-sky-700",
                border: "border-sky-200",
                iconBg: "bg-sky-100",
              }}
            />
            <MetricCard
              title="Late Arrivals"
              value={dailyMetrics.lateArrivals}
              subtext="Checked in after scheduled start"
              definition="Present employees whose check-in time occurred after the company's scheduled start time (subset of Present)."
              icon={AlertTriangle}
              accentColor={{
                bg: "bg-amber-50",
                text: "text-amber-700",
                border: "border-amber-200",
                iconBg: "bg-amber-100",
              }}
            />
            <MetricCard
              title="Attendance Rate"
              value={`${dailyMetrics.attendanceRate}%`}
              subtext={`${dailyMetrics.present} present / ${dailyMetrics.expectedToWork} expected`}
              definition="Formula: Present ÷ Expected to Work (Total Active Staff − On Leave) × 100%. Denominator excludes staff with approved leave."
              icon={Clock}
              accentColor={{
                bg: "bg-indigo-50",
                text: "text-indigo-700",
                border: "border-indigo-200",
                iconBg: "bg-indigo-100",
              }}
            />
          </div>

          {/* Daily Table */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Staff Attendance List
                </CardTitle>
                <span className="text-xs text-slate-400">
                  ({filteredDailyRecords.length} staff members shown)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {[
                  { key: 'ALL', label: `All (${dailyStaffRecords.length})` },
                  { key: 'PRESENT', label: `Present (${dailyMetrics.present})` },
                  { key: 'LATE', label: `Late (${dailyMetrics.lateArrivals})` },
                  { key: 'ON_LEAVE', label: `On Leave (${dailyMetrics.onLeave})` },
                  { key: 'ABSENT', label: `Absent (${dailyMetrics.absent})` },
                ].map((pill) => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setDailyStatusFilter(pill.key)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                      dailyStatusFilter === pill.key
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              {isLoadingDaily ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                  Loading daily attendance records...
                </div>
              ) : filteredDailyRecords.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  No staff attendance records match the selected filters.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/75">
                    <TableRow className="border-b border-slate-200">
                      <TableHead className="text-xs font-semibold text-slate-700">Staff Member</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700">Department</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700">Attendance Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700">Check In (IST)</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700">Check Out (IST)</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700">Worked Duration</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700">Notes / Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDailyRecords.map((record) => {
                      const netMins = record.session?.netDurationMinutes || 0;
                      const breakMins = record.session?.breakDurationMinutes || 0;
                      const workedStr =
                        netMins > 0
                          ? `${Math.floor(netMins / 60)}h ${netMins % 60}m`
                          : record.session?.checkInTime
                          ? 'In Progress'
                          : '—';

                      return (
                        <TableRow key={record.id} className="hover:bg-slate-50/50">
                          <TableCell className="py-2.5">
                            <div className="font-medium text-slate-900 text-xs">
                              {record.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {record.businessId} • {record.email}
                            </div>
                          </TableCell>

                          <TableCell className="py-2.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {record.department?.name || 'Unassigned'}
                            </span>
                          </TableCell>

                          <TableCell className="py-2.5">
                            <div className="flex flex-wrap items-center gap-1">
                              {record.attendanceStatus === 'PRESENT' && (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-semibold">
                                  {record.session?.status === 'ACTIVE'
                                    ? 'Working'
                                    : record.session?.status === 'ON_BREAK'
                                    ? 'On Break'
                                    : 'Present (Completed)'}
                                </Badge>
                              )}
                              {record.isLate && (
                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                                  Late {record.lateMinutes > 0 ? `(+${record.lateMinutes}m)` : ''}
                                </Badge>
                              )}
                              {record.attendanceStatus === 'ON_LEAVE' && (
                                <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-[11px]">
                                  On Leave ({record.leave?.leaveType || 'Approved'})
                                </Badge>
                              )}
                              {record.attendanceStatus === 'ABSENT' && (
                                <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[11px]">
                                  Absent
                                </Badge>
                              )}
                              {record.attendanceStatus === 'UNMARKED' && (
                                <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[11px]">
                                  Pending Check-in
                                </Badge>
                              )}
                              {record.attendanceStatus === 'WEEKEND_OFF' && (
                                <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-[11px]">
                                  Weekly Off
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="py-2.5 font-mono text-xs text-slate-700">
                            {record.session?.checkInTime ? fmtTime(record.session.checkInTime) : '—'}
                          </TableCell>

                          <TableCell className="py-2.5 font-mono text-xs text-slate-700">
                            {record.session?.checkOutTime ? fmtTime(record.session.checkOutTime) : '—'}
                          </TableCell>

                          <TableCell className="py-2.5 text-xs text-slate-700">
                            <span className="font-mono">{workedStr}</span>
                            {breakMins > 0 && (
                              <span className="block text-[10px] text-slate-400">
                                Break: {Math.floor(breakMins / 60)}h {breakMins % 60}m
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="py-2.5 text-xs text-slate-600 max-w-xs truncate">
                            {record.session?.note ? (
                              <span title={record.session.note}>{record.session.note}</span>
                            ) : record.leave ? (
                              <span className="text-sky-700 italic">
                                {record.leave.startDate} to {record.leave.endDate}
                                {record.leave.reason ? ` — ${record.leave.reason}` : ''}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: ATTENDANCE REPORTS (MONTHLY & CUSTOM DATE RANGE) ────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {canViewTeam && activeTab === 'report' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Range Mode Switcher & Inputs */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setReportMode('month')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      reportMode === 'month'
                        ? 'bg-white text-slate-900 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Monthly Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportMode('custom')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      reportMode === 'custom'
                        ? 'bg-white text-slate-900 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Custom Date Range
                  </button>
                </div>

                {reportMode === 'month' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Month:</span>
                    <input
                      type="month"
                      value={reportMonth}
                      onChange={(e) => setReportMonth(e.target.value)}
                      className="border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 h-8"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReportMonth(getCurrentMonthString())}
                      className="h-8 text-xs"
                    >
                      This Month
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-600">From:</span>
                      <input
                        type="date"
                        value={reportStartDate}
                        onChange={(e) => setReportStartDate(e.target.value)}
                        className="border border-slate-300 rounded-md px-2 py-1 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 h-8"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-600">To:</span>
                      <input
                        type="date"
                        value={reportEndDate}
                        onChange={(e) => setReportEndDate(e.target.value)}
                        className="border border-slate-300 rounded-md px-2 py-1 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 h-8"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Department, Search, Export & Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={reportDepartment}
                    onChange={(e) => setReportDepartment(e.target.value)}
                    className="border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 h-8"
                  >
                    <option value="all">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search staff or ID..."
                    value={reportSearchQuery}
                    onChange={(e) => setReportSearchQuery(e.target.value)}
                    className="border border-slate-300 rounded-md pl-8 pr-3 py-1 text-xs font-normal text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 h-8 w-44"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearReportFilters}
                  className="h-8 px-2.5 text-xs text-slate-600 flex items-center gap-1"
                  title="Reset Filters"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadReportData}
                  disabled={isLoadingReport}
                  className="h-8 px-2.5 text-xs text-slate-600 flex items-center gap-1"
                  title="Generate Report"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReport ? 'animate-spin text-primary' : ''}`} />
                  <span>Refresh</span>
                </Button>

                <Button
                  size="sm"
                  onClick={handleExportCsv}
                  disabled={isLoadingReport || filteredReportEmployees.length === 0}
                  className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm font-medium"
                  title="Download CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </Button>
              </div>
            </div>

            {/* Reporting Period Info Banner */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">Reporting Period:</span>
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                  {reportAppliedRange.start} to {reportAppliedRange.end}
                </span>
                <span className="text-slate-400">({BUSINESS_TIMEZONE})</span>
              </div>
              <div className="text-slate-500 text-[11px]">
                Weekly offs (Sundays) and approved leaves are excluded from absence counts.
              </div>
            </div>
          </div>

          {reportError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{reportError}</span>
              </div>
              <Button size="sm" variant="outline" onClick={loadReportData} className="h-7 text-xs bg-white">
                Retry
              </Button>
            </div>
          )}

          {/* Period Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <MetricCard
              title="Active Staff"
              value={periodSummary.totalEmployees}
              subtext="Total workforce in period"
              definition="Active employees eligible for work during the selected date range."
              icon={Users}
              accentColor={{
                bg: "bg-slate-50",
                text: "text-slate-900",
                border: "border-slate-200",
                iconBg: "bg-slate-100",
              }}
            />
            <MetricCard
              title="Avg Attendance"
              value={`${periodSummary.avgAttendanceRate}%`}
              subtext="Workforce average rate"
              definition="Average attendance percentage across all employees: Present ÷ (Present + Absent) × 100%."
              icon={Clock}
              accentColor={{
                bg: "bg-indigo-50",
                text: "text-indigo-700",
                border: "border-indigo-200",
                iconBg: "bg-indigo-100",
              }}
            />
            <MetricCard
              title="Total Present"
              value={periodSummary.presentDays}
              subtext="Total present employee-days"
              definition="Sum of all qualifying attendance days worked by active staff in this period."
              icon={CheckCircle2}
              accentColor={{
                bg: "bg-emerald-50",
                text: "text-emerald-700",
                border: "border-emerald-200",
                iconBg: "bg-emerald-100",
              }}
            />
            <MetricCard
              title="Total Absent"
              value={periodSummary.absentDays}
              subtext="Confirmed unexcused days"
              definition="Sum of days expected to work where staff had no attendance and no approved leave."
              icon={XCircle}
              accentColor={{
                bg: "bg-rose-50",
                text: "text-rose-700",
                border: "border-rose-200",
                iconBg: "bg-rose-100",
              }}
            />
            <MetricCard
              title="Approved Leave"
              value={periodSummary.onLeaveDays}
              subtext="Total approved leave days"
              definition="Sum of employee-days covered by approved leave requests in this period."
              icon={Calendar}
              accentColor={{
                bg: "bg-sky-50",
                text: "text-sky-700",
                border: "border-sky-200",
                iconBg: "bg-sky-100",
              }}
            />
            <MetricCard
              title="Late Arrivals"
              value={periodSummary.lateDays}
              subtext="Checked in after start time"
              definition="Total number of late check-ins recorded across all employees (subset of Present)."
              icon={AlertTriangle}
              accentColor={{
                bg: "bg-amber-50",
                text: "text-amber-700",
                border: "border-amber-200",
                iconBg: "bg-amber-100",
              }}
            />
            <MetricCard
              title="Total Worked"
              value={periodSummary.totalWorkedHours}
              subtext="Total workforce net hours"
              definition="Total cumulative net worked hours and minutes recorded by employees in this period."
              icon={Clock}
              accentColor={{
                bg: "bg-purple-50",
                text: "text-purple-700",
                border: "border-purple-200",
                iconBg: "bg-purple-100",
              }}
            />
          </div>

          {/* Employee-Wise Report Table */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Employee-Wise Attendance Breakdown
                </CardTitle>
                <span className="text-xs text-slate-400">
                  ({filteredReportEmployees.length} employees)
                </span>
              </div>
              <div className="text-xs text-slate-500">
                Click any row or &ldquo;View Breakdown&rdquo; to expand day-by-day logs
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              {isLoadingReport ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                  Generating attendance report...
                </div>
              ) : filteredReportEmployees.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  No staff members match the selected report criteria.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/75">
                    <TableRow className="border-b border-slate-200">
                      <TableHead className="text-xs font-semibold text-slate-700">Employee</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700">Department</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 text-center">Expected Days</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 text-center">Present</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 text-center">Absent</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 text-center">Late</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 text-center">On Leave</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 text-center">Weekly Offs</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 text-center">Attendance %</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 text-right">Worked Hours</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReportEmployees.map((emp) => {
                      const isExpanded = expandedEmployeeId === emp.id;

                      const rateColor =
                        emp.attendancePercentage >= 90
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : emp.attendancePercentage >= 75
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200';

                      return (
                        <React.Fragment key={emp.id}>
                          <TableRow
                            onClick={() => setExpandedEmployeeId(isExpanded ? null : emp.id)}
                            className="hover:bg-slate-50/75 cursor-pointer transition-colors"
                          >
                            <TableCell className="py-2.5">
                              <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                                {emp.fullName}
                                {emp.roles && emp.roles.length > 0 && (
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    ({emp.roles[0].name})
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {emp.businessId} • {emp.email}
                              </div>
                            </TableCell>

                            <TableCell className="py-2.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                {emp.department?.name || 'Unassigned'}
                              </span>
                            </TableCell>

                            <TableCell className="py-2.5 text-center font-mono text-xs text-slate-700">
                              {emp.expectedWorkingDays}
                            </TableCell>

                            <TableCell className="py-2.5 text-center font-mono text-xs font-semibold text-emerald-700">
                              {emp.presentDays}
                            </TableCell>

                            <TableCell className="py-2.5 text-center font-mono text-xs font-semibold text-rose-600">
                              {emp.absentDays}
                            </TableCell>

                            <TableCell className="py-2.5 text-center font-mono text-xs text-amber-700">
                              {emp.lateDays}
                            </TableCell>

                            <TableCell className="py-2.5 text-center font-mono text-xs text-sky-700">
                              {emp.onLeaveDays}
                            </TableCell>

                            <TableCell className="py-2.5 text-center font-mono text-xs text-slate-600">
                              {emp.weeklyOffDays}
                            </TableCell>

                            <TableCell className="py-2.5 text-center">
                              <Badge className={`text-xs font-bold font-mono px-2 py-0.5 ${rateColor}`}>
                                {emp.attendancePercentage}%
                              </Badge>
                            </TableCell>

                            <TableCell className="py-2.5 text-right font-mono text-xs font-medium text-slate-800">
                              {emp.workedHoursStr}
                            </TableCell>

                            <TableCell className="py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedEmployeeId(isExpanded ? null : emp.id)}
                                className="h-7 px-2 text-[11px] flex items-center gap-1 mx-auto"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-3.5 h-3.5" />
                                    <span>Hide</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                    <span>Breakdown</span>
                                  </>
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>

                          {/* ── Expandable Daily Log Sub-Row ───────────────── */}
                          {isExpanded && (
                            <TableRow className="bg-slate-50/60 border-y border-slate-200">
                              <TableCell colSpan={11} className="p-4">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-primary" />
                                      <span className="font-semibold text-xs text-slate-800">
                                        Daily Attendance Breakdown for {emp.fullName} ({emp.businessId})
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-slate-500">
                                      Period: {reportAppliedRange.start} to {reportAppliedRange.end}
                                    </span>
                                  </div>

                                  <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                                    <Table>
                                      <TableHeader className="bg-slate-100 text-[11px]">
                                        <TableRow>
                                          <TableHead className="py-1.5 px-3">Date</TableHead>
                                          <TableHead className="py-1.5 px-3">Status</TableHead>
                                          <TableHead className="py-1.5 px-3">Check In</TableHead>
                                          <TableHead className="py-1.5 px-3">Check Out</TableHead>
                                          <TableHead className="py-1.5 px-3">Worked</TableHead>
                                          <TableHead className="py-1.5 px-3">Break</TableHead>
                                          <TableHead className="py-1.5 px-3">Details / Notes</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {emp.dailyRecords.map((d) => {
                                          const net = d.session?.netDurationMinutes || 0;
                                          const brk = d.session?.breakDurationMinutes || 0;

                                          return (
                                            <TableRow key={d.date} className="text-xs hover:bg-slate-50 border-b border-slate-100">
                                              <TableCell className="py-1.5 px-3 font-mono font-medium text-slate-800">
                                                {d.date} {d.isWeekend ? '(Sun)' : ''}
                                              </TableCell>

                                              <TableCell className="py-1.5 px-3">
                                                {d.status === 'PRESENT' && (
                                                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                                                    Present {d.isLate ? `(Late +${d.lateMinutes}m)` : ''}
                                                  </Badge>
                                                )}
                                                {d.status === 'ON_LEAVE' && (
                                                  <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-[10px]">
                                                    Leave ({d.leave?.leaveType || 'Approved'})
                                                  </Badge>
                                                )}
                                                {d.status === 'ABSENT' && (
                                                  <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">
                                                    Absent
                                                  </Badge>
                                                )}
                                                {d.status === 'WEEKEND_OFF' && (
                                                  <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-[10px]">
                                                    Weekly Off
                                                  </Badge>
                                                )}
                                                {d.status === 'UNMARKED' && (
                                                  <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
                                                    Pending Check-in
                                                  </Badge>
                                                )}
                                                {d.status === 'SCHEDULED' && (
                                                  <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">
                                                    Scheduled
                                                  </Badge>
                                                )}
                                                {d.status === 'NOT_HIRED' && (
                                                  <span className="text-slate-400 text-[10px]">Not employed</span>
                                                )}
                                                {d.status === 'DEPARTED' && (
                                                  <span className="text-slate-400 text-[10px]">Departed</span>
                                                )}
                                              </TableCell>

                                              <TableCell className="py-1.5 px-3 font-mono text-[11px] text-slate-700">
                                                {d.session?.checkInTime ? fmtTime(d.session.checkInTime) : '—'}
                                              </TableCell>

                                              <TableCell className="py-1.5 px-3 font-mono text-[11px] text-slate-700">
                                                {d.session?.checkOutTime ? fmtTime(d.session.checkOutTime) : '—'}
                                              </TableCell>

                                              <TableCell className="py-1.5 px-3 font-mono text-[11px] text-slate-700">
                                                {net > 0 ? `${Math.floor(net / 60)}h ${net % 60}m` : '—'}
                                              </TableCell>

                                              <TableCell className="py-1.5 px-3 font-mono text-[11px] text-slate-500">
                                                {brk > 0 ? `${Math.floor(brk / 60)}h ${brk % 60}m` : '—'}
                                              </TableCell>

                                              <TableCell className="py-1.5 px-3 text-[11px] text-slate-600">
                                                {d.session?.note ? (
                                                  <span>{d.session.note}</span>
                                                ) : d.leave ? (
                                                  <span className="text-sky-700 italic">
                                                    {d.leave.leaveType} leave
                                                    {d.leave.reason ? ` — ${d.leave.reason}` : ''}
                                                  </span>
                                                ) : (
                                                  <span className="text-slate-300">—</span>
                                                )}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 3: MY ATTENDANCE (INDIVIDUAL WORKFLOW PRESERVED 100%) ──────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {(!canViewTeam || activeTab === 'my') && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Current Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  Status: <Badge>{myStatus?.state || 'Not Checked In'}</Badge>
                </div>
                <div className="flex flex-wrap gap-3 mt-2">
                  {(!myStatus?.state || myStatus?.state === 'Not Checked In') && (
                    <div className="w-full space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          What are you working on today?{' '}
                          <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                          value={myNote}
                          onChange={(e) => setMyNote(e.target.value)}
                          placeholder="e.g. Following up on leads from yesterday, Sales calls…"
                          rows={2}
                          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <Button onClick={() => { loadSummary(); setIsCheckInModalOpen(true); }}>
                        Check In
                      </Button>
                    </div>
                  )}

                  {myStatus?.state === 'Working' && myStatus?.note && (
                    <div className="w-full p-2.5 rounded-md bg-blue-50 border border-blue-100 text-sm text-blue-800 mb-1">
                      <span className="font-semibold text-blue-600 text-xs block mb-0.5">
                        Working on
                      </span>
                      {myStatus.note}
                    </div>
                  )}

                  {myStatus?.state === 'Working' && (
                    <>
                      <Button onClick={() => handleAction('BREAK_START')} variant="secondary">
                        Take a Break
                      </Button>
                      <Button onClick={() => { loadSummary(); setIsCheckOutModalOpen(true); }} variant="danger">
                        Check Out
                      </Button>
                    </>
                  )}

                  {myStatus?.state === 'On Break' && (
                    <>
                      <Button onClick={() => handleAction('BREAK_END')} variant="secondary">
                        Stop the Break
                      </Button>
                      <Button onClick={() => { loadSummary(); setIsCheckOutModalOpen(true); }} variant="danger">
                        Check Out
                      </Button>
                    </>
                  )}

                  {myStatus?.state === 'Day Complete' && (
                    <div className="text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-2 rounded-md">
                      You have successfully checked out for the day.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Today&apos;s Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>Net Worked Time: {myStatus?.workedTime || '0h 0m'}</div>
                <div>Break Time: {myStatus?.breakTime || '0h 0m'}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Historical Sessions</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Worked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myHistory.map((session, i) => (
                    <TableRow key={i}>
                      <TableCell>{session.date}</TableCell>
                      <TableCell>{session.checkIn}</TableCell>
                      <TableCell>{session.checkOut}</TableCell>
                      <TableCell>{session.workedTime}</TableCell>
                    </TableRow>
                  ))}
                  {myHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-slate-400">
                        No previous attendance records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-md shadow-lg font-medium text-white transition-opacity z-50 ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Check In Modal */}
      <Modal isOpen={isCheckInModalOpen} onClose={() => setIsCheckInModalOpen(false)} size="lg">
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-slate-900">Good Morning! Here is your agenda for today</h2>

          {isLoadingSummary ? (
            <div className="py-8 text-center text-slate-500">Loading your tasks...</div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                <h3 className="font-semibold text-amber-800 mb-2">
                  Pending Follow-ups ({dailySummary?.pendingFollowUps?.length || 0})
                </h3>
                {dailySummary?.pendingFollowUps?.length > 0 ? (
                  <ul className="list-disc list-inside text-sm text-amber-700 space-y-1">
                    {dailySummary.pendingFollowUps.slice(0, 5).map((f: any) => (
                      <li key={f.id}>
                        {f.lead?.firstName} {f.lead?.lastName}
                      </li>
                    ))}
                    {dailySummary.pendingFollowUps.length > 5 && (
                      <li>...and {dailySummary.pendingFollowUps.length - 5} more</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-amber-700">No pending follow-ups for today.</p>
                )}
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h3 className="font-semibold text-blue-800 mb-2">
                  Scheduled Demos ({dailySummary?.pendingDemos?.length || 0})
                </h3>
                {dailySummary?.pendingDemos?.length > 0 ? (
                  <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                    {dailySummary.pendingDemos.slice(0, 5).map((d: any) => (
                      <li key={d.id}>
                        {d.student?.lead?.firstName} {d.student?.lead?.lastName}
                      </li>
                    ))}
                    {dailySummary.pendingDemos.length > 5 && (
                      <li>...and {dailySummary.pendingDemos.length - 5} more</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-blue-700">No demos scheduled for today.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setIsCheckInModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleAction('CHECK_IN')} disabled={isLoadingSummary}>
              Acknowledge & Check In
            </Button>
          </div>
        </div>
      </Modal>

      {/* Check Out Modal */}
      <Modal isOpen={isCheckOutModalOpen} onClose={() => setIsCheckOutModalOpen(false)} size="lg">
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-slate-900">End of Day Summary</h2>

          {isLoadingSummary ? (
            <div className="py-8 text-center text-slate-500">Loading your summary...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                  <h3 className="font-semibold text-emerald-800 mb-2">Completed Today</h3>
                  <div className="text-sm text-emerald-700 space-y-1">
                    <p>✓ {dailySummary?.completedFollowUps?.length || 0} Follow-ups completed</p>
                    <p>✓ {dailySummary?.completedDemos?.length || 0} Demos conducted</p>
                  </div>
                </div>

                <div className="bg-rose-50 rounded-lg p-4 border border-rose-100">
                  <h3 className="font-semibold text-rose-800 mb-2">Leftovers / Pending</h3>
                  <div className="text-sm text-rose-700 space-y-1">
                    <p>⚠ {dailySummary?.pendingFollowUps?.length || 0} Follow-ups pending</p>
                    <p>⚠ {dailySummary?.pendingDemos?.length || 0} Demos pending</p>
                  </div>
                </div>
              </div>

              {(dailySummary?.pendingFollowUps?.length > 0 ||
                dailySummary?.pendingDemos?.length > 0) && (
                <div className="p-3 bg-slate-50 text-slate-600 text-sm rounded border border-slate-200">
                  You still have pending tasks for today. Are you sure you want to check out?
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setIsCheckOutModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => handleAction('CHECK_OUT')}
              variant="danger"
              disabled={isLoadingSummary}
            >
              Verify & Check Out
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
