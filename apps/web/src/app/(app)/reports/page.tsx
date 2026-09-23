import { getSession } from '@/lib/api/auth';
import { CeoFinanceView } from '@/components/ceo/CeoFinanceView';
import { SalesHeadReportsView } from '@/components/reports/SalesHeadReportsView';

export default async function ReportsPage({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const user = await getSession();
  const isCeo = user?.permissions?.includes('analytics.ceo.read');
  const isSalesHead = user?.permissions?.includes('target.read.team');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {isCeo && <CeoFinanceView searchParams={searchParams} />}
      {(isSalesHead || isCeo) && <SalesHeadReportsView searchParams={searchParams} />}
      
      {!isCeo && !isSalesHead && (
        <div className="p-8 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Reports & Finance</h1>
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
            <p className="text-gray-500">The operational Finance and Reports module is scheduled for development in a future phase.</p>
          </div>
        </div>
      )}
    </div>
  );
}
