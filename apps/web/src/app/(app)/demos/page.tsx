import { Metadata } from 'next';
import { DemoDashboardClient } from './components/DemoDashboardClient';
import { getSession } from '@/lib/api/auth';
import { CeoDemosView } from '@/components/ceo/CeoDemosView';

export const metadata: Metadata = {
  title: 'Demo Management | EL SCORE OS',
  description: 'Manage scheduled demos, tutor assignments and demo outcomes.',
};

export default async function DemosPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const isCeo = user?.permissions?.includes('analytics.ceo.read');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {isCeo && <CeoDemosView searchParams={searchParams} />}
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Demo Management</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage scheduled demos, tutor assignments and demo outcomes.
          </p>
        </div>
      </div>
      
      <DemoDashboardClient />
    </div>
  );
}
