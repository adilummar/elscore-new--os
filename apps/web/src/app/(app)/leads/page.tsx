import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import { LeadList } from './components/LeadList';
import { CeoLeadsView } from '@/components/ceo/CeoLeadsView';

export default async function LeadsPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const isCeo = user?.permissions?.includes('analytics.ceo.read');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {isCeo && <CeoLeadsView searchParams={searchParams} />}
      <LeadList />
    </div>
  );
}
