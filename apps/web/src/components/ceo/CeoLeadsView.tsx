import * as React from 'react';
import { fetchApi } from '@/lib/api/client';
import { resolvePeriodToQueryString } from './utils';
import { CeoLeadsPipelineClient } from './CeoLeadsPipelineClient';

export async function CeoLeadsView({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; period?: string; status?: string };
}) {
  const apiQs = resolvePeriodToQueryString(searchParams);
  let pipelineData: any = null;
  let overviewData: any = null;

  try {
    const results = await Promise.allSettled([
      fetchApi<any>(`/analytics/ceo/pipeline${apiQs}`),
      fetchApi<any>(`/analytics/ceo/overview${apiQs}`),
    ]);

    if (results[0].status === 'fulfilled') pipelineData = results[0].value.data;
    if (results[1].status === 'fulfilled') overviewData = results[1].value.data;
  } catch (e: any) {
    // Ignore errors for resilient rendering
  }

  return (
    <div className="mb-4">
      <CeoLeadsPipelineClient
        pipelineData={pipelineData}
        overviewData={overviewData}
        searchParams={searchParams}
      />
    </div>
  );
}
