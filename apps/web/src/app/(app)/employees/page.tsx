import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import { redirect } from 'next/navigation';
import { CeoHrView } from '@/components/ceo/CeoHrView';

export default async function EmployeesPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const isCeo = user?.permissions?.includes('analytics.ceo.read');

  if (isCeo) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CeoHrView searchParams={searchParams} />
      </div>
    );
  }

  // Redirect to Settings for operational users
  if (user?.permissions?.includes('employee.read')) {
    redirect('/settings/employees');
  }

  redirect('/dashboard');
}
