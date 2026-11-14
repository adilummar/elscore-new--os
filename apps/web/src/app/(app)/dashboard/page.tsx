import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import CeoDashboard from '@/components/dashboard/CeoDashboard';
import OperationalDashboard from '@/components/dashboard/OperationalDashboard';
import MentorDashboard from '@/components/dashboard/MentorDashboard';

export default async function DashboardPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const perms = user?.permissions || [];
  const roles = user?.roles || [];

  const isCeo = perms.includes('analytics.ceo.read');
  const isHr = perms.includes('tutor_lead.manage') || perms.includes('tutor_lead.read');
  const isSales = perms.includes('lead.read') || perms.includes('followup.read');
  const isMentor = roles.includes('MENTOR') || (perms.includes('mentoring.student.read-assigned') && !roles.includes('MENTORING_HEAD') && !perms.includes('mentoring.student.read-all'));
  const isMentoringHead = roles.includes('MENTORING_HEAD') || perms.includes('mentoring.student.read-all');

  if (isCeo) {
    return <CeoDashboard searchParams={searchParams} />;
  }

  // A user with the MENTOR role lands on the dedicated Mentor Dashboard after login.
  if (isMentor && !isSales) {
    return <MentorDashboard searchParams={searchParams} />;
  }

  // The Mentoring Head works from Classes when not on Sales.
  if (isMentoringHead && !isSales) {
    const { redirect } = await import('next/navigation');
    redirect('/mentoring/classes');
  }

  if (isHr && !isSales) {
    // If the user is an HR manager and not a sales person, their dashboard IS the Tutor HR page.
    const { redirect } = await import('next/navigation');
    redirect('/tutor-hr/leads');
  }

  return <OperationalDashboard />;
}
