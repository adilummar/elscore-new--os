import { Suspense } from 'react';

import { getMarketingLeadsAction } from '../actions';
import { MarketingAttributionList } from './MarketingAttributionList';

export default async function MarketingAttributionPage({
  searchParams,
}: {
  searchParams: { search?: string; cursor?: string };
}) {
  const { search, cursor } = searchParams;
  // Use leads query but we will extract the canonical attribution from it
  const initialData = await getMarketingLeadsAction(search, undefined, cursor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketing Attribution</h1>
        <p className="mt-1 text-sm text-gray-500">
          Canonical original attribution for all acquired marketing leads.
        </p>
      </div>

      <Suspense fallback={<div>Loading attribution data...</div>}>
        <MarketingAttributionList initialData={initialData} />
      </Suspense>
    </div>
  );
}
