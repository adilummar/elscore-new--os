"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  getAttendanceStatusAction,
  getAttendanceHistoryAction,
  performAttendanceAction,
  getDailySummaryAction,
  getAttendanceDashboardSummaryAction,
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
  Info,
  UserCheck,
} from "lucide-react";

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

// ─── Stat Card Component with Clear Tooltip Metric Definitions ─────────────
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

  // Navigation tab state: 'company' for managers, 'my' for individual
  const [activeTab, setActiveTab] = useState<'company' | 'my'>(() => (canViewTeam ? 'company' : 'my'));

  // If permissions load after initial render and user has team view, default to 'company'
  useEffect(() => {
    if (canViewTeam && activeTab !== 'my' && activeTab !== 'company') {
      setActiveTab('company');
    }
  }, [canViewTeam, activeTab]);

  // ─── Company Dashboard State ───────────────────────────────────────────────
  const getTodayIstString = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE || 'Asia/Kolkata' });

  const [selectedDate, setSelectedDate] = useState<string>(getTodayIstString());
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [metrics, setMetrics] = useState<SummaryMetrics>({
    totalActiveStaff: 0,
    present: 0,
    absent: 0,
    onLeave: 0,
    lateArrivals: 0,
    unmarked: 0,
    expectedToWork: 0,
    attendanceRate: 0,
  });

  const [staffRecords, setStaffRecords] = useState<StaffRecord[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; code: string }[]>([]);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState<boolean>(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isWeekend, setIsWeekend] = useState<boolean>(false);
  const [isToday, setIsToday] = useState<boolean>(true);

  // Fetch company dashboard data
  const loadDashboardData = useCallback(async () => {
    if (!canViewTeam) return;
    setIsLoadingDashboard(true);
    setDashboardError(null);
    try {
      const data = await getAttendanceDashboardSummaryAction(selectedDate, selectedDepartment);
      if (data) {
        setMetrics(data.metrics || {
          totalActiveStaff: 0,
          present: 0,
          absent: 0,
          onLeave: 0,
          lateArrivals: 0,
          unmarked: 0,
          expectedToWork: 0,
          attendanceRate: 0,
        });
        setStaffRecords(data.records || []);
        if (Array.isArray(data.departments) && data.departments.length > 0) {
          setDepartments(data.departments);
        }
        setIsWeekend(Boolean(data.isWeekend));
        setIsToday(Boolean(data.isToday));
      }
    } catch (err: any) {
      console.error('Failed to load attendance dashboard:', err);
      setDashboardError(err.message || 'Failed to load company attendance summary');
    } finally {
      setIsLoadingDashboard(false);
    }
  }, [canViewTeam, selectedDate, selectedDepartment]);

  useEffect(() => {
    if (canViewTeam && activeTab === 'company') {
      loadDashboardData();
    }
  }, [canViewTeam, activeTab, loadDashboardData]);

  // Date step helper (yesterday, tomorrow)
  const shiftDate = (deltaDays: number) => {
    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const curr = new Date(Date.UTC(year, month - 1, day));
      curr.setUTCDate(curr.getUTCDate() + deltaDays);
      const nextStr = curr.toISOString().split('T')[0];
      setSelectedDate(nextStr);
    } catch (e) {
      console.error(e);
    }
  };

  // Filtered staff records for table
  const filteredRecords = useMemo(() => {
    return staffRecords.filter((rec) => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = rec.fullName.toLowerCase().includes(query);
        const matchId = rec.businessId.toLowerCase().includes(query);
        const matchEmail = rec.email.toLowerCase().includes(query);
        const matchDept = rec.department?.name?.toLowerCase().includes(query);
        if (!matchName && !matchId && !matchEmail && !matchDept) return false;
      }

      // 2. Status Pill Filter
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'PRESENT') return rec.attendanceStatus === 'PRESENT';
      if (statusFilter === 'LATE') return rec.isLate;
      if (statusFilter === 'ON_LEAVE') return rec.attendanceStatus === 'ON_LEAVE';
      if (statusFilter === 'ABSENT') return rec.attendanceStatus === 'ABSENT' || rec.attendanceStatus === 'UNMARKED';
      return true;
    });
  }, [staffRecords, searchQuery, statusFilter]);

  // ─── My Attendance State ───────────────────────────────────────────────────
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
        loadDashboardData();
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

  const handleOpenCheckIn = () => {
    loadSummary();
    setIsCheckInModalOpen(true);
  };

  const handleOpenCheckOut = () => {
    loadSummary();
    setIsCheckOutModalOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Page Header & View Toggle ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            {canViewTeam && activeTab === 'company'
              ? 'Company-Wide Staff Attendance Dashboard'
              : 'My Attendance'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {canViewTeam && activeTab === 'company'
              ? 'Real-time company attendance records, working hours, and workforce metrics.'
              : 'Record your daily check-in, breaks, working hours, and task progress.'}
          </p>
        </div>

        {canViewTeam && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('company')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'company'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Company Dashboard
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
      {/* ── TAB 1: COMPANY-WIDE ATTENDANCE DASHBOARD ───────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {canViewTeam && activeTab === 'company' && (
        <div className="space-y-6">
          {/* Controls Bar: Date navigation, Department filter, Search, Refresh */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
            {/* Left: Date controls */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Date:</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shiftDate(-1)}
                  title="Previous Day"
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 h-8"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shiftDate(1)}
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
                  onClick={() => setSelectedDate(getTodayIstString())}
                  className={`h-8 text-xs ${selectedDate === getTodayIstString() ? 'bg-primary/10 text-primary border-primary/30 font-semibold' : ''}`}
                >
                  Today
                </Button>
                {/* Date indicator badge */}
                {isWeekend ? (
                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[11px]">
                    Weekend (Weekly Off)
                  </Badge>
                ) : isToday ? (
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

            {/* Right: Department Filter, Search & Refresh */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
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
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border border-slate-300 rounded-md pl-8 pr-3 py-1 text-xs font-normal text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 h-8 w-44"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={loadDashboardData}
                disabled={isLoadingDashboard}
                className="h-8 px-2.5 text-xs flex items-center gap-1 text-slate-600"
                title="Refresh Attendance Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDashboard ? 'animate-spin text-primary' : ''}`} />
                <span className="hidden md:inline">Refresh</span>
              </Button>
            </div>
          </div>

          {/* Error Banner */}
          {dashboardError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{dashboardError}</span>
              </div>
              <Button size="sm" variant="outline" onClick={loadDashboardData} className="h-7 text-xs bg-white">
                Retry
              </Button>
            </div>
          )}

          {/* ── 6 Summary Cards ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {/* 1. Total Active Staff */}
            <MetricCard
              title="Total Active Staff"
              value={metrics.totalActiveStaff}
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

            {/* 2. Present */}
            <MetricCard
              title="Present"
              value={metrics.present}
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

            {/* 3. Absent */}
            <MetricCard
              title={isToday ? "Absent / Unmarked" : "Absent"}
              value={metrics.absent}
              subtext={isToday ? "No check-in or leave yet today" : "Expected to work with no attendance"}
              definition="Employees expected to work on this working day who have no qualifying attendance record and no approved leave."
              icon={XCircle}
              accentColor={{
                bg: "bg-rose-50",
                text: "text-rose-700",
                border: "border-rose-200",
                iconBg: "bg-rose-100",
              }}
            />

            {/* 4. On Leave */}
            <MetricCard
              title="On Leave"
              value={metrics.onLeave}
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

            {/* 5. Late Arrivals */}
            <MetricCard
              title="Late Arrivals"
              value={metrics.lateArrivals}
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

            {/* 6. Attendance Rate */}
            <MetricCard
              title="Attendance Rate"
              value={`${metrics.attendanceRate}%`}
              subtext={`${metrics.present} present / ${metrics.expectedToWork} expected`}
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

          {/* ── Detailed Staff Attendance Table ───────────────────────────── */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Staff Attendance List
                </CardTitle>
                <span className="text-xs text-slate-400">
                  ({filteredRecords.length} staff members shown)
                </span>
              </div>

              {/* Status pill filters */}
              <div className="flex flex-wrap items-center gap-1">
                {[
                  { key: 'ALL', label: `All (${staffRecords.length})` },
                  { key: 'PRESENT', label: `Present (${metrics.present})` },
                  { key: 'LATE', label: `Late (${metrics.lateArrivals})` },
                  { key: 'ON_LEAVE', label: `On Leave (${metrics.onLeave})` },
                  { key: 'ABSENT', label: `Absent (${metrics.absent})` },
                ].map((pill) => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setStatusFilter(pill.key)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                      statusFilter === pill.key
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
              {isLoadingDashboard ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                  Loading attendance records...
                </div>
              ) : filteredRecords.length === 0 ? (
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
                    {filteredRecords.map((record) => {
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
                          {/* Staff Member */}
                          <TableCell className="py-2.5">
                            <div className="font-medium text-slate-900 text-xs">
                              {record.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {record.businessId} • {record.email}
                            </div>
                          </TableCell>

                          {/* Department */}
                          <TableCell className="py-2.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {record.department?.name || 'Unassigned'}
                            </span>
                          </TableCell>

                          {/* Attendance Status */}
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

                              {record.attendanceStatus === 'SCHEDULED' && (
                                <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[11px]">
                                  Scheduled
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          {/* Check In */}
                          <TableCell className="py-2.5 font-mono text-xs text-slate-700">
                            {record.session?.checkInTime ? fmtTime(record.session.checkInTime) : '—'}
                          </TableCell>

                          {/* Check Out */}
                          <TableCell className="py-2.5 font-mono text-xs text-slate-700">
                            {record.session?.checkOutTime ? fmtTime(record.session.checkOutTime) : '—'}
                          </TableCell>

                          {/* Worked Duration */}
                          <TableCell className="py-2.5 text-xs text-slate-700">
                            <span className="font-mono">{workedStr}</span>
                            {breakMins > 0 && (
                              <span className="block text-[10px] text-slate-400">
                                Break: {Math.floor(breakMins / 60)}h {breakMins % 60}m
                              </span>
                            )}
                          </TableCell>

                          {/* Notes */}
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
      {/* ── TAB 2: MY ATTENDANCE (INDIVIDUAL WORKFLOW PRESERVED 100%) ──────── */}
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
                      <Button onClick={handleOpenCheckIn}>Check In</Button>
                    </div>
                  )}

                  {/* Show current task note when already working */}
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
                      <Button onClick={handleOpenCheckOut} variant="danger">
                        Check Out
                      </Button>
                    </>
                  )}

                  {myStatus?.state === 'On Break' && (
                    <>
                      <Button onClick={() => handleAction('BREAK_END')} variant="secondary">
                        Stop the Break
                      </Button>
                      <Button onClick={handleOpenCheckOut} variant="danger">
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
