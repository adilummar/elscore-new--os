'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, Search, RefreshCw, Building2, CheckCircle, Clock, Coffee, UserX } from 'lucide-react';
import { getAllStaffsAction, getStaffDetailAction } from './actions';
import type { StaffSummary, StaffDetail } from './actions';
import { StaffCard } from '@/components/staffs/StaffCard';
import { StaffDetailPanel } from '@/components/staffs/StaffDetailPanel';
import { usePermissions } from '@/components/providers/AuthProvider';

// ─── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-border shadow-card p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

export default function StaffsPage() {
  const { hasPermission } = usePermissions();
  const [staffs, setStaffs] = useState<StaffSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<StaffDetail | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  const canSeeAll = hasPermission('employee.read-all') || hasPermission('analytics.ceo.read');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllStaffsAction();
      setStaffs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCardClick = async (staff: StaffSummary) => {
    setPanelLoading(true);
    setSelectedStaff(null); // clear while loading
    const detail = await getStaffDetailAction(staff.id);
    setSelectedStaff(detail);
    setPanelLoading(false);
  };

  // Department list for filter
  const departments = ['all', ...Array.from(new Set(staffs.map(s => s.department?.name).filter(Boolean)))];

  const filtered = staffs.filter(s => {
    const name = `${s.firstName} ${s.lastName}`.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase());
    const matchDept = deptFilter === 'all' || s.department?.name === deptFilter;
    return matchSearch && matchDept;
  });

  // Group by department
  const grouped: Record<string, StaffSummary[]> = {};
  for (const s of filtered) {
    const dept = s.department?.name ?? 'Unknown';
    if (!grouped[dept]) grouped[dept] = [];
    grouped[dept].push(s);
  }

  // Stats
  const total = staffs.length;
  const working = staffs.filter(s => s.todaySession?.status === 'ACTIVE').length;
  const onBreak = staffs.filter(s => s.todaySession?.status === 'ON_BREAK').length;
  const checkedOut = staffs.filter(s => s.todaySession?.status === 'COMPLETED').length;
  const absent = staffs.filter(s => !s.todaySession).length;

  if (!hasPermission('attendance.read.team') && !hasPermission('employee.read')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-muted">
        <Users className="w-12 h-12 mb-3 opacity-30" />
        <p className="font-medium">You don&apos;t have access to Staffs</p>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              Staffs
            </h1>
            <p className="text-sm text-text-muted mt-0.5">
              Live attendance overview for {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm text-text-secondary hover:bg-surface-muted transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile icon={Users} label="Total Staff" value={total} color="bg-primary/10 text-primary" />
          <StatTile icon={Clock} label="Working Now" value={working} color="bg-emerald-100 text-emerald-600" />
          <StatTile icon={Coffee} label="On Break" value={onBreak} color="bg-amber-100 text-amber-600" />
          <StatTile icon={UserX} label="Absent Today" value={absent} color="bg-red-100 text-red-500" />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-md border border-border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-text-muted shrink-0" />
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {departments.map(d => (
                <option key={d} value={d}>{d === 'all' ? 'All Departments' : d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Staff grid — grouped by department */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-border p-4 animate-pulse space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-slate-200 rounded w-2/3" />
                    <div className="h-3 bg-slate-200 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-3 bg-slate-200 rounded w-full" />
                <div className="h-3 bg-slate-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No staff found</p>
            <p className="text-sm mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([dept, members]) => {
              const activeCount = members.filter(m => m.todaySession?.status === 'ACTIVE').length;
              return (
                <section key={dept}>
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">{dept}</h2>
                    <div className="flex items-center gap-1.5 text-xs text-text-muted">
                      <span className="px-1.5 py-0.5 rounded bg-surface-muted">{members.length} staff</span>
                      {activeCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                          {activeCount} working
                        </span>
                      )}
                    </div>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {members.map(staff => (
                      <StaffCard key={staff.id} staff={staff} onClick={() => handleCardClick(staff)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Loading overlay for panel */}
      {panelLoading && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 w-full max-w-lg bg-white flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-text-muted">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm">Loading staff details…</p>
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedStaff && (
        <StaffDetailPanel staff={selectedStaff} onClose={() => setSelectedStaff(null)} />
      )}
    </>
  );
}
