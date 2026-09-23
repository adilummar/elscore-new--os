'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Calendar, PhoneCall, Trophy, AlertTriangle } from 'lucide-react';
import { getFollowUpsSummary, getFollowUps } from '../actions';
import { usePermissions } from '@/components/providers/AuthProvider';
import { FollowUpList } from './FollowUpList';
import { CreateFollowUpModal } from './CreateFollowUpModal';

type TabView = 'today' | 'upcoming' | 'overdue' | 'all';

export function FollowUpDashboardClient() {
  const [activeTab, setActiveTab] = React.useState<TabView>('today');
  const [summary, setSummary] = React.useState<{ today: number; upcoming: number; overdue: number; completedToday: number } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const { hasPermission } = usePermissions();

  const loadSummary = React.useCallback(async () => {
    try {
      const data = await getFollowUpsSummary();
      setSummary(data);
    } catch (e) {
      console.error('Failed to load summary', e);
    }
  }, []);

  React.useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end mb-4">
        {hasPermission('followup.create') && (
          <Button onClick={() => setIsCreateOpen(true)}>New Follow-up</Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Today', value: summary?.today ?? '--', icon: PhoneCall, color: 'text-blue-500' },
          { title: 'Upcoming', value: summary?.upcoming ?? '--', icon: Calendar, color: 'text-emerald-500' },
          { title: 'Overdue', value: summary?.overdue ?? '--', icon: AlertTriangle, color: 'text-red-500' },
          { title: 'Completed Today', value: summary?.completedToday ?? '--', icon: Trophy, color: 'text-emerald-500' },
        ].map((kpi, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-slate-900">{kpi.value}</h3>
                <p className="text-sm font-medium text-slate-500 mt-1">{kpi.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <div className="flex items-center overflow-x-auto border-b border-slate-200 hide-scrollbar">
          {(['today', 'upcoming', 'overdue', 'all'] as TabView[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'overdue' && summary && summary.overdue > 0 && (
                <span className="ml-2 inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px]">
                  {summary.overdue}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-0">
          <FollowUpList 
            view={activeTab} 
            onChange={() => loadSummary()} 
          />
        </div>
      </div>

      {isCreateOpen && (
        <CreateFollowUpModal 
          isOpen={isCreateOpen} 
          onClose={() => setIsCreateOpen(false)} 
          onSuccess={() => {
            setIsCreateOpen(false);
            loadSummary();
            // We would also need to refresh the list, but FollowUpList manages its own fetch. 
            // We can handle refresh via a context or simply forcing a key change if needed.
          }} 
        />
      )}
    </div>
  );
}
