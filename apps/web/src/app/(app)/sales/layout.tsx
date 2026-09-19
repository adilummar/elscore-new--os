import * as React from 'react';
import { getSession } from '@/lib/api/auth';
import { SalesNavigation } from './SalesNavigation';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  const permissions = user?.permissions || [];
  
  const isCeo = permissions.includes('analytics.ceo.read');
  const isSalesHead = permissions.includes('lead.read-all'); // Approx for sales head
  const canManageRR = permissions.includes('roundrobin.manage');

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {!isCeo && <SalesNavigation isSalesHead={isSalesHead} canManageRR={canManageRR} />}
      {children}
    </div>
  );
}
