import { Suspense } from 'react';

import { getMarketingActivityAction } from '../actions';
import { MarketingActivityList } from './MarketingActivityList';

export default async function MarketingActivityPage({
  searchParams,
}: {
  searchParams: { cursor?: string };
}) {
  const { cursor } = searchParams;
  const initialData = await getMarketingActivityAction(cursor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketing Activity Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Real-time log of marketing webhook ingestions, including duplicates and idempotency events.
        </p>
      </div>

      <Suspense fallback={<div>Loading activity logs...</div>}>
        <MarketingActivityList initialData={initialData} />
      </Suspense>
    </div>
  );
}
