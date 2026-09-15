import * as React from 'react';
import { fetchApi } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PeriodSelector } from '../ceo/PeriodSelector';
import { ExecutiveKpiStrip } from '../ceo/ExecutiveKpiStrip';
import { MarketingCard } from '../ceo/MarketingCard';
import { SalesCard } from '../ceo/SalesCard';
import { DemoCard } from '../ceo/DemoCard';
import { FinanceCard } from '../ceo/FinanceCard';
import { HrCard } from '../ceo/HrCard';
import { AttentionCard } from '../ceo/AttentionCard';

export default async function CeoDashboard({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const from = searchParams.from || '';
  const to = searchParams.to || '';
  const period = searchParams.period || '30d';

  let overviewData: any = null;
  let marketingData: any = null;
  let salesData: any = null;
  let financeData: any = null;
  let hrData: any = null;
  let demoData: any = null;
  let attentionData: any = null;
  let error = null;

  try {
    const qs = from && to ? `?from=${from}&to=${to}` : `?period=${period}`;
    // Actually our backend expects from/to. If we just have period, we should calculate from/to on the client or server.
    // Let's resolve 'period' to from/to dates here.
    let startDate = from;
    let endDate = to;
    if (!startDate && !endDate) {
      const now = new Date();
      if (period === 'today') {
        now.setHours(0,0,0,0);
        startDate = now.toISOString();
      } else if (period === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        startDate = d.toISOString();
      } else if (period === '30d') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        startDate = d.toISOString();
      }
    }
    
    const apiQs = startDate ? `?from=${startDate}${endDate ? `&to=${endDate}` : ''}` : '';

    const results = await Promise.allSettled([
      fetchApi<any>(`/analytics/ceo/overview${apiQs}`),
      fetchApi<any>(`/analytics/ceo/marketing${apiQs}`),
      fetchApi<any>(`/analytics/ceo/sales${apiQs}`),
      fetchApi<any>(`/analytics/ceo/finance${apiQs}`),
      fetchApi<any>(`/analytics/ceo/hr`),
      fetchApi<any>(`/analytics/ceo/demos${apiQs}`),
      fetchApi<any>(`/analytics/ceo/attention`)
    ]);

    overviewData = results[0].status === 'fulfilled' ? results[0].value.data : null;
    marketingData = results[1].status === 'fulfilled' ? results[1].value.data : null;
    salesData = results[2].status === 'fulfilled' ? results[2].value.data : null;
    financeData = results[3].status === 'fulfilled' ? results[3].value.data : null;
    hrData = results[4].status === 'fulfilled' ? results[4].value.data : null;
    demoData = results[5].status === 'fulfilled' ? results[5].value.data : null;
    attentionData = results[6].status === 'fulfilled' ? results[6].value.data : null;

    if (results.some(r => r.status === 'rejected')) {
      error = 'Some metrics failed to load. Displaying partial data.';
    }
  } catch (e: any) {
    error = e.message;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-xl shadow-lg">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Company Overview</h1>
          <p className="text-slate-400 mt-1">Executive overview of company performance</p>
        </div>
        <PeriodSelector currentPeriod={period} currentFrom={from} currentTo={to} />
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <ExecutiveKpiStrip data={overviewData} periodLabel={period} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <SalesCard data={salesData} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MarketingCard data={marketingData} />
            <FinanceCard data={financeData} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DemoCard data={demoData} />
            <HrCard data={hrData} />
          </div>
        </div>
        
        <div className="space-y-6">
          <AttentionCard data={attentionData} />
        </div>
      </div>
    </div>
  );
}
