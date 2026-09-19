import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import { CeoSalesView } from '@/components/ceo/CeoSalesView';
import { SalesHeadWorkspace } from './components/SalesHeadWorkspace';
import { SalesCounsellorWorkspace } from './components/SalesCounsellorWorkspace';

export default async function SalesOverviewPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const permissions = user?.permissions || [];
  
  const isCeo = permissions.includes('analytics.ceo.read');
  const isSalesHead = permissions.includes('lead.read-all');

  if (isCeo) {
    return (
      <div className="max-w-7xl mx-auto">
        <CeoSalesView searchParams={searchParams} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sales Workspace</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your operations, follow-ups, and performance.</p>
      </div>

      {isSalesHead ? <SalesHeadWorkspace /> : <SalesCounsellorWorkspace />}
    </div>
  );
}
