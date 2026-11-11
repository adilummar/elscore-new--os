import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import CeoDashboard from '@/components/dashboard/CeoDashboard';
import OperationalDashboard from '@/components/dashboard/OperationalDashboard';

import { MentoringOverview } from './MentoringOverview';

export default async function DashboardPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const perms = user?.permissions || [];

  const isCeo = perms.includes('analytics.ceo.read');
  const isHr = perms.includes('tutor_lead.manage') || perms.includes('tutor_lead.read');
  const isSales = perms.includes('lead.read') || perms.includes('followup.read');
  const isMentoring = perms.includes('mentoring.student.read-all') || perms.includes('mentoring.student.read-assigned');

  if (isCeo) {
    return <CeoDashboard searchParams={searchParams} />;
  }

  // The Mentoring Head and the Mentors get their own dashboard, not the Sales one. Someone who also does Sales keeps the Sales page.
  if (isMentoring && !isSales) {
    return <MentoringOverview />;
  }

  if (isHr && !isSales) {
    // If the user is an HR manager and not a sales person, their dashboard IS the Tutor HR page.
    const { redirect } = await import('next/navigation');
    redirect('/tutor-hr/leads');
  }

  return <OperationalDashboard />;
}
