'use client';

import * as React from 'react';
import { usePermissions } from '@/components/providers/AuthProvider';
import { getDemosSummary } from '../actions';
import { DemoList } from './DemoList';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { BookDemoModal } from './BookDemoModal';

export function DemoDashboardClient() {
  const { hasPermission } = usePermissions();
  const [view, setView] = React.useState<'today' | 'upcoming' | 'completed' | 'all'>('today');
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

  const tabs = [
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
    { id: 'all', label: 'All' },
  ] as const;

  const canBook = hasPermission('demo.book');

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Demos", value: summary?.today, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Upcoming', value: summary?.upcoming, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Completed Today', value: summary?.completedToday, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'No-Shows Today', value: summary?.noShowToday, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            {summary ? (
              <p className={`mt-2 text-3xl font-semibold ${stat.color}`}>{stat.value || 0}</p>
            ) : (
              <Skeleton className="h-9 w-16 mt-2" />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="bg-slate-100 p-1 rounded-lg inline-flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                view === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {canBook && (
          <Button onClick={() => setIsBookModalOpen(true)}>Book Demo</Button>
        )}
      </div>

      {/* List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <DemoList view={view} />
      </div>

      {canBook && (
        <BookDemoModal
          isOpen={isBookModalOpen}
          onClose={() => setIsBookModalOpen(false)}
          onSuccess={() => {
            setIsBookModalOpen(false);
            // In a real app we might trigger a refresh of the summary and list here.
            window.location.reload(); 
          }}
        />
      )}
    </div>
  );
}
