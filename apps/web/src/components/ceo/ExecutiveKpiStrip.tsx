import * as React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Users, UserPlus, Trophy, Banknote, Activity, TrendingUp } from 'lucide-react';

export function ExecutiveKpiStrip({ data, periodLabel }: { data: any, periodLabel: string }) {
  if (!data) return null;

  const kpis = [
    { label: 'Active Leads', value: data.activeLeads, icon: Users, isCurrentState: true },
    { label: 'New Leads', value: data.newLeads, icon: UserPlus, isCurrentState: false },
    { label: 'Enrolled', value: data.enrolled, icon: Trophy, isCurrentState: false },
    { label: 'Collections', value: `AED ${(data.actualCollections || 0).toLocaleString()}`, icon: Banknote, isCurrentState: false },
    { label: 'Conversion', value: data.conversionRate, icon: TrendingUp, isCurrentState: false },
    { label: 'Active Employees', value: data.activeEmployees, icon: Activity, isCurrentState: true },
  ];

  const getPeriodText = (isCurrent: boolean) => {
    if (isCurrent) return 'Current state';
    if (periodLabel === 'today') return 'Today';
    if (periodLabel === '7d') return 'Last 7 Days';
    if (periodLabel === '30d') return 'Last 30 Days';
    return 'Selected period';
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        
        const cardContent = (
          <Card key={idx} className="shadow-sm border-slate-200 h-full hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                <div className="p-2 bg-brand-50 rounded-lg text-brand-600">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold mt-2 text-slate-900">{kpi.value}</p>
              <p className="text-xs text-slate-400 mt-1">{getPeriodText(kpi.isCurrentState)}</p>
            </CardContent>
          </Card>
        );

        if (kpi.label === 'Active Leads') {
          return (
            <a key={idx} href="/leads" className="block h-full cursor-pointer">
              {cardContent}
            </a>
          );
        }

        return cardContent;
      })}
    </div>
  );
}
