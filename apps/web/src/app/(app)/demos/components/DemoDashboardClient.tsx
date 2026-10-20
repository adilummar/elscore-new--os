'use client';

import * as React from 'react';
import { usePermissions } from '@/components/providers/AuthProvider';
import { getDemosSummary } from '../actions';
import { DemoList } from './DemoList';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { BookDemoModal } from './BookDemoModal';
import { Sparkles, Users, Clock, AlertTriangle, CheckCircle2, ChevronRight, Filter } from 'lucide-react';

export function DemoDashboardClient() {
  const { hasPermission } = usePermissions();
  const [view, setView] = React.useState<string>('all');
  const [stage, setStage] = React.useState<string>('');
  const [summary, setSummary] = React.useState<any>(null);
  const [isBookModalOpen, setIsBookModalOpen] = React.useState(false);

  React.useEffect(() => {
    async function loadSummary() {
      try {
        const res = await getDemosSummary();
        setSummary(res.data || res);
      } catch (err) {
        console.error('Failed to load demo summary', err);
      }
    }
    loadSummary();
  }, []);

  interface QueueTab {
    id: string;
    label: string;
    highlight?: boolean;
    count?: number;
    alert?: boolean;
  }

  const queueTabs: QueueTab[] = [
    { id: 'all', label: 'All Demos' },
    { id: 'ready_for_sales', label: '★ Ready for Sales', highlight: true, count: summary?.readyForSales },
    { id: 'my_queue', label: 'My Queue', count: summary?.myQueue },
    { id: 'unassigned', label: 'Unassigned', count: summary?.unassigned, alert: (summary?.unassigned || 0) > 0 },
    { id: 'overdue', label: 'Overdue', count: summary?.overdue, alert: (summary?.overdue || 0) > 0 },
    { id: 'today', label: 'Today', count: summary?.today },
    { id: 'upcoming', label: 'Upcoming', count: summary?.upcoming },
    { id: 'completed', label: 'Completed' },
  ];

  const stageList = [
    { id: 'VALID_DEMO', label: 'Valid Demo', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { id: 'PREPARATION', label: 'Preparation', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { id: 'TUTOR_ASSIGNED', label: 'Tutor Assigned', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { id: 'LINK_SHARED', label: 'Link Shared', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { id: 'PARENT_CONFIRMATION', label: 'Parent Confirmed', color: 'bg-teal-50 text-teal-700 border-teal-200' },
    { id: 'COMPLETED', label: 'Completed', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { id: 'NOT_SHOW', label: 'No-Show', color: 'bg-rose-50 text-rose-700 border-rose-200' },
    { id: 'CANCELLED', label: 'Cancelled', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    { id: 'RESCHEDULED', label: 'Rescheduled', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  ];

  const canBook = hasPermission('demo.book');

  return (
    <div className="space-y-6">
      {/* Operations KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {[
          {
            label: 'Ready for Sales',
            value: summary?.readyForSales,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50/70',
            icon: Sparkles,
            border: 'border-indigo-100',
          },
          {
            label: 'Unassigned Queue',
            value: summary?.unassigned,
            color: 'text-amber-600',
            bg: 'bg-amber-50/70',
            icon: Users,
            border: 'border-amber-100',
          },
          {
            label: "Today's Schedule",
            value: summary?.today,
            color: 'text-blue-600',
            bg: 'bg-blue-50/70',
            icon: Clock,
            border: 'border-blue-100',
          },
          {
            label: 'Completed Today',
            value: summary?.completedToday,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50/70',
            icon: CheckCircle2,
            border: 'border-emerald-100',
          },
          {
            label: 'Overdue Demos',
            value: summary?.overdue,
            color: 'text-rose-600',
            bg: 'bg-rose-50/70',
            icon: AlertTriangle,
            border: 'border-rose-100',
          },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              className={`bg-white rounded-xl border ${stat.border} p-4 shadow-sm flex items-center justify-between`}
            >
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{stat.label}</p>
                {summary ? (
                  <p className={`mt-1.5 text-2xl font-bold ${stat.color}`}>{stat.value ?? 0}</p>
                ) : (
                  <Skeleton className="h-8 w-14 mt-1.5" />
                )}
              </div>
              <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 9-Stage Operational Pipeline Ribbon */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Filter by Operational Stage</span>
          </div>
          {stage && (
            <button
              onClick={() => setStage('')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              Clear stage filter
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setStage('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 border ${
              stage === ''
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            All Stages
          </button>
          {stageList.map((s) => {
            const count = summary?.stages?.[s.id] ?? 0;
            const isSelected = stage === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStage(isSelected ? '' : s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 border flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : `${s.color} hover:brightness-95`
                }`}
              >
                <span>{s.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-black/5 text-slate-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Operational Queues & Book Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="bg-slate-100 p-1 rounded-xl inline-flex flex-wrap gap-1">
          {queueTabs.map((t) => {
            const isSelected = view === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                } ${t.highlight && !isSelected ? 'text-indigo-600 font-semibold' : ''}`}
              >
                <span>{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      t.alert
                        ? 'bg-rose-100 text-rose-700'
                        : isSelected
                        ? 'bg-slate-200 text-slate-800'
                        : 'bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {canBook && (
          <Button onClick={() => setIsBookModalOpen(true)} className="shrink-0">
            Book Demo
          </Button>
        )}
      </div>

      {/* Demos Table List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <DemoList view={view} stage={stage} />
      </div>

      {canBook && (
        <BookDemoModal
          isOpen={isBookModalOpen}
          onClose={() => setIsBookModalOpen(false)}
          onSuccess={() => {
            setIsBookModalOpen(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
