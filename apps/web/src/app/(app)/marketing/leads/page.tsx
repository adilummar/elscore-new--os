import { Suspense } from 'react';

import { getMarketingLeadsAction } from '../actions';
import { MarketingLeadsList } from './MarketingLeadsList';

export default async function MarketingLeadsPage({
  searchParams,
}: {
  searchParams: { search?: string; status?: string; cursor?: string };
}) {
  const { search, status, cursor } = searchParams;
  const initialData = await getMarketingLeadsAction(search, status, cursor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketing Leads</h1>
        <p className="mt-1 text-sm text-gray-500">
          View all leads acquired through marketing channels.
        </p>
      </div>

      <Suspense fallback={<div>Loading leads...</div>}>
        <MarketingLeadsList initialData={initialData} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
