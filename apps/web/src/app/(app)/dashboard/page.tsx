import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import CeoDashboard from '@/components/dashboard/CeoDashboard';
import OperationalDashboard from '@/components/dashboard/OperationalDashboard';

export default async function DashboardPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const perms = user?.permissions || [];
  
  const isCeo = perms.includes('analytics.ceo.read');
  const isHr = perms.includes('tutor_lead.manage') || perms.includes('tutor_lead.read');
  const isSales = perms.includes('lead.read') || perms.includes('followup.read');

  if (isCeo) {
    return <CeoDashboard searchParams={searchParams} />;
  }

  if (isHr && !isSales) {
    // If the user is an HR manager and not a sales person, their dashboard IS the Tutor HR page.
    const { redirect } = await import('next/navigation');
    redirect('/tutor-hr/leads');
  }

  return <OperationalDashboard />;
}