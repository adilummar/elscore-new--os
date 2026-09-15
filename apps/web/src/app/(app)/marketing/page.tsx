import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import { Suspense } from 'react';
import { Card } from '@/components/ui/Card';
import { getMarketingSummaryAction } from './actions';
import { CeoMarketingView } from '@/components/ceo/CeoMarketingView';

async function MarketingSummaryCards() {
  const summary = await getMarketingSummaryAction();
  
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="p-6">
        <h3 className="text-sm font-medium text-gray-500">Total Marketing Leads</h3>
        <p className="mt-2 text-3xl font-bold text-gray-900">{summary.totalLeads}</p>
      </Card>
      
      <Card className="p-6">
        <h3 className="text-sm font-medium text-gray-500">New Leads</h3>
        <p className="mt-2 text-3xl font-bold text-gray-900">{summary.newLeads}</p>
      </Card>
      
      <Card className="p-6">
        <h3 className="text-sm font-medium text-gray-500">Converted Leads</h3>
        <p className="mt-2 text-3xl font-bold text-gray-900">{summary.convertedLeads}</p>
      </Card>
      
      <Card className="p-6">
        <h3 className="text-sm font-medium text-gray-500">Conversion Rate</h3>
        <p className="mt-2 text-3xl font-bold text-gray-900">{summary.conversionRate.toFixed(1)}%</p>
      </Card>
    </div>
  );
}

function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="p-6">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200"></div>
          <div className="mt-2 h-8 w-16 animate-pulse rounded bg-gray-200"></div>
        </Card>
      ))}
    </div>
  );
}

export default async function MarketingOverviewPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const isCeo = user?.permissions?.includes('analytics.ceo.read');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {isCeo && <CeoMarketingView searchParams={searchParams} />}
      
      {!isCeo && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Marketing Overview</h1>
            <p className="mt-1 text-sm text-gray-500">
              Track the performance of your marketing campaigns and lead attribution.
            </p>
          </div>

          <Suspense fallback={<SummaryCardsSkeleton />}>
            <MarketingSummaryCards />
          </Suspense>
        </>
      )}
    </div>
  );
}
