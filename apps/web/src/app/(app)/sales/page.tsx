import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import { redirect } from 'next/navigation';
import { CeoSalesView } from '@/components/ceo/CeoSalesView';

export default async function SalesOverviewPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const isCeo = user?.permissions?.includes('analytics.ceo.read');

  if (isCeo) {
    return (
      <div className="max-w-7xl mx-auto">
        <CeoSalesView searchParams={searchParams} />
      </div>
    );
  }

  // If not CEO, but they have access to sales team view, redirect them
  if (user?.permissions?.includes('sales.manage') || user?.permissions?.includes('sales.read-all')) {
    redirect('/sales/team');
  }

  // Fallback
  redirect('/dashboard');
}
