import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import { FollowUpDashboardClient } from './components/FollowUpDashboardClient';
import { CeoFollowupsView } from '@/components/ceo/CeoFollowupsView';

export default async function FollowUpsPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const isCeo = user?.permissions?.includes('analytics.ceo.read');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {isCeo && <CeoFollowupsView searchParams={searchParams} />}
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Follow-ups</h1>
          <p className="text-slate-500 text-sm mt-1">Stay on top of today&apos;s conversations and upcoming sales activity.</p>
        </div>
      </div>
      
      <FollowUpDashboardClient />
    </div>
  );
}
