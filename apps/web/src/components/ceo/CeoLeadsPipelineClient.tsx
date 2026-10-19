'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { PeriodSelector } from './PeriodSelector';
import { ChevronDown, ChevronUp, Layers, CheckCircle, TrendingUp, Users, X } from 'lucide-react';

interface StageConfig {
  id: string;
  label: string;
  color: string;
  bgLight: string;
  borderLight: string;
  textLight: string;
  badgeBg: string;
  barColor: string;
}

const ACTIVE_STAGES: StageConfig[] = [
  { id: 'NEW', label: 'New', color: 'blue', bgLight: 'bg-blue-50/50 dark:bg-blue-950/20', borderLight: 'border-blue-200 dark:border-blue-800', textLight: 'text-blue-700 dark:text-blue-300', badgeBg: 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200', barColor: 'bg-blue-500' },
  { id: 'CONTACTED', label: 'Contacted', color: 'amber', bgLight: 'bg-amber-50/50 dark:bg-amber-950/20', borderLight: 'border-amber-200 dark:border-amber-800', textLight: 'text-amber-700 dark:text-amber-300', badgeBg: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200', barColor: 'bg-amber-500' },
  { id: 'DEMO_BOOKED', label: 'Demo Booked', color: 'purple', bgLight: 'bg-purple-50/50 dark:bg-purple-950/20', borderLight: 'border-purple-200 dark:border-purple-800', textLight: 'text-purple-700 dark:text-purple-300', badgeBg: 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200', barColor: 'bg-purple-500' },
  { id: 'NEGOTIATION', label: 'Negotiation', color: 'orange', bgLight: 'bg-orange-50/50 dark:bg-orange-950/20', borderLight: 'border-orange-200 dark:border-orange-800', textLight: 'text-orange-700 dark:text-orange-300', badgeBg: 'bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200', barColor: 'bg-orange-500' },
  { id: 'ENROLLED', label: 'Enrolled', color: 'emerald', bgLight: 'bg-emerald-50/50 dark:bg-emerald-950/20', borderLight: 'border-emerald-200 dark:border-emerald-800', textLight: 'text-emerald-700 dark:text-emerald-300', badgeBg: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200', barColor: 'bg-emerald-500' },
  { id: 'PAID', label: 'Paid', color: 'green', bgLight: 'bg-green-50/50 dark:bg-green-950/20', borderLight: 'border-green-200 dark:border-green-800', textLight: 'text-green-700 dark:text-green-300', badgeBg: 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200', barColor: 'bg-green-500' },
];

const TERMINAL_STAGES: StageConfig[] = [
  { id: 'LOST', label: 'Lost', color: 'rose', bgLight: '', borderLight: '', textLight: 'text-rose-600 dark:text-rose-400', badgeBg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300', barColor: 'bg-rose-500' },
  { id: 'JUNK', label: 'Junk', color: 'slate', bgLight: '', borderLight: '', textLight: 'text-slate-600 dark:text-slate-400', badgeBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', barColor: 'bg-slate-400' },
  { id: 'NOT_INTERESTED', label: 'Not Interested', color: 'slate', bgLight: '', borderLight: '', textLight: 'text-slate-600 dark:text-slate-400', badgeBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', barColor: 'bg-slate-400' },
];

export function CeoLeadsPipelineClient({
  pipelineData,
  overviewData,
  searchParams,
}: {
  pipelineData: any;
  overviewData: any;
  searchParams: { from?: string; to?: string; period?: string; status?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const activeParams = useSearchParams();

  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('elscore_pipeline_collapsed');
    if (saved === 'true') {
      setIsCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('elscore_pipeline_collapsed', String(next));
      return next;
    });
  };

  // Build pipeline map and calculate totals
  const pipelineMap = new Map<string, number>();
  let totalActiveLeads = 0;
  let totalAllLeads = 0;

  if (Array.isArray(pipelineData)) {
    pipelineData.forEach((s: any) => {
      pipelineMap.set(s.status, s.count);
      totalAllLeads += s.count;
      if (!['LOST', 'JUNK', 'NOT_INTERESTED'].includes(s.status)) {
        totalActiveLeads += s.count;
      }
    });
  }

  const denominator = totalAllLeads > 0 ? totalAllLeads : 1;
  const currentStatus = activeParams?.get('status') || '';
  const displayActiveLeads = overviewData?.activeLeads ?? totalActiveLeads;
  const displayEnrolled = overviewData?.enrolled ?? (pipelineMap.get('ENROLLED') || 0);
  const displayConversionRate = overviewData?.conversionRate ?? 
    (totalAllLeads > 0 ? ((displayEnrolled / totalAllLeads) * 100).toFixed(1) + '%' : '0%');

  const handleStageClick = (statusId: string) => {
    const params = new URLSearchParams(activeParams?.toString() || '');
    if (currentStatus === statusId) {
      params.delete('status');
    } else {
      params.set('status', statusId);
    }
    const targetPath = pathname || '/leads';
    router.push(`${targetPath}?${params.toString()}`);
  };

  const handleResetFilter = () => {
    const params = new URLSearchParams(activeParams?.toString() || '');
    params.delete('status');
    const targetPath = pathname || '/leads';
    router.push(`${targetPath}?${params.toString()}`);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden transition-all duration-200">
      
      {/* ── Compact Header & Inline KPIs ── */}
      <div className="px-4 py-2.5 sm:px-5 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
        
        {/* Left: Title & Quick Status */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-600 text-white flex items-center justify-center shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Pipeline Intelligence
              </h2>
              {currentStatus && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-100 dark:bg-brand-950/70 text-brand-800 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                  Filtered: {currentStatus.replace('_', ' ')}
                  <button onClick={handleResetFilter} className="hover:text-brand-950 font-bold ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              Click stage cards below to filter the lead table instantly
            </p>
          </div>
        </div>

        {/* Right: Inline KPI Pills, Period Selector & Collapse Toggle */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          
          {/* Active Leads KPI */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-100 dark:border-sky-900 text-xs">
            <Users className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span className="text-sky-700 dark:text-sky-300 font-medium">Active:</span>
            <span className="font-bold text-sky-900 dark:text-sky-100 text-xs sm:text-sm">
              {displayActiveLeads}
            </span>
          </div>

          {/* Enrolled KPI */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900 text-xs">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-emerald-700 dark:text-emerald-300 font-medium">Enrolled:</span>
            <span className="font-bold text-emerald-900 dark:text-emerald-100 text-xs sm:text-sm">
              {displayEnrolled}
            </span>
          </div>

          {/* Conversion KPI */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900 text-xs">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-indigo-700 dark:text-indigo-300 font-medium">Conversion:</span>
            <span className="font-bold text-indigo-900 dark:text-indigo-100 text-xs sm:text-sm">
              {displayConversionRate}
            </span>
          </div>

          {/* Period Selector */}
          <PeriodSelector
            currentPeriod={searchParams.period || '30d'}
            currentFrom={searchParams.from || ''}
            currentTo={searchParams.to || ''}
          />

          {/* Collapse / Expand Toggle Button */}
          <button
            onClick={toggleCollapsed}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors shadow-xs"
            title={isCollapsed ? 'Expand pipeline ribbon' : 'Collapse pipeline ribbon'}
          >
            <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
            {isCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* ── Expandable Horizontal Pipeline Ribbon ── */}
      {!isCollapsed && (
        <div className="p-3 sm:p-4 space-y-2.5">
          
          {/* Active Funnel Stages Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {ACTIVE_STAGES.map(stage => {
              const count = pipelineMap.get(stage.id) || 0;
              const percent = Math.round((count / denominator) * 100) || 0;
              const isSelected = currentStatus === stage.id;

              return (
                <div
                  key={stage.id}
                  onClick={() => handleStageClick(stage.id)}
                  className={`cursor-pointer relative p-2.5 rounded-xl border transition-all select-none ${
                    isSelected
                      ? 'border-brand-500 ring-2 ring-brand-500/40 bg-brand-50/60 dark:bg-brand-950/40 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-xs'
                  }`}
                >
                  {/* Stage Label & Percentage */}
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${stage.textLight}`}>
                      {stage.label}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {percent}%
                    </span>
                  </div>

                  {/* Count & Unit */}
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {count}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {count === 1 ? 'lead' : 'leads'}
                    </span>
                  </div>

                  {/* Micro Progress Bar */}
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
                    <div
                      className={`h-1 rounded-full ${stage.barColor} transition-all duration-300`}
                      style={{ width: `${Math.min(100, percent)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Terminal / Exit States & Quick All Leads Reset */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-medium text-slate-400">Other States:</span>
              {TERMINAL_STAGES.map(stage => {
                const count = pipelineMap.get(stage.id) || 0;
                const isSelected = currentStatus === stage.id;

                return (
                  <button
                    key={stage.id}
                    onClick={() => handleStageClick(stage.id)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors border ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-750 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{stage.label}:</span> <span className="font-bold">{count}</span>
                  </button>
                );
              })}
            </div>

            {currentStatus && (
              <button
                onClick={handleResetFilter}
                className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
              >
                <span>Reset stage filter</span>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
