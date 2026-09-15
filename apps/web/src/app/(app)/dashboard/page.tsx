import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import CeoDashboard from '@/components/dashboard/CeoDashboard';
import OperationalDashboard from '@/components/dashboard/OperationalDashboard';

export default async function DashboardPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const perms = user?.permissions || [];
  
  const isCeo = perms.includes('analytics.ceo.read');

  if (isCeo) {
    return <CeoDashboard searchParams={searchParams} />;
  }

  return <OperationalDashboard />;
}